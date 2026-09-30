// "RFC §" references herein cite docs/design/continue-work-signal-v2.md (Agent Self-Elected Turn Continuation / CONTINUE_WORK).
/**
 * Exactly-once continuation-depth accounting for released post-compaction work.
 *
 * Queued post-compaction delivery charges the parent chain only after a child is
 * actually accepted, so every pre-acceptance failure (attachment materialization,
 * spawn fence, spawn rejection) leaves the budget untouched. This module owns the
 * durable marker that makes that charge idempotent across crash, restart, and
 * queue replay.
 */

import {
  decodeDelegateFlowMetadata,
  getDelegateRecord,
  isPostCompactionDelegateFlow,
} from "./delegate-flow-store.js";
import { markPendingDelegateChainStatePersistPlanned } from "./delegate-store.js";
import type { ChainState, PendingContinuationDelegate } from "./types.js";

/**
 * Reserve the accepted post-compaction hop on its custody record, idempotently.
 *
 * Returns the chain state the session entry must be persisted to, and the
 * revision acceptance must commit against (the marker write bumps the record a
 * revision). A record that already carries an `advanced` marker returns that
 * marker unchanged, so a replayed delivery re-persists the same hop instead of
 * advancing depth again. Because the marker is written before the session-entry
 * patch, an absent marker proves the entry was never advanced for this record,
 * and a `terminal` marker records a rejection that consumed no hop at all.
 */
export async function reserveAcceptedPostCompactionChainHop(
  delegate: Pick<PendingContinuationDelegate, "flowId" | "expectedRevision" | "task">,
  plannedChainState: ChainState,
): Promise<{ chainState: ChainState; expectedRevision: number | undefined }> {
  if (!delegate.flowId || delegate.expectedRevision === undefined) {
    return { chainState: plannedChainState, expectedRevision: delegate.expectedRevision };
  }
  const record = await getDelegateRecord(delegate.flowId);
  const decoded =
    record && isPostCompactionDelegateFlow(record)
      ? await decodeDelegateFlowMetadata(record)
      : undefined;
  if (decoded?.persistedChainState && decoded.persistedChainStateKind !== "terminal") {
    return { chainState: decoded.persistedChainState, expectedRevision: record?.revision };
  }
  const marked = await markPendingDelegateChainStatePersistPlanned(
    { ...delegate, expectedRevision: record?.revision ?? delegate.expectedRevision },
    plannedChainState,
    "advanced",
  );
  return { chainState: plannedChainState, expectedRevision: marked.expectedRevision };
}
