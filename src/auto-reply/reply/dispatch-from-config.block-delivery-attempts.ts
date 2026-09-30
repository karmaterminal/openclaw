// Block-reply delivery attempt tracking for chooseDispatchRoute (record + coverage lookup).
import { resolveSendableOutboundReplyParts } from "openclaw/plugin-sdk/reply-payload";
import { getReplyPayloadMetadata, type ReplyPayload } from "../reply-payload.js";
import {
  blockReplyAttemptSourcesCoverPayload,
  createBlockReplyContentKey,
  getBlockReplyAttemptGroups,
  type RoutedBlockReplyDelivery as BlockDelivery,
  type RoutedBlockReplyDeliveryAttempt as BlockDeliveryAttempt,
} from "./block-reply-pipeline.js";
import { runWithDispatchAbortSignal } from "./dispatch-from-config.abort.js";
import { shouldRetryReplyDispatch } from "./reply-dispatch-outcome.js";

export function createBlockDeliveryAttemptTracker() {
  const blockDeliveryAttemptsByMessage = new Map<number | undefined, BlockDeliveryAttempt[]>();
  const recordBlockDeliveryAttempt = (payload: ReplyPayload, outcome: Promise<BlockDelivery>) => {
    const assistantMessageIndex = getReplyPayloadMetadata(payload)?.assistantMessageIndex;
    const attempts = blockDeliveryAttemptsByMessage.get(assistantMessageIndex) ?? [];
    const reply = resolveSendableOutboundReplyParts(payload);
    attempts.push({
      contentKey: createBlockReplyContentKey(payload),
      // Coverage provenance first; see block-reply-pipeline. The occurrence pair
      // is cleared when presentation changes, and this join must still recognise
      // the source already under delivery custody.
      source:
        getReplyPayloadMetadata(payload)?.blockCoverageSourceText ??
        getReplyPayloadMetadata(payload)?.blockSourceText ??
        reply.trimmedText,
      delivery: outcome,
    });
    blockDeliveryAttemptsByMessage.set(assistantMessageIndex, attempts);
  };
  const getBlockReplyOutcome = async (
    payload: ReplyPayload,
    abortSignal?: AbortSignal,
  ): Promise<BlockDelivery | undefined> => {
    if (abortSignal?.aborted) {
      return undefined;
    }
    const contentKey = createBlockReplyContentKey(payload);
    for (const group of getBlockReplyAttemptGroups(blockDeliveryAttemptsByMessage, payload)) {
      const exactAttempts = group.filter((attempt) => attempt.contentKey === contentKey);
      const matchingAttempts =
        exactAttempts.length > 0
          ? exactAttempts
          : blockReplyAttemptSourcesCoverPayload(
                payload,
                group.map((attempt) => attempt.source),
              )
            ? group
            : [];
      if (matchingAttempts.length === 0) {
        continue;
      }
      const settled = await runWithDispatchAbortSignal(abortSignal, () =>
        Promise.all(matchingAttempts.map((attempt) => attempt.delivery)),
      );
      if (exactAttempts.length === 0) {
        const retryable = settled.find(
          ({ outcome, pending }) => !pending && shouldRetryReplyDispatch(outcome),
        );
        if (retryable) {
          return retryable;
        }
      }
      return (
        settled.find(({ outcome }) => outcome === "delivered") ??
        settled.find(({ outcome, pending }) => pending || !shouldRetryReplyDispatch(outcome)) ??
        settled[0]
      );
    }
    return undefined;
  };
  return { recordBlockDeliveryAttempt, getBlockReplyOutcome };
}
