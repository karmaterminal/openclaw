// The Codex route's executed sovereign check reaches the run's prompt report (openclaw#1321):
// `handoff-verified` at the handoff the attempt passed, with the loaded generation's digests
// and no content. An off agent's report carries no sovereign block.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  createParams,
  createStartedThreadHarness,
  runCodexAppServerAttempt,
  setupRunAttemptTestHooks,
  tempDir,
} from "./run-attempt-test-harness.js";
import {
  GENERATION,
  SENTINEL,
  writeSovereignGeneration,
} from "./sovereign-generation.test-support.js";

setupRunAttemptTestHooks();

let agentsRoot = "";
let setDigest = "";
// The process loads each generation once, so one config serves both cases.
let config: NonNullable<ReturnType<typeof createParams>["config"]>;

beforeAll(() => {
  agentsRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "openclaw-codex-receipt-"));
  const main = path.join(agentsRoot, "main");
  fs.mkdirSync(main, { mode: 0o700 });
  setDigest = writeSovereignGeneration(main, "main").setDigest;
  config = {
    agents: {
      entries: {
        main: { agentDir: main, sovereignPrompts: { mode: "enforce" } },
        plain: { agentDir: path.join(agentsRoot, "plain") },
      },
    },
  };
});

afterAll(() => {
  fs.rmSync(agentsRoot, { recursive: true, force: true });
});

async function runTurn(agentId: string) {
  const harness = createStartedThreadHarness();
  const params = createParams(path.join(tempDir, `${agentId}.jsonl`), tempDir, {
    sessionKey: `agent:${agentId}:session-1`,
  });
  params.agentId = agentId;
  params.config = config;
  const run = runCodexAppServerAttempt(params);
  await run.waitForTurnAccepted();
  await harness.completeTurn({ threadId: "thread-1", turnId: "turn-1" });
  return (await run).systemPromptReport;
}

it.skipIf(process.platform === "win32")(
  "records handoff-verified for an enforce agent's run, and no sovereign block for an off agent",
  async () => {
    const report = await runTurn("main");
    expect(report?.sovereign).toEqual({
      agentId: "main",
      generation: GENERATION,
      setDigest,
      bytes: expect.any(Number),
      files: expect.arrayContaining([expect.objectContaining({ path: "identity-section.md" })]),
      verification: {
        result: "handoff-verified",
        route: "codex",
        boundary: "app_server_handoff",
        site: "thread/start",
      },
    });
    expect(JSON.stringify(report)).not.toContain(SENTINEL);

    expect((await runTurn("plain"))?.sovereign).toBeUndefined();
  },
);
