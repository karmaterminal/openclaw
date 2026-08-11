import type { ChannelIngressQueueClaim, ChannelIngressQueueRecord } from "./ingress-queue.js";

export class IngressAdoptionLostError extends Error {
  readonly code: "guillotined" | "superseded" | "reclaimed";

  constructor(code: "guillotined" | "superseded" | "reclaimed") {
    super(`ingress adoption lost: ${code}`);
    this.name = "IngressAdoptionLostError";
    this.code = code;
  }
}

export function isIngressAdoptionLostError(error: unknown): error is IngressAdoptionLostError {
  return error instanceof IngressAdoptionLostError;
}

export type ChannelIngressDrainDispatchResult =
  | { kind: "completed" }
  | { kind: "deferred" }
  | { kind: "failed-retryable"; error: unknown };

/** Full pre-adoption → adoption ownership lifecycle for one claimed event. */
export type ChannelIngressDispatchLifecycle = {
  /** Pre-adoption only. After adopt the drain treats this signal as inert. */
  abortSignal: AbortSignal;
  /**
   * Fires when recovery-relevant session/run state is durable.
   * Drain completes (tombstones) the claim here — never at settle.
   */
  onAdopted: () => void | Promise<void>;
  /**
   * Turn ownership deferred to reply-lane admission (queued followup).
   * Claim remains held until adopted or abandoned.
   */
  onDeferred: () => void;
  /**
   * Durable adoption finalization is in progress (e.g. settlement hold while
   * committing dedupe). Clears the pre-adoption stall watchdog so a timeout
   * settlement cannot race and dead-letter an about-to-complete claim.
   * Claim stays held until onAdopted / onAbandoned / fail.
   */
  onAdoptionFinalizing: () => void;
  /** Deferred work terminally failed after dispatch returned. */
  onFailed?: (error: unknown) => void | Promise<void>;
  /**
   * Deferred turn finished without ever owning the reply lane.
   * Drain releases the claim for retry.
   */
  onAbandoned: () => void | Promise<void>;
};

/**
 * Maps a drain lifecycle onto reply options.
 * Single surface: turnAdoptionLifecycle only.
 * Marks exclusive admission so collect isolation is not inferred from onAbandoned.
 */
export function bindIngressLifecycleToReplyOptions(lifecycle: ChannelIngressDispatchLifecycle): {
  turnAdoptionLifecycle: {
    admission: "exclusive";
    onAdopted: () => void | Promise<void>;
    onDeferred: () => void;
    onAbandoned: () => void | Promise<void>;
    abortSignal: AbortSignal;
  };
} {
  return {
    turnAdoptionLifecycle: {
      admission: "exclusive",
      onAdopted: lifecycle.onAdopted,
      onDeferred: lifecycle.onDeferred,
      onAbandoned: lifecycle.onAbandoned,
      abortSignal: lifecycle.abortSignal,
    },
  };
}

export type ActiveHandlerState<TPayload, TMetadata> = {
  eventId: string;
  laneKey: string;
  claim: ChannelIngressQueueClaim<TPayload, TMetadata>;
  abortController: AbortController;
  startedAt: number;
  phase: "dispatching" | "deferred" | "adopted" | "settled";
  occupiesLane: boolean;
  task: Promise<void>;
  stallTimer?: ReturnType<typeof setTimeout>;
  claimRefreshTimer?: ReturnType<typeof setInterval>;
  /** Closed code: pre-adoption stall watchdog has claimed settle ownership. */
  guillotined: boolean;
  /** Closed code: pre-adoption supersede has claimed settle ownership. */
  superseded: boolean;
  /**
   * Terminal channel-policy outcome that produced no delivery.
   *
   * The drain settles such rows outside lane serialization, so this records
   * whether that prediction actually held.
   */
  settledWithoutDelivery: boolean;
  /** Single settle owner for complete / fail / release / supersede / guillotine. */
  settleOnce: (fn: () => Promise<void>) => Promise<void>;
};

export function activeClaimKey<TPayload, TMetadata>(
  claim: ChannelIngressQueueClaim<TPayload, TMetadata>,
): string {
  return `${claim.id}\0${claim.claim.token}`;
}

export function resolveLaneKey<TPayload, TMetadata>(
  record: ChannelIngressQueueRecord<TPayload, TMetadata>,
  deriveLaneKey?: (record: ChannelIngressQueueRecord<TPayload, TMetadata>) => string | undefined,
  reconcileStoredLaneKey?: (
    record: ChannelIngressQueueRecord<TPayload, TMetadata>,
    storedLaneKey: string,
    derivedLaneKey: string,
  ) => boolean,
): string {
  const derivedLaneKey = deriveLaneKey?.(record);
  const storedLaneKey = record.laneKey;
  if (
    !reconcileStoredLaneKey ||
    storedLaneKey === undefined ||
    derivedLaneKey === undefined ||
    storedLaneKey === derivedLaneKey
  ) {
    return derivedLaneKey ?? storedLaneKey ?? record.id;
  }
  return reconcileStoredLaneKey(record, storedLaneKey, derivedLaneKey)
    ? derivedLaneKey
    : storedLaneKey;
}

export function sortedKeys(keys: Iterable<string>): string[] {
  return [...keys].toSorted((a, b) => a.localeCompare(b));
}
