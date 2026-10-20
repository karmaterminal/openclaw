import { createSubagentRunRecord } from "../../subagent-test-fixtures.test-helpers.js";
import { createDeliveredWake } from "./subagent-registry.persistence.test-support.js";

export function createHydratedRegistryRuns(endedAt: number) {
  const yieldedRun = createDeliveredWake("run-hydrated-yield", undefined, {
    taskRunId: "run-hydrated-yield",
    requesterTurnRunId: "run-requester",
    requesterTurnYielded: true,
    childSessionKey: "agent:main:subagent:hydrated-yield",
    childSessionIdentity: { sessionId: "sess-hydrated-yield" },
    createdAt: endedAt - 1_000,
    endedReason: "subagent-complete",
    startedAt: endedAt - 500,
    endedAt,
    cleanupCompletedAt: endedAt,
  });
  const queuedCollector = createSubagentRunRecord({
    runId: "run-hydrated-collector",
    childSessionKey: "agent:main:subagent:hydrated-collector",
    childSessionIdentity: {
      sessionId: "sess-hydrated-collector",
      lifecycleRevision: "revision-hydrated-collector",
    },
    createdAt: endedAt - 500,
    collect: true,
    swarmRequesterSessionKey: "agent:main:main",
    groupId: "hydrated-group",
    archiveAtMs: endedAt - 1,
    startedAt: endedAt - 400,
    endedAt,
    outcome: { status: "error", error: "launch failed" },
    completion: { required: true },
    delivery: { status: "pending" },
    collectorCompletion: { status: "failed" },
    collectorLaunchCleanupPending: true,
  });
  const runningRun = createSubagentRunRecord({
    runId: "run-hydrated-running",
    childSessionKey: "agent:main:subagent:hydrated-running",
    childSessionIdentity: { sessionId: "sess-hydrated-running" },
    createdAt: endedAt,
    execution: { status: "running", startedAt: endedAt },
    delivery: { status: "not_required" },
  });
  const finishedRun = createSubagentRunRecord({
    runId: "run-hydrated-history",
    childSessionKey: "agent:main:subagent:hydrated-history",
    endedAt,
    cleanupCompletedAt: endedAt,
    completion: { required: true, resultText: "retained result" },
    delivery: { status: "delivered", deliveredAt: endedAt },
  });
  return { finishedRun, queuedCollector, runningRun, yieldedRun };
}

export function createRejectedRequesterWake(params: {
  restarting: boolean;
  waitingForActivation: boolean;
  endedAt: number;
}) {
  return createDeliveredWake("run-rejected-requester-wake", {
    status: params.restarting && !params.waitingForActivation ? "dispatching" : "pending",
    attemptCount: params.waitingForActivation ? 2 : params.restarting ? 1 : 0,
    ...(params.restarting ? { replayCount: 1, nextAttemptAt: params.endedAt + 30_000 } : {}),
    batchRunIds: ["run-rejected-requester-wake"],
    requesterYieldBatch: true,
    afterRequesterYield: true,
    rearmGeneration: 1,
  });
}

export function createOutstandingWakeRuns(runCount: number) {
  return Array.from({ length: runCount }, (_, index) => {
    const runId = `run-outstanding-wake-${index}`;
    return {
      ...createDeliveredWake(runId, {
        status: "pending",
        attemptCount: 2,
        batchRunIds: [runId],
        requesterYieldBatch: true,
        afterRequesterYield: true,
        rearmGeneration: 1,
      }),
      requesterSessionKey: `agent:main:requester-${index}`,
    };
  });
}

export function createSelectedAllRecipientAuthorityBinding() {
  return {
    version: 1 as const,
    selection: "selected" as const,
    recipients: [
      {
        sessionKey: "agent:main:main",
        authority: {
          state: "bound" as const,
          epoch: "11111111-1111-4111-8111-111111111111",
        },
      },
    ],
  };
}
