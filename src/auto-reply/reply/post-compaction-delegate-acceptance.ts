// Admission evidence and at-most-once settlement for queued post-compaction
// delegates (RFC docs/design/continue-work-signal-v2.md §4.4, §5.4.4): the
// entry's attempt keys, the one interrupted notice for an unproven attempt,
// and the exactly-once chain charge for a child the registry already admitted.
import type { SessionEntry } from "../../config/sessions/types.js";
import { resolveContinuationTraceparent } from "../../infra/continuation-tracer.js";
import { generateChainId } from "../../infra/secure-random.js";
import {
  enqueueSessionDeliveryWithStatus,
  SessionDeliveryDeadLetteredError,
} from "../../infra/session-delivery-queue-storage.js";
import {
  formatContinuationChildRunId,
  parseContinuationChildRunId,
} from "../../shared/continuation-run-key.js";
import type { OpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.types.js";
import { surfaceDurableContinuationNotice } from "../continuation/continuation-notice-surface.js";
import { buildContinuationSpawnInterruptedNotice } from "../continuation/custody/spawn-interrupted-notice.js";
import type { DelegateAdmissionEvidence } from "../continuation/delegate-dispatch-accepted-children.js";
import { captureContinuationQueueContext } from "../continuation/queue-context.js";
import { withContinuationOwner } from "../continuation/system-event-ownership.js";
import type { ChainState } from "../continuation/types.js";
import type {
  PostCompactionDelegateDeliveryDeps,
  QueuedPostCompactionDelegateDelivery,
} from "./post-compaction-delegate-delivery.js";
import { assertPostCompactionSourceLifecycle } from "./post-compaction-source-lifecycle.js";

export async function enqueueQueueEntryInterruptedNotice(params: {
  entry: QueuedPostCompactionDelegateDelivery;
  queueContext?: OpenClawStateWorkerContext;
}): Promise<void> {
  const notice = buildContinuationSpawnInterruptedNotice({
    sessionKey: params.entry.sessionKey,
    source: { kind: "queue-entry", entryId: params.entry.id },
    task: params.entry.task,
  });
  // Insert-if-absent under the entry-derived key: a redelivery after a crash
  // between this insert and the entry's settlement resolves to the same row.
  const enqueued = await enqueueSessionDeliveryWithStatus(
    notice,
    params.queueContext ?? captureContinuationQueueContext(),
  );
  if (notice.kind === "systemEvent" && enqueued.status !== "unknown") {
    await surfaceDurableContinuationNotice({
      entryId: enqueued.id,
      entryStatus: enqueued.status,
      sessionKey: params.entry.sessionKey,
      text: notice.text,
      reason: "continuation-delegate-spawn-interrupted",
      ...(params.queueContext ? { queueContext: params.queueContext } : {}),
    });
  }
}

/**
 * The continuation record id this entry's child is spawned under. Source-backed
 * entries reuse their custody record id; a source-less entry falls back to the
 * queue entry id. The derived child session key MUST come from the same value
 * the spawn uses.
 */
export function resolveQueuedPostCompactionContinuationFlowId(
  entry: QueuedPostCompactionDelegateDelivery,
): string {
  return entry.sourceFlowId ?? entry.id;
}

export function resolveQueuedPostCompactionTraceparent(
  entry: QueuedPostCompactionDelegateDelivery,
): string | undefined {
  return entry.traceparentProvenance === "internal"
    ? resolveContinuationTraceparent(entry.traceparent)
    : undefined;
}

/**
 * Settle the parent chain charge for an accepted post-compaction child exactly once.
 *
 * `reserveAcceptedPostCompactionChainHop` writes the durable `advanced` marker on
 * the source row BEFORE this session-entry patch and returns that same hop on
 * every later call, so a replayed delivery re-persists the identical count rather
 * than advancing depth again. Charging here rather than before the spawn is what
 * keeps a retry that never reached an accepted child at zero continuation budget.
 */
export async function commitAcceptedPostCompactionChainCharge(params: {
  deps: PostCompactionDelegateDeliveryDeps;
  entry: QueuedPostCompactionDelegateDelivery;
  plannedChainState: ChainState;
  sessionEntry?: SessionEntry;
  storePath: string;
}): Promise<{ expectedRevision: number | undefined }> {
  const { deps, entry, sessionEntry, storePath } = params;
  const reserved = await deps.reserveAcceptedPostCompactionChainHop(
    {
      ...(entry.sourceFlowId ? { flowId: entry.sourceFlowId } : {}),
      ...(entry.sourceExpectedRevision !== undefined
        ? { expectedRevision: entry.sourceExpectedRevision }
        : {}),
      task: entry.task,
    },
    params.plannedChainState,
  );
  const { chainState } = reserved;
  let persistedEntry: SessionEntry | null;
  try {
    persistedEntry = await deps.patchSessionEntryCore(
      { storePath, sessionKey: entry.sessionKey },
      () => ({
        continuationChainCount: chainState.currentChainCount,
        continuationChainStartedAt: chainState.chainStartedAt,
        continuationChainTokens: chainState.accumulatedChainTokens,
        ...(chainState.chainId ? { continuationChainId: chainState.chainId } : {}),
      }),
      {
        ...(sessionEntry ? { fallbackEntry: sessionEntry } : {}),
        preserveActivity: true,
        requireWriteSuccess: true,
      },
    );
    if (!persistedEntry) {
      throw new Error(`session entry was not found: ${entry.sessionKey}`);
    }
  } catch (err) {
    deps.log(
      `Failed to persist post-compaction delegate chain state for ${entry.sessionKey}: ${String(err)}`,
    );
    // Rethrow so the delivery rejects, the queue entry stays in `pending/` with a
    // bumped retryCount, and the next unfiltered drain re-considers it once
    // backoff has elapsed. The child is already accepted here, so that retry is
    // caught by the accepted-child replay path below and reserves the same hop
    // instead of spawning a duplicate or charging a second time.
    throw err;
  }
  if (sessionEntry) {
    Object.assign(sessionEntry, persistedEntry);
  }
  return { expectedRevision: reserved.expectedRevision };
}

/** Every attempt key the entry may have launched under, oldest first (RFC §5.4.4). */
export function queuedAttemptRunIds(entry: QueuedPostCompactionDelegateDelivery): string[] {
  const base = entry.childRunId ? parseContinuationChildRunId(entry.childRunId) : undefined;
  if (!base) {
    return [];
  }
  const attempts = Math.max(base.attemptId, entry.retryCount + 1);
  return Array.from({ length: attempts }, (_, index) =>
    formatContinuationChildRunId(base.recordId, index + 1),
  );
}

/** Settle an unproven entry: one interrupted notice, then the entry fails (Q3). */
export async function settleInterruptedQueuedDelivery(params: {
  deps: PostCompactionDelegateDeliveryDeps;
  entry: QueuedPostCompactionDelegateDelivery;
  queueContext?: OpenClawStateWorkerContext;
  reason: string;
}): Promise<never> {
  params.deps.log(
    `[continuation:post-compaction-delivery-interrupted] entryId=${params.entry.id} flowId=${params.entry.sourceFlowId ?? "none"} reason=${params.reason}`,
  );
  await params.deps.enqueueInterruptedNotice({
    entry: params.entry,
    ...(params.queueContext ? { queueContext: params.queueContext } : {}),
  });
  throw new SessionDeliveryDeadLetteredError(
    `post-compaction delegate admission could not be proven (${params.reason})`,
  );
}

export async function maybeFinalizePreviouslyAcceptedDelivery(params: {
  deps: PostCompactionDelegateDeliveryDeps;
  entry: QueuedPostCompactionDelegateDelivery;
  evidence: DelegateAdmissionEvidence;
  ownerAgentId: string;
  storePath: string;
}): Promise<boolean> {
  const { deps, entry, evidence, ownerAgentId, storePath } = params;
  if (evidence.kind !== "admitted") {
    return false;
  }
  const acceptedChildSessionKey = evidence.childSessionKey;
  const sourceEntry = deps.loadSessionEntry({ storePath, sessionKey: entry.sessionKey });
  assertPostCompactionSourceLifecycle(entry, sourceEntry);
  if (entry.sourceFlowId && entry.sourceExpectedRevision !== undefined) {
    const sessionEntry = deps.loadSessionEntry({ storePath, sessionKey: entry.sessionKey });
    const { expectedRevision } = await commitAcceptedPostCompactionChainCharge({
      deps,
      entry,
      plannedChainState: {
        currentChainCount: (sessionEntry?.continuationChainCount ?? 0) + 1,
        chainStartedAt: sessionEntry?.continuationChainStartedAt ?? deps.now(),
        accumulatedChainTokens: sessionEntry?.continuationChainTokens ?? 0,
        chainId: sessionEntry?.continuationChainId ?? generateChainId(),
      },
      ...(sessionEntry ? { sessionEntry } : {}),
      storePath,
    });
    assertPostCompactionSourceLifecycle(
      entry,
      deps.loadSessionEntry({ storePath, sessionKey: entry.sessionKey }),
    );
    const committed = await deps.markPendingDelegateSpawnAccepted(
      {
        flowId: entry.sourceFlowId,
        // The marker write leaves the record a revision past the queued claim, so
        // acceptance must commit against where the record actually is.
        expectedRevision: expectedRevision ?? entry.sourceExpectedRevision,
        task: entry.task,
      },
      acceptedChildSessionKey,
    );
    if (!committed) {
      throw new Error(
        `[continuation:post-compaction-source-accept-not-committed] flowId=${entry.sourceFlowId}`,
      );
    }
  }
  // A source-less entry has no custody record, so no durable marker can prove
  // whether the accepted hop was already charged. Re-charging here could double
  // count it, so the replay only reclaims the delivery: preventing a duplicate
  // spawn for a child that is already live is the load-bearing job.
  const entryTraceparent = resolveQueuedPostCompactionTraceparent(entry);
  assertPostCompactionSourceLifecycle(
    entry,
    deps.loadSessionEntry({ storePath, sessionKey: entry.sessionKey }),
  );
  deps.enqueueSystemEvent(
    `[continuation:compaction-delegate-spawned] Post-compaction shard dispatched: ${entry.task}`,
    withContinuationOwner(
      {
        sessionKey: entry.sessionKey,
        ...(entryTraceparent ? { traceparent: entryTraceparent } : {}),
      },
      ownerAgentId,
    ),
  );
  deps.log(
    `[continuation:post-compaction-source-accepted-recovered] flowId=${entry.sourceFlowId ?? entry.id} child=${acceptedChildSessionKey}`,
  );
  return true;
}
