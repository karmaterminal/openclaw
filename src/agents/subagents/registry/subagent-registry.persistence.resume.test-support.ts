import { vi } from "vitest";
import { createSubagentRunRecord } from "../../subagent-test-fixtures.test-helpers.js";
import { createDeliveredWake } from "./subagent-registry.persistence.test-support.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

type WakeRequester =
  typeof import("../announce/subagent-announce.requester-settle-wake.js").maybeWakeRequesterAfterAllChildrenSettled;

export function createHydratedRegistryRuns(endedAt: number) {
  const yieldedRun = createDeliveredWake("run-hydrated-yield", undefined, {
    taskRunId: "run-hydrated-yield",
    requesterTurnRunId: "run-requester",
    requesterTurnYielded: true,
    childSessionKey: "agent:main:subagent:hydrated-yield",
    task: "wake only after lifecycle activation",
    createdAt: endedAt - 1_000,
    endedReason: "subagent-complete",
    startedAt: endedAt - 500,
    endedAt,
    cleanupCompletedAt: endedAt,
  });
  const queuedCollector = createSubagentRunRecord({
    runId: "run-hydrated-collector",
    childSessionKey: "agent:main:subagent:hydrated-collector",
    task: "clean only after lifecycle activation",
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
    task: "wait through the activated instance",
    createdAt: endedAt,
    execution: { status: "running", startedAt: endedAt },
    completion: { required: false },
    delivery: { status: "not_required" },
  });
  return { queuedCollector, runningRun, yieldedRun };
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

export function createSteeredRestoreRuns(endedAt: number, requesterYielded: boolean) {
  const run = createDeliveredWake("run-steered", undefined, {
    taskRunId: "run-original",
    requesterTurnRunId: "run-requester",
    ...(requesterYielded ? { requesterTurnYielded: true } : {}),
    childSessionKey: "agent:main:subagent:steered",
    task: "deliver the steered result",
    createdAt: endedAt - 1_000,
    endedReason: "subagent-complete",
    startedAt: endedAt - 500,
    endedAt,
    cleanupCompletedAt: endedAt,
  });
  const nonannouncing: SubagentRunRecord[] = [];
  for (const collect of [false, true]) {
    nonannouncing.push({
      ...run,
      runId: `run-nonannouncing-${collect}`,
      taskRunId: `run-nonannouncing-${collect}`,
      childSessionKey: `agent:main:subagent:nonannouncing-${collect}`,
      expectsCompletionMessage: false,
      requesterTurnYielded: undefined,
      collect,
      completion: { required: false, resultText: "quiet result", capturedAt: endedAt },
      delivery: { status: "not_required" },
      ...(collect ? { collectorCompletion: { status: "done" } } : {}),
    });
  }
  return { nonannouncing, run };
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

// Settle like the real waker so a later restore replay sees no pending wake.
export function createSettlingRequesterWake() {
  return vi.fn<WakeRequester>(async (params) => {
    const wake = params.settledEntry!.requesterSettleWake!;
    await params.completeBatch([params.settledEntry!], wake.rearmGeneration!, {
      delivered: true,
      path: "direct",
    });
    return true;
  });
}
