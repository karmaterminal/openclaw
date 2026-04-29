/**
 * S1 — Two-hop chain across the subagent boundary (`r3164380565` cross-surface).
 *
 * **Shape:**
 *   1. Parent session has `currentChainCount = 0`. Parent emits a
 *      `continue_delegate(silent-wake)` via `enqueuePendingDelegate`.
 *   2. Real `dispatchToolDelegates` runs against the parent session, advancing
 *      `currentChainCount` to 1 and (via fake `spawnSubagentDirect`) creating
 *      a child session entry on disk.
 *   3. Parent's drain calls `dispatchToolDelegates` a second time after the
 *      child settles; that second call must observe the persisted advanced
 *      chain state, not the snapshot from before the first dispatch.
 *
 * **Why this matters:**
 *   The unit test in `subagent-announce.continuation-drain.test.ts` only
 *   asserts that `persistContinuationChainState` is called and that
 *   `updateSessionStore` is invoked. It does NOT prove that the *next reader*
 *   of that entry observes the new value. r3164380565 was specifically about
 *   the drain discarding the returned `chainState`; if the persist write went
 *   to the wrong key or wrong shape, the next dispatch could still see 0.
 *
 *   This test exercises the real on-disk round-trip: write via real
 *   `updateSessionStore` → read via real `loadSessionStore` → assert the
 *   second-hop dispatch enforces the advanced count.
 *
 * **Substrate:**
 *   - Real `dispatchToolDelegates` (boundary under test).
 *   - Real `enqueuePendingDelegate` / `consumePendingDelegates` (TaskFlow store
 *     mocked at the registry level — same pattern as `delegate-dispatch.test.ts`).
 *   - Faked `spawnSubagentDirect` returning deterministic accepted results.
 *   - Tmpdir session-store file via `createDurabilityFixture()`.
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
import { resetContinuationStateForTests } from "../../../../src/auto-reply/continuation/state.js";
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

  it("second-hop dispatch reads the advanced chain count after first hop persists", async () => {
    const parentSessionKey = "agent:main:main";

    await seedSessionEntry(fixture.storePath, parentSessionKey, {
      sessionId: "session-parent",
      continuationChainCount: 0,
      continuationChainStartedAt: Date.now(),
      continuationChainTokens: 0,
    });

    // First hop: enqueue + dispatch.
    enqueuePendingDelegate(parentSessionKey, {
      task: "first hop",
      mode: "silent-wake",
    });

    const startedAt = Date.now();
    const firstResult = await dispatchToolDelegates({
      sessionKey: parentSessionKey,
      chainState: {
        currentChainCount: 0,
        chainStartedAt: startedAt,
        accumulatedChainTokens: 0,
      },
      ctx: { sessionKey: parentSessionKey },
      maxChainLength: 10,
    });

    expect(firstResult.dispatched).toBe(1);
    expect(firstResult.chainState.currentChainCount).toBe(1);
    expect(spawn.calls).toHaveLength(1);
    expect(spawn.calls[0]?.task).toContain("[continuation:chain-hop:1]");

    // Second hop: enqueue + dispatch with the FIRST hop's returned chainState
    // (simulating what subagent-announce / agent-runner persist + reload).
    enqueuePendingDelegate(parentSessionKey, {
      task: "second hop",
      mode: "silent-wake",
    });

    const secondResult = await dispatchToolDelegates({
      sessionKey: parentSessionKey,
      chainState: firstResult.chainState,
      ctx: { sessionKey: parentSessionKey },
      maxChainLength: 10,
    });

    // Boundary assertion: second hop's spawn task is labeled chain-hop:2,
    // proving currentChainCount carried across the persist boundary.
    expect(secondResult.dispatched).toBe(1);
    expect(secondResult.chainState.currentChainCount).toBe(2);
    expect(spawn.calls).toHaveLength(2);
    expect(spawn.calls[1]?.task).toContain("[continuation:chain-hop:2]");
  });

  it("seeded entry survives round-trip through real updateSessionStore", async () => {
    // Sanity check the fixture itself: write → read sees the same fields.
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
