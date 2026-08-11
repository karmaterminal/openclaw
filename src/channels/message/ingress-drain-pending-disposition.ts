import { resolveLaneKey } from "./ingress-drain-state.js";
import type { ChannelIngressQueue, ChannelIngressQueueRecord } from "./ingress-queue.js";

export type ChannelIngressPendingDisposition =
  | {
      kind: "fail";
      reason: string;
      message: string;
    }
  | {
      /** Intentional policy drop: replay-guard tombstone without dead-letter health. */
      kind: "complete";
      reason: string;
      message: string;
    };

export type ChannelIngressPendingDispositionContext = {
  laneKey: string;
  now: number;
};

export type ResolveChannelIngressPendingDisposition<TPayload, TMetadata> = (
  record: ChannelIngressQueueRecord<TPayload, TMetadata>,
  context: ChannelIngressPendingDispositionContext,
) =>
  | ChannelIngressPendingDisposition
  | null
  | undefined
  | Promise<ChannelIngressPendingDisposition | null | undefined>;

export type OnChannelIngressPendingDispositionCommitted<TPayload, TMetadata> = (
  record: ChannelIngressQueueRecord<TPayload, TMetadata>,
  disposition: ChannelIngressPendingDisposition,
  context: ChannelIngressPendingDispositionContext,
) => void | Promise<void>;

type ApplyPendingDispositionsParams<TPayload, TMetadata, TCompletedMetadata> = {
  pending: Array<ChannelIngressQueueRecord<TPayload, TMetadata>>;
  dispositionNow: number;
  /**
   * Max pending rows that may be examined (resolver invoked) in one drain pass.
   * Unexamined tails stay pending. Defaults to unlimited when omitted.
   */
  workLimit?: number;
  queue: Pick<ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>, "fail" | "complete">;
  resolvePendingDisposition?: ResolveChannelIngressPendingDisposition<TPayload, TMetadata>;
  onPendingDispositionCommitted?: OnChannelIngressPendingDispositionCommitted<TPayload, TMetadata>;
  deriveLaneKey?: (record: ChannelIngressQueueRecord<TPayload, TMetadata>) => string | undefined;
  reconcileStoredLaneKey?: (
    record: ChannelIngressQueueRecord<TPayload, TMetadata>,
    storedLaneKey: string,
    derivedLaneKey: string,
  ) => boolean;
  log: (message: string) => void;
};

export type AppliedIngressPendingDispositions<TPayload, TMetadata> = {
  pending: Array<ChannelIngressQueueRecord<TPayload, TMetadata>>;
  /** Lanes that lost disposition CAS or threw in the resolver — keep fenced. */
  blockedLaneKeys: Set<string>;
  /**
   * Lanes whose head was retained because the work budget was exhausted before
   * examination. Claim must not race past that unexamined head this pass.
   */
  workLimitedLaneKeys: Set<string>;
  /** Resolver invocations performed this pass (bounded by workLimit). */
  examined: number;
  /** Durable fail/complete settlements that won CAS this pass. */
  settled: number;
};

async function settlePendingRecord<TPayload, TMetadata, TCompletedMetadata>(
  queue: Pick<ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>, "fail" | "complete">,
  record: ChannelIngressQueueRecord<TPayload, TMetadata>,
  disposition: ChannelIngressPendingDisposition,
  settledAt: number,
): Promise<boolean> {
  const reason = disposition.reason.trim() || "pending-disposition";
  const message = disposition.message.trim() || reason;
  if (disposition.kind === "complete") {
    return await queue.complete(record.id, {
      completedAt: settledAt,
      metadata: {
        ingressDisposition: "suppressed",
        reason,
        message,
      } as TCompletedMetadata,
    });
  }
  return await queue.fail(record.id, { reason, message, failedAt: settledAt });
}

/**
 * Pre-claim pending policy pass. Examines rows in snapshot order under workLimit,
 * fences later same-lane tails behind any retained head, and isolates observer
 * failures after a successful CAS settlement.
 */
export async function applyIngressPendingDispositions<TPayload, TMetadata, TCompletedMetadata>(
  params: ApplyPendingDispositionsParams<TPayload, TMetadata, TCompletedMetadata>,
): Promise<AppliedIngressPendingDispositions<TPayload, TMetadata>> {
  if (!params.resolvePendingDisposition) {
    return {
      pending: params.pending,
      blockedLaneKeys: new Set(),
      workLimitedLaneKeys: new Set(),
      examined: 0,
      settled: 0,
    };
  }
  const workLimit =
    params.workLimit === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.floor(params.workLimit));
  const retained: Array<ChannelIngressQueueRecord<TPayload, TMetadata>> = [];
  const blockedLaneKeys = new Set<string>();
  const workLimitedLaneKeys = new Set<string>();
  // Oldest retained row per lane fences later predicted drops on that lane.
  const retainedHeadLaneKeys = new Set<string>();
  let examined = 0;
  let settled = 0;

  for (const event of params.pending) {
    const laneKey = resolveLaneKey(event, params.deriveLaneKey, params.reconcileStoredLaneKey);

    if (retainedHeadLaneKeys.has(laneKey)) {
      retained.push(event);
      continue;
    }

    if (examined >= workLimit) {
      retained.push(event);
      retainedHeadLaneKeys.add(laneKey);
      workLimitedLaneKeys.add(laneKey);
      continue;
    }

    examined += 1;
    let disposition: ChannelIngressPendingDisposition | null | undefined;
    try {
      disposition = await params.resolvePendingDisposition(event, {
        laneKey,
        now: params.dispositionNow,
      });
    } catch (err) {
      // Resolver throws fail closed: keep the row and fence the lane head.
      params.log(
        `ingress drain: pending disposition resolver failed for event ${event.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      retained.push(event);
      retainedHeadLaneKeys.add(laneKey);
      blockedLaneKeys.add(laneKey);
      continue;
    }

    if (!disposition) {
      retained.push(event);
      retainedHeadLaneKeys.add(laneKey);
      continue;
    }

    if (disposition.kind !== "fail" && disposition.kind !== "complete") {
      retained.push(event);
      retainedHeadLaneKeys.add(laneKey);
      continue;
    }

    const committed = await settlePendingRecord(
      params.queue,
      event,
      disposition,
      params.dispositionNow,
    );
    if (!committed) {
      params.log(`ingress drain: pending disposition lost race for event ${event.id}`);
      retained.push(event);
      retainedHeadLaneKeys.add(laneKey);
      blockedLaneKeys.add(laneKey);
      continue;
    }

    settled += 1;
    // Observer runs only after durable CAS success and must not abort the pass.
    if (params.onPendingDispositionCommitted) {
      try {
        await params.onPendingDispositionCommitted(event, disposition, {
          laneKey,
          now: params.dispositionNow,
        });
      } catch (err) {
        params.log(
          `ingress drain: pending disposition observer failed for event ${event.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  return {
    pending: retained,
    blockedLaneKeys,
    workLimitedLaneKeys,
    examined,
    settled,
  };
}
