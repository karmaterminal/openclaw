import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as loader from "../agents/sovereign-prompts/loader.js";
import { describeSovereignPromptStatus } from "../agents/sovereign-prompts/runtime.js";
import {
  capture,
  expectNoSentinel,
  GENERATION,
  SENTINEL,
  useSovereignTempDirs,
  writeGeneration,
  writeRoot,
} from "../agents/sovereign-prompts/sovereign-fixture.test-support.js";
import { ExitError } from "../runtime.js";
import { registerSovereignCli } from "./sovereign-cli.js";

const state = vi.hoisted(() => ({ config: {} as unknown }));

vi.mock("../config/config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config/config.js")>()),
  captureRuntimeConfigAsyncReader: () => async () => state.config,
}));

const tempDirs = useSovereignTempDirs(afterEach);

let agentDir = "";
let root = "";

beforeEach(() => {
  agentDir = tempDirs.make("openclaw-sovereign-cli-");
  root = path.join(agentDir, "sovereign", "systemprompts");
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  configure("off");
});

function configure(mode: "off" | "enforce") {
  state.config = { agents: { entries: { main: { agentDir, sovereignPrompts: { mode } } } } };
}

/** Runs the command; `forbidden` strings (fixture paths) must never reach its output. */
async function run(args: string[], forbidden: string[] = []) {
  const program = new Command().exitOverride();
  registerSovereignCli(program);
  const outcome = await capture(async () => {
    await program.parseAsync(["sovereign", ...args], { from: "user" });
  });
  expectNoSentinel(outcome, forbidden);
  if (outcome.error !== undefined) {
    expect(outcome.error).toBeInstanceOf(ExitError);
  }
  const exitCode = outcome.error instanceof ExitError ? outcome.error.code : 0;
  const output = outcome.logs.join("");
  return { exitCode, output, json: () => JSON.parse(output) as Record<string, unknown> };
}

describe.skipIf(process.platform === "win32")("openclaw sovereign", () => {
  it.each(["off", "enforce"] as const)(
    "paths reports the agent-dir root and the %s switch without reading a file",
    async (mode) => {
      configure(mode);
      const result = await run(["paths", "--agent", "main", "--json"]);
      expect(result.exitCode).toBe(0);
      expect(result.json()).toEqual({
        ok: true,
        agentId: "main",
        mode,
        root,
        current: path.join(root, "CURRENT"),
        generations: path.join(root, "generations"),
      });
    },
  );

  it("slots --json publishes the registry: names, flags and reserved tokens, no text", async () => {
    const result = await run(["slots", "--json"]);
    expect(result.exitCode).toBe(0);
    const json = result.json() as {
      ok: boolean;
      slots: { slot: string; files: string[]; required: boolean; converted: boolean }[];
      reserved: { markers: string[]; headings: string[] };
    };
    expect(json.ok).toBe(true);
    expect(json.slots.filter((slot) => slot.required).map((slot) => slot.files)).toEqual([
      ["identity-section.md"],
      ["tool-section.md"],
      ["safety-section.md"],
    ]);
    // The slots this build renders: the shared builders, both identities and the framing.
    expect(json.slots.filter((slot) => slot.converted).map((slot) => slot.slot)).toEqual([
      "identity/opening",
      "execution/bias",
      "tool/call-style",
      "tool/media-dedupe",
      "safety/care",
      "safety/credentials",
      "runtime-context/main",
      "project-context/main",
      "project-context/personal-user",
      "project-context/precedence-soul",
      "project-context/precedence-memory",
      "project-context/precedence-user",
    ]);
    expect(json.reserved.headings).toContain("# Project Context");
    expect(json.reserved.markers).toContain("<!-- openclaw:sovereign");
  });

  it("slots --json declares each route's verification boundary and executes none", async () => {
    configure("enforce");
    writeRoot(root);
    const result = await run(["slots", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.json().routes).toEqual([
      {
        route: "openclaw",
        check: "final-payload",
        boundary: "provider_request",
        sites: [
          "anthropic-messages",
          "openai-completions",
          "mistral-conversations",
          "openai-responses",
          "azure-openai-responses",
          "openai-chatgpt-responses",
          "google-generative-ai",
          "google-vertex",
          "google-interactions",
        ],
        unverified: [],
      },
      {
        route: "codex",
        check: "handoff",
        boundary: "app_server_handoff",
        sites: ["thread/start", "thread/resume", "thread/inject_items", "live_thread_reuse"],
        unverified: ["codex_binary", "inference_relay"],
      },
    ]);
    // A declaration is not a receipt: no executed result, no load, no diagnostic line.
    expect(result.output).not.toMatch(/-verified|"result"|SOVEREIGN_PROMPTS_/);
    expect(describeSovereignPromptStatus()).toBeUndefined();
    const text = await run(["slots"]);
    expect(text.output).toContain(
      "route codex: declared handoff check at app_server_handoff (thread/start, thread/resume, thread/inject_items, live_thread_reuse); unverified: codex_binary, inference_relay",
    );
    expect(text.output).not.toMatch(/-verified/);
  });

  it("check loads CURRENT's generation into content-free JSON", async () => {
    writeRoot(root);
    const result = await run(["check", "--agent", "main", "--json"], [root]);
    expect(result.exitCode).toBe(0);
    expect(result.json()).toMatchObject({
      ok: true,
      event: "sovereign_prompts.loaded",
      agentId: "main",
      generation: GENERATION,
      files: expect.arrayContaining([expect.objectContaining({ path: "identity-section.md" })]),
    });
  });

  it("check reports an unexpected load failure as io_error, never its native message", async () => {
    writeRoot(root);
    const load = vi.spyOn(loader, "loadSovereignPromptSnapshot").mockImplementation(() => {
      throw new TypeError(`cannot read ${root}: ${SENTINEL}`);
    });
    try {
      const result = await run(["check", "--agent", "main", "--json"], [root, "cannot read"]);
      expect(result.exitCode).toBe(1);
      expect(result.json()).toEqual({
        ok: false,
        event: "sovereign_prompts.refused",
        agentId: "main",
        code: "io_error",
        errno: "EUNKNOWN",
      });
    } finally {
      load.mockRestore();
    }
  });

  it("check refuses a candidate generation with its code and a nonzero exit", async () => {
    const staging = path.join(root, ".staging-1");
    writeGeneration(staging, { files: { "tool-section.md": null } });
    const json = await run(["check", "--agent", "main", "--generation", staging, "--json"], [root]);
    expect(json.exitCode).toBe(1);
    expect(json.json()).toMatchObject({
      ok: false,
      code: "required_missing",
      file: "tool-section.md",
    });
    const human = await run(["check", "--agent", "main", "--generation", staging], [root]);
    expect(human.exitCode).toBe(1);
    expect(human.output).toContain(
      "[SOVEREIGN_PROMPTS_REFUSED] agent:main code=required_missing slot=tool/call-style file=tool-section.md",
    );
  });

  it("refuses an empty --generation instead of checking the live generation", async () => {
    writeRoot(root);
    for (const generation of ["", " "]) {
      const result = await run(["check", "--agent", "main", "--generation", generation, "--json"]);
      expect(result.exitCode).toBe(1);
      expect(result.json()).toMatchObject({ ok: false, code: "generation_missing" });
    }
  });

  it("refuses an unconfigured agent", async () => {
    const result = await run(["check", "--agent", "ghost", "--json"]);
    expect(result.exitCode).toBe(1);
    expect(result.json()).toMatchObject({ ok: false, agentId: "ghost", code: "agent_unknown" });
  });
});
