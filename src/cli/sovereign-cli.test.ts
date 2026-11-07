import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import {
  capture,
  expectNoSentinel,
  expectNoSentinelFilesSince,
  GENERATION,
  writeGeneration,
  writeRoot,
} from "../agents/sovereign-prompts/sovereign-fixture.test-support.js";
import type { OpenClawConfig } from "../config/types.js";
import { ExitError } from "../runtime.js";
import { registerSovereignCli } from "./sovereign-cli.js";

const state = vi.hoisted(() => ({ config: {} as unknown }));

vi.mock("../config/config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config/config.js")>()),
  captureRuntimeConfigAsyncReader: () => async () => state.config,
}));

const startedAt = Date.now();
const tempDirs = useAutoCleanupTempDirTracker(afterEach);
afterAll(() => expectNoSentinelFilesSince(startedAt));

let agentDir = "";
let root = "";

beforeEach(() => {
  agentDir = tempDirs.make("openclaw-sovereign-cli-");
  root = path.join(agentDir, "sovereign", "systemprompts");
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  configure("off");
});

function configure(mode: "off" | "enforce") {
  state.config = {
    agents: { entries: { main: { agentDir, sovereignPrompts: { mode } } } },
  } satisfies OpenClawConfig;
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
  it("paths reports the agent-dir root and the off state", async () => {
    const result = await run(["paths", "--agent", "main", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.json()).toEqual({
      ok: true,
      agentId: "main",
      mode: "off",
      state: "off",
      root,
      current: path.join(root, "CURRENT"),
      generations: path.join(root, "generations"),
    });
  });

  it("paths refuses an enforce agent with enforce_unwired and a nonzero exit", async () => {
    configure("enforce");
    const result = await run(["paths", "--agent", "main", "--json"]);
    expect(result.exitCode).toBe(1);
    expect(result.json()).toMatchObject({
      ok: false,
      agentId: "main",
      code: "enforce_unwired",
      root,
    });
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
