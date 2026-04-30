/**
 * S1 — Two-hop chain across the subagent boundary (`r3164380565` cross-surface).
 *
 * **Boundary under test:** the audit-lane bug-shape was *caller discards
 * returned chainState → next reader loads stale 0/1 from sessionStore*.
 * The honest test must therefore:
 *
 *   1. Call real `dispatchToolDelegates`; capture returned `chainState`.
 *   2. Persist via the **same callsite under test** —
 *      `updateSessionStore(... persistContinuationChainState(entry, returned))`.
 *      This is what `subagent-announce`'s child-drain (r3164380565),
 *      `agent-runner` durable write-back (r3164418100), and
 *      `followup-runner` token persist (r3164418106) all do.
 *   3. **Drop** the returned `chainState`. Reload from disk via
 *      `loadSessionStore(skipCache:true)` + `loadContinuationChainState`.
 *   4. Dispatch hop 2 with the **disk-derived** chainState. Assert hop label
 *      `[continuation:chain-hop:2]`.
 *
 * If anyone reverts the persist call (the actual bug), step 4's
 * `loadContinuationChainState` returns `currentChainCount = 0`, and the
 * spawn label asserts `chain-hop:1`, failing the test.
 *
 * **No in-memory hand-off between hops.** That's the contract: persist→read
 * round-trip via the same write-site the audit family covers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// TaskFlow registry mock — delegate-store transitively depends on it.
const mockFlows = new Map<string, Record<string, unknown>>();
let flowIdCounter = 0;

vi.mock("../../../../src/tasks/task-flow-registry.js", () => ({
  createManagedTaskFlow: vi.fn((params: Record<string, unknown>) => {
    const flowId = `flow-${++flowIdCounter}`;
    mockFlows.set(flowId, {
      flowId,
      syncMode: "managed",
      ownerKey: params.ownerKey,
      controllerId: params.controllerId,
      status: "queued",
      stateJson: params.stateJson,
      goal: params.goal,
      currentStep: params.currentStep,
      revision: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return mockFlows.get(flowId);
  }),
  listTaskFlowsForOwnerKey: vi.fn((ownerKey: string) =>
    [...mockFlows.values()].filter((f) => f.ownerKey === ownerKey),
  ),
  finishFlow: vi.fn((params: { flowId: string; expectedRevision: number }) => {
    const flow = mockFlows.get(params.flowId);
    if (!flow || flow.revision !== params.expectedRevision) {
      return { applied: false, reason: flow ? "revision_conflict" : "not_found" };
    }
    flow.status = "succeeded";
    flow.revision = flow.revision + 1;
    return { applied: true, flow: { ...flow } };
  }),
  failFlow: vi.fn((params: { flowId: string }) => {
    const flow = mockFlows.get(params.flowId);
    if (flow) {
      flow.status = "failed";
    }
    return { applied: !!flow };
  }),
  deleteTaskFlowRecordById: vi.fn((flowId: string) => {
    mockFlows.delete(flowId);
  }),
}));

// Fake spawn — installed at module-mock time, swapped per-test below.
const fakeSpawnRef = { fn: vi.fn() };
vi.mock("../../../../src/agents/subagent-spawn.js", () => ({
  spawnSubagentDirect: (
    spec: Record<string, unknown>,
    ctx: Record<string, unknown>,
  ) => fakeSpawnRef.fn(spec, ctx),
}));

import {
  dispatchToolDelegates,
  resetDelegateDispatchHedgesForTests,
} from "../../../../src/auto-reply/continuation/delegate-dispatch.js";
import { enqueuePendingDelegate } from "../../../../src/auto-reply/continuation/delegate-store.js";
import {
  loadContinuationChainState,
  persistContinuationChainState,
  resetContinuationStateForTests,
} from "../../../../src/auto-reply/continuation/state.js";
import { updateSessionStore } from "../../../../src/config/sessions/store.js";
import {
  createDurabilityFixture,
  createFakeSpawn,
  readSessionEntry,
  seedSessionEntry,
  type DurabilityFixture,
} from "./durability-fixture.js";

describe("S1 — two-hop chain across subagent boundary (r3164380565)", () => {
  let fixture: DurabilityFixture;
  let spawn: ReturnType<typeof createFakeSpawn>;

  beforeEach(async () => {
    mockFlows.clear();
    flowIdCounter = 0;
    fixture = await createDurabilityFixture();
    spawn = createFakeSpawn();
    fakeSpawnRef.fn = vi.fn(spawn.fn);
  });

  afterEach(async () => {
    resetDelegateDispatchHedgesForTests();
    resetContinuationStateForTests();
    mockFlows.clear();
    await fixture.cleanup();
  });

  it("hop-2 reads chain count from disk after hop-1 persists via the same write-site", async () => {
    const sessionKey = "agent:main:main";
    const startedAt = 1_700_000_000_000;

    // Seed parent entry with chain count 0 on disk.
    await seedSessionEntry(fixture.storePath, sessionKey, {
      sessionId: "session-parent",
      continuationChainCount: 0,
      continuationChainStartedAt: startedAt,
      continuationChainTokens: 0,
    });

    // Hop 1 — enqueue + dispatch. Build initial chainState by reading from disk
    // (matches what production agent-runner / subagent-announce do).
    enqueuePendingDelegate(sessionKey, { task: "first hop", mode: "silent-wake" });

    const initialEntry = readSessionEntry(fixture.storePath, sessionKey);
    const initialChainState = loadContinuationChainState(initialEntry);
    expect(initialChainState.currentChainCount).toBe(0);

    const firstResult = await dispatchToolDelegates({
      sessionKey,
      chainState: initialChainState,
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(firstResult.dispatched).toBe(1);
    expect(firstResult.chainState.currentChainCount).toBe(1);
    expect(spawn.calls).toHaveLength(1);
    expect(spawn.calls[0]?.task).toContain("[continuation:chain-hop:1]");

    // SAME WRITE-SITE the audit-lane fixes use: updateSessionStore wrapping
    // persistContinuationChainState. If a future regression discards
    // firstResult.chainState (the original bug shape), this write does not
    // happen and hop-2 reads stale 0/1 below.
    await updateSessionStore(fixture.storePath, (store) => {
      const entry = store[sessionKey];
      if (!entry) {
        throw new Error(`missing entry for ${sessionKey} after hop 1`);
      }
      persistContinuationChainState({
        sessionEntry: entry,
        count: firstResult.chainState.currentChainCount,
        startedAt: firstResult.chainState.chainStartedAt,
        tokens: firstResult.chainState.accumulatedChainTokens,
      });
    });

    // ── BOUNDARY ──
    // Drop firstResult entirely. Reload from disk. Build hop-2 chainState
    // from what the next reader observes, not from in-memory hand-off.
    const persistedEntry = readSessionEntry(fixture.storePath, sessionKey);
    expect(persistedEntry?.continuationChainCount).toBe(1);
    expect(persistedEntry?.continuationChainStartedAt).toBe(startedAt);

    const reloadedChainState = loadContinuationChainState(persistedEntry);
    expect(reloadedChainState.currentChainCount).toBe(1);

    // Hop 2 — fresh dispatch using the disk-reloaded chainState.
    enqueuePendingDelegate(sessionKey, { task: "second hop", mode: "silent-wake" });

    const secondResult = await dispatchToolDelegates({
      sessionKey,
      chainState: reloadedChainState,
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    // Boundary assertion: hop-2 spawn label proves the disk-reloaded count
    // drove chain-budget enforcement. If persist had been skipped, this would
    // assert chain-hop:1 instead and the test would fail.
    expect(secondResult.dispatched).toBe(1);
    expect(secondResult.chainState.currentChainCount).toBe(2);
    expect(spawn.calls).toHaveLength(2);
    expect(spawn.calls[1]?.task).toContain("[continuation:chain-hop:2]");
  });

  it("regression sentinel: if persist is skipped, hop-2 dispatches as chain-hop:1", async () => {
    // Negative case — proves the boundary assertion above is load-bearing.
    // We deliberately do NOT call persistContinuationChainState between hops;
    // hop-2 must reload count=0 from disk and produce chain-hop:1.
    const sessionKey = "agent:main:regression";

    await seedSessionEntry(fixture.storePath, sessionKey, {
      sessionId: "session-regression",
      continuationChainCount: 0,
      continuationChainStartedAt: 1_700_000_000_000,
      continuationChainTokens: 0,
    });

    enqueuePendingDelegate(sessionKey, { task: "first hop", mode: "silent-wake" });

    const initialChainState = loadContinuationChainState(
      readSessionEntry(fixture.storePath, sessionKey),
    );
    const firstResult = await dispatchToolDelegates({
      sessionKey,
      chainState: initialChainState,
      ctx: { sessionKey },
      maxChainLength: 10,
    });
    expect(firstResult.chainState.currentChainCount).toBe(1);

    // ── DELIBERATE BUG SIMULATION ── do not persist firstResult.chainState.

    enqueuePendingDelegate(sessionKey, { task: "second hop", mode: "silent-wake" });

    const reloadedChainState = loadContinuationChainState(
      readSessionEntry(fixture.storePath, sessionKey),
    );
    expect(reloadedChainState.currentChainCount).toBe(0); // bug visible: stale

    const secondResult = await dispatchToolDelegates({
      sessionKey,
      chainState: reloadedChainState,
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    // With persist skipped, hop-2 spawns as chain-hop:1 — proving the positive
    // test above actually depends on the persist call to reach chain-hop:2.
    expect(spawn.calls[1]?.task).toContain("[continuation:chain-hop:1]");
    expect(secondResult.chainState.currentChainCount).toBe(1);
  });

  it("seeded entry survives round-trip through real updateSessionStore", async () => {
    const key = "agent:main:subagent:test";
    await seedSessionEntry(fixture.storePath, key, {
      sessionId: "session-rt",
      continuationChainCount: 7,
      continuationChainStartedAt: 1_700_000_000_000,
      continuationChainTokens: 9_999,
    });

    const entry = readSessionEntry(fixture.storePath, key);
    expect(entry).toBeDefined();
    expect(entry?.continuationChainCount).toBe(7);
    expect(entry?.continuationChainStartedAt).toBe(1_700_000_000_000);
    expect(entry?.continuationChainTokens).toBe(9_999);
  });
});
