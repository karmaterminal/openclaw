import type { ChannelIngressQueueRecord } from "./ingress-queue.js";
import {
  resolveIngressRetryDelayMs,
  type IngressRetryPolicyConfig,
} from "./ingress-retry-policy.js";

export type ChannelIngressRetryDelayBypassContext = {
  laneKey: string;
  now: number;
  retryDelayMs: number;
};

type ResolvePendingScanParams<TPayload, TMetadata> = {
  pending: ReadonlyArray<ChannelIngressQueueRecord<TPayload, TMetadata>>;
  now: number;
  retryPolicy?: IngressRetryPolicyConfig;
  resolveLaneKey: (record: ChannelIngressQueueRecord<TPayload, TMetadata>) => string;
  shouldBypassRetryDelay?: (
    record: ChannelIngressQueueRecord<TPayload, TMetadata>,
    context: ChannelIngressRetryDelayBypassContext,
  ) => boolean | Promise<boolean>;
  formatError: (error: unknown) => string;
  log: (message: string) => void;
};

/**
 * Split one pending snapshot into claim candidates plus retry-fenced lanes.
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
}> {
  const eligiblePending: Array<ChannelIngressQueueRecord<TPayload, TMetadata>> = [];
  const seenLaneKeys = new Set<string>();
  const retryDelayedLaneKeys = new Set<string>();

  for (const event of params.pending) {
    const retryDelayMs = resolveIngressRetryDelayMs(event, params.retryPolicy, params.now);
    const laneKey = params.resolveLaneKey(event);
    const isLaneHead = !seenLaneKeys.has(laneKey);
    seenLaneKeys.add(laneKey);
    if (retryDelayMs === 0) {
      eligiblePending.push(event);
      continue;
    }
    // Only the oldest retained row can block its lane for retry backoff. A
    // delayed tail must not hide an eligible head from claimNext.
    if (!isLaneHead) {
      continue;
    }
    if (await bypassesRetryDelay(event, laneKey, retryDelayMs, params)) {
      eligiblePending.push(event);
      continue;
    }
    retryDelayedLaneKeys.add(laneKey);
  }

  return { eligiblePending, retryDelayedLaneKeys };
}

async function bypassesRetryDelay<TPayload, TMetadata>(
  record: ChannelIngressQueueRecord<TPayload, TMetadata>,
  laneKey: string,
  retryDelayMs: number,
  params: ResolvePendingScanParams<TPayload, TMetadata>,
): Promise<boolean> {
  if (!params.shouldBypassRetryDelay) {
    return false;
  }
  try {
    return await params.shouldBypassRetryDelay(record, { laneKey, now: params.now, retryDelayMs });
  } catch (err) {
    // Fail closed: an unusable predicate must keep the backoff rather than
    // release a lane, and must never take the drain pump down with it.
    params.log(
      `ingress drain retry-delay bypass predicate failed for ${record.id}: ${params.formatError(err)}`,
    );
    return false;
  }
}
