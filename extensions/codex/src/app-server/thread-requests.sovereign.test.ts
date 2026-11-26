// Exact-route proof for Codex (openclaw#1321): an enforce agent's loaded generation reaches
// the thread/start and thread/resume requests the lifecycle sends unchanged, as Codex
// `baseInstructions` on an ordinary thread and as developer text behind an authored base.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspect } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  fixtureBody,
  SENTINEL,
  SOVEREIGN_BODIES as BODIES,
  STOCK_IDENTITY,
  writeSovereignGeneration as writeGeneration,
} from "./sovereign-generation.test-support.js";
import { checkCodexThreadHandoff } from "./sovereign-handoff.js";
import {
  createThreadRequestAppServerOptions,
  createThreadRequestAttemptParams,
} from "./thread-lifecycle.test-fixtures.js";
import { buildThreadResumeParams, buildThreadStartParams } from "./thread-requests.js";

let tempRoot = "";
const CONTINUATION_BODY = fixtureBody("continuation");
// Codex test files are isolated, so this one config initializes the process registry.
let config: NonNullable<ReturnType<typeof createThreadRequestAttemptParams>["config"]>;

beforeAll(() => {
  tempRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "openclaw-codex-sovereign-"));
  const agentDir = (agentId: string) => {
    const dir = path.join(tempRoot, agentId);
    fs.mkdirSync(dir, { mode: 0o700 });
    return dir;
  };
  const main = agentDir("main");
  writeGeneration(main, "main", BODIES);
  const broken = agentDir("broken");
  writeGeneration(broken, "broken", { "identity-section.md": BODIES["identity-section.md"]! });
  const cont = agentDir("cont");
  writeGeneration(cont, "cont", { ...BODIES, "continuation-section.md": CONTINUATION_BODY });
  config = {
    agents: {
      entries: {
        main: { agentDir: main, sovereignPrompts: { mode: "enforce" } },
        broken: { agentDir: broken, sovereignPrompts: { mode: "enforce" } },
        cont: { agentDir: cont, sovereignPrompts: { mode: "enforce" } },
        plain: { agentDir: agentDir("plain") },
      },
    },
  };
});

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function attempt(agentId: string) {
  return { ...createThreadRequestAttemptParams({ provider: "openai" }), agentId, config };
}

const options = () => ({ appServer: createThreadRequestAppServerOptions() });

describe.skipIf(process.platform === "win32")("Codex route: sovereign prompt text", () => {
  it("an ordinary thread's baseInstructions carry the loaded identity and shared policy", async () => {
    const params = attempt("main");
    const start = await buildThreadStartParams(params, {
      ...options(),
      cwd: "/repo",
      dynamicTools: [],
    });
    const base = start.baseInstructions ?? "";
    expect(base.split("\n")[0]).toBe(BODIES["identity-section.md"]);
    for (const [heading, file] of [
      ["## Execution Bias", "execution-section.md"],
      ["## Runtime Context", "runtime-context-section.md"],
      ["## Tool Call Style", "tool-section.md"],
      ["## Care", "safety-section.md"],
    ] as const) {
      expect(base).toContain(`${heading}\n${BODIES[file]}`);
    }
    expect(base).not.toContain(STOCK_IDENTITY);
    expect(base).not.toContain("Routine low-risk: call silently.");
    expect(start.developerInstructions).not.toContain(SENTINEL);
    // A cold resume places the same base, so the thread keeps the prince's text.
    const resume = await buildThreadResumeParams(params, { ...options(), threadId: "thread-1" });
    expect(resume.baseInstructions).toBe(base);
  });

  it("an authored Codex base keeps the operator's base; the loaded text rides the developer carrier", async () => {
    const start = await buildThreadStartParams(attempt("main"), {
      ...options(),
      config: { instructions: "Operator-authored base" },
      cwd: "/repo",
      dynamicTools: [],
    });
    expect(start.baseInstructions).toBeUndefined();
    expect(start.developerInstructions).toMatch(
      new RegExp(`^<thread_policy>\\n${BODIES["identity-section.md"]}\\n`),
    );
    expect(start.developerInstructions).toContain(`## Care\n${BODIES["safety-section.md"]}`);
    expect(start.developerInstructions).not.toContain(STOCK_IDENTITY);
  });

  it("a refused enforce agent fails before any request is built; an off agent keeps stock text", async () => {
    let refusal: unknown;
    try {
      await buildThreadStartParams(attempt("broken"), {
        ...options(),
        cwd: "/repo",
        dynamicTools: [],
      });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({ name: "SovereignPromptRefusal", code: "required_missing" });
    expect(inspect(refusal, { depth: 8 })).not.toContain(SENTINEL);
    expect(inspect(refusal, { depth: 8 })).not.toContain(tempRoot);

    const plain = await buildThreadStartParams(attempt("plain"), {
      ...options(),
      cwd: "/repo",
      dynamicTools: [],
    });
    expect(plain.baseInstructions?.split("\n")[0]).toBe(STOCK_IDENTITY);
    expect(plain.baseInstructions).not.toContain(SENTINEL);
  });

  it("continuation guidance stays code text beside the loaded slots, and the handoff passes", async () => {
    // continuation/main is a phase C slot this build has not converted: the agent's file there
    // is loaded and digested, while the guidance renders from code (sovereign-prompts/registry.ts).
    const params = {
      ...attempt("cont"),
      config: {
        ...config,
        agents: { ...config.agents, defaults: { continuation: { enabled: true } } },
      },
    };
    const start = await buildThreadStartParams(params, {
      ...options(),
      cwd: "/repo",
      dynamicTools: [],
    });
    const resume = await buildThreadResumeParams(params, { ...options(), threadId: "thread-1" });
    const base = start.baseInstructions ?? "";
    expect(base.split("\n")[0]).toBe(BODIES["identity-section.md"]);
    expect(base).toContain("## Continuation & Delegation\n### How you wake");
    expect(base).not.toContain(CONTINUATION_BODY);
    expect(resume.baseInstructions).toBe(base);
    for (const [site, request] of [
      ["thread/start", start],
      ["thread/resume", resume],
    ] as const) {
      expect(checkCodexThreadHandoff(params, site, request)?.verification?.result).toBe(
        "handoff-verified",
      );
    }
  });
});
