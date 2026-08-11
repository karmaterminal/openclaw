/**
 * Bounded out-of-band settlement of ingress rows the channel scheduled as
 * non-delivering.
 *
 * Claiming and settling are separate phases on purpose. Claiming is cheap and
 * is what the admission lock protects, so it runs inside the drain pass.
 * Settlement runs a handler to completion, so it must not run inside that lock:
 * durable admission has to stay open while suppression settles.
 */
import { resolveLaneKey, type ActiveHandlerState } from "./ingress-drain-state.js";
import type { ChannelIngressQueue, ChannelIngressQueueClaim } from "./ingress-queue.js";

export type ClaimedNonDeliveringRow<TPayload, TMetadata> = {
  claim: ChannelIngressQueueClaim<TPayload, TMetadata>;
  laneKey: string;
};

/** Claim options are the queue's own contract; never restate them here. */
type ClaimNextOptions<TPayload, TMetadata, TCompletedMetadata> = NonNullable<
  Parameters<ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>["claimNext"]>[0]
>;

export type ClaimNonDeliveringRunOptions<TPayload, TMetadata, TCompletedMetadata> = {
  queue: ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>;
  ownerId: string;
  orderBy: ClaimNextOptions<TPayload, TMetadata, TCompletedMetadata>["orderBy"];
  scanLimit: number;
  /** Ids the channel scheduled as non-delivering; consumed as they are claimed. */
  nonDeliveringIds: Set<string>;
  /** Lanes already active or claimed this pass; never claimed out of band. */
  laneBusyKeys: ReadonlySet<string>;
  deriveLaneKey?: ClaimNextOptions<TPayload, TMetadata, TCompletedMetadata>["deriveLaneKey"];
  reconcileStoredLaneKey?: ClaimNextOptions<
    TPayload,
    TMetadata,
    TCompletedMetadata
  >["reconcileStoredLaneKey"];
  shouldStop: () => boolean;
};

/**
 * Claims the run of rows that are expected to settle without delivering.
 *
 * A row that delivers nothing has no agent turn to order, so fencing it behind
 * the lane would make a reconnect backlog cost one claim and one pump per row
 * while a fresh addressed message waits behind backlog depth. Claiming the run
 * in one pass keeps a deep backlog to a bounded number of pumps. Every
 * iteration consumes a candidate id or stops, so the loop cannot spin on
 * SQLite.
 */
async function claimNonDeliveringIngressRun<TPayload, TMetadata, TCompletedMetadata>(
  options: ClaimNonDeliveringRunOptions<TPayload, TMetadata, TCompletedMetadata>,
): Promise<Array<ClaimedNonDeliveringRow<TPayload, TMetadata>>> {
  const { queue, nonDeliveringIds, laneBusyKeys, shouldStop } = options;
  const claimed: Array<ClaimedNonDeliveringRow<TPayload, TMetadata>> = [];
  while (nonDeliveringIds.size > 0 && !shouldStop()) {
    const row = await queue.claimNext({
      ownerId: options.ownerId,
      blockedLaneKeys: laneBusyKeys,
      orderBy: options.orderBy,
      scanLimit: options.scanLimit,
      candidateIds: nonDeliveringIds,
      ...(options.deriveLaneKey ? { deriveLaneKey: options.deriveLaneKey } : {}),
      ...(options.reconcileStoredLaneKey
        ? { reconcileStoredLaneKey: options.reconcileStoredLaneKey }
        : {}),
    });
    if (!row) {
      break;
    }
    nonDeliveringIds.delete(row.id);
    claimed.push({
      claim: row,
      laneKey: resolveLaneKey(row, options.deriveLaneKey, options.reconcileStoredLaneKey),
    });
  }
  return claimed;
}

/**
 * Settles an already-claimed run outside the admission lock.
 *
 * Rows settle one at a time so same-lane ordering and lane ownership stay
 * exclusive. The channel prediction is checked, not trusted: an unexpected
 * delivery stops the run and hands the remaining rows back to normal lane
 * serialization on the next pass.
 */
async function settleClaimedIngressRun<TPayload, TMetadata, TCompletedMetadata>(
  rows: ReadonlyArray<ClaimedNonDeliveringRow<TPayload, TMetadata>>,
  options: {
    queue: ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>;
    runClaimed: (
      claim: ChannelIngressQueueClaim<TPayload, TMetadata>,
      laneKey: string,
    ) => ActiveHandlerState<TPayload, TMetadata>;
    shouldStop: () => boolean;
    log: (message: string) => void;
  },
): Promise<void> {
  for (const [index, row] of rows.entries()) {
    if (options.shouldStop()) {
      await releaseUnsettledRun(rows.slice(index), options);
      return;
    }
    const state = options.runClaimed(row.claim, row.laneKey);
    await state.task;
    if (!state.settledWithoutDelivery) {
      options.log(
        `ingress drain: event ${row.claim.id} on lane ${row.laneKey} delivered despite being scheduled as non-delivering; resuming lane serialization`,
      );
      await releaseUnsettledRun(rows.slice(index + 1), options);
      return;
    }
  }
}

/**
 * A stopped run must not strand its remaining claims: they were claimed for
 * settlement that will not happen here, so release them back to pending without
 * recording an attempt and let normal lane serialization own them.
 */
async function releaseUnsettledRun<TPayload, TMetadata, TCompletedMetadata>(
  rows: ReadonlyArray<ClaimedNonDeliveringRow<TPayload, TMetadata>>,
  options: {
    queue: ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>;
    log: (message: string) => void;
  },
): Promise<void> {
  for (const row of rows) {
    try {
      await options.queue.release(row.claim, { recordAttempt: false });
    } catch (error) {
      options.log(
        `ingress drain: failed to release unsettled non-delivering claim ${row.claim.id}: ${String(error)}`,
      );
    }
  }
}

/**
 * Claims the run inside the drain pass and settles it afterwards, tracking the
 * settlement so `waitForIdle` and shutdown still observe a quiet drain.
 */
export async function scheduleNonDeliveringIngressRun<TPayload, TMetadata, TCompletedMetadata>(
  options: ClaimNonDeliveringRunOptions<TPayload, TMetadata, TCompletedMetadata> & {
    runClaimed: (
      claim: ChannelIngressQueueClaim<TPayload, TMetadata>,
      laneKey: string,
    ) => ActiveHandlerState<TPayload, TMetadata>;
    log: (message: string) => void;
    formatError: (error: unknown) => string;
    track: Set<Promise<void>>;
  },
): Promise<{ claimedIds: Set<string>; laneKeys: Set<string> }> {
  const rows = await claimNonDeliveringIngressRun(options);
  const scheduled = {
    claimedIds: new Set(rows.map((row) => row.claim.id)),
    laneKeys: new Set(rows.map((row) => row.laneKey)),
  };
  if (rows.length === 0) {
    return scheduled;
  }
  const settlement = settleClaimedIngressRun(rows, options)
    .catch((error: unknown) => {
      options.log(
        `ingress drain: non-delivering settlement run failed: ${options.formatError(error)}`,
      );
    })
    .finally(() => {
      options.track.delete(settlement);
    });
  options.track.add(settlement);
  return scheduled;
}
