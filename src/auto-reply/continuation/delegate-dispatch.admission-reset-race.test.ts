import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnSubagentDirectMock = vi.fn();

vi.mock("../../agents/subagents/spawn/subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => spawnSubagentDirectMock(...args),
}));

vi.mock("../../config/sessions/session-accessor.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../config/sessions/session-accessor.js")>()),
  // Dispatch revalidates the owner session before and after the spawn fence; the
  // race under test is the claim abort, so the owner must resolve with a stable
  // lifecycle identity on every load.
  loadSessionEntry: ({ sessionKey }: { sessionKey: string }) => ({
    sessionId: `session-${sessionKey}`,
    lifecycleRevision: "revision-1",
  }),
  updateSessionEntry: vi.fn(async () => null),
}));

vi.mock("../../infra/session-delivery-queue-storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../infra/session-delivery-queue-storage.js")>()),
  loadPendingSessionDeliveries: vi.fn(async () => []),
}));

vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEventRaw: vi.fn(),
}));

import {
  abortContinuationDispatchClaims,
  resetContinuationDispatchClaimsForTests,
} from "./continuation-dispatch-claims.js";
import {
  custodyStateForTest,
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import { readDelegateAdmissionEvidence } from "./delegate-dispatch-accepted-children.js";
import { recoverPendingContinuationDelegates } from "./delegate-dispatch-recovery.js";
import { dispatchToolDelegates, resetDelegateDispatchHedgesForTests } from "./delegate-dispatch.js";
import { enqueuePendingDelegate } from "./delegate-store.js";
import { cancelSessionContinuations } from "./session-reset.js";
import type { ContinuationRuntimeConfig } from "./types.js";

function continuationConfig(): ContinuationRuntimeConfig {
  return {
    enabled: true,
    defaultDelayMs: 15_000,
    minDelayMs: 5_000,
    maxDelayMs: 300_000,
    maxChainLength: 10,
    costCapTokens: 500_000,
    maxDelegatesPerTurn: 5,
    maxPendingWork: 32,
    crossSessionTargeting: "enabled",
    earlyWarningBand: 0.3125,
  };
}

useContinuationCustodyTestState();

beforeEach(() => {
  spawnSubagentDirectMock.mockReset().mockResolvedValue({ status: "accepted" });
});

afterEach(() => {
  resetContinuationDispatchClaimsForTests();
  resetDelegateDispatchHedgesForTests();
});

describe("delegate dispatch admission reset race", () => {
  it("closes post-fence delegate admission when reset durably cancels the source", async () => {
    const sessionKey = "agent:main:delegate-reset-after-fence";
    const delegate = await enqueuePendingDelegate(sessionKey, {
      task: "must not spawn after reset",
    });
    let releaseSpawn!: () => void;
    let spawnReached!: () => void;
    const reachedSpawn = new Promise<void>((resolve) => {
      spawnReached = resolve;
    });
    const spawnBarrier = new Promise<void>((resolve) => {
      releaseSpawn = resolve;
    });
    spawnSubagentDirectMock.mockImplementationOnce(
      async (
        _params,
        context: {
          continuationDelegateAdmission: {
            assertCurrent(boundary: "child-session"): void;
          };
        },
      ) => {
        spawnReached();
        await spawnBarrier;
        context.continuationDelegateAdmission.assertCurrent("child-session");
        return { status: "accepted", childSessionKey: "unexpected-child" };
      },
    );

    const dispatch = dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 0,
        chainStartedAt: Date.now(),
        accumulatedChainTokens: 0,
      },
      ctx: { sessionKey },
      maxChainLength: 8,
      config: continuationConfig(),
    });
    await reachedSpawn;
    await cancelSessionContinuations(sessionKey);
    abortContinuationDispatchClaims(sessionKey);
    releaseSpawn();

    await expect(dispatch).resolves.toMatchObject({ dispatched: 0, rejected: 1 });
    const cancelled = await readCustodyRecordForTest(delegate.recordId);
    if (!cancelled) {
      throw new Error("expected the cancelled delegate record");
    }
    expect(cancelled.status).toBe("cancelled");
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    // No child was admitted under the claim's recorded child run ID: the
    // registry (the admission evidence owner, RFC §5.4.4) has no run for it.
    const childRunIds = cancelled.spawnAttempts.map((attempt) => attempt.childRunId);
    expect(childRunIds).toHaveLength(1);
    expect(spawnSubagentDirectMock.mock.calls[0]?.[0]).toMatchObject({
      continuationChildRunId: childRunIds[0],
    });
    await expect(
      readDelegateAdmissionEvidence({ runIds: childRunIds, requesterSessionKey: sessionKey }),
    ).resolves.toEqual({ kind: "none" });

    await recoverPendingContinuationDelegates();
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    const afterRecovery = await readCustodyRecordForTest(delegate.recordId);
    expect(afterRecovery?.status).toBe("cancelled");
    expect(afterRecovery?.revision).toBe(cancelled.revision);
    expect(afterRecovery && custodyStateForTest(afterRecovery)).toEqual(
      custodyStateForTest(cancelled),
    );
  });
});
