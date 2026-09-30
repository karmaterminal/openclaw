// ─────────────────────────────────────────────────────────────────────────────
// delegate-dispatch — chain-depth exhaustion
//
// SEAM GUARDED: This file traps the bounded-continuation invariant from
// docs/design/continue-work-signal-v2.md. Delegates can spawn delegates, which
// can spawn more delegates — without a chain-depth cap, this becomes a
// runaway recursion engine. The cap (maxChainLength) keeps delegate chains
// bounded.
//
// ARCHITECTURAL CANON (from delegate-dispatch.ts):
//   1. EVERY dispatch call carries a `chainState` with currentChainCount.
//   2. BEFORE spawning, the dispatcher checks: currentChainCount <
//      maxChainLength. The comparison is strict-less-than; equality means
//      cap-reached and the delegate is REJECTED, not dispatched.
//   3. On rejection, the dispatcher:
//        a. Emits a system event with "chain-capped" in the message text
//           (visible to the model on next turn — see continue-work-signal-v2).
//        b. Marks the corresponding custody record as `failed` (NOT
//           succeeded, NOT left queued) — so custody listings surface
//           the rejection state to ops/observability.
//   4. Within a single dispatch call, currentChainCount is INCREMENTED
//      per successful spawn — so a single call can dispatch N delegates
//      and then reject the (N+1)th when the running counter hits the cap.
//
// These three tests pin distinct corners of the
// bounded-chain contract. If the dispatch loop is ever changed to skip
// the chain-depth check, OR if the custody failure-marking is dropped on
// rejection, one of these tests will fire and point reviewers straight at
// the budget-check block in delegate-dispatch.ts. The bounded-chain
// invariant prevents unbounded successor chains.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock setup ──────────────────────────────────────────────────────────
// The mocks reproduce the side-effect-bearing surfaces (spawn,
// system-events) so we can assert on what the dispatcher TRIED to do;
// continuation custody is the real store, so the persisted record state
// is observed directly.
const enqueueSystemEventMock = vi.fn();
const loggerRecords: Array<{ level: string; message: string }> = [];
const spawnSubagentDirectMock = vi.fn();

vi.mock("../../agents/subagents/spawn/subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => spawnSubagentDirectMock(...args),
}));

vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEventRaw: (text: string, options: unknown) => enqueueSystemEventMock(text, options),
}));

vi.mock("../../logging/subsystem.js", () => {
  const record =
    (level: string) =>
    (message: string): void => {
      loggerRecords.push({ level, message });
    };
  const logger = {
    subsystem: "test",
    isEnabled: () => true,
    trace: record("trace"),
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
    fatal: record("fatal"),
    raw: record("raw"),
    child: () => logger,
  };
  return {
    createSubsystemLogger: () => logger,
  };
});

import { clearRuntimeConfigSnapshot } from "../../config/config.js";
import { upsertSessionEntryCore } from "../../config/sessions/session-accessor.js";
import { resetContinuationTracer } from "../../infra/continuation-tracer.js";
import { resolveSystemEventQueueKey } from "../../infra/system-event-ownership.js";
import { closeOpenClawAgentDatabasesForTest } from "../../state/openclaw-agent-db.js";
import {
  listCustodyRecordsForTest,
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import { dispatchToolDelegates, resetDelegateDispatchHedgesForTests } from "./delegate-dispatch.js";
import { enqueuePendingDelegate } from "./delegate-store.js";
import { resetContinuationStateForTests } from "./state.js";

useContinuationCustodyTestState();

// Dispatch revalidates the owner session before claiming a delegate, so tests
// that reach the spawn path seed the owner row in the isolated session store
// (mirrors delegate-dispatch-post-compaction.test.ts).
async function seedOwnerSession(sessionKey: string): Promise<void> {
  await upsertSessionEntryCore(
    { agentId: "main", sessionKey },
    {
      sessionId: `session:${sessionKey}`,
      lifecycleRevision: `lifecycle:${sessionKey}`,
      updatedAt: Date.now(),
    },
  );
}

beforeEach(() => {
  closeOpenClawAgentDatabasesForTest();
  // Fresh state per test so chain-state contamination from a prior test
  // can't mask a real budget-check regression.
  enqueueSystemEventMock.mockClear();
  loggerRecords.length = 0;
  spawnSubagentDirectMock.mockReset().mockResolvedValue({ status: "accepted" });
  vi.useFakeTimers();
});

afterEach(() => {
  resetDelegateDispatchHedgesForTests();
  resetContinuationStateForTests();
  resetContinuationTracer();
  clearRuntimeConfigSnapshot();
  closeOpenClawAgentDatabasesForTest();
  vi.useRealTimers();
});

describe("chain-depth exhaustion", () => {
  // CHAIN-DEPTH AXIS: each test pins a different point in the
  // currentChainCount-vs-maxChainLength relationship:
  //   at-limit (count == max)           → all delegates rejected
  //   under-limit transitioning to limit → first dispatches, rest reject
  //   rejection side-effects             → custody record marked failed
  //
  // Together these three guard the WHOLE budget-check block in
  // delegate-dispatch.ts. Removing the check, off-by-one'ing the
  // comparison, or skipping the terminal custody write will trip exactly one of
  // them and point reviewers at the precise regression.

  // ───────────────────────────────────────────────────────────────────────
  // AT-LIMIT case: currentChainCount === maxChainLength on entry.
  //
  // CANON GUARDED: the strict-less-than comparison. At equality, dispatch
  // is REJECTED, not allowed to slip through "one more time."
  //
  // Regression indicator: if this test flips to "dispatched: 1, rejected:
  // 0", the comparison went from `<` to `<=` somewhere; reviewer should
  // grep delegate-dispatch.ts for the chain-cap budget check and verify
  // operator direction.
  // ───────────────────────────────────────────────────────────────────────
  it("rejects a delegate when currentChainCount equals maxChainLength", async () => {
    const sessionKey = "session-chain-depth-at-limit";
    await enqueuePendingDelegate(sessionKey, { task: "work at the ceiling" });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 10,
        chainStartedAt: Date.now(),
        accumulatedChainTokens: 0,
      },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    // Count assertion: 0 dispatched, 1 rejected — the strict-less-than
    // gate is closed at equality.
    expect(result.dispatched).toBe(0);
    expect(result.rejected).toBe(1);
    // Spawn assertion: zero side effects on the spawn surface — the gate
    // ran BEFORE the spawn call, not after.
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();

    // Surface assertion: the model has to see WHY its delegate didn't
    // fire, so we require a "chain-capped" system event. If the message
    // text changes, the model's self-correction prompt will also need to
    // change — keep these strings in sync with continue-work-signal-v2.
    expect(enqueueSystemEventMock).toHaveBeenCalledWith(expect.stringContaining("chain-capped"), {
      sessionKey: resolveSystemEventQueueKey(sessionKey, "main"),
      trusted: true,
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // INCREMENTAL case: under-limit transitioning to at-limit mid-dispatch.
  //
  // CANON GUARDED: the chain counter is mutated per-dispatch inside the
  // SAME dispatchToolDelegates call. The first delegate spawns and lifts
  // count 9 → 10; the second delegate sees count===10 and gets rejected.
  //
  // Regression indicator: if the test ever shows "dispatched: 2" (cap
  // checked once, mutated never) or "dispatched: 0" (cap checked against
  // pre-mutation snapshot only), the counter-increment loop is broken.
  // Reviewer should look at the per-iteration update of
  // chainState.currentChainCount in the dispatch loop.
  // ───────────────────────────────────────────────────────────────────────
  it("accepts a delegate at count 9/10, then rejects the next at 10/10", async () => {
    const sessionKey = "session-chain-depth-incremental";
    await seedOwnerSession(sessionKey);
    await enqueuePendingDelegate(sessionKey, { task: "first delegate" });
    await enqueuePendingDelegate(sessionKey, { task: "second delegate" });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 9,
        chainStartedAt: Date.now(),
        accumulatedChainTokens: 0,
      },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    // First delegate spawns at hop 10 (9→10), then the budget check for
    // the second delegate sees currentChainCount===10 >= maxChainLength===10
    // and rejects. The post-call chainState should reflect the mutation.
    expect(result.dispatched).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.chainState.currentChainCount).toBe(10);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);

    // FIFO assertion: the FIRST queued task is the one that dispatched.
    // If the dispatcher were ever to reorder (e.g. priority queue), this
    // test would surface that shift.
    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining("first delegate"),
      }),
      expect.objectContaining({ agentSessionKey: sessionKey }),
    );

    // Rejection-surface assertion: the second delegate's rejection must
    // emit the same chain-capped system event shape as the at-limit case.
    expect(enqueueSystemEventMock).toHaveBeenCalledWith(expect.stringContaining("chain-capped"), {
      sessionKey: resolveSystemEventQueueKey(sessionKey, "main"),
      trusted: true,
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // SIDE-EFFECT case: custody record state on chain-depth rejection.
  //
  // CANON GUARDED: a chain-depth rejection isn't just an in-memory
  // counter event — it must also transition the persistent custody
  // record from `queued` to `failed`. Leaving it `queued` would make ops
  // surfaces (custody listings) report a delegate as still
  // pending forever; transitioning it to `succeeded` would be a lie.
  //
  // Regression indicator: if the custody record stays `queued` after
  // rejection, the terminal write was dropped from the rejection branch;
  // reviewer should look for the terminal / "mark failed" lines in
  // delegate-dispatch.ts and verify they're in the cap-rejection
  // branch, not behind a `dispatched > 0` guard.
  // ───────────────────────────────────────────────────────────────────────
  it("marks the custody record as failed for chain-depth-rejected delegates", async () => {
    const sessionKey = "session-chain-depth-taskflow-status";
    await enqueuePendingDelegate(sessionKey, { task: "doomed by chain depth" });

    // Snapshot the pre-state: the enqueue should have created exactly one
    // queued custody record. If this assertion fails, the test fixture
    // (enqueuePendingDelegate → custody create) has drifted.
    const queuedBefore = await listCustodyRecordsForTest({
      ownerSessionKey: sessionKey,
      kinds: ["delegate"],
      statuses: ["queued"],
    });
    expect(queuedBefore).toHaveLength(1);
    const recordId = queuedBefore.at(0)?.recordId;
    if (typeof recordId !== "string") {
      throw new Error("expected queued record id");
    }

    await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 10,
        chainStartedAt: Date.now(),
        accumulatedChainTokens: 0,
      },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    // Final-state assertion: queued → failed. NOT queued (would mean the
    // record was leaked); NOT succeeded (would mean we lied to ops).
    expect((await readCustodyRecordForTest(recordId))?.status).toBe("failed");
  });
});
