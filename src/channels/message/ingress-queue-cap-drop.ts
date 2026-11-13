import type { FollowupQueueDisposition } from "../../auto-reply/get-reply-options.types.js";
import type { IngressNonRetryableFailure } from "./ingress-retry-policy.js";

export const INGRESS_QUEUE_CAP_DROP_REASONS = [
  "queue-cap",
  "queue-cap-old",
  "queue-cap-new",
] as const satisfies readonly FollowupQueueDisposition[];

/** A queue policy discard is terminal for the claimed ingress row. */
export class IngressQueueCapDropError extends Error {
  constructor(readonly reason: FollowupQueueDisposition) {
    super(`followup queue dropped source by cap policy (${reason})`);
  }
}

/** Protected work fills the followup queue: retryable backpressure, never a failed attempt. */
export class IngressQueueBackpressureError extends Error {
  constructor() {
    super("followup queue capacity backpressure: protected work fills the cap");
  }
}

export function resolveQueueCapDropFailure(
  failure: unknown,
  fallback?: (error: unknown) => IngressNonRetryableFailure | null,
): IngressNonRetryableFailure | null {
  return failure instanceof IngressQueueCapDropError
    ? { reason: failure.reason, message: failure.message }
    : (fallback?.(failure) ?? null);
}
