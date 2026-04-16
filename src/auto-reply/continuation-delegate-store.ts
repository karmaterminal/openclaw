import { z } from "zod";
import {
  createManagedTaskFlow,
  deleteTaskFlowRecordById,
  failFlow,
  finishFlow,
  listTaskFlowsForOwnerKey,
} from "../tasks/task-flow-registry.js";
import type { TaskFlowRecord } from "../tasks/task-flow-registry.types.js";
import type { PendingContinuationDelegate } from "./continuation-delegate.types.js";

export const CONTINUATION_DELEGATE_CONTROLLER_ID = "core/continuation-delegate";
export const CONTINUATION_POST_COMPACTION_CONTROLLER_ID = "core/continuation-post-compaction";

const PendingContinuationDelegateStateSchema = z.object({
  kind: z.literal("continuation_delegate"),
  task: z.string().min(1),
  delayMs: z.number().int().nonnegative().optional(),
  silent: z.boolean().optional(),
  silentWake: z.boolean().optional(),
  postCompaction: z.boolean().optional(),
});

type PendingContinuationDelegateState = z.infer<typeof PendingContinuationDelegateStateSchema>;

function buildPendingDelegateGoal(delegate: PendingContinuationDelegate): string {
  const task = delegate.task.trim();
  if (!task) {
    return delegate.postCompaction
      ? "Post-compaction continuation delegate"
      : "Continuation delegate";
  }
  const excerpt = task.length > 80 ? `${task.slice(0, 77)}...` : task;
  return delegate.postCompaction
    ? `Post-compaction delegate: ${excerpt}`
    : `Continuation delegate: ${excerpt}`;
}

function buildPendingDelegateState(
  delegate: PendingContinuationDelegate,
): PendingContinuationDelegateState {
  return {
    kind: "continuation_delegate",
    task: delegate.task,
    ...(delegate.delayMs !== undefined ? { delayMs: delegate.delayMs } : {}),
    ...(delegate.silent === true ? { silent: true } : {}),
    ...(delegate.silentWake === true ? { silentWake: true } : {}),
    ...(delegate.postCompaction === true ? { postCompaction: true } : {}),
  };
}

function isPendingDelegateFlow(flow: TaskFlowRecord): boolean {
  return flow.syncMode === "managed" && flow.controllerId === CONTINUATION_DELEGATE_CONTROLLER_ID;
}

function isPostCompactionDelegateFlow(flow: TaskFlowRecord): boolean {
  return (
    flow.syncMode === "managed" && flow.controllerId === CONTINUATION_POST_COMPACTION_CONTROLLER_ID
  );
}

function listQueuedPendingDelegateFlows(sessionKey: string): TaskFlowRecord[] {
  return listTaskFlowsForOwnerKey(sessionKey)
    .filter((flow) => isPendingDelegateFlow(flow) && flow.status === "queued")
    .toSorted((left, right) => left.createdAt - right.createdAt);
}

function listQueuedPostCompactionDelegateFlows(sessionKey: string): TaskFlowRecord[] {
  return listTaskFlowsForOwnerKey(sessionKey)
    .filter((flow) => isPostCompactionDelegateFlow(flow) && flow.status === "queued")
    .toSorted((left, right) => left.createdAt - right.createdAt);
}

function decodePendingDelegateState(
  flow: TaskFlowRecord,
): PendingContinuationDelegateState | undefined {
  const parsed = PendingContinuationDelegateStateSchema.safeParse(flow.stateJson);
  return parsed.success ? parsed.data : undefined;
}

export function enqueuePendingDelegate(
  sessionKey: string,
  delegate: PendingContinuationDelegate,
): void {
  createManagedTaskFlow({
    ownerKey: sessionKey,
    controllerId:
      delegate.postCompaction === true
        ? CONTINUATION_POST_COMPACTION_CONTROLLER_ID
        : CONTINUATION_DELEGATE_CONTROLLER_ID,
    notifyPolicy: "silent",
    goal: buildPendingDelegateGoal(delegate),
    currentStep:
      delegate.postCompaction === true
        ? "Staged for release after compaction"
        : "Queued for continuation dispatch",
    stateJson: buildPendingDelegateState(delegate),
  });
}

export function stagePostCompactionDelegate(
  sessionKey: string,
  delegate: Omit<PendingContinuationDelegate, "postCompaction">,
): void {
  enqueuePendingDelegate(sessionKey, {
    ...delegate,
    silent: delegate.silent ?? true,
    silentWake: delegate.silentWake ?? true,
    postCompaction: true,
  });
}

export function consumePendingDelegates(sessionKey: string): PendingContinuationDelegate[] {
  const delegates: PendingContinuationDelegate[] = [];

  for (const flow of listQueuedPendingDelegateFlows(sessionKey)) {
    const state = decodePendingDelegateState(flow);
    if (!state) {
      failFlow({
        flowId: flow.flowId,
        expectedRevision: flow.revision,
        currentStep: "Rejected invalid continuation payload",
        blockedSummary: "Pending continuation delegate payload could not be decoded.",
      });
      continue;
    }

    const finished = finishFlow({
      flowId: flow.flowId,
      expectedRevision: flow.revision,
      currentStep: "Released to continuation scheduler",
      stateJson: {
        ...state,
        releasedAt: Date.now(),
      },
    });
    if (!finished.applied) {
      continue;
    }

    delegates.push({
      task: state.task,
      ...(state.delayMs !== undefined ? { delayMs: state.delayMs } : {}),
      ...(state.silent === true ? { silent: true } : {}),
      ...(state.silentWake === true ? { silentWake: true } : {}),
    });
  }

  return delegates;
}

export function consumeStagedPostCompactionDelegates(
  sessionKey: string,
): PendingContinuationDelegate[] {
  const delegates: PendingContinuationDelegate[] = [];

  for (const flow of listQueuedPostCompactionDelegateFlows(sessionKey)) {
    const state = decodePendingDelegateState(flow);
    if (!state) {
      failFlow({
        flowId: flow.flowId,
        expectedRevision: flow.revision,
        currentStep: "Rejected invalid post-compaction payload",
        blockedSummary: "Staged post-compaction delegate payload could not be decoded.",
      });
      continue;
    }

    const finished = finishFlow({
      flowId: flow.flowId,
      expectedRevision: flow.revision,
      currentStep: "Released after compaction",
      stateJson: {
        ...state,
        releasedAt: Date.now(),
      },
    });
    if (!finished.applied) {
      continue;
    }

    delegates.push({
      task: state.task,
      ...(state.delayMs !== undefined ? { delayMs: state.delayMs } : {}),
      ...(state.silent === true ? { silent: true } : {}),
      ...(state.silentWake === true ? { silentWake: true } : {}),
      postCompaction: true,
    });
  }

  return delegates;
}

export function pendingDelegateCount(sessionKey: string): number {
  return listQueuedPendingDelegateFlows(sessionKey).length;
}

export function stagedPostCompactionDelegateCount(sessionKey: string): number {
  return listQueuedPostCompactionDelegateFlows(sessionKey).length;
}

export function clearPendingDelegates(sessionKey: string): void {
  for (const flow of listTaskFlowsForOwnerKey(sessionKey).filter(
    (candidate) => isPendingDelegateFlow(candidate) || isPostCompactionDelegateFlow(candidate),
  )) {
    deleteTaskFlowRecordById(flow.flowId);
  }
}
