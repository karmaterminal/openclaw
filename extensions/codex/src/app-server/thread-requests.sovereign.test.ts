// Exact-route proof for Codex (openclaw#1321): an enforce agent's loaded generation reaches
// the thread/start and thread/resume requests the lifecycle sends unchanged, as Codex
// `baseInstructions` on an ordinary thread and as developer text behind an authored base.
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspect } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createThreadRequestAppServerOptions,
  createThreadRequestAttemptParams,
} from "./thread-lifecycle.test-fixtures.js";
import { buildThreadResumeParams, buildThreadStartParams } from "./thread-requests.js";

// Synthetic fixture prose only; the sentinel proves no body leaks into errors.
const SENTINEL = `codex-sovereign-sentinel-${randomUUID()}`;
const GENERATION = "20261118T120000Z-0123456789ab";
const fixtureBody = (name: string) =>
  `${SENTINEL} Synthetic fixture prose for ${name}. ${SENTINEL}`;
const STOCK_IDENTITY = "You are a personal assistant running inside OpenClaw.";
const BODIES: Record<string, string> = {
  "identity-section.md": fixtureBody("identity"),
  "execution-section.md": fixtureBody("execution"),
  "runtime-context-section.md": fixtureBody("runtime-context"),
  "tool-section.md": fixtureBody("tool"),
  "safety-section.md": fixtureBody("safety"),
};

const sha256 = (data: string) => createHash("sha256").update(data).digest("hex");

/** One sealed generation at the agent's default sovereign root (loader design § 3.3). */
function writeGeneration(agentDir: string, agentId: string, bodies: Record<string, string>) {
  const root = path.join(agentDir, "sovereign", "systemprompts");
  const dir = path.join(root, "generations", GENERATION);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const files = Object.entries(bodies)
    .map(([file, content]) => {
      fs.writeFileSync(path.join(dir, file), content, { mode: 0o600 });
      return { path: file, bytes: Buffer.byteLength(content), sha256: sha256(content) };
    })
    .toSorted((a, b) => (a.path < b.path ? -1 : 1));
  const manifest = {
    schema: "openclaw.sovereign-prompts/1",
    agentId,
    generation: GENERATION,
    source: {
      repo: "karmaterminal/fixture",
      commit: "0123456789ab".padEnd(40, "c"),
      path: "sovereign/systemprompts",
    },
    files,
    // RFC 8785 JSON of `{bytes, path, sha256}` sorted by path, as the loader recomputes it.
    setDigest: sha256(
      JSON.stringify(
        files.map(({ bytes, path: file, sha256: digest }) => ({
          bytes,
          path: file,
          sha256: digest,
        })),
      ),
    ),
  };
  fs.writeFileSync(path.join(dir, "MANIFEST.json"), JSON.stringify(manifest), { mode: 0o600 });
  fs.writeFileSync(path.join(root, "CURRENT"), `${GENERATION}\n`, { mode: 0o600 });
}

let tempRoot = "";
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
  config = {
    agents: {
      entries: {
        main: { agentDir: main, sovereignPrompts: { mode: "enforce" } },
        broken: { agentDir: broken, sovereignPrompts: { mode: "enforce" } },
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
});
