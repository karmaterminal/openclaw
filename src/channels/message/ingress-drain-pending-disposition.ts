import { resolveLaneKey } from "./ingress-drain-state.js";
import type {
  ChannelIngressPendingGenerationMatch,
  ChannelIngressQueue,
  ChannelIngressQueueRecord,
} from "./ingress-queue.js";

/** Durable metadata written for intentional pending-disposition completes. */
export type ChannelIngressSuppressedCompletionMetadata = {
  ingressDisposition: "suppressed";
  reason: string;
  message: string;
};

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

type PendingDispositionQueue<TPayload, TMetadata> = {
  fail: ChannelIngressQueue<TPayload, TMetadata, unknown>["fail"];
  /**
   * Disposition completes always write suppression metadata. Use `unknown` here
   * so free TCompletedMetadata queues remain structurally assignable; the drain
   * factory still gates incompatible completed-metadata contracts at its edge.
   */
  complete: (
    idOrClaim: Parameters<ChannelIngressQueue<TPayload, TMetadata, unknown>["complete"]>[0],
    options: {
      completedAt?: number;
      metadata?: unknown;
      expectedPending: ChannelIngressPendingGenerationMatch;
    },
  ) => Promise<boolean>;
};

type ApplyPendingDispositionsParams<TPayload, TMetadata> = {
  pending: Array<ChannelIngressQueueRecord<TPayload, TMetadata>>;
  dispositionNow: number;
  /**
   * Max pending rows that may be visited/examined in one drain pass.
   * Callers should also bound the pending snapshot load to this limit.
   * Unexamined tails stay pending. Defaults to unlimited when omitted.
   */
  workLimit?: number;
  /**
   * Lanes already owned by an active local claim or peer-held durable claim.
   * Pending rows on these lanes must not be settled this pass — leave them
   * pending and keep the lane fenced so a later predicted drop cannot overtake
   * an older in-flight same-lane head.
   */
  fencedLaneKeys?: ReadonlySet<string>;
  queue: PendingDispositionQueue<TPayload, TMetadata>;
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
  /** Rows touched under the admission pass (bounded by workLimit). */
  visited: number;
  /** Resolver invocations performed this pass (bounded by workLimit). */
  examined: number;
  /** Durable fail/complete settlements that won CAS this pass. */
  settled: number;
};

/** Diagnostic logging must never abort durable settlement or later drain work. */
function safeLog(log: (message: string) => void, message: string): void {
  try {
    log(message);
  } catch {
    // intentionally empty
  }
}

function pendingGenerationMatch<TPayload, TMetadata>(
  record: ChannelIngressQueueRecord<TPayload, TMetadata>,
): ChannelIngressPendingGenerationMatch {
  return {
    generation: record.generation,
    receivedAt: record.receivedAt,
  };
}

async function settlePendingRecord<TPayload, TMetadata>(
  queue: PendingDispositionQueue<TPayload, TMetadata>,
  record: ChannelIngressQueueRecord<TPayload, TMetadata>,
  disposition: ChannelIngressPendingDisposition,
  settledAt: number,
): Promise<boolean> {
  const reason = disposition.reason.trim() || "pending-disposition";
  const message = disposition.message.trim() || reason;
  const expectedPending = pendingGenerationMatch(record);
  if (disposition.kind === "complete") {
    const metadata: ChannelIngressSuppressedCompletionMetadata = {
      ingressDisposition: "suppressed",
      reason,
      message,
    };
    return await queue.complete(record.id, {
      completedAt: settledAt,
      metadata,
      expectedPending,
    });
  }
  return await queue.fail(record.id, {
    reason,
    message,
    failedAt: settledAt,
    expectedPending,
  });
}

/**
 * Pre-claim pending policy pass. Visits rows in snapshot order under workLimit,
 * fences later same-lane tails behind any retained head, generation-fences async
 * settlements, and isolates observer and log-sink failures after durable CAS.
 *
 * Callers must bound `pending` itself (typically `listPending({ limit: startLimit })`)
 * so large DB tails are never loaded under the admission lock.
 */
export async function applyIngressPendingDispositions<TPayload, TMetadata>(
  params: ApplyPendingDispositionsParams<TPayload, TMetadata>,
): Promise<AppliedIngressPendingDispositions<TPayload, TMetadata>> {
  if (!params.resolvePendingDisposition) {
    return {
      pending: params.pending,
      blockedLaneKeys: new Set(),
      workLimitedLaneKeys: new Set(),
      visited: 0,
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
  const fencedLaneKeys = params.fencedLaneKeys ?? new Set<string>();
  let visited = 0;
  let examined = 0;
  let settled = 0;

  for (const event of params.pending) {
    // Callers bound the snapshot load to startLimit; visiting only that window
    // keeps admission-lock work O(startLimit). Same-lane retained tails still
    // fence without consuming the unique-row examine budget.
    visited += 1;
    const laneKey = resolveLaneKey(event, params.deriveLaneKey, params.reconcileStoredLaneKey);

    if (retainedHeadLaneKeys.has(laneKey)) {
      retained.push(event);
      continue;
    }

    // Active/peer-held claim owns this lane — do not settle pending tails yet.
    if (fencedLaneKeys.has(laneKey)) {
      retained.push(event);
      retainedHeadLaneKeys.add(laneKey);
      blockedLaneKeys.add(laneKey);
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
      safeLog(
        params.log,
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
      safeLog(params.log, `ingress drain: pending disposition lost race for event ${event.id}`);
      retained.push(event);
      retainedHeadLaneKeys.add(laneKey);
      blockedLaneKeys.add(laneKey);
      continue;
    }

    settled += 1;
    // Observer runs only after durable CAS success and must not abort the pass,
    // even when both the observer and the diagnostic log sink throw.
    if (params.onPendingDispositionCommitted) {
      try {
        await params.onPendingDispositionCommitted(event, disposition, {
          laneKey,
          now: params.dispositionNow,
        });
      } catch (err) {
        safeLog(
          params.log,
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
    visited,
    examined,
    settled,
  };
}
