/**
 * Core-owned durable channel-ingress drain.
 *
 * Owns claim recovery, per-lane serialization, adoption-time complete, retry /
 * dead-letter disposition, pre-adoption stall watchdog, and optional supersede.
 */
import { sleepWithAbort } from "@openclaw/retry";
import { formatErrorMessage, toErrorObject } from "../../infra/errors.js";
import {
  createIngressDrainOwnerId,
  deregisterLiveIngressDrainInstance,
  INGRESS_CLAIM_LEASE_MS,
  isIngressClaimOwnedByOtherLiveProcess,
  isIngressCorruptClaimOwnedByOtherLiveProcess,
  isLiveLocalIngressDrainOwner,
  registerLiveIngressDrainInstance,
} from "./ingress-claim-owner.js";
import {
  applyIngressPendingDispositions,
  type ChannelIngressSuppressedCompletionMetadata,
  type OnChannelIngressPendingDispositionCommitted,
  type ResolveChannelIngressPendingDisposition,
} from "./ingress-drain-pending-disposition.js";
import {
  activeClaimKey,
  IngressAdoptionLostError,
  isIngressAdoptionLostError,
  resolveLaneKey,
  sortedKeys,
  type ActiveHandlerState,
  type ChannelIngressDrainDispatchResult,
  type ChannelIngressDispatchLifecycle,
} from "./ingress-drain-state.js";
import { supersedeActiveStatesIfNeeded } from "./ingress-drain-supersede.js";
export {
  bindIngressLifecycleToReplyOptions,
  isIngressAdoptionLostError,
} from "./ingress-drain-state.js";
import type {
  ChannelIngressQueue,
  ChannelIngressQueueClaim,
  ChannelIngressQueueRecord,
} from "./ingress-queue.js";
import {
  DEFAULT_INGRESS_RETRY_BASE_MS,
  DEFAULT_INGRESS_RETRY_MAX_MS,
  resolveIngressFailureDisposition,
  resolveIngressRetryDelayMs,
  type IngressNonRetryableFailure,
  type IngressRetryPolicyConfig,
} from "./ingress-retry-policy.js";

/** Default claim→adoption stall before dead-lettering with handler-timeout. */
export const DEFAULT_INGRESS_ADOPTION_STALL_MS = 5 * 60 * 1000;

/** Bounded tombstone write retries — wedged ownership beats silent double-dispatch. */
const INGRESS_TOMBSTONE_RETRY_MAX_ATTEMPTS = 8;

type DeferredLaneOccupancy = "hold" | "release";

type CreateChannelIngressDrainCoreOptions<
  TPayload,
  TMetadata = unknown,
  TCompletedMetadata = unknown,
> = {
  queue: ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>;
  /**
   * Dispatch a claimed event. Wire lifecycle into reply options (see
   * bindIngressLifecycleToReplyOptions). Return deferred when ownership will
   * transfer at reply-lane admission; otherwise complete or throw.
   */
  dispatchClaimedEvent: (
    event: ChannelIngressQueueClaim<TPayload, TMetadata>,
    lifecycle: ChannelIngressDispatchLifecycle,
  ) => Promise<ChannelIngressDrainDispatchResult | void> | ChannelIngressDrainDispatchResult | void;
  resolveNonRetryableFailure?: (err: unknown) => IngressNonRetryableFailure | null;
  shouldSupersedePending?: (
    newEvent:
      | ChannelIngressQueueRecord<TPayload, TMetadata>
      | ChannelIngressQueueClaim<TPayload, TMetadata>,
    pendingEvent: ChannelIngressQueueClaim<TPayload, TMetadata>,
  ) => boolean | Promise<boolean>;
  deriveLaneKey?: (record: ChannelIngressQueueRecord<TPayload, TMetadata>) => string | undefined;
  reconcileStoredLaneKey?: (
    record: ChannelIngressQueueRecord<TPayload, TMetadata>,
    storedLaneKey: string,
    derivedLaneKey: string,
  ) => boolean;
  ownerId?: string;
  adoptionStallTimeoutMs?: number;
  claimLeaseMs?: number;
  /**
   * Whether a claimed event keeps occupying its ingress serialization lane after
   * dispatch hands ownership to deferred work. Default "hold" (current behavior).
   */
  deferredLaneOccupancy?: DeferredLaneOccupancy;
  retryPolicy?: IngressRetryPolicyConfig;
  now?: () => number;
  formatError?: (err: unknown) => string;
  onLog?: (message: string) => void;
  abortSignal?: AbortSignal;
  orderBy?: "received" | "id";
  scanLimit?: number;
  startLimit?: number;
};

type CreateChannelIngressDrainDispositionFields<TPayload, TMetadata> = {
  /**
   * complete dispositions write ChannelIngressSuppressedCompletionMetadata.
   * Only available when TCompletedMetadata accepts that shape (including unknown).
   */
  resolvePendingDisposition?: ResolveChannelIngressPendingDisposition<TPayload, TMetadata>;
  onPendingDispositionCommitted?: OnChannelIngressPendingDispositionCommitted<TPayload, TMetadata>;
};

/**
 * Completed-metadata contract carried by a queue value. Used so disposition
 * gating follows the queue even when factory type arguments are partial.
 */
export type ChannelIngressQueueCompletedMetadataOf<Q> = Q extends {
  readonly __completedMetadataBrand?: (value: infer C) => infer _C;
}
  ? C
  : Q extends ChannelIngressQueue<infer _P, infer _M, infer C>
    ? C
    : unknown;

/**
 * Public drain options. Disposition resolvers are only part of the surface when
 * the *queue value's* completed-metadata brand can store
 * ChannelIngressSuppressedCompletionMetadata.
 *
 * TQueue is constrained with `any` completed metadata so specialized queues can
 * still be supplied. Prefer the queue-first factory overload so TQueue is inferred
 * from `options.queue` (TypeScript cannot infer a trailing brand parameter once
 * leading type arguments are supplied without an any-default that fails open).
 * Incompatible queue contracts collapse disposition fields to `never` (errors
 * land on resolvePendingDisposition, not the queue property).
 */
export type CreateChannelIngressDrainOptions<
  TPayload = unknown,
  TMetadata = unknown,
  TCompletedMetadata = unknown,
  // Loose structural bound: function-brand variance rejects ChannelIngressQueue<P,M,C>
  // extends ChannelIngressQueue<P,M,any>, which would fail open or reject valid queues.
  TQueue extends {
    readonly __payloadBrand?: (value: TPayload) => unknown;
    readonly __metadataBrand?: (value: TMetadata) => unknown;
  } = ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>,
> = Omit<CreateChannelIngressDrainCoreOptions<TPayload, TMetadata, TCompletedMetadata>, "queue"> & {
  queue: TQueue;
} & (ChannelIngressSuppressedCompletionMetadata extends ChannelIngressQueueCompletedMetadataOf<TQueue>
    ? ChannelIngressSuppressedCompletionMetadata extends TCompletedMetadata
      ? CreateChannelIngressDrainDispositionFields<TPayload, TMetadata>
      : {
          resolvePendingDisposition?: never;
          onPendingDispositionCommitted?: never;
        }
    : {
        resolvePendingDisposition?: never;
        onPendingDispositionCommitted?: never;
      });

/**
 * Recover queue type params from compile-time brand fields (method bivariance
 * makes `extends ChannelIngressQueue<infer P, …>` collapse to unknown).
 */
type ChannelIngressQueueParamsOf<TQueue> = TQueue extends {
  readonly __payloadBrand?: (value: infer P) => infer _P;
  readonly __metadataBrand?: (value: infer M) => infer _M;
  readonly __completedMetadataBrand?: (value: infer C) => infer _C;
}
  ? [P, M, C]
  : never;

/**
 * Options inferred entirely from a queue value. Used by the queue-first factory
 * overload so one-/two-payload call sites keep brand safety without supplying an
 * any-metadata default for a trailing TQueue parameter.
 */
export type CreateChannelIngressDrainOptionsForQueue<TQueue> =
  ChannelIngressQueueParamsOf<TQueue> extends [infer P, infer M, infer C]
    ? CreateChannelIngressDrainOptions<P, M, C, TQueue & ChannelIngressQueue<P, M, C>>
    : never;

export type ChannelIngressDrain = {
  recoverStaleClaims: () => Promise<number>;
  drainOnce: (options?: {
    shouldStop?: () => boolean;
  }) => Promise<{ started: number; settled: number }>;
  activeLaneKeys: () => ReadonlySet<string>;
  waitForIdle: () => Promise<void>;
  dispose: () => void;
};

/**
 * Structural queue brand that can store suppressed completion metadata.
 * Used by genuine one-/two-generic single-call overloads so disposition
 * compatibility is checked without a caller-visible trailing completion generic.
 */
export type ChannelIngressQueueAcceptsSuppressedWrite<TPayload, TMetadata = unknown> = {
  readonly __payloadBrand?: (value: TPayload) => TPayload;
  readonly __metadataBrand?: (value: TMetadata) => TMetadata;
  readonly __completedMetadataBrand?: (
    value: ChannelIngressSuppressedCompletionMetadata,
  ) => unknown;
};

/** Payload/metadata brands only — avoids completed-metadata method invariance. */
export type ChannelIngressLoosePayloadQueueBrand<TPayload, TMetadata = unknown> = {
  readonly __payloadBrand?: (value: TPayload) => TPayload;
  readonly __metadataBrand?: (value: TMetadata) => TMetadata;
};

export type CreateChannelIngressDrainPartialCompatibleOptions<TPayload, TMetadata = unknown> = Omit<
  CreateChannelIngressDrainCoreOptions<
    TPayload,
    TMetadata,
    ChannelIngressSuppressedCompletionMetadata
  >,
  "queue"
> & {
  queue: ChannelIngressQueueAcceptsSuppressedWrite<TPayload, TMetadata>;
} & CreateChannelIngressDrainDispositionFields<TPayload, TMetadata>;

export type CreateChannelIngressDrainPartialFallbackOptions<TPayload, TMetadata = unknown> = Omit<
  CreateChannelIngressDrainCoreOptions<TPayload, TMetadata, unknown>,
  "queue"
> & {
  queue: ChannelIngressLoosePayloadQueueBrand<TPayload, TMetadata>;
  resolvePendingDisposition?: never;
  onPendingDispositionCommitted?: never;
};

/**
 * Queue-first call (zero type arguments). Infers payload/metadata/completed
 * metadata from `options.queue`. TQueue is unconstrained: specialized queues are
 * not assignable to `ChannelIngressQueue<any, any, any>` under function-brand
 * variance, and `createChannelIngressDrain<Payload>(...)` binds Payload as
 * TQueue with OptionsForQueue=never so the one-generic overloads win.
 */
export function createChannelIngressDrain<TQueue>(
  options: CreateChannelIngressDrainOptionsForQueue<TQueue>,
): ChannelIngressDrain;
/**
 * Genuine one-generic single-call form (`<Payload>({ queue, ... })`).
 * Compatible queues accept disposition resolvers; incompatible queues reject
 * resolvePendingDisposition (never the queue property) via fallback overload.
 */
export function createChannelIngressDrain<TPayload>(
  options: CreateChannelIngressDrainPartialCompatibleOptions<TPayload>,
): ChannelIngressDrain;
export function createChannelIngressDrain<TPayload>(
  options: CreateChannelIngressDrainPartialFallbackOptions<TPayload>,
): ChannelIngressDrain;
/**
 * Genuine two-generic single-call form (`<Payload, Metadata>({ queue, ... })`).
 */
export function createChannelIngressDrain<TPayload, TMetadata>(
  options: CreateChannelIngressDrainPartialCompatibleOptions<TPayload, TMetadata>,
): ChannelIngressDrain;
export function createChannelIngressDrain<TPayload, TMetadata>(
  options: CreateChannelIngressDrainPartialFallbackOptions<TPayload, TMetadata>,
): ChannelIngressDrain;
/**
 * Explicit free completed-metadata call (`<Payload, Metadata, CompletedMetadata>`).
 * No default on TCompletedMetadata so 0/1/2-arg calls cannot match this overload
 * and fail open or steal errors onto the queue property.
 */
export function createChannelIngressDrain<
  TPayload,
  TMetadata,
  TCompletedMetadata,
  TQueue extends {
    readonly __payloadBrand?: (value: TPayload) => unknown;
    readonly __metadataBrand?: (value: TMetadata) => unknown;
  } = ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>,
>(
  options: CreateChannelIngressDrainOptions<
    TPayload,
    TMetadata,
    TCompletedMetadata,
    TQueue & ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>
  >,
): ChannelIngressDrain;
/**
 * Creates a channel-agnostic durable ingress drain over an existing queue.
 * Implementation generics are erased at call sites by the overloads above.
 */
export function createChannelIngressDrain<
  TPayload = any,
  TMetadata = any,
  TCompletedMetadata = any,
  TQueue extends {
    readonly __payloadBrand?: (value: TPayload) => unknown;
    readonly __metadataBrand?: (value: TMetadata) => unknown;
  } = any,
>(
  options: CreateChannelIngressDrainOptions<TPayload, TMetadata, TCompletedMetadata, TQueue>,
): ChannelIngressDrain {
  // Overload erasure uses a loose structural TQueue bound (function-brand variance).
  // Recover the operational queue surface for the implementation body.
  const queue = options.queue as unknown as ChannelIngressQueue<
    TPayload,
    TMetadata,
    TCompletedMetadata
  >;
  // Unique per drain instance so same-process peers do not share claim ownership.
  const ownerId = options.ownerId ?? createIngressDrainOwnerId();
  registerLiveIngressDrainInstance(ownerId);
  const adoptionStallTimeoutMs =
    options.adoptionStallTimeoutMs ?? DEFAULT_INGRESS_ADOPTION_STALL_MS;
  const claimLeaseMs = options.claimLeaseMs ?? INGRESS_CLAIM_LEASE_MS;
  const now = options.now ?? Date.now;
  const formatError = options.formatError ?? formatErrorMessage;
  const orderBy = options.orderBy ?? "received";
  const scanLimit = options.scanLimit ?? 100;
  const startLimit = options.startLimit ?? 32;
  const deferredLaneOccupancy = options.deferredLaneOccupancy ?? "hold";
  const activeByClaim = new Map<string, ActiveHandlerState<TPayload, TMetadata>>();
  const laneOwnerByKey = new Map<string, ActiveHandlerState<TPayload, TMetadata>>();
  let disposed = false;

  const log = (message: string) => {
    try {
      options.onLog?.(message);
    } catch {
      // Diagnostic sinks must not abort admission/drain after durable work.
    }
  };

  const clearStallTimer = (state: ActiveHandlerState<TPayload, TMetadata>) => {
    if (state.stallTimer) {
      clearTimeout(state.stallTimer);
      state.stallTimer = undefined;
    }
  };

  const clearClaimRefresh = (state: ActiveHandlerState<TPayload, TMetadata>) => {
    if (state.claimRefreshTimer) {
      clearInterval(state.claimRefreshTimer);
      state.claimRefreshTimer = undefined;
    }
  };

  const abortActiveClaims = () => {
    // Retire before abort so replacements recover; Set.delete makes disposal repeat safe.
    // Claim-token fencing prevents this owner from settling a recovered claim.
    deregisterLiveIngressDrainInstance(ownerId);
    const reason = toErrorObject(options.abortSignal?.reason, "ingress-drain-aborted");
    for (const state of activeByClaim.values()) {
      if (state.phase === "dispatching" || state.phase === "deferred") {
        state.abortController.abort(reason);
      }
    }
  };
  if (options.abortSignal?.aborted) {
    abortActiveClaims();
  } else {
    options.abortSignal?.addEventListener("abort", abortActiveClaims, { once: true });
  }

  const removeActive = (state: ActiveHandlerState<TPayload, TMetadata>) => {
    clearStallTimer(state);
    clearClaimRefresh(state);
    activeByClaim.delete(activeClaimKey(state.claim));
    if (laneOwnerByKey.get(state.laneKey) === state) {
      laneOwnerByKey.delete(state.laneKey);
    }
    state.occupiesLane = false;
  };

  const markLeaseReclaimed = (state: ActiveHandlerState<TPayload, TMetadata>) => {
    // Guillotine-style closed flag: late onAdopted throws IngressAdoptionLostError.
    // Do not release/fail the durable row — another owner holds the claim token.
    // Retire local ownership so same-lane tails are not wedged forever.
    if (state.phase === "settled" || state.guillotined || state.superseded) {
      return;
    }
    state.guillotined = true;
    clearStallTimer(state);
    clearClaimRefresh(state);
    try {
      state.abortController.abort(new Error("ingress claim lease reclaimed"));
    } catch {
      // AbortController.abort is not fallible in practice.
    }
    removeActive(state);
  };

  const armClaimRefresh = (state: ActiveHandlerState<TPayload, TMetadata>) => {
    clearClaimRefresh(state);
    // Keep lease alive until tombstone commits (includes complete-retry wedge).
    const intervalMs = Math.max(1, Math.floor(claimLeaseMs / 3));
    state.claimRefreshTimer = setInterval(() => {
      if (state.phase === "settled" || state.guillotined || state.superseded) {
        clearClaimRefresh(state);
        return;
      }
      if (!queue.refreshClaim) {
        return;
      }
      void queue
        .refreshClaim(state.claim, { refreshedAt: now() })
        .then((refreshed) => {
          // false = claim-token fence rejected (lease reclaimed by another owner).
          if (!refreshed) {
            markLeaseReclaimed(state);
          }
        })
        .catch(() => undefined);
    }, intervalMs);
    state.claimRefreshTimer.unref?.();
  };

  /**
   * Claim-token fenced writes can throw OR return false when the lease was
   * reclaimed. For complete, false is ownership loss (do not settle success).
   * For release/fail, false means the row is already gone from this owner —
   * treat as done so abandon races do not wedge.
   */
  const isStopped = () => disposed || options.abortSignal?.aborted === true;

  const commitClaimWriteWithRetry = async (params: {
    claim: ChannelIngressQueueClaim<TPayload, TMetadata>;
    label: "tombstone" | "dead-letter" | "release";
    write: () => Promise<boolean>;
    falseMeansReclaimed: boolean;
  }): Promise<void> => {
    let attempt = 0;
    for (;;) {
      // First write still runs after session abort: terminal complete/release
      // (failed-retryable requeue, post-dispatch tombstone) must not be blocked.
      // Stop only cuts retry backoffs (webhook stop / dispose mid-retry).
      if (attempt > 0 && isStopped()) {
        throw new Error("ingress drain stopped during claim write");
      }
      try {
        const committed = await params.write();
        if (!committed) {
          if (params.falseMeansReclaimed) {
            throw new IngressAdoptionLostError("reclaimed");
          }
          return;
        }
        return;
      } catch (err) {
        if (isIngressAdoptionLostError(err)) {
          throw err;
        }
        attempt += 1;
        if (isStopped() || attempt >= INGRESS_TOMBSTONE_RETRY_MAX_ATTEMPTS) {
          if (attempt >= INGRESS_TOMBSTONE_RETRY_MAX_ATTEMPTS && !isStopped()) {
            log(
              `ingress drain: ${params.label} write failed for event ${params.claim.id} after ${attempt} attempt(s); holding claim: ${formatError(err)}`,
            );
          }
          throw err;
        }
        const delayMs = Math.min(
          DEFAULT_INGRESS_RETRY_MAX_MS,
          DEFAULT_INGRESS_RETRY_BASE_MS * 2 ** (attempt - 1),
        );
        const displayId = params.claim.id.replace(/^0+(?=\d)/, "") || params.claim.id;
        // Operator + test-visible: tombstone/complete retries after durable adoption.
        log(
          `ingress drain: ${params.label} retry ${attempt}/${INGRESS_TOMBSTONE_RETRY_MAX_ATTEMPTS} for event ${params.claim.id} in ${delayMs}ms: ${formatError(err)}`,
        );
        if (params.label === "tombstone") {
          log(`completion retry ${attempt} scheduled for event ${displayId}`);
        }
        // Abortable sleep: webhook stop aborts options.abortSignal mid-backoff.
        await sleepWithAbort(delayMs, options.abortSignal, { ref: false });
      }
    }
  };

  const completeClaimWithRetry = async (
    claim: ChannelIngressQueueClaim<TPayload, TMetadata>,
  ): Promise<void> => {
    // Tombstone via complete() — never delete. Retry IO failures; false = reclaimed.
    await commitClaimWriteWithRetry({
      claim,
      label: "tombstone",
      write: () => queue.complete(claim),
      falseMeansReclaimed: true,
    });
  };

  const releaseClaim = async (
    claim: ChannelIngressQueueClaim<TPayload, TMetadata>,
    lastError?: string,
  ) => {
    await commitClaimWriteWithRetry({
      claim,
      label: "release",
      write: () =>
        queue.release(claim, lastError === undefined ? {} : { lastError, releasedAt: now() }),
      falseMeansReclaimed: false,
    });
  };

  const failClaim = async (
    claim: ChannelIngressQueueClaim<TPayload, TMetadata>,
    reason: string,
    message: string,
  ) => {
    await commitClaimWriteWithRetry({
      claim,
      label: "dead-letter",
      write: () => queue.fail(claim, { reason, message, failedAt: now() }),
      // Fail false after guillotine/supersede race: treat as already settled.
      falseMeansReclaimed: false,
    });
  };

  const applyFailureDisposition = async (
    claim: ChannelIngressQueueClaim<TPayload, TMetadata>,
    err: unknown,
  ) => {
    const disposition = resolveIngressFailureDisposition({
      err,
      event: claim,
      formatError,
      resolveNonRetryableFailure: options.resolveNonRetryableFailure,
      config: options.retryPolicy,
      now: now(),
    });
    if (disposition.kind === "fail") {
      // Operator-visible dead-letter line. Prefer numeric id when the event id
      // is a zero-padded telegram update_id so logs stay human-readable.
      const displayId = claim.id.replace(/^0+(?=\d)/, "") || claim.id;
      log(
        `spooled update ${displayId} failed with non-retryable ${disposition.reason}: ${disposition.message}; dead-lettered`,
      );
      if (disposition.reason === "retry-limit-exceeded") {
        log(
          `spooled update ${displayId} on lane ${claim.laneKey ?? displayId} reached retry limit after ${disposition.attempt} attempts; dead-lettered`,
        );
      }
      await failClaim(claim, disposition.reason, disposition.message);
      return;
    }
    const displayId = claim.id.replace(/^0+(?=\d)/, "") || claim.id;
    log(`spooled update ${displayId} failed; keeping for retry: ${disposition.message}`);
    await releaseClaim(claim, disposition.message);
  };

  const createSettleOwner = (
    state: ActiveHandlerState<TPayload, TMetadata>,
  ): ((fn: () => Promise<void>) => Promise<void>) => {
    let settlePromise: Promise<void> | undefined;
    let settled = false;
    return async (fn) => {
      if (settled) {
        return;
      }
      if (settlePromise) {
        await settlePromise;
        return;
      }
      settlePromise = (async () => {
        // Only mark settled after the tombstone/fail/release write commits.
        // Ordinary write failure must keep heartbeat + in-memory ownership
        // (wedged > duplicated). Definitive claim-token loss is handled below.
        await fn();
        settled = true;
        state.phase = "settled";
        removeActive(state);
      })();
      try {
        await settlePromise;
      } catch (err) {
        settlePromise = undefined;
        // Complete returned false / adoption lost: retire local lane ownership
        // inside the lifecycle owner so steer-style callers that catch and return
        // "completed" cannot leave the lane wedged until lease heartbeat.
        // Ordinary I/O failures are not adoption-loss and keep ownership.
        if (isIngressAdoptionLostError(err)) {
          state.guillotined = true;
          clearStallTimer(state);
          clearClaimRefresh(state);
          removeActive(state);
        }
        throw err;
      }
    };
  };

  const armStallWatchdog = (state: ActiveHandlerState<TPayload, TMetadata>) => {
    clearStallTimer(state);
    state.stallTimer = setTimeout(() => {
      // Pre-adoption only (dispatching OR deferred). Timer is not cleared by deferral.
      if (state.phase !== "dispatching" && state.phase !== "deferred") {
        return;
      }
      const ageMs = now() - state.startedAt;
      const displayId = state.eventId.replace(/^0+(?=\d)/, "") || state.eventId;
      const message = `Channel ingress claim→adoption stalled for event ${displayId} on lane ${state.laneKey} after ${ageMs}ms; marking failed (handler-timeout).`;
      // Closed guillotine flag — catch must not string-sniff errors.
      state.guillotined = true;
      clearStallTimer(state);
      log(message);
      try {
        state.abortController.abort(new Error(message));
      } catch {
        // AbortController.abort is not fallible in practice.
      }
      // Same bounded-retry/hold-ownership policy as tombstone: a fail write
      // error must not falsely settle (would stop heartbeat and wedge recovery).
      void state
        .settleOnce(async () => {
          await failClaim(state.claim, "handler-timeout", message);
        })
        .catch((err: unknown) => {
          log(
            `ingress drain: failed to dead-letter stalled event ${displayId}; holding claim: ${formatError(err)}`,
          );
        });
    }, adoptionStallTimeoutMs);
    state.stallTimer.unref?.();
  };

  const createLifecycle = (
    state: ActiveHandlerState<TPayload, TMetadata>,
  ): ChannelIngressDispatchLifecycle => {
    return {
      abortSignal: state.abortController.signal,
      onAdopted: async () => {
        // Lost adoption is loud: guillotine/supersede already tombstoned/failed the claim.
        if (state.guillotined) {
          throw new IngressAdoptionLostError("guillotined");
        }
        if (state.superseded) {
          throw new IngressAdoptionLostError("superseded");
        }
        if (state.phase === "adopted" || state.phase === "settled") {
          // Idempotent only after a genuine successful adoption path.
          return;
        }
        // Complete at adoption, not settle — frees the lane for later events.
        state.phase = "adopted";
        clearStallTimer(state);
        await state.settleOnce(async () => {
          await completeClaimWithRetry(state.claim);
        });
      },
      onDeferred: () => {
        if (state.phase !== "dispatching") {
          return;
        }
        // Deferred holds the claim; watchdog remains armed until adoption or abandon.
        state.phase = "deferred";
        if (deferredLaneOccupancy === "release") {
          if (laneOwnerByKey.get(state.laneKey) === state) {
            laneOwnerByKey.delete(state.laneKey);
          }
          state.occupiesLane = false;
        }
      },
      onAdoptionFinalizing: () => {
        if (state.phase !== "dispatching" && state.phase !== "deferred") {
          return;
        }
        if (state.guillotined || state.superseded) {
          return;
        }
        // Adoption finalization (settlement hold) owns the claim; do not let a
        // stall watchdog race and dead-letter an about-to-complete event.
        clearStallTimer(state);
      },
      onFailed: async (error) => {
        if (state.phase !== "dispatching" && state.phase !== "deferred") {
          return;
        }
        if (state.guillotined || state.superseded) {
          return;
        }
        clearStallTimer(state);
        await state.settleOnce(async () => {
          await applyFailureDisposition(state.claim, error);
        });
      },
      onAbandoned: async () => {
        if (state.phase !== "deferred" && state.phase !== "dispatching") {
          return;
        }
        if (state.guillotined || state.superseded) {
          return;
        }
        clearStallTimer(state);
        await state
          .settleOnce(async () => {
            await releaseClaim(state.claim, "turn-abandoned");
          })
          .catch(() => undefined);
      },
    };
  };

  const supersedeActiveIfNeeded = async (
    candidate: ChannelIngressQueueRecord<TPayload, TMetadata>,
    laneKey: string,
  ): Promise<boolean> =>
    await supersedeActiveStatesIfNeeded({
      candidate,
      laneKey,
      activeByClaim,
      laneOwnerByKey,
      shouldSupersedePending: options.shouldSupersedePending,
      clearStallTimer,
      completeClaim: completeClaimWithRetry,
      formatError,
      log,
    });

  const runClaimed = (
    claim: ChannelIngressQueueClaim<TPayload, TMetadata>,
    laneKey: string,
  ): ActiveHandlerState<TPayload, TMetadata> => {
    const abortController = new AbortController();
    const state = {
      eventId: claim.id,
      laneKey,
      claim,
      abortController,
      startedAt: now(),
      phase: "dispatching" as const,
      occupiesLane: true,
      guillotined: false,
      superseded: false,
      task: Promise.resolve(),
      settleOnce: async () => {},
    } as ActiveHandlerState<TPayload, TMetadata>;
    state.settleOnce = createSettleOwner(state);
    const lifecycle = createLifecycle(state);
    armStallWatchdog(state);
    armClaimRefresh(state);

    state.task = (async () => {
      try {
        const result = await options.dispatchClaimedEvent(claim, lifecycle);
        // dispose() leaves claims for recovery. Session abort mid-flight
        // (skipped/void) also leaves the claim; a terminal completed/failed
        // result still settles even if abort raced the return.
        if (disposed) {
          return;
        }
        if (
          options.abortSignal?.aborted &&
          result?.kind !== "completed" &&
          result?.kind !== "failed-retryable"
        ) {
          return;
        }
        if (state.phase === "settled" || state.phase === "adopted") {
          return;
        }
        if (state.guillotined || state.superseded) {
          return;
        }
        if (result?.kind === "deferred") {
          lifecycle.onDeferred();
          return;
        }
        if (result?.kind === "failed-retryable") {
          clearStallTimer(state);
          await state.settleOnce(async () => {
            await applyFailureDisposition(claim, result.error);
          });
          return;
        }
        // Default: dispatch returned without deferral — complete when channel
        // did not call onAdopted (channels should prefer lifecycle.onAdopted).
        // Mark adopted BEFORE tombstone retries so a write failure cannot release
        // a claim whose dispatch side effects already ran (replay risk).
        if (state.phase === "dispatching") {
          state.phase = "adopted";
          clearStallTimer(state);
          await state.settleOnce(async () => {
            await completeClaimWithRetry(claim);
          });
        }
      } catch (err) {
        if (disposed) {
          return;
        }
        if (options.abortSignal?.aborted) {
          return;
        }
        if (state.phase === "settled") {
          return;
        }
        // Definitive claim-token loss: retire local lane ownership without touching
        // the peer-owned durable row so same-lane tails can progress later.
        if (isIngressAdoptionLostError(err)) {
          state.guillotined = true;
          clearStallTimer(state);
          clearClaimRefresh(state);
          removeActive(state);
          return;
        }
        // Guillotine / supersede own settleOnce — do not fail/release again.
        if (state.guillotined || state.superseded) {
          return;
        }
        // Adoption may have partially completed (tombstone retry wedge); keep claim.
        // Includes handler-completed path that moved to adopted before complete().
        // Only retain ownership when the claim token is still ours (IO failures).
        if (state.phase === "adopted") {
          log(
            `ingress drain: post-adoption error for event ${claim.id} while claim held: ${formatError(err)}`,
          );
          return;
        }
        clearStallTimer(state);
        await state.settleOnce(async () => {
          await applyFailureDisposition(claim, err);
        });
      }
    })();

    activeByClaim.set(activeClaimKey(claim), state);
    laneOwnerByKey.set(laneKey, state);
    return state;
  };

  const recoverStaleClaims = async (): Promise<number> => {
    const activeLanes = new Set(laneOwnerByKey.keys());
    return await queue.recoverStaleClaims({
      staleMs: 0,
      now: now(),
      shouldRecover: (claim) => {
        if (activeByClaim.has(activeClaimKey(claim))) {
          return false;
        }
        // Same-PID multi-drain: only recover when the owner instance is not live.
        if (isLiveLocalIngressDrainOwner(claim.claim.ownerId)) {
          return false;
        }
        return !isIngressClaimOwnedByOtherLiveProcess(claim, {
          maxAgeMs: claimLeaseMs,
          now: now(),
        });
      },
      shouldRecoverCorrupt: (claim) => {
        if (claim.laneKey && activeLanes.has(claim.laneKey)) {
          return false;
        }
        if (isLiveLocalIngressDrainOwner(claim.claim.ownerId)) {
          return false;
        }
        return !isIngressCorruptClaimOwnedByOtherLiveProcess(claim, {
          maxAgeMs: claimLeaseMs,
          now: now(),
        });
      },
    });
  };

  const drainOnce = async (drainOptions?: {
    shouldStop?: () => boolean;
  }): Promise<{ started: number; settled: number }> => {
    if (disposed) {
      return { started: 0, settled: 0 };
    }
    const shouldStop = () =>
      disposed || drainOptions?.shouldStop?.() === true || options.abortSignal?.aborted === true;

    await recoverStaleClaims();

    const dispositionNow = now();
    // Load durable + local claim ownership before pending dispositions so a
    // later same-lane predicted drop cannot settle while an older head claim
    // (local or peer-held) still owns the lane.
    const claims = await queue.listClaims();
    const activeLaneKeys = new Set(laneOwnerByKey.keys());
    const claimedLaneKeys = new Set(
      claims
        .filter((claim) => {
          const state = activeByClaim.get(activeClaimKey(claim));
          return !(
            state?.phase === "deferred" &&
            !state.occupiesLane &&
            !state.guillotined &&
            !state.superseded
          );
        })
        .map((claim) =>
          resolveLaneKey(claim, options.deriveLaneKey, options.reconcileStoredLaneKey),
        ),
    );
    const fencedLaneKeys = new Set<string>([
      ...sortedKeys(activeLaneKeys),
      ...sortedKeys(claimedLaneKeys),
    ]);
    // Bound pre-claim disposition load+visit+resolver work by startLimit so
    // reconnect backlogs cannot scan an unbounded pending tail under the
    // admission lock before claims. Without a disposition resolver the full
    // pending set is still needed for retry/claim eligibility.
    const pendingSnapshot = await queue.listPending({
      limit: options.resolvePendingDisposition ? startLimit : "all",
      orderBy,
    });
    const pendingDispositionResult = await applyIngressPendingDispositions({
      pending: pendingSnapshot,
      dispositionNow,
      workLimit: startLimit,
      fencedLaneKeys,
      // Factory edge already gates completed-metadata compatibility; free
      // TCompletedMetadata cannot re-prove structural complete assignability.
      queue: queue as never,
      resolvePendingDisposition: options.resolvePendingDisposition,
      onPendingDispositionCommitted: options.onPendingDispositionCommitted,
      deriveLaneKey: options.deriveLaneKey,
      reconcileStoredLaneKey: options.reconcileStoredLaneKey,
      log,
    });
    const pending = pendingDispositionResult.pending;
    const eligiblePending: Array<ChannelIngressQueueRecord<TPayload, TMetadata>> = [];
    const oldestRetainedPendingLaneKeys = new Set<string>();
    const retryDelayedLaneKeys = new Set<string>();
    for (const event of pending) {
      const retryDelayMs = resolveIngressRetryDelayMs(event, options.retryPolicy, dispositionNow);
      if (retryDelayMs === 0) {
        eligiblePending.push(event);
      }
      const laneKey = resolveLaneKey(event, options.deriveLaneKey, options.reconcileStoredLaneKey);
      if (oldestRetainedPendingLaneKeys.has(laneKey)) {
        continue;
      }
      oldestRetainedPendingLaneKeys.add(laneKey);
      // Only the oldest retained row can block its lane for retry backoff. A
      // delayed tail must not hide an eligible head from claimNext.
      if (retryDelayMs > 0) {
        retryDelayedLaneKeys.add(laneKey);
      }
    }

    // Deterministic blocked set for claimNext lane serialization.
    const blockedLaneKeys = new Set<string>([
      ...sortedKeys(activeLaneKeys),
      ...sortedKeys(claimedLaneKeys),
      ...sortedKeys(retryDelayedLaneKeys),
      ...sortedKeys(pendingDispositionResult.blockedLaneKeys),
      // Do not claim past a same-lane head the disposition pass lacked budget to examine.
      ...sortedKeys(pendingDispositionResult.workLimitedLaneKeys),
    ]);

    // Optional supersede scan: pending events may abort unadopted same-lane work.
    // Free the lane in blockedLaneKeys so claimNext can take the superseding event.
    for (const event of eligiblePending) {
      if (shouldStop()) {
        break;
      }
      const laneKey = resolveLaneKey(event, options.deriveLaneKey, options.reconcileStoredLaneKey);
      if (await supersedeActiveIfNeeded(event, laneKey)) {
        blockedLaneKeys.delete(laneKey);
      }
    }

    const candidateIds = new Set(eligiblePending.map((event) => event.id));
    // Share startLimit across disposition settlements and claims so one pass cannot
    // perform unbounded pre-claim work and then still start a full claim batch.
    const claimBudget = Math.max(0, startLimit - pendingDispositionResult.settled);
    let started = 0;
    while (started < claimBudget) {
      if (shouldStop()) {
        break;
      }
      const claimed = await queue.claimNext({
        ownerId,
        blockedLaneKeys,
        orderBy,
        scanLimit,
        candidateIds,
        deriveLaneKey: options.deriveLaneKey,
        ...(options.reconcileStoredLaneKey
          ? { reconcileStoredLaneKey: options.reconcileStoredLaneKey }
          : {}),
      });
      if (!claimed) {
        break;
      }
      // One snapshot row gets one attempt per pass. A released claim remains
      // pending for the next pump instead of spinning through SQLite here.
      candidateIds.delete(claimed.id);
      if (shouldStop()) {
        await queue.release(claimed, { recordAttempt: false });
        break;
      }
      const laneKey = resolveLaneKey(
        claimed,
        options.deriveLaneKey,
        options.reconcileStoredLaneKey,
      );
      const existing = laneOwnerByKey.get(laneKey);
      if (existing && existing.phase !== "settled") {
        if (await supersedeActiveIfNeeded(claimed, laneKey)) {
          blockedLaneKeys.delete(laneKey);
        }
        if (laneOwnerByKey.has(laneKey)) {
          await queue.release(claimed, { recordAttempt: false });
          blockedLaneKeys.add(laneKey);
          continue;
        }
      }
      runClaimed(claimed, laneKey);
      blockedLaneKeys.add(laneKey);
      started += 1;
    }
    return { started, settled: pendingDispositionResult.settled };
  };

  return {
    recoverStaleClaims,
    drainOnce,
    activeLaneKeys: () => new Set(laneOwnerByKey.keys()),
    waitForIdle: async () => {
      const tasks = [...activeByClaim.values()].map((state) => state.task);
      await Promise.allSettled(tasks);
    },
    dispose: () => {
      disposed = true;
      options.abortSignal?.removeEventListener("abort", abortActiveClaims);
      deregisterLiveIngressDrainInstance(ownerId);
      // Snapshot: removeActive mutates activeByClaim during this sweep.
      const activeStates = Array.from(activeByClaim.values());
      for (const state of activeStates) {
        clearStallTimer(state);
        if (state.phase === "dispatching" || state.phase === "deferred") {
          try {
            state.abortController.abort(new Error("ingress-drain-disposed"));
          } catch {
            // ignore
          }
        }
        removeActive(state);
      }
    },
  };
}
