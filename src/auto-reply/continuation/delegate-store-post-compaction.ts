/**
 * Post-compaction continuation-delegate transitions over the continuation
 * custody store (RFC docs/design/continue-work-signal-v2.md §4.4, §5.4.4).
 *
 * A staged record is `queued` until a compaction seam claims it (`running`),
 * and the claim ends in exactly one of: a release that inserts the session
 * delivery queue entry and hands the record off in one commit, a requeue back
 * to staged, or a terminal rejection. The queue drain alone spawns the child.
 */

import type { SessionPostCompactionDelegate } from "../../config/sessions.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  buildPostCompactionDelegateDeliveryPayload,
  prepareSessionDeliveryEnqueue,
  type SessionDeliveryContext,
} from "../../infra/session-delivery-queue-storage.js";
import { formatContinuationChildRunId } from "../../shared/continuation-run-key.js";
import { releaseContinuationPostCompaction } from "./custody/custody-store.js";
import {
  countStagedPostCompactionDelegates,
  createDelegateRecord,
  decodeDelegateFlow,
  delegateStateJsonWithChanges,
  getDelegateRecord,
  isAwaitingNextCompactionDelegateFlow,
  isPostCompactionDelegateFlow,
  listDelegateRecords,
  listQueuedPostCompactionFlows,
  rejectCorruptDelegateFlow,
  updateDelegateRecord,
  type DelegateCustodyRecord,
} from "./delegate-flow-store.js";
import type { PendingContinuationDelegate, StagedPostCompactionDelegate } from "./types.js";

export type PostCompactionDelegateRequeueResult = "requeued" | "authoritative" | "missing";

const STAGED_PHASE = "Staged for release after compaction";

/** Stage the custody value used by the tool and the token grammar. */
export async function stagePostCompactionCustodyDelegate(
  sessionKey: string,
  delegate: StagedPostCompactionDelegate,
  options: { attachmentConfig?: OpenClawConfig } = {},
): Promise<DelegateCustodyRecord> {
  const pendingDelegate: PendingContinuationDelegate = {
    task: delegate.task,
    mode: "post-compaction",
    firstArmedAt: delegate.firstArmedAt ?? delegate.stagedAt,
    ...(delegate.originRunId ? { originRunId: delegate.originRunId } : {}),
    ...(delegate.attachments !== undefined ? { attachments: delegate.attachments } : {}),
    ...(delegate.attachAs !== undefined ? { attachAs: delegate.attachAs } : {}),
    ...(delegate.targetSessionKey ? { targetSessionKey: delegate.targetSessionKey } : {}),
    ...(delegate.targetSessionKeys ? { targetSessionKeys: delegate.targetSessionKeys } : {}),
    ...(delegate.fanoutMode ? { fanoutMode: delegate.fanoutMode } : {}),
    ...(delegate.recipientAuthorityBinding
      ? { recipientAuthorityBinding: delegate.recipientAuthorityBinding }
      : {}),
    ...(delegate.traceparent ? { traceparent: delegate.traceparent } : {}),
    ...(delegate.model ? { model: delegate.model } : {}),
  };
  return await createDelegateRecord({
    ownerKey: sessionKey,
    controller: "post-compaction",
    delegate: pendingDelegate,
    phase: STAGED_PHASE,
    ...(options.attachmentConfig ? { attachmentConfig: options.attachmentConfig } : {}),
  });
}

/** Put a claimed record back to staged; a record that moved on stays authoritative. */
export async function requeueReleasedPostCompactionDelegate(
  delegate: Pick<PendingContinuationDelegate, "flowId" | "expectedRevision" | "task">,
): Promise<PostCompactionDelegateRequeueResult> {
  if (!delegate.flowId) {
    return "missing";
  }
  const record = await getDelegateRecord(delegate.flowId);
  if (!record || !isPostCompactionDelegateFlow(record)) {
    return "missing";
  }
  if (
    delegate.expectedRevision === undefined ||
    record.status !== "running" ||
    record.revision !== delegate.expectedRevision
  ) {
    return "authoritative";
  }
  if (!(await decodeDelegateFlow(record))) {
    await rejectCorruptDelegateFlow(record, {
      kind: "post-compaction",
      sessionKey: record.ownerSessionKey,
    });
    return "authoritative";
  }
  const result = await updateDelegateRecord({
    record,
    changes: { releasedAt: null, awaitingNextCompaction: null },
    patch: { status: "queued", phase: STAGED_PHASE, failureReason: null },
  });
  if (result.applied) {
    return "requeued";
  }
  return result.current && isPostCompactionDelegateFlow(result.current)
    ? "authoritative"
    : "missing";
}

/** Startup: records persisted for the next compaction seam go back to staged. */
export async function requeueAwaitingNextCompactionDelegatesRaw(options: {
  runningUpdatedAtOrBefore: number;
}): Promise<number> {
  let requeued = 0;
  for (const record of await listDelegateRecords({
    kinds: ["post_compaction"],
    statuses: ["running"],
  })) {
    if (
      record.cancelRequestedAt !== undefined ||
      record.updatedAt > options.runningUpdatedAtOrBefore ||
      !isAwaitingNextCompactionDelegateFlow(record)
    ) {
      continue;
    }
    const delegate = await decodeDelegateFlow(record);
    if (delegate && (await requeueReleasedPostCompactionDelegate(delegate)) === "requeued") {
      requeued += 1;
    }
  }
  return requeued;
}

export async function failStagedPostCompactionDelegatesForCleanup(
  sessionKey: string,
  failureReason: string,
): Promise<number> {
  let failed = 0;
  for (const record of await listDelegateRecords({
    ownerSessionKey: sessionKey,
    kinds: ["post_compaction"],
    statuses: ["queued", "running"],
  })) {
    const result = await updateDelegateRecord({
      record,
      patch: {
        status: "failed",
        phase: "Dropped post-compaction delegate during subagent cleanup",
        failureReason,
      },
    });
    if (result.applied) {
      failed += 1;
    }
  }
  return failed;
}

/** Claim staged records for a release seam without handing them off yet. */
export async function claimStagedPostCompactionDelegates(
  sessionKey: string,
  options: { claimFor?: "release" | "next-seam-persist" } = {},
): Promise<PendingContinuationDelegate[]> {
  const delegates: PendingContinuationDelegate[] = [];
  for (const record of await listQueuedPostCompactionFlows(sessionKey)) {
    if (!(await decodeDelegateFlow(record))) {
      await rejectCorruptDelegateFlow(record, { kind: "post-compaction", sessionKey });
      continue;
    }
    const releasedAt = Date.now();
    const claimForNextSeamPersist = options.claimFor === "next-seam-persist";
    const claimed = await updateDelegateRecord({
      record,
      changes: {
        releasedAt,
        ...(claimForNextSeamPersist ? { awaitingNextCompaction: true } : {}),
      },
      patch: {
        status: "running",
        phase: claimForNextSeamPersist
          ? "Persisting staged delegate for next compaction seam"
          : "Released after compaction — awaiting durable handoff",
        failureReason: null,
      },
      now: releasedAt,
    });
    if (!claimed.applied) {
      continue;
    }
    const claimedDelegate = await decodeDelegateFlow(claimed.record);
    if (claimedDelegate) {
      delegates.push(claimedDelegate);
    }
  }
  return delegates;
}

/**
 * Claimed records a crash left before their release committed (RFC §4.4). No
 * queue entry exists for them, so no spawn can have begun; recovery releases
 * them into the queue, whose drain applies every delivery gate.
 */
export async function listRecoverableStagedPostCompactionDelegates(options?: {
  runningUpdatedAtOrBefore?: number;
}): Promise<Array<{ sessionKey: string; delegate: PendingContinuationDelegate }>> {
  const recoverable: Array<{ sessionKey: string; delegate: PendingContinuationDelegate }> = [];
  for (const record of await listDelegateRecords({
    kinds: ["post_compaction"],
    statuses: ["running"],
  })) {
    if (record.cancelRequestedAt !== undefined) {
      continue;
    }
    if (
      options?.runningUpdatedAtOrBefore !== undefined &&
      record.updatedAt > options.runningUpdatedAtOrBefore
    ) {
      continue;
    }
    const delegate = await decodeDelegateFlow(record);
    if (!delegate) {
      await rejectCorruptDelegateFlow(record, {
        kind: "post-compaction",
        sessionKey: record.ownerSessionKey,
      });
      continue;
    }
    if (isAwaitingNextCompactionDelegateFlow(record)) {
      continue;
    }
    recoverable.push({ sessionKey: record.ownerSessionKey, delegate });
  }
  return recoverable;
}

/**
 * Release one claimed record to the session delivery queue (RFC §4.4): the
 * queue insert and the record's permanent handoff are one commit. The entry
 * carries the precomputed first child run ID (§5.4.4); its presence is what
 * marks an entry this build enqueued.
 */
export async function releaseStagedPostCompactionDelegateToQueue(params: {
  sessionKey: string;
  delegate: SessionPostCompactionDelegate;
  sourceSessionId?: string;
  sourceLifecycleRevision?: string;
  sequence: number;
  compactionCount?: number;
  deliveryContext?: SessionDeliveryContext;
}): Promise<{ released: true; entryId: string } | { released: false; reason: string }> {
  const { delegate } = params;
  if (!delegate.flowId || delegate.expectedRevision === undefined) {
    return { released: false, reason: "missing claim" };
  }
  const record = await getDelegateRecord(delegate.flowId);
  if (!record || record.revision !== delegate.expectedRevision) {
    return { released: false, reason: "claim moved" };
  }
  const now = Date.now();
  const stateJson = delegateStateJsonWithChanges(record, { releasedAt: now });
  if (stateJson === undefined) {
    return { released: false, reason: "undecodable state" };
  }
  const { bound } = prepareSessionDeliveryEnqueue(
    buildPostCompactionDelegateDeliveryPayload({
      sessionKey: params.sessionKey,
      ...(params.sourceSessionId ? { sourceSessionId: params.sourceSessionId } : {}),
      ...(params.sourceLifecycleRevision
        ? { sourceLifecycleRevision: params.sourceLifecycleRevision }
        : {}),
      delegate,
      sequence: params.sequence,
      compactionCount: params.compactionCount,
      ...(params.deliveryContext ? { deliveryContext: params.deliveryContext } : {}),
      childRunId: formatContinuationChildRunId(record.recordId, 1),
    }),
    now,
  );
  const result = await releaseContinuationPostCompaction({
    recordId: record.recordId,
    ownerSessionKey: record.ownerSessionKey,
    expectedRevision: record.revision,
    entry: bound,
    phase: "Durably handed off after compaction",
    stateJson,
    now,
  });
  return result.outcome === "released"
    ? { released: true, entryId: result.entryId }
    : { released: false, reason: result.outcome };
}

/** Stage the session-persistence value used by reply and delivery callers. */
export async function stagePostCompactionDelegate(
  sessionKey: string,
  delegate: SessionPostCompactionDelegate & { originRunId?: string },
): Promise<DelegateCustodyRecord> {
  const stagedAt = delegate.createdAt ?? Date.now();
  return await stagePostCompactionCustodyDelegate(sessionKey, {
    task: delegate.task,
    stagedAt,
    ...(delegate.originRunId ? { originRunId: delegate.originRunId } : {}),
    firstArmedAt: delegate.firstArmedAt ?? stagedAt,
    ...(delegate.attachments !== undefined ? { attachments: delegate.attachments } : {}),
    ...(delegate.attachAs !== undefined ? { attachAs: delegate.attachAs } : {}),
    ...(delegate.targetSessionKey ? { targetSessionKey: delegate.targetSessionKey } : {}),
    ...(delegate.targetSessionKeys ? { targetSessionKeys: delegate.targetSessionKeys } : {}),
    ...(delegate.fanoutMode ? { fanoutMode: delegate.fanoutMode } : {}),
    ...(delegate.recipientAuthorityBinding
      ? { recipientAuthorityBinding: delegate.recipientAuthorityBinding }
      : {}),
    ...(delegate.traceparent && delegate.traceparentProvenance === "internal"
      ? { traceparent: delegate.traceparent }
      : {}),
    ...(delegate.model ? { model: delegate.model } : {}),
  });
}

/** Project a claimed custody delegate onto the session-persistence shape. */
export function toSessionPostCompactionDelegate(
  claimed: PendingContinuationDelegate,
  now = Date.now(),
): SessionPostCompactionDelegate {
  const firstArmedAt = claimed.firstArmedAt ?? now;
  return {
    task: claimed.task,
    createdAt: firstArmedAt,
    firstArmedAt,
    silent: true,
    silentWake: true,
    ...(claimed.attachments ? { attachments: claimed.attachments } : {}),
    ...(claimed.attachAs ? { attachAs: claimed.attachAs } : {}),
    ...(claimed.targetSessionKey ? { targetSessionKey: claimed.targetSessionKey } : {}),
    ...(claimed.targetSessionKeys ? { targetSessionKeys: claimed.targetSessionKeys } : {}),
    ...(claimed.fanoutMode ? { fanoutMode: claimed.fanoutMode } : {}),
    ...(claimed.recipientAuthorityBinding
      ? { recipientAuthorityBinding: claimed.recipientAuthorityBinding }
      : {}),
    ...(claimed.traceparent
      ? { traceparent: claimed.traceparent, traceparentProvenance: "internal" as const }
      : {}),
    ...(claimed.model ? { model: claimed.model } : {}),
    ...(claimed.flowId ? { flowId: claimed.flowId } : {}),
    ...(claimed.expectedRevision !== undefined
      ? { expectedRevision: claimed.expectedRevision }
      : {}),
  };
}

export async function consumeStagedPostCompactionDelegates(
  sessionKey: string,
  options?: { claimFor?: "release" | "next-seam-persist" },
): Promise<SessionPostCompactionDelegate[]> {
  const now = Date.now();
  return (await claimStagedPostCompactionDelegates(sessionKey, options)).map((claimed) =>
    toSessionPostCompactionDelegate(claimed, now),
  );
}

/** Staged post-compaction delegates for a session, from the hot-path projection. */
export function stagedPostCompactionDelegateCount(sessionKey: string): number {
  return countStagedPostCompactionDelegates(sessionKey);
}
