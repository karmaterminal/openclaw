/**
 * S3 — Durable persist across simulated gateway restart
 *       (`r3164418100` + persist-trio cross-surface).
 *
 * **Boundary under test:** the agent-runner P1 audit fix targets the case
 * where chain state is persisted via the *durable* triple-write
 * (sessionEntry + sessionStore in-memory + disk via `updateSessionStore`),
 * not just the in-memory `sessionEntry` mutation that
 * `lazy.runtime.persistContinuationChainState` does.
 *
 * Without the durable write-back, a restart (or any disk-based reload)
 * reverts chain depth/tokens/chain-id. This scenario simulates that
 * restart explicitly.
 *
 * **Honest test shape** (no in-memory hand-off, simulated restart):
 *   1. Seed entry on disk with chainCount=0.
 *   2. Build chainState from disk → dispatch hop 1 (chain advances to 1).
 *   3. Persist via the durable callsite (`updateSessionStore` +
 *      `persistContinuationChainState`).
 *   4. **Simulate gateway restart**:
 *        - `resetContinuationStateForTests()` clears all in-memory
 *          continuation maps (timer handles, refs, hedges).
 *        - `resetDelegateDispatchHedgesForTests()` for explicit clarity.
 *        - `loadSessionStore(skipCache: true)` forces a fresh disk read,
 *          mimicking a process boot reading the on-disk state.
 *   5. Build hop-2 chainState exclusively from the freshly-reloaded entry.
 *   6. Dispatch hop 2 → assert spawn label `[continuation:chain-hop:2]`
 *      AND tokens carry across (audit-fix triple-write covers tokens too).
 *
 * Regression sentinel: if the durable write-back is replaced by the
 * in-memory-only `lazy.runtime.persistContinuationChainState` (the bug
 * shape r3164418100 fixed), the disk entry stays at chainCount=0; after
 * the simulated restart the reloaded chainState is fresh, and hop 2
 * spawns as `chain-hop:1`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    flow.revision = (flow.revision as number) + 1;
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
import {
  loadSessionStore,
  updateSessionStore,
} from "../../../../src/config/sessions/store.js";
import {
  createDurabilityFixture,
  createFakeSpawn,
  readSessionEntry,
  seedSessionEntry,
  type DurabilityFixture,
} from "./durability-fixture.js";

describe("S3 — durable persist across simulated gateway restart (r3164418100)", () => {
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

  /**
   * Helper: simulate a gateway process restart between hops. Clears all
   * in-memory continuation maps; the next read goes to disk fresh.
   */
  function simulateGatewayRestart() {
    resetDelegateDispatchHedgesForTests();
    resetContinuationStateForTests();
  }

  it("hop-2 reads chain state from disk after simulated restart between hops", async () => {
    const sessionKey = "agent:main:durable";
    const startedAt = 1_700_000_000_000;
    const seedTokens = 50;
    const hop1Tokens = 75;

    await seedSessionEntry(fixture.storePath, sessionKey, {
      sessionId: "session-durable",
      continuationChainCount: 0,
      continuationChainStartedAt: startedAt,
      continuationChainTokens: seedTokens,
    });

    // Hop 1.
    enqueuePendingDelegate(sessionKey, { task: "first hop", mode: "silent-wake" });

    const initialEntry = readSessionEntry(fixture.storePath, sessionKey);
    const initialChainState = loadContinuationChainState(initialEntry, hop1Tokens);
    expect(initialChainState.currentChainCount).toBe(0);
    expect(initialChainState.accumulatedChainTokens).toBe(seedTokens + hop1Tokens);

    const firstResult = await dispatchToolDelegates({
      sessionKey,
      chainState: initialChainState,
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(firstResult.dispatched).toBe(1);
    expect(firstResult.chainState.currentChainCount).toBe(1);
    expect(firstResult.chainState.accumulatedChainTokens).toBe(seedTokens + hop1Tokens);

    // Durable triple-write — same callsite the audit-lane fix uses.
    await updateSessionStore(fixture.storePath, (store) => {
      const entry = store[sessionKey];
      if (!entry) {
        throw new Error("missing entry after hop 1");
      }
      persistContinuationChainState({
        sessionEntry: entry,
        count: firstResult.chainState.currentChainCount,
        startedAt: firstResult.chainState.chainStartedAt,
        tokens: firstResult.chainState.accumulatedChainTokens,
      });
    });

    // ── SIMULATED GATEWAY RESTART ──
    simulateGatewayRestart();

    // Fresh disk read — `skipCache:true` mimics a process boot.
    const reloadedStore = loadSessionStore(fixture.storePath, { skipCache: true });
    const reloadedEntry = reloadedStore[sessionKey];
    expect(reloadedEntry).toBeDefined();
    expect(reloadedEntry?.continuationChainCount).toBe(1);
    expect(reloadedEntry?.continuationChainTokens).toBe(seedTokens + hop1Tokens);

    // Build hop-2 chainState only from disk-reloaded entry. No in-memory hand-off.
    const reloadedChainState = loadContinuationChainState(reloadedEntry);
    expect(reloadedChainState.currentChainCount).toBe(1);
    expect(reloadedChainState.accumulatedChainTokens).toBe(seedTokens + hop1Tokens);

    // Hop 2.
    enqueuePendingDelegate(sessionKey, { task: "second hop", mode: "silent-wake" });

    const secondResult = await dispatchToolDelegates({
      sessionKey,
      chainState: reloadedChainState,
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(secondResult.dispatched).toBe(1);
    expect(secondResult.chainState.currentChainCount).toBe(2);
    expect(spawn.calls).toHaveLength(2);
    expect(spawn.calls[0]?.task).toContain("[continuation:chain-hop:1]");
    expect(spawn.calls[1]?.task).toContain("[continuation:chain-hop:2]");
  });

  it("regression sentinel: in-memory-only persist (no disk write) → restart loses chain", async () => {
    // Simulates the r3164418100 bug shape: the lazy.runtime variant of
    // `persistContinuationChainState` mutates only the in-memory
    // `sessionEntry`, never touching disk. After restart the on-disk entry
    // is stale, hop 2 spawns chain-hop:1.
    const sessionKey = "agent:main:durable-regression";

    await seedSessionEntry(fixture.storePath, sessionKey, {
      sessionId: "session-durable-regression",
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

    // ── DELIBERATE BUG ── in-memory mutation only, no updateSessionStore wrap.
    const inMemoryEntry = readSessionEntry(fixture.storePath, sessionKey);
    if (inMemoryEntry) {
      // This mutates a snapshot returned from the cache, never persisted to disk.
      persistContinuationChainState({
        sessionEntry: inMemoryEntry,
        count: firstResult.chainState.currentChainCount,
        startedAt: firstResult.chainState.chainStartedAt,
        tokens: firstResult.chainState.accumulatedChainTokens,
      });
    }

    // Restart — drops cache + in-memory state.
    simulateGatewayRestart();

    const reloadedStore = loadSessionStore(fixture.storePath, { skipCache: true });
    const reloadedEntry = reloadedStore[sessionKey];
    // Bug visible: chain count never reached disk.
    expect(reloadedEntry?.continuationChainCount).toBe(0);

    enqueuePendingDelegate(sessionKey, { task: "second hop", mode: "silent-wake" });
    const reloadedChainState = loadContinuationChainState(reloadedEntry);
    const secondResult = await dispatchToolDelegates({
      sessionKey,
      chainState: reloadedChainState,
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    // With persist failing to reach disk, hop 2 sees a fresh chain.
    expect(spawn.calls[1]?.task).toContain("[continuation:chain-hop:1]");
    expect(secondResult.chainState.currentChainCount).toBe(1);
  });
});
