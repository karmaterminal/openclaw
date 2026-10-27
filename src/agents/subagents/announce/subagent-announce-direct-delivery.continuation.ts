import type { ContinuationTrigger } from "../../../auto-reply/get-reply-options.types.js";
import type { SourceReplyDeliveryMode } from "../../../auto-reply/source-reply-delivery-mode.types.js";

/**
 * Continuation (karmaterminal): the direct completion request's source-reply fields, then the
 * continuation trigger and trace it carries to the requester's turn, each only when present.
 * The direct-delivery owner sits at its line cap, so its request keeps one call here in place of
 * upstream's spread.
 */
export function withDirectAnnounceContinuationFields(
  completionSourceReplyDeliveryMode: SourceReplyDeliveryMode | undefined,
  params: { continuationTriggerOverride?: ContinuationTrigger; traceparent?: string },
) {
  return {
    // Upstream's direct agent request expression, verbatim.
    ...(completionSourceReplyDeliveryMode
      ? { sourceReplyDeliveryMode: completionSourceReplyDeliveryMode }
      : {}),
    ...(params.continuationTriggerOverride
      ? { continuationTrigger: params.continuationTriggerOverride }
      : {}),
    ...(params.traceparent ? { traceparent: params.traceparent } : {}),
  };
}
