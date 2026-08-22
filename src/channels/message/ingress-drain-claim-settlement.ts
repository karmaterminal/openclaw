/**
 * Durable settlement owner for a held channel ingress claim.
 *
 * Every terminal write for a claim — tombstone, release, dead-letter — and the
 * single failure-disposition decision live here so the drain has exactly one
 * retry budget. The stall watchdog, genuine pre-adoption abandonment, and
 * dispatch failure all route through `applyFailureDisposition`; splitting that
 * decision across call sites is what previously let an unadoptable lane head
 * retry forever.
 */
import { sleepWithAbort } from "@openclaw/retry";
import { GatewayDrainingError } from "../../process/gateway-work-admission.js";
import { IngressAdoptionLostError, isIngressAdoptionLostError } from "./ingress-drain-state.js";
import type { ChannelIngressQueue, ChannelIngressQueueClaim } from "./ingress-queue.js";
import {
  DEFAULT_INGRESS_RETRY_BASE_MS,
  DEFAULT_INGRESS_RETRY_MAX_MS,
  resolveIngressFailureDisposition,
  type IngressNonRetryableFailure,
  type IngressRetryPolicyConfig,
} from "./ingress-retry-policy.js";

/** Bounded tombstone write retries — wedged ownership beats silent double-dispatch. */
const INGRESS_TOMBSTONE_RETRY_MAX_ATTEMPTS = 8;

export type IngressClaimSettlementDeps<TPayload, TMetadata> = {
  queue: ChannelIngressQueue<TPayload, TMetadata>;
  now: () => number;
  log: (message: string) => void;
  formatError: (err: unknown) => string;
  /** Cuts retry backoffs only; the first write still runs after abort. */
  isStopped: () => boolean;
  abortSignal?: AbortSignal;
  retryPolicy?: IngressRetryPolicyConfig;
  resolveNonRetryableFailure?: (err: unknown) => IngressNonRetryableFailure | null;
};

export type IngressClaimSettlement<TPayload, TMetadata> = {
  completeClaimWithRetry: (claim: ChannelIngressQueueClaim<TPayload, TMetadata>) => Promise<void>;
  releaseClaim: (
    claim: ChannelIngressQueueClaim<TPayload, TMetadata>,
    releaseOptions?: { lastError?: string; recordAttempt?: boolean },
  ) => Promise<void>;
  applyFailureDisposition: (
    claim: ChannelIngressQueueClaim<TPayload, TMetadata>,
    err: unknown,
  ) => Promise<void>;
};

export function createIngressClaimSettlement<TPayload, TMetadata>(
  deps: IngressClaimSettlementDeps<TPayload, TMetadata>,
): IngressClaimSettlement<TPayload, TMetadata> {
  const { queue, now, log, formatError, isStopped } = deps;

  /**
   * Claim-token fenced writes can throw OR return false when the lease was
   * reclaimed. For complete, false is ownership loss (do not settle success).
   * For release/fail, false means the row is already gone from this owner —
   * treat as done so abandon races do not wedge.
   */
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
        if (!committed && params.falseMeansReclaimed) {
          throw new IngressAdoptionLostError("reclaimed");
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
        // Abortable sleep: webhook stop aborts abortSignal mid-backoff.
        await sleepWithAbort(delayMs, deps.abortSignal, { ref: false });
      }
    }
  };

  const releaseClaim: IngressClaimSettlement<TPayload, TMetadata>["releaseClaim"] = async (
    claim,
    releaseOptions,
  ) => {
    await commitClaimWriteWithRetry({
      claim,
      label: "release",
      write: () => queue.release(claim, { ...releaseOptions, releasedAt: now() }),
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

  return {
    completeClaimWithRetry: async (claim) => {
      // Tombstone via complete() — never delete. Retry IO failures; false = reclaimed.
      await commitClaimWriteWithRetry({
        claim,
        label: "tombstone",
        write: () => queue.complete(claim),
        falseMeansReclaimed: true,
      });
    },
    releaseClaim,
    applyFailureDisposition: async (claim, err) => {
      if (err instanceof GatewayDrainingError) {
        // Root dispatch closes before durable transport admission during restart.
        // Preserve the row for the successor without spending its failure budget.
        await releaseClaim(claim, { recordAttempt: false });
        return;
      }
      const disposition = resolveIngressFailureDisposition({
        err,
        event: claim,
        formatError,
        resolveNonRetryableFailure: deps.resolveNonRetryableFailure,
        config: deps.retryPolicy,
        now: now(),
      });
      // Prefer numeric id when the event id is a zero-padded telegram update_id
      // so operator-visible lines stay human-readable.
      const displayId = claim.id.replace(/^0+(?=\d)/, "") || claim.id;
      if (disposition.kind === "fail") {
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
      log(`spooled update ${displayId} failed; keeping for retry: ${disposition.message}`);
      await releaseClaim(claim, { lastError: disposition.message });
    },
  };
}
