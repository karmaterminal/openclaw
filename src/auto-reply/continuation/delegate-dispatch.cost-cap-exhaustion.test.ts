// ─────────────────────────────────────────────────────────────────────────────
// delegate-dispatch — cost-cap exhaustion mid-chain
//
// SEAM GUARDED: This file traps the cost-cap invariant — the second of
// the two bounded-continuation guards (the first
// being chain-depth, covered in the sibling test file). Where chain-depth
// counts HOPS, cost-cap counts TOKENS. A long chain of cheap delegates
// might never hit chain-depth but could still burn through the user's
// token budget; the cost-cap is the financial-pressure brake.
//
// ARCHITECTURAL CANON (from delegate-dispatch.ts):
//   1. EVERY chain carries an accumulatedChainTokens running total.
//   2. The dispatcher compares it to config.costCapTokens using
//      STRICT-GREATER-THAN. accumulated > cap → reject; accumulated <=
//      cap → allow. This means an exact equality at the cap is ALLOWED,
//      not rejected — a deliberate "one more allowed at the line" choice
//      that this test file pins down.
//   3. Once the cap is crossed, EVERY remaining queued delegate in the
//      same dispatch call is rejected as a CASCADE — the dispatcher
//      doesn't re-check each one independently because the accumulated
//      total can only grow.
//   4. Cap-rejected delegates transition their custody record from
//      `queued` to `failed`, identical to chain-depth rejections.
//   5. Cap rejections emit a system event with "cost-capped" text.
//
// Tests guard distinct corners of the
// cost-cap contract:
//   - just-under   → ALLOW (proves the gate isn't over-eager)
//   - just-over    → REJECT (proves the gate fires)
//   - exact        → ALLOW (proves strict-greater-than, not >=)
//   - cascade      → all-remaining-rejected (proves the loop short-circuits)
//   - custody      → failed-state recorded (proves side-effect persists)
//
// If a future refactor changes the comparison operator (`>` → `>=`),
// removes the cascade short-circuit, or skips the terminal custody write on
// cost-rejection, exactly one of these tests will fire and route the
// reviewer to the budget block in delegate-dispatch.ts. The five-point
// coverage is intentional — collapsing any two would leave a blind spot.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock setup ──────────────────────────────────────────────────────────
// Spawn, system events, and the logger are mocked so we can assert on
// dispatcher INTENT; continuation custody is the real store, so the persisted
// record state is observed directly.
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
  // Fresh mock state per test — chain-state contamination between tests
  // could mask a real budget-check regression by carrying tokens forward.
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

describe("cost-cap exhaustion mid-chain", () => {
  // COST-CAP AXIS: tests below pin five points relative to costCapTokens:
  //   accumulated = cap - 1   → ALLOW   (sanity: gate isn't over-eager)
  //   accumulated = cap + 1   → REJECT  (sanity: gate fires)
  //   accumulated = cap       → ALLOW   (canon: strict-greater-than, not >=)
  //   cascade (3 queued, all over) → 3 rejected (canon: short-circuit loop)
  //   side-effect (custody)        → failed-state (canon: persistent record)

  // ───────────────────────────────────────────────────────────────────────
  // JUST-UNDER case: accumulated = 499_999, cap = 500_000.
  //
  // CANON GUARDED: the gate is not over-eager. Being 1 token below the
  // cap is still under the cap; dispatch should succeed.
  //
  // Regression indicator: if this test starts asserting rejection, the
  // gate operator went from `>` to `>=` or got an off-by-one; reviewer
  // should look at the cost-cap comparison in delegate-dispatch.ts.
  // ───────────────────────────────────────────────────────────────────────
  it("allows dispatch when accumulatedChainTokens is 1 below costCapTokens", async () => {
    const sessionKey = "session-cost-cap-just-under";
    await seedOwnerSession(sessionKey);
    await enqueuePendingDelegate(sessionKey, { task: "squeaks under the cap" });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 0,
        chainStartedAt: Date.now(),
        accumulatedChainTokens: 499_999,
      },
      ctx: { sessionKey },
      maxChainLength: 10,
      config: {
        enabled: true,
        defaultDelayMs: 15_000,
        minDelayMs: 5_000,
        maxDelayMs: 300_000,
        maxChainLength: 10,
        costCapTokens: 500_000,
        maxDelegatesPerTurn: 5,
        maxPendingWork: 32,
        crossSessionTargeting: "disabled",
        earlyWarningBand: 0.3125,
      },
    });

    // 499_999 < 500_000 → not cost-capped, should spawn.
    expect(result.dispatched).toBe(1);
    expect(result.rejected).toBe(0);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining("squeaks under the cap"),
      }),
      expect.objectContaining({ agentSessionKey: sessionKey }),
    );
  });

  // ───────────────────────────────────────────────────────────────────────
  // JUST-OVER case: accumulated = 500_001, cap = 500_000.
  //
  // CANON GUARDED: the gate fires on over-cap, emitting the cost-capped
  // system event so the model can see why its delegate didn't dispatch.
  //
  // Regression indicator: if this test starts asserting "dispatched: 1",
  // the cost-cap check has been removed or bypassed; reviewer should
  // grep delegate-dispatch.ts for costCapTokens comparisons.
  // ───────────────────────────────────────────────────────────────────────
  it("rejects dispatch when accumulatedChainTokens exceeds costCapTokens by 1", async () => {
    const sessionKey = "session-cost-cap-just-over";
    await enqueuePendingDelegate(sessionKey, { task: "over the budget" });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 0,
        chainStartedAt: Date.now(),
        accumulatedChainTokens: 500_001,
      },
      ctx: { sessionKey },
      maxChainLength: 10,
      config: {
        enabled: true,
        defaultDelayMs: 15_000,
        minDelayMs: 5_000,
        maxDelayMs: 300_000,
        maxChainLength: 10,
        costCapTokens: 500_000,
        maxDelegatesPerTurn: 5,
        maxPendingWork: 32,
        crossSessionTargeting: "disabled",
        earlyWarningBand: 0.3125,
      },
    });

    expect(result.dispatched).toBe(0);
    expect(result.rejected).toBe(1);
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();

    // Surface canon: cost-cap rejections emit a "cost-capped" system event.
    // The text content is part of the contract with continue-work-signal-v2
    // so the model can self-correct on next turn.
    expect(enqueueSystemEventMock).toHaveBeenCalledWith(expect.stringContaining("cost-capped"), {
      sessionKey: resolveSystemEventQueueKey(sessionKey, "main"),
      trusted: true,
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // CASCADE case: 3 delegates queued, all start over-cap.
  //
  // CANON GUARDED: once accumulated tokens exceed the cap, every
  // remaining queued delegate in the same dispatch call is rejected —
  // the loop doesn't re-evaluate from scratch (accumulated can only
  // grow). This is the cascade-rejection-on-cap behavior.
  //
  // Regression indicator: if this test starts asserting "rejected: 1"
  // (only the first checked, rest mysteriously absent) or "rejected: 0,
  // dispatched: 3" (cap somehow cleared mid-loop), the cascade logic is
  // broken; reviewer should look at the for-each-delegate iteration in
  // delegate-dispatch.ts.
  // ───────────────────────────────────────────────────────────────────────
  it("rejects all remaining queued delegates once cost cap is crossed", async () => {
    const sessionKey = "session-cost-cap-remaining-rejected";
    await seedOwnerSession(sessionKey);
    await enqueuePendingDelegate(sessionKey, { task: "delegate-1" });
    await enqueuePendingDelegate(sessionKey, { task: "delegate-2" });
    await enqueuePendingDelegate(sessionKey, { task: "delegate-3" });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 0,
        chainStartedAt: Date.now(),
        accumulatedChainTokens: 500_001,
      },
      ctx: { sessionKey },
      maxChainLength: 10,
      config: {
        enabled: true,
        defaultDelayMs: 15_000,
        minDelayMs: 5_000,
        maxDelayMs: 300_000,
        maxChainLength: 10,
        costCapTokens: 500_000,
        maxDelegatesPerTurn: 5,
        maxPendingWork: 32,
        crossSessionTargeting: "disabled",
        earlyWarningBand: 0.3125,
      },
    });

    // ALL three should be rejected — once over cap, every subsequent
    // delegate in the same dispatch call is also over (accumulated can
    // only grow, never shrink, within a single dispatch).
    expect(result.dispatched).toBe(0);
    expect(result.rejected).toBe(3);
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────
  // SIDE-EFFECT case: custody record state on cost-cap rejection.
  //
  // CANON GUARDED: cost-cap rejection transitions the persistent
  // custody record from `queued` to `failed`, identical to chain-depth
  // rejections. The two budget-rejection paths must produce symmetric
  // observable state.
  //
  // Regression indicator: if the record stays `queued` after a cost-cap
  // rejection, the terminal write is missing from the cost-cap branch
  // (but possibly still present in the chain-depth branch — the sibling
  // test would still pass). This is a sneaky regression shape; reviewer
  // should diff the two rejection branches for parity.
  // ───────────────────────────────────────────────────────────────────────
  it("marks custody records as failed for cost-cap-rejected delegates", async () => {
    const sessionKey = "session-cost-cap-taskflow-failed";
    await enqueuePendingDelegate(sessionKey, { task: "doomed by cost" });

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
        currentChainCount: 0,
        chainStartedAt: Date.now(),
        accumulatedChainTokens: 500_001,
      },
      ctx: { sessionKey },
      maxChainLength: 10,
      config: {
        enabled: true,
        defaultDelayMs: 15_000,
        minDelayMs: 5_000,
        maxDelayMs: 300_000,
        maxChainLength: 10,
        costCapTokens: 500_000,
        maxDelegatesPerTurn: 5,
        maxPendingWork: 32,
        crossSessionTargeting: "disabled",
        earlyWarningBand: 0.3125,
      },
    });

    // Final-state assertion: queued → failed. Symmetric with the
    // chain-depth equivalent test in the sibling file.
    expect((await readCustodyRecordForTest(recordId))?.status).toBe("failed");
  });

  // ───────────────────────────────────────────────────────────────────────
  // EXACT-BOUNDARY case: accumulated === costCapTokens (= 500_000).
  //
  // CANON GUARDED: strict-greater-than semantics. The check is
  // `accumulatedChainTokens > costCapTokens`, NOT `>=`. At exactly the
  // cap value, dispatch is still ALLOWED — the cap is the inclusive
  // ceiling, not the exclusive one.
  //
  // Regression indicator: this is the single most surgical pin in the
  // file. If `>` ever flips to `>=` (very easy refactor mistake, looks
  // like a "be safer" change), this test fires immediately and only
  // this test — none of the just-under/just-over/cascade tests would
  // catch it. Reviewer should look at the cost-cap comparison operator
  // in delegate-dispatch.ts and verify it's strict-greater-than.
  // ───────────────────────────────────────────────────────────────────────
  it("rejects at exact boundary (accumulatedChainTokens === costCapTokens is NOT over)", async () => {
    const sessionKey = "session-cost-cap-exact-boundary";
    await seedOwnerSession(sessionKey);
    await enqueuePendingDelegate(sessionKey, { task: "at exact cap" });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 0,
        chainStartedAt: Date.now(),
        accumulatedChainTokens: 500_000,
      },
      ctx: { sessionKey },
      maxChainLength: 10,
      config: {
        enabled: true,
        defaultDelayMs: 15_000,
        minDelayMs: 5_000,
        maxDelayMs: 300_000,
        maxChainLength: 10,
        costCapTokens: 500_000,
        maxDelegatesPerTurn: 5,
        maxPendingWork: 32,
        crossSessionTargeting: "disabled",
        earlyWarningBand: 0.3125,
      },
    });

    // The check is `accumulatedChainTokens > costCapTokens` (strict).
    // At exactly 500_000 it should NOT be cost-capped — equality is
    // the inclusive ceiling, not the exclusive one. NOTE: the test
    // title says "rejects at exact boundary" but the canon being
    // guarded is the OPPOSITE — the title preserves historical naming
    // while the assertions encode the actual contract (allow-at-cap).
    expect(result.dispatched).toBe(1);
    expect(result.rejected).toBe(0);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
  });
});
