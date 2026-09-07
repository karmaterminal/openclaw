import type { TaskFlowRecord } from "../../tasks/task-flow-registry.types.js";
import type {
  ContinuationWorkBatchParams,
  ContinuationWorkBatchResult,
  ContinuationWorkScheduleParams,
  ContinuationWorkScheduleResult,
} from "./types.js";
import type { PendingContinuationWork } from "./work-flow-state.js";
import {
  enqueuePendingWorkReplacing,
  listQueuedTurnEndParkedWork,
} from "./work-replacement-store.js";
import { enqueuePendingWork } from "./work-store.js";

type ScheduledWorkEnqueueResult =
  | {
      scheduled: true;
      work: PendingContinuationWork;
      supersededCount: number;
    }
  | Extract<ContinuationWorkScheduleResult, { scheduled: false }>;

export function enqueueContinuationWorkForSchedule(params: {
  work: PendingContinuationWork;
  schedule: Pick<
    ContinuationWorkScheduleParams,
    "chainState" | "log" | "priorParkedFlowsToSupersede" | "sessionKey"
  >;
}): ScheduledWorkEnqueueResult {
  const priorFlows = params.schedule.priorParkedFlowsToSupersede;
  if (!priorFlows || priorFlows.length === 0) {
    const work = enqueuePendingWork(params.work);
    return work
      ? { scheduled: true, work, supersededCount: 0 }
      : { scheduled: false, capped: false, chainState: params.schedule.chainState };
  }
  const replacement = enqueuePendingWorkReplacing({
    work: params.work,
    priorFlows,
    summary: "Superseded by a newer continue_work election after its replacement became durable.",
  });
  if (!replacement.applied) {
    params.schedule.log?.(
      `[continuation:work-replacement-not-committed] session=${params.schedule.sessionKey} reason=${replacement.reason}${replacement.flowId ? ` flowId=${replacement.flowId}` : ""}`,
    );
    return {
      scheduled: false,
      capped: false,
      chainState: params.schedule.chainState,
      replacementFailure: replacement.reason,
      ...(replacement.flowId ? { replacementFailureFlowId: replacement.flowId } : {}),
    };
  }
  params.schedule.log?.(
    `[continuation:work-turn-end-parked-coalesced] session=${params.schedule.sessionKey} folded=${replacement.supersededCount}`,
  );
  return {
    scheduled: true,
    work: replacement.work,
    supersededCount: replacement.supersededCount,
  };
}

export function prepareContinuationWorkBatchReplacement(params: ContinuationWorkBatchParams): {
  priorParkedFlows: readonly TaskFlowRecord[];
  pendingCapacityExclusionFlowIds?: ReadonlySet<string>;
} {
  const priorParkedFlows =
    params.priorParkedFlowsToSupersede ??
    (params.coalescePriorParkedWork === false
      ? []
      : listQueuedTurnEndParkedWork(params.sessionKey));
  if (priorParkedFlows.length === 0) {
    return {
      priorParkedFlows,
      pendingCapacityExclusionFlowIds: params.pendingCapacityExclusionFlowIds,
    };
  }

  return {
    priorParkedFlows,
    pendingCapacityExclusionFlowIds: new Set([
      ...(params.pendingCapacityExclusionFlowIds ?? []),
      ...priorParkedFlows.map((flow) => flow.flowId),
    ]),
  };
}

export function buildContinuationWorkBatchFailure(input: {
  result: Extract<ContinuationWorkScheduleResult, { scheduled: false }>;
  scheduledCount: number;
  requestCount: number;
  chainState: ContinuationWorkBatchResult["chainState"];
}): ContinuationWorkBatchResult {
  return {
    scheduledCount: input.scheduledCount,
    cappedCount: input.requestCount - input.scheduledCount,
    capped: input.result.capped,
    chainState: input.chainState,
    ...(input.result.replacementFailure
      ? { replacementFailure: input.result.replacementFailure }
      : {}),
    ...(input.result.replacementFailureFlowId
      ? { replacementFailureFlowId: input.result.replacementFailureFlowId }
      : {}),
  };
}
