/**
 * Core-owned pre-claim disposition pass for stored pending ingress rows.
 *
 * Channels opt in through the drain seam to settle rows that can never become
 * work, or to hold a row while the channel cannot yet classify it, before the
 * drain builds its candidate window. The hook never sees a claim, so it cannot
 * take part in adoption, retry, or supersede semantics.
 */
import type { ChannelIngressQueue, ChannelIngressQueueRecord } from "./ingress-queue.js";

type ChannelIngressPendingDisposition =
  /** Terminally fail the stored row; it can never become work. */
  | { kind: "fail"; reason: string; message: string }
  /** Hold the row and its lane for this pass; the channel cannot classify it yet. */
  | { kind: "defer" };

type ChannelIngressPendingDispositionContext = {
  laneKey: string;
  now: number;
};

/**
 * Optional channel policy evaluated before a pending row can be claimed.
 * Unreadable rows must remain eligible for the canonical claim-time codec.
 */
export type ResolveChannelIngressPendingDisposition<TPayload, TMetadata> = (
  record: ChannelIngressQueueRecord<TPayload, TMetadata>,
  context: ChannelIngressPendingDispositionContext,
) =>
  | ChannelIngressPendingDisposition
  | null
  | undefined
  | Promise<ChannelIngressPendingDisposition | null | undefined>;

type ApplyPendingDispositionsParams<TPayload, TMetadata, TCompletedMetadata> = {
  pending: Array<ChannelIngressQueueRecord<TPayload, TMetadata>>;
  now: number;
  queue: Pick<ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>, "fail">;
  resolve?: ResolveChannelIngressPendingDisposition<TPayload, TMetadata>;
  resolveLaneKey: (record: ChannelIngressQueueRecord<TPayload, TMetadata>) => string;
  log: (message: string) => void;
};

export async function applyIngressPendingDispositions<TPayload, TMetadata, TCompletedMetadata>(
  params: ApplyPendingDispositionsParams<TPayload, TMetadata, TCompletedMetadata>,
): Promise<{
  pending: Array<ChannelIngressQueueRecord<TPayload, TMetadata>>;
  blockedLaneKeys: Set<string>;
}> {
  const resolve = params.resolve;
  if (!resolve) {
    return { pending: params.pending, blockedLaneKeys: new Set() };
  }

  const retained: Array<ChannelIngressQueueRecord<TPayload, TMetadata>> = [];
  const blockedLaneKeys = new Set<string>();
  for (const record of params.pending) {
    const laneKey = params.resolveLaneKey(record);
    if (blockedLaneKeys.has(laneKey)) {
      // This lane is already fenced for the snapshot. Its head keeps ordering,
      // so no later row on it may be settled or started ahead of that head.
      retained.push(record);
      continue;
    }
    const disposition = await resolve(record, { laneKey, now: params.now });
    if (!disposition) {
      retained.push(record);
      continue;
    }
    if (disposition.kind === "defer") {
      // The channel cannot classify this row yet. Hold the lane so the row is
      // neither settled nor claimed before the channel can decide.
      retained.push(record);
      blockedLaneKeys.add(laneKey);
      continue;
    }

    const reason = disposition.reason.trim() || "pending-disposition";
    const committed = await params.queue.fail(record.id, {
      reason,
      message: disposition.message.trim() || reason,
      failedAt: params.now,
    });
    if (!committed) {
      // A concurrent claim won the compare-and-set. Keep its lane out of this
      // snapshot so later same-lane work cannot overtake the real claimant.
      params.log(`ingress drain: pending disposition lost race for event ${record.id}`);
      retained.push(record);
      blockedLaneKeys.add(laneKey);
    }
  }
  return { pending: retained, blockedLaneKeys };
}
