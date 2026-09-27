import { validateSubagentAttachments } from "../../agents/subagents/spawn/subagent-attachments.js";
import { getRuntimeConfig } from "../../config/config.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { registerDiagnosticContinuationQueueMetricsProvider } from "../../logging/diagnostic-continuation-queues.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  CONTINUATION_DELEGATE_CONTROLLER_ID,
  CONTINUATION_POST_COMPACTION_CONTROLLER_ID,
  hasStoredDelegateAttachmentState,
  isContinuationDelegateFlow,
  scrubStoredDelegateAttachmentState,
} from "../../tasks/task-flow-continuation-state.js";
import type { TaskFlowRecord } from "../../tasks/task-flow-registry.types.js";
import {
  createManagedTaskFlow,
  deleteTaskFlowRecordById,
  failFlow,
  finishFlow,
  getTaskFlowById,
  listTaskFlowRecords,
  listTaskFlowsForOwnerKey,
  updateFlowRecordByIdExpectedRevision,
} from "../../tasks/task-flow-runtime-internal.js";
import {
  createDelegateAttachmentId,
  discardDelegateAttachmentPayload,
  projectDelegateFlow,
  readDelegateAttachmentId,
  reconcileDelegateAttachmentPayloads,
  releaseDelegateAttachmentPayload,
  storeDelegateAttachmentPayload,
} from "./delegate-attachment-payload-store.js";
import * as delegateFlowDiagnostics from "./delegate-flow-diagnostics.js";
import {
  decodeDelegateStateJson,
  encodeDelegateState,
  type PendingDelegateState,
} from "./delegate-flow-state.js";
import { createContinuationRecipientAuthorityBinding } from "./recipient-authority-binding.js";
import type { ChainState, PendingContinuationDelegate } from "./types.js";

const log = createSubsystemLogger("continuation/delegate-store");

type DecodedDelegateFlow = PendingContinuationDelegate | undefined;

export { CONTINUATION_DELEGATE_CONTROLLER_ID, CONTINUATION_POST_COMPACTION_CONTROLLER_ID };

export type PendingDelegateCutoffOptions = {
  includeRunning?: boolean;
  queuedCreatedAtOrBefore?: number;
  includeRunningUpdatedAtOrBefore?: number;
};

type ContinuationDelegateQueueDepths = {
  pendingQueued: number;
  pendingRunnable: number;
  pendingScheduled: number;
  stagedPostCompaction: number;
  totalQueued: number;
};

type DelegateStateChanges = {
  releasedAt?: number | null;
  childSessionKey?: string | null;
  chainTokensFold?: number | null;
  persistedChainState?: ChainState | null;
  persistedChainStateKind?: "advanced" | "terminal" | null;
  inheritedSilent?: true;
  inheritedWake?: true;
  awaitingNextCompaction?: true | null;
};

function delegateGoal(delegate: PendingContinuationDelegate): string {
  const task = delegate.task.trim();
  const isPostCompaction = delegate.mode === "post-compaction";
  if (!task) {
    return isPostCompaction ? "Post-compaction continuation delegate" : "Continuation delegate";
  }
  const excerpt = task.length > 80 ? `${task.slice(0, 77)}...` : task;
  return isPostCompaction
    ? `Post-compaction delegate: ${excerpt}`
    : `Continuation delegate: ${excerpt}`;
}

function applyDelegateStateChanges(
  state: PendingDelegateState,
  changes: DelegateStateChanges = {},
): PendingDelegateState {
  const next = { ...state };
  for (const key of [
    "releasedAt",
    "childSessionKey",
    "chainTokensFold",
    "persistedChainState",
    "persistedChainStateKind",
    "inheritedSilent",
    "inheritedWake",
    "awaitingNextCompaction",
  ] as const) {
    const value = changes[key];
    if (value === null) {
      delete next[key];
    } else if (value !== undefined) {
      Object.assign(next, { [key]: value });
    }
  }
  return next;
}

function resolveUpdatedDelegateState(params: {
  flowId: string;
  fallbackDelegate?: PendingContinuationDelegate;
  changes?: DelegateStateChanges;
}): PendingDelegateState | undefined {
  const current = getTaskFlowById(params.flowId);
  const state =
    (current ? decodeDelegateState(current) : undefined) ??
    (params.fallbackDelegate ? encodeDelegateState(params.fallbackDelegate) : undefined);
  return state ? applyDelegateStateChanges(state, params.changes) : undefined;
}

function decodeDelegateState(flow: TaskFlowRecord): PendingDelegateState | undefined {
  return decodeDelegateStateJson(flow.stateJson);
}

function decodeDelegateFlowWithOptions(
  flow: TaskFlowRecord,
  options: { requireAttachmentPayload: boolean },
): DecodedDelegateFlow {
  const state = decodeDelegateState(flow);
  if (!state) {
    return undefined;
  }
  const delegate = projectDelegateFlow(flow, state, options);
  if (!delegate) {
    return undefined;
  }
  // Apply the live spawn policy after resolving either legacy inline bytes or
  // durable referenced custody. Invalid recovery state never reaches dispatch.
  const attachmentError = validateSubagentAttachments({
    config: getRuntimeConfig(),
    attachments: delegate.attachments,
    redactContinuationErrorDetails: true,
  });
  return attachmentError ? undefined : delegate;
}

export function decodeDelegateFlow(flow: TaskFlowRecord): DecodedDelegateFlow {
  return decodeDelegateFlowWithOptions(flow, { requireAttachmentPayload: true });
}

export function decodeDelegateFlowMetadata(flow: TaskFlowRecord): DecodedDelegateFlow {
  return decodeDelegateFlowWithOptions(flow, { requireAttachmentPayload: false });
}

export function readAcceptedDelegateChildSessionKey(flow: TaskFlowRecord): string | undefined {
  return decodeDelegateState(flow)?.childSessionKey;
}

export function findContinuationDelegateFlowByOriginRun(
  ownerKey: string,
  originRunId: string,
): TaskFlowRecord | undefined {
  return listTaskFlowsForOwnerKey(ownerKey).find(
    (flow) =>
      isContinuationDelegateFlow(flow) && decodeDelegateState(flow)?.originRunId === originRunId,
  );
}

export function isPendingDelegateFlow(flow: TaskFlowRecord): boolean {
  return flow.syncMode === "managed" && flow.controllerId === CONTINUATION_DELEGATE_CONTROLLER_ID;
}

export function isPostCompactionDelegateFlow(flow: TaskFlowRecord): boolean {
  return (
    flow.syncMode === "managed" && flow.controllerId === CONTINUATION_POST_COMPACTION_CONTROLLER_ID
  );
}

export function isTerminalDelegateFlow(flow: TaskFlowRecord): boolean {
  return (
    isContinuationDelegateFlow(flow) &&
    (flow.status === "succeeded" ||
      flow.status === "blocked" ||
      flow.status === "failed" ||
      flow.status === "cancelled" ||
      flow.status === "lost")
  );
}

export function isSucceededDelegateFlow(flow: TaskFlowRecord): boolean {
  return isContinuationDelegateFlow(flow) && flow.status === "succeeded";
}

/**
 * True when a post-compaction row sits in its durable-handoff state: finalized
 * to `succeeded` exactly one revision past the claim a queued delivery carries.
 * `dispatchPostCompactionDelegates` enqueues the delivery and only then calls
 * `finalizeStagedPostCompactionDelegates`, so this — not the claim revision — is
 * what a drain observes. Delivery-time spawn fences and terminal transitions
 * both key off this shape, so it has one spelling and cannot drift apart.
 */
export function isDurablyHandedOffPostCompactionFlow(
  flow: TaskFlowRecord | undefined,
  claimRevision: number,
): boolean {
  return (
    flow !== undefined &&
    isPostCompactionDelegateFlow(flow) &&
    flow.status === "succeeded" &&
    flow.revision === claimRevision + 1
  );
}

export function isRecoverablePendingFlow(flow: TaskFlowRecord): boolean {
  return (
    isPendingDelegateFlow(flow) &&
    flow.cancelRequestedAt == null &&
    (flow.status === "queued" || flow.status === "running")
  );
}

export function isRecoverableContinuationDelegateFlow(flow: TaskFlowRecord): boolean {
  return (
    isContinuationDelegateFlow(flow) &&
    flow.cancelRequestedAt == null &&
    (flow.status === "queued" || flow.status === "running")
  );
}

export function isRecoverablePendingFlowWithinCutoffs(
  flow: TaskFlowRecord,
  options: PendingDelegateCutoffOptions = {},
): boolean {
  if (!isPendingDelegateFlow(flow) || flow.cancelRequestedAt != null) {
    return false;
  }
  if (flow.status === "queued") {
    return (
      options.queuedCreatedAtOrBefore === undefined ||
      flow.createdAt <= options.queuedCreatedAtOrBefore
    );
  }
  if (flow.status !== "running" || options.includeRunning !== true) {
    return false;
  }
  return (
    options.includeRunningUpdatedAtOrBefore === undefined ||
    flow.updatedAt <= options.includeRunningUpdatedAtOrBefore
  );
}

export function listRecoverablePendingFlows(
  sessionKey: string,
  options: PendingDelegateCutoffOptions = {},
): TaskFlowRecord[] {
  return listTaskFlowsForOwnerKey(sessionKey)
    .filter((flow) => isRecoverablePendingFlowWithinCutoffs(flow, options))
    .toSorted((a, b) => a.createdAt - b.createdAt);
}

export function listQueuedPendingFlows(sessionKey: string): TaskFlowRecord[] {
  return listTaskFlowsForOwnerKey(sessionKey)
    .filter(
      (flow) =>
        isPendingDelegateFlow(flow) && flow.cancelRequestedAt == null && flow.status === "queued",
    )
    .toSorted((a, b) => a.createdAt - b.createdAt);
}

export function listQueuedPostCompactionFlows(sessionKey: string): TaskFlowRecord[] {
  return listTaskFlowsForOwnerKey(sessionKey)
    .filter(
      (flow) =>
        isPostCompactionDelegateFlow(flow) &&
        flow.cancelRequestedAt == null &&
        flow.status === "queued",
    )
    .toSorted((a, b) => a.createdAt - b.createdAt);
}

function scrubReleasedDelegateAttachmentState(
  stateJson: TaskFlowRecord["stateJson"],
): TaskFlowRecord["stateJson"] {
  const scrubbed = scrubStoredDelegateAttachmentState(stateJson);
  if (!scrubbed || typeof scrubbed !== "object" || Array.isArray(scrubbed)) {
    return scrubbed;
  }
  const released = { ...scrubbed };
  delete released.attachmentId;
  return released;
}

function releaseDelegateAttachmentCustody(
  flowId: string,
  stateJson: TaskFlowRecord["stateJson"],
): void {
  const attachmentId = readDelegateAttachmentId(stateJson);
  if (attachmentId && !releaseDelegateAttachmentPayload(attachmentId, flowId)) {
    log.warn(`[continuation:delegate-attachment-release-failed] flowId=${flowId}`);
  }
}

export async function reconcileDelegateAttachmentCustody(
  orphanedBefore: number,
): Promise<{ removed: number; failed: number }> {
  const retainedAttachmentIds = new Set<string>();
  for (const flow of listTaskFlowRecords()) {
    if (
      !isContinuationDelegateFlow(flow) ||
      (flow.status !== "queued" && flow.status !== "running")
    ) {
      continue;
    }
    const attachmentId = readDelegateAttachmentId(flow.stateJson);
    if (attachmentId) {
      retainedAttachmentIds.add(attachmentId);
    }
  }
  return await reconcileDelegateAttachmentPayloads({ retainedAttachmentIds, orphanedBefore });
}

export function scrubCancellationRequestedDelegateFlowState(flow: TaskFlowRecord): void {
  releaseDelegateAttachmentCustody(flow.flowId, flow.stateJson);
  let current = flow;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (
      !isContinuationDelegateFlow(current) ||
      current.cancelRequestedAt == null ||
      (!hasStoredDelegateAttachmentState(current.stateJson) &&
        !readDelegateAttachmentId(current.stateJson))
    ) {
      return;
    }
    const result = updateFlowRecordByIdExpectedRevision({
      flowId: current.flowId,
      expectedRevision: current.revision,
      patch: {
        stateJson: scrubReleasedDelegateAttachmentState(current.stateJson),
      },
    });
    if (result.applied || result.reason === "not_found" || !result.current) {
      return;
    }
    current = result.current;
  }
}

export function delegateDueAt(flow: TaskFlowRecord, delegate: PendingContinuationDelegate): number {
  return flow.createdAt + (delegate.delayMs ?? 0);
}

export function isAwaitingNextCompactionDelegateFlow(flow: TaskFlowRecord): boolean {
  return decodeDelegateState(flow)?.awaitingNextCompaction === true;
}

type DelegateFlowPatch = {
  status?: TaskFlowRecord["status"];
  currentStep?: string;
  waitJson?: null;
  blockedTaskId?: null;
  blockedSummary?: string | null;
  endedAt?: number | null;
  updatedAt?: number;
};

export const delegateFlowRecords = {
  create(params: {
    ownerKey: string;
    controller: "pending" | "post-compaction";
    delegate: PendingContinuationDelegate;
    currentStep: string;
    /** Tests and non-tool producers can inject their resolved runtime policy. */
    attachmentConfig?: OpenClawConfig;
  }) {
    const delegate = params.delegate.recipientAuthorityBinding
      ? params.delegate
      : {
          ...params.delegate,
          recipientAuthorityBinding: createContinuationRecipientAuthorityBinding({
            requesterSessionKey: params.ownerKey,
            targetSessionKey: params.delegate.targetSessionKey,
            targetSessionKeys: params.delegate.targetSessionKeys,
            fanoutMode: params.delegate.fanoutMode,
          }),
        };
    const state = encodeDelegateState(delegate, params.attachmentConfig);
    const attachmentId = state.attachments ? createDelegateAttachmentId() : undefined;
    const durableState: PendingDelegateState = attachmentId ? { ...state, attachmentId } : state;
    const flow = createManagedTaskFlow({
      ownerKey: params.ownerKey,
      controllerId:
        params.controller === "post-compaction"
          ? CONTINUATION_POST_COMPACTION_CONTROLLER_ID
          : CONTINUATION_DELEGATE_CONTROLLER_ID,
      notifyPolicy: "silent",
      goal: delegateGoal(delegate),
      currentStep: params.currentStep,
      stateJson: scrubStoredDelegateAttachmentState(durableState),
    });
    if (flow && attachmentId && state.attachments) {
      try {
        storeDelegateAttachmentPayload({
          attachmentId,
          flowId: flow.flowId,
          ownerKey: flow.ownerKey,
          state,
        });
      } catch (error) {
        failFlow({
          flowId: flow.flowId,
          expectedRevision: flow.revision,
          currentStep: "Failed to persist continuation attachment custody",
          blockedSummary: "Continuation attachment custody could not be persisted.",
          stateJson: scrubReleasedDelegateAttachmentState(durableState),
        });
        discardDelegateAttachmentPayload(attachmentId);
        throw error;
      }
    }
    return flow;
  },
  update(params: {
    flowId: string;
    expectedRevision: number;
    fallbackDelegate?: PendingContinuationDelegate;
    changes?: DelegateStateChanges;
    patch: DelegateFlowPatch;
  }) {
    const state = resolveUpdatedDelegateState(params);
    if (!state) {
      return {
        applied: false as const,
        reason: "not_found" as const,
        current: undefined,
      };
    }
    return updateFlowRecordByIdExpectedRevision({
      flowId: params.flowId,
      expectedRevision: params.expectedRevision,
      patch: {
        ...params.patch,
        stateJson: state,
      },
    });
  },
  finish(params: {
    flowId: string;
    expectedRevision: number;
    fallbackDelegate?: PendingContinuationDelegate;
    changes?: DelegateStateChanges;
    currentStep: string;
    updatedAt?: number;
    endedAt?: number;
  }) {
    const state = resolveUpdatedDelegateState(params);
    if (!state) {
      return {
        applied: false as const,
        reason: "not_found" as const,
        current: undefined,
      };
    }
    const result = finishFlow({
      flowId: params.flowId,
      expectedRevision: params.expectedRevision,
      currentStep: params.currentStep,
      stateJson: scrubReleasedDelegateAttachmentState(state),
      updatedAt: params.updatedAt,
      endedAt: params.endedAt,
    });
    if (result.applied || result.reason === "not_found") {
      releaseDelegateAttachmentCustody(params.flowId, state);
    }
    return result;
  },
  fail(params: Parameters<typeof failFlow>[0]) {
    const current = getTaskFlowById(params.flowId);
    const stateJson = params.stateJson !== undefined ? params.stateJson : current?.stateJson;
    const custodyStateJson = current?.stateJson ?? params.stateJson;
    const result = failFlow({
      ...params,
      ...(stateJson !== undefined
        ? { stateJson: scrubReleasedDelegateAttachmentState(stateJson) }
        : {}),
    });
    if (result.applied || result.reason === "not_found") {
      releaseDelegateAttachmentCustody(params.flowId, custodyStateJson);
    }
    return result;
  },
  get: getTaskFlowById,
  listAll: listTaskFlowRecords,
  listForOwner: listTaskFlowsForOwnerKey,
  delete(flowId: string) {
    const current = getTaskFlowById(flowId);
    const deleted = deleteTaskFlowRecordById(flowId);
    if (deleted) {
      releaseDelegateAttachmentCustody(flowId, current?.stateJson);
    }
    return deleted;
  },
};

export function rejectCorruptDelegateFlow(
  flow: TaskFlowRecord,
  options: { kind: "pending" | "post-compaction"; sessionKey: string },
): void {
  const isPostCompaction = options.kind === "post-compaction";
  const tag = isPostCompaction
    ? "continuation:post-compaction-decode-failed"
    : "continuation:delegate-decode-failed";
  log.warn(
    `[${tag}] flowId=${flow.flowId} session=${options.sessionKey} ${delegateFlowDiagnostics.describeDelegateState(flow.stateJson)}`,
  );
  delegateFlowRecords.fail({
    flowId: flow.flowId,
    expectedRevision: flow.revision,
    stateJson: {},
    currentStep: isPostCompaction
      ? "Rejected invalid post-compaction payload"
      : "Rejected invalid continuation payload",
    blockedSummary: isPostCompaction
      ? "Staged post-compaction delegate payload could not be decoded."
      : "Pending continuation delegate payload could not be decoded.",
  });
}

const continuationQueueDiagnostics = delegateFlowDiagnostics.createContinuationQueueDiagnostics({
  listFlows: listTaskFlowRecords,
  isContinuationDelegateFlow,
  isPostCompactionDelegateFlow,
  decodeDelegateFlow,
  delegateDueAt,
});

registerDiagnosticContinuationQueueMetricsProvider(continuationQueueDiagnostics.sample);

export function getContinuationDelegateQueueDepths(
  sessionKey: string,
  now = Date.now(),
): ContinuationDelegateQueueDepths {
  const pendingFlows = listQueuedPendingFlows(sessionKey);
  let pendingRunnable = 0;
  for (const flow of pendingFlows) {
    const delegate = decodeDelegateFlow(flow);
    if (delegate && delegateDueAt(flow, delegate) <= now) {
      pendingRunnable += 1;
    }
  }
  const stagedPostCompaction = listQueuedPostCompactionFlows(sessionKey).length;
  return {
    pendingQueued: pendingFlows.length,
    pendingRunnable,
    pendingScheduled: pendingFlows.length - pendingRunnable,
    stagedPostCompaction,
    totalQueued: pendingFlows.length + stagedPostCompaction,
  };
}

export function resetDelegateFlowDiagnosticsForTests(): void {
  continuationQueueDiagnostics.reset();
}
