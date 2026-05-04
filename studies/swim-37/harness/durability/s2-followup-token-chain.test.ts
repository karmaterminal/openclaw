/**
 * S2 — Followup-only token-chain persist (`r3164418106` cross-surface).
 *
 * **Boundary under test:** when a turn produces no tool-dispatched delegates
 * (delayed-only, all-deferred, or pure `continue_work`), `dispatchToolDelegates`
 * returns `dispatched: 0` but the chainState still carries the advanced
 * `accumulatedChainTokens` from `loadContinuationChainState(entry, turnTokens)`.
 *
 * The bug shape: prior `dispatched > 0 && tailEntry` guard in
 * `followup-runner.ts` skipped persistence entirely → next turn's
 * cost-cap reader loads stale token total → budget enforcement off.
 *
 * **Honest test shape** (no in-memory hand-off):
 *   1. Seed entry with `continuationChainTokens = 100`.
 *   2. Build chainState via real `loadContinuationChainState(entry, 150)`
 *      → `accumulatedChainTokens = 250`.
 *   3. Call real `dispatchToolDelegates` with EMPTY queue → `dispatched: 0`,
 *      chainState passed through unchanged with tokens 250.
 *   4. Persist via the same callsite the audit fix uses
 *      (`updateSessionStore` + `persistContinuationChainState`).
 *   5. Drop in-memory chainState. Reload from disk.
 *   6. Assert reloaded `continuationChainTokens === 250`.
 *
 * Regression sentinel: simulate the bug by guarding persist on
 * `dispatched > 0`. Reloaded entry stays at 100; assertion would fail.
 *
 * **Substrate:** stub on `dispatchToolDelegates` is unnecessary — the
 * real function with an empty queue exercises the exact path
 * (`toolDelegates.length === 0 → return { dispatched: 0, ..., chainState }`).
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
  spawnSubagentDirect: (spec: Record<string, unknown>, ctx: Record<string, unknown>) =>
    fakeSpawnRef.fn(spec, ctx),
}));

import {
  dispatchToolDelegates,
  resetDelegateDispatchHedgesForTests,
} from "../../../../src/auto-reply/continuation/delegate-dispatch.js";
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

describe("S2 — followup-only token chain persist (r3164418106)", () => {
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

  it("persists advanced chain tokens via dispatch-with-empty-queue → next turn reads them from disk", async () => {
    const sessionKey = "agent:main:followup";
    const startedAt = 1_700_000_000_000;
    const seedTokens = 100;
    const turnTokens = 150;

    await seedSessionEntry(fixture.storePath, sessionKey, {
      sessionId: "session-followup",
      continuationChainCount: 2,
      continuationChainStartedAt: startedAt,
      continuationChainTokens: seedTokens,
    });

    // Build chainState from disk + this turn's token cost.
    const initialEntry = readSessionEntry(fixture.storePath, sessionKey);
    const advancedChainState = loadContinuationChainState(initialEntry, turnTokens);
    expect(advancedChainState.accumulatedChainTokens).toBe(seedTokens + turnTokens);

    // Real dispatchToolDelegates with empty queue → returns chainState unchanged.
    const dispatchResult = await dispatchToolDelegates({
      sessionKey,
      chainState: advancedChainState,
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(dispatchResult.dispatched).toBe(0); // followup-only path
    expect(dispatchResult.chainState.accumulatedChainTokens).toBe(seedTokens + turnTokens);
    expect(spawn.calls).toHaveLength(0);

    // Persist via the same callsite the audit fix uses.
    await updateSessionStore(fixture.storePath, (store) => {
      const entry = store[sessionKey];
      if (!entry) {
        throw new Error(`missing entry for ${sessionKey} after dispatch`);
      }
      persistContinuationChainState({
        sessionEntry: entry,
        count: dispatchResult.chainState.currentChainCount,
        startedAt: dispatchResult.chainState.chainStartedAt,
        tokens: dispatchResult.chainState.accumulatedChainTokens,
      });
    });

    // Drop in-memory state, reload from disk, assert tokens persisted.
    const persistedEntry = readSessionEntry(fixture.storePath, sessionKey);
    expect(persistedEntry?.continuationChainTokens).toBe(seedTokens + turnTokens);
    expect(persistedEntry?.continuationChainCount).toBe(2); // unchanged
    expect(persistedEntry?.continuationChainStartedAt).toBe(startedAt);
  });

  it("regression sentinel: if persist is gated on dispatched>0, tokens stay stale on disk", async () => {
    // Simulates the original r3164418106 bug: persist wrapped in
    // `if (dispatchResult.dispatched > 0)`. Tokens never reach disk.
    const sessionKey = "agent:main:followup-regression";
    const seedTokens = 100;
    const turnTokens = 150;

    await seedSessionEntry(fixture.storePath, sessionKey, {
      sessionId: "session-followup-regression",
      continuationChainCount: 2,
      continuationChainStartedAt: 1_700_000_000_000,
      continuationChainTokens: seedTokens,
    });

    const advancedChainState = loadContinuationChainState(
      readSessionEntry(fixture.storePath, sessionKey),
      turnTokens,
    );

    const dispatchResult = await dispatchToolDelegates({
      sessionKey,
      chainState: advancedChainState,
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    // ── DELIBERATE BUG SIMULATION ──
    // Original guard: only persist when dispatched > 0.
    if (dispatchResult.dispatched > 0) {
      await updateSessionStore(fixture.storePath, (store) => {
        const entry = store[sessionKey];
        if (!entry) {
          return;
        }
        persistContinuationChainState({
          sessionEntry: entry,
          count: dispatchResult.chainState.currentChainCount,
          startedAt: dispatchResult.chainState.chainStartedAt,
          tokens: dispatchResult.chainState.accumulatedChainTokens,
        });
      });
    }

    // Reloaded entry shows tokens stuck at seed value — bug is visible.
    const reloaded = readSessionEntry(fixture.storePath, sessionKey);
    expect(reloaded?.continuationChainTokens).toBe(seedTokens);
    expect(reloaded?.continuationChainTokens).not.toBe(seedTokens + turnTokens);
  });

  it("#431 sentinel: bare persistContinuationChainState mutation (no updateSessionStore wrap) is orphaned for disk", async () => {
    // Simulates the #431 bug shape: r3164418106 closed the in-memory
    // shape but the bare `persistContinuationChainState({ sessionEntry:
    // tailEntry, ... })` mutation never reached disk via the followup
    // path. The followup-runner's only durable writer
    // (`persistRunSessionUsage` → `updateSessionStoreEntry`) does
    // `loadSessionStore(skipCache:true)` and patches usage fields only.
    //
    // Without the `updateSessionStore` wrap (added in the #431 fix at
    // `followup-runner.ts:485`-area), tokens stay stale on disk even
    // though the in-memory entry shows the advanced value.
    const sessionKey = "agent:main:followup-orphan";
    const seedTokens = 100;
    const turnTokens = 150;

    await seedSessionEntry(fixture.storePath, sessionKey, {
      sessionId: "session-followup-orphan",
      continuationChainCount: 2,
      continuationChainStartedAt: 1_700_000_000_000,
      continuationChainTokens: seedTokens,
    });

    // Load entry from disk into an in-memory "tailEntry"-shaped object.
    const tailEntry = readSessionEntry(fixture.storePath, sessionKey);
    expect(tailEntry).toBeDefined();

    const advancedChainState = loadContinuationChainState(tailEntry, turnTokens);

    const dispatchResult = await dispatchToolDelegates({
      sessionKey,
      chainState: advancedChainState,
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    // ── DELIBERATE BUG SIMULATION (#431 orphan shape) ──
    // Bare mutation only — NO `updateSessionStore` wrap. This is what
    // r3164418106 originally shipped at `followup-runner.ts:485`.
    persistContinuationChainState({
      sessionEntry: tailEntry!,
      count: dispatchResult.chainState.currentChainCount,
      startedAt: dispatchResult.chainState.chainStartedAt,
      tokens: dispatchResult.chainState.accumulatedChainTokens,
    });

    // In-memory tailEntry shows the advanced value (the in-memory shape
    // r3164418106 fixed correctly).
    expect(tailEntry!.continuationChainTokens).toBe(seedTokens + turnTokens);

    // But disk still has the stale value — the orphan #431 surfaced.
    const reloaded = readSessionEntry(fixture.storePath, sessionKey);
    expect(reloaded?.continuationChainTokens).toBe(seedTokens);
    expect(reloaded?.continuationChainTokens).not.toBe(seedTokens + turnTokens);
  });
});
