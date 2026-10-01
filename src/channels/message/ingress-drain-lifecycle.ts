import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Marks an `onAbandoned` call that is really aggregate cancellation. Lifecycles
 * that predate `onCancelled` expose cancellation through `onAbandoned`, so the
 * durable owner needs the distinction to keep those releases budget-free.
 */
const ingressCancelCompat = new AsyncLocalStorage<true>();

/** Run a source-compatible cancellation fallback as cancellation, not abandonment. */
export function runIngressCancelCompat<T>(fn: () => T): T {
  return ingressCancelCompat.run(true, fn);
}

/** True while the running `onAbandoned` call stands in for cancellation. */
export function isIngressCancelCompat(): boolean {
  return ingressCancelCompat.getStore() === true;
}

/**
 * Marks an `onAbandoned` call that is really an intentional queue-policy drop
 * (for example a follow-up queue cap eviction). The dropped turn will never
 * run, so the durable owner completes the claim with this disposition instead
 * of spending a retry attempt and re-delivering it later.
 */
const ingressPolicyDrop = new AsyncLocalStorage<string>();

/** Run an abandonment that stands for an intentional policy drop named `disposition`. */
export function runIngressPolicyDrop<T>(disposition: string, fn: () => T): T {
  return ingressPolicyDrop.run(disposition, fn);
}

/** Completed-row metadata recorded when a policy drop settles a claim. */
export type IngressPolicyDropMetadata = { policyDrop: string };

/**
 * Settles an unadopted claim whose deferred turn ended without the reply lane:
 * a policy drop completes it with its disposition, cancellation compat releases
 * it budget-free, and genuine abandonment goes through the shared retry owner.
 */
export async function settleAbandonedIngressClaim<TClaim>(
  claim: TClaim,
  writes: {
    complete: (claim: TClaim, metadata: IngressPolicyDropMetadata) => Promise<void>;
    release: (claim: TClaim, options: { recordAttempt: false }) => Promise<unknown>;
    retry: (claim: TClaim, error: Error) => Promise<void>;
  },
): Promise<void> {
  const policyDrop = ingressPolicyDrop.getStore();
  if (policyDrop !== undefined) {
    await writes.complete(claim, { policyDrop });
    return;
  }
  if (isIngressCancelCompat()) {
    // A source-compatible fan-in reaches cancellation through onAbandoned;
    // that release must not spend the event's retry budget.
    await writes.release(claim, { recordAttempt: false });
    return;
  }
  // Genuine abandonment is a real attempt, so it settles through the shared
  // retry owner instead of retrying without bound.
  await writes.retry(claim, new Error("turn-abandoned"));
}

/** Full pre-adoption -> adoption ownership lifecycle for one claimed event. */
export type ChannelIngressDispatchLifecycle = {
  /** Pre-adoption only. After adopt the drain treats this signal as inert. */
  abortSignal: AbortSignal;
  /**
   * Fires when recovery-relevant session/run state is durable.
   * Drain completes (tombstones) the claim here -- never at settle.
   */
  onAdopted: () => void | Promise<void>;
  /**
   * Turn ownership deferred to reply-lane admission (queued followup).
   * Claim remains held until adopted or abandoned.
   */
  onDeferred: () => void;
  /** Pre-adoption liveness while waiting for reply-lane admission or preflight compaction. */
  onDeferredHeartbeat?: () => void;
  deferredHeartbeatIntervalMs?: number;
  /**
   * Durable adoption finalization is in progress (e.g. settlement hold while
   * committing dedupe). Clears the pre-adoption stall watchdog so a timeout
   * settlement cannot race and dead-letter an about-to-complete claim.
   * Claim stays held until onAdopted / onAbandoned / fail.
   */
  onAdoptionFinalizing: () => void;
  /** Deferred work terminally failed after dispatch returned. */
  onFailed?: (error: unknown) => void | Promise<void>;
  /** Explicit cancellation before adoption; releases without consuming retry budget. */
  onCancelled?: () => void | Promise<void>;
  /**
   * Deferred turn finished without ever owning the reply lane.
   * Drain applies the bounded retry disposition unless a source-compatible
   * fan-in callback invokes it as cancellation.
   */
  onAbandoned: () => void | Promise<void>;
};

/** Maps a drain lifecycle onto the reply-lane ownership surface. */
export function bindIngressLifecycleToReplyOptions(lifecycle: ChannelIngressDispatchLifecycle): {
  turnAdoptionLifecycle: Omit<
    ChannelIngressDispatchLifecycle,
    "onAdoptionFinalizing" | "onFailed"
  > & { admission: "exclusive" };
} {
  return {
    turnAdoptionLifecycle: {
      admission: "exclusive",
      onAdopted: lifecycle.onAdopted,
      onDeferred: lifecycle.onDeferred,
      onDeferredHeartbeat: lifecycle.onDeferredHeartbeat,
      deferredHeartbeatIntervalMs: lifecycle.deferredHeartbeatIntervalMs,
      // Cancellation is part of the reply-lane terminal contract: a queued turn
      // dropped before admission must release its claim without spending budget.
      ...(lifecycle.onCancelled ? { onCancelled: lifecycle.onCancelled } : {}),
      onAbandoned: lifecycle.onAbandoned,
      abortSignal: lifecycle.abortSignal,
    },
  };
}

// onAdoptionFinalizing stays drain-only (not reply-options); channels call it
// via the spooled-replay ALS lifecycle frame during settlement hold.
