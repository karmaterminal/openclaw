/**
 * Drain-owned claim write + failure disposition.
 *
 * Tombstone/release/fail retries and retry-budget application live here so
 * pre-adoption abandonment and onFailed share one writer. Keeps ingress-drain
 * under the 700-line ceiling without a second settlement path.
 */
import { sleepWithAbort } from "@openclaw/retry";
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

type IngressDrainClaimWriteQueue<TPayload, TMetadata, TCompletedMetadata> = Pick<
  ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>,
  "complete" | "release" | "fail"
>;

export type IngressDrainClaimWriteHost<TPayload, TMetadata, TCompletedMetadata> = {
  queue: IngressDrainClaimWriteQueue<TPayload, TMetadata, TCompletedMetadata>;
  now: () => number;
  log: (message: string) => void;
  formatError: (err: unknown) => string;
  isStopped: () => boolean;
  abortSignal?: AbortSignal;
  resolveNonRetryableFailure?: (err: unknown) => IngressNonRetryableFailure | null;
  retryPolicy?: IngressRetryPolicyConfig;
};

export function createIngressDrainClaimWrites<TPayload, TMetadata, TCompletedMetadata>(
  host: IngressDrainClaimWriteHost<TPayload, TMetadata, TCompletedMetadata>,
) {
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
      if (attempt > 0 && host.isStopped()) {
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
        if (host.isStopped() || attempt >= INGRESS_TOMBSTONE_RETRY_MAX_ATTEMPTS) {
          if (attempt >= INGRESS_TOMBSTONE_RETRY_MAX_ATTEMPTS && !host.isStopped()) {
            host.log(
              `ingress drain: ${params.label} write failed for event ${params.claim.id} after ${attempt} attempt(s); holding claim: ${host.formatError(err)}`,
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
        host.log(
          `ingress drain: ${params.label} retry ${attempt}/${INGRESS_TOMBSTONE_RETRY_MAX_ATTEMPTS} for event ${params.claim.id} in ${delayMs}ms: ${host.formatError(err)}`,
        );
        if (params.label === "tombstone") {
          host.log(`completion retry ${attempt} scheduled for event ${displayId}`);
        }
        // Abortable sleep: webhook stop aborts options.abortSignal mid-backoff.
        await sleepWithAbort(delayMs, host.abortSignal, { ref: false });
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
      write: () => host.queue.complete(claim),
      falseMeansReclaimed: true,
    });
  };

  const releaseClaim = async (
    claim: ChannelIngressQueueClaim<TPayload, TMetadata>,
    releaseOptions?: { lastError?: string; recordAttempt?: boolean },
  ) => {
    await commitClaimWriteWithRetry({
      claim,
      label: "release",
      write: () => host.queue.release(claim, { ...releaseOptions, releasedAt: host.now() }),
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
      write: () => host.queue.fail(claim, { reason, message, failedAt: host.now() }),
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
      formatError: host.formatError,
      resolveNonRetryableFailure: host.resolveNonRetryableFailure,
      config: host.retryPolicy,
      now: host.now(),
    });
    if (disposition.kind === "fail") {
      // Operator-visible dead-letter line. Prefer numeric id when the event id
      // is a zero-padded telegram update_id so logs stay human-readable.
      const displayId = claim.id.replace(/^0+(?=\d)/, "") || claim.id;
      host.log(
        `spooled update ${displayId} failed with non-retryable ${disposition.reason}: ${disposition.message}; dead-lettered`,
      );
      if (disposition.reason === "retry-limit-exceeded") {
        host.log(
          `spooled update ${displayId} on lane ${claim.laneKey ?? displayId} reached retry limit after ${disposition.attempt} attempts; dead-lettered`,
        );
      }
      await failClaim(claim, disposition.reason, disposition.message);
      return;
    }
    const displayId = claim.id.replace(/^0+(?=\d)/, "") || claim.id;
    host.log(`spooled update ${displayId} failed; keeping for retry: ${disposition.message}`);
    await releaseClaim(claim, { lastError: disposition.message });
  };

  return {
    completeClaimWithRetry,
    releaseClaim,
    failClaim,
    applyFailureDisposition,
  };
}
