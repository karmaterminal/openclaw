import type { ChannelIngressQueueRecord } from "./ingress-queue.js";
import {
  resolveIngressRetryDelayMs,
  type IngressRetryPolicyConfig,
} from "./ingress-retry-policy.js";

export type ChannelIngressPendingDeliveryContext = {
  laneKey: string;
  now: number;
  /** Remaining retry backoff for this row, or 0 when it is already claimable. */
  retryDelayMs: number;
};

type ResolvePendingScanParams<TPayload, TMetadata> = {
  pending: ReadonlyArray<ChannelIngressQueueRecord<TPayload, TMetadata>>;
  now: number;
  retryPolicy?: IngressRetryPolicyConfig;
  resolveLaneKey: (record: ChannelIngressQueueRecord<TPayload, TMetadata>) => string;
  shouldDrainWithoutDelivery?:
    | ((
        record: ChannelIngressQueueRecord<TPayload, TMetadata>,
        context: ChannelIngressPendingDeliveryContext,
      ) => boolean | Promise<boolean>)
    | undefined;
  formatError: (error: unknown) => string;
  log: (message: string) => void;
};

/**
 * Split one pending snapshot into claim candidates, retry-fenced lanes, and
 * rows the channel expects to settle without delivering.
 *
 * Retry eligibility is drain-owned: claimNext has no backoff predicate of its
 * own, so a row reaches delivery only by landing in `eligiblePending`.
 */
export async function resolveChannelIngressPendingScan<TPayload, TMetadata>(
  params: ResolvePendingScanParams<TPayload, TMetadata>,
): Promise<{
  /** Snapshot rows offered to claimNext as candidates this pass. */
  eligiblePending: Array<ChannelIngressQueueRecord<TPayload, TMetadata>>;
  /** Lanes fenced because their oldest retained row is still under backoff. */
  retryDelayedLaneKeys: Set<string>;
  /** Candidate ids the channel expects to settle without delivering. */
  nonDeliveringIds: Set<string>;
}> {
  const eligiblePending: Array<ChannelIngressQueueRecord<TPayload, TMetadata>> = [];
  const seenLaneKeys = new Set<string>();
  const retryDelayedLaneKeys = new Set<string>();
  const nonDeliveringIds = new Set<string>();

  for (const event of params.pending) {
    const retryDelayMs = resolveIngressRetryDelayMs(event, params.retryPolicy, params.now);
    const laneKey = params.resolveLaneKey(event);
    const isLaneHead = !seenLaneKeys.has(laneKey);
    seenLaneKeys.add(laneKey);
    // Evaluated for every pending row, not just lane heads: a backlog is only
    // drainable in one pass if the whole run of non-delivering rows is known.
    if (await drainsWithoutDelivery(event, laneKey, retryDelayMs, params)) {
      eligiblePending.push(event);
      nonDeliveringIds.add(event.id);
      continue;
    }
    if (retryDelayMs === 0) {
      eligiblePending.push(event);
      continue;
    }
    // Only the oldest retained row can block its lane for retry backoff. A
    // delayed tail must not hide an eligible head from claimNext.
    if (!isLaneHead) {
      continue;
    }
    retryDelayedLaneKeys.add(laneKey);
  }

  return { eligiblePending, retryDelayedLaneKeys, nonDeliveringIds };
}

async function drainsWithoutDelivery<TPayload, TMetadata>(
  record: ChannelIngressQueueRecord<TPayload, TMetadata>,
  laneKey: string,
  retryDelayMs: number,
  params: ResolvePendingScanParams<TPayload, TMetadata>,
): Promise<boolean> {
  if (!params.shouldDrainWithoutDelivery) {
    return false;
  }
  try {
    return await params.shouldDrainWithoutDelivery(record, {
      laneKey,
      now: params.now,
      retryDelayMs,
    });
  } catch (err) {
    // Fail closed: an unusable predicate must keep normal backoff and lane
    // serialization rather than release a lane, and must never take the drain
    // pump down with it.
    params.log(
      `ingress drain non-delivering predicate failed for ${record.id}: ${params.formatError(err)}`,
    );
    return false;
  }
}
