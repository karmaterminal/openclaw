// Continuation (karmaterminal): F4 option 1 fresh-process recovery. A reset that marked its tree
// and died before resolving must be settled by the next Gateway process from durable state alone
// (the run's mark, the return row's source run, the session row's revision), exactly once. Only
// a real new process proves that nothing in-memory carries over, so this file pays for two
// process starts (about 30s); every other retention contract lives in
// subagent-reset.continuation-retention.test.ts.
// Preserve module setup before modules that consume it.
// oxfmt-ignore
import { useSubagentControlFixture } from "./subagent-control.test-support.js";
import { beforeEach, expect, it } from "vitest";
import { runNodeScript } from "../../../../test/helpers/run-node-script.js";
import { captureRuntimeConfigAsyncReader } from "../../../config/config.js";
import { patchSessionEntryCore } from "../../../config/sessions/session-accessor.js";
import {
  createResetRetentionFixture,
  parentKey,
} from "./subagent-reset.continuation-retention.test-support.js";

const fixture = useSubagentControlFixture();
beforeEach(async () => captureRuntimeConfigAsyncReader()());
const { writeSession, addChild, returnFrom, returnRows, leavePendingRetention } =
  createResetRetentionFixture(() => fixture.stateDir);

const bootChildEntry = new URL(
  "../../../auto-reply/continuation/session-reset-retention.boot-child.test-support.ts",
  import.meta.url,
);

type BootRun = {
  before?: string;
  after?: string;
  resolvedAt?: number;
  rowIds: string[];
  replays: string[];
  events: string[];
};

/** A new Gateway process on the same state: registry restore, boot resolution, one replay. */
async function bootFreshProcess(targets: string[][], signal: AbortSignal) {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITEST") || key === "NODE_OPTIONS") {
      delete env[key];
    }
  }
  const result = await runNodeScript(
    (workerArgv) => [...workerArgv(bootChildEntry), ...targets.flat()],
    env,
    120_000,
    { signal, maxBuffer: 4 * 1024 * 1024 },
  );
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const line = result.stdout
    .trim()
    .split("\n")
    .findLast((candidate) => candidate.startsWith("{"));
  expect(line, result.stdout + result.stderr).toBeDefined();
  return JSON.parse(line!) as { pid: number; runs: Record<string, BootRun> };
}

it("fresh processes settle a reset that died before resolving, adopted or aborted, exactly once", async ({
  signal,
}) => {
  const committedKey = parentKey;
  const abortedKey = "agent:main:telegram:default:direct:aborted";
  const targets: string[][] = [];
  for (const [requester, runId] of [
    [committedKey, "committed-run"],
    [abortedKey, "aborted-run"],
  ] as const) {
    const storePath = await writeSession(requester, `${runId}-parent`, "before-reset");
    await addChild(runId, true, requester);
    const text = `${runId} result before the crash`;
    const retention = await leavePendingRetention(storePath, {
      requester,
      during: async () => {
        await returnFrom(runId, text, requester);
      },
    });
    if (requester === committedKey) {
      // This reset committed its successor; the process died before its resolution ran.
      await patchSessionEntryCore({ storePath, sessionKey: requester }, (entry) => ({
        ...entry,
        lifecycleRevision: retention.successorRevision,
      }));
    }
    targets.push([requester, runId, text]);
  }
  const rowIds = {
    "committed-run": (await returnRows("committed-run")).map((row) => row.id),
    "aborted-run": (await returnRows("aborted-run")).map((row) => row.id),
  };
  expect(rowIds["committed-run"]).toHaveLength(1);
  expect(rowIds["aborted-run"]).toHaveLength(1);

  const first = await bootFreshProcess(targets, signal);
  const second = await bootFreshProcess(targets, signal);

  for (const [runId, outcome] of [
    ["committed-run", "adopted"],
    ["aborted-run", "aborted"],
  ] as const) {
    const released = {
      rowIds: rowIds[runId],
      replays: ["queued"],
      events: rowIds[runId],
    };
    expect(first.runs[runId]).toMatchObject({ before: "pending", after: outcome, ...released });
    expect(second.runs[runId]).toMatchObject({
      before: outcome,
      after: outcome,
      resolvedAt: first.runs[runId]?.resolvedAt,
      ...released,
    });
  }
  expect(new Set([process.pid, first.pid, second.pid]).size).toBe(3);
});
