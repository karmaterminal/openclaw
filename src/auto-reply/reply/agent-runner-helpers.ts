import { isAudioFileName } from "@openclaw/media-core/mime";
import {
  hasOutboundReplyContent,
  resolveSendableOutboundReplyParts,
} from "openclaw/plugin-sdk/reply-payload";
import { settleProgressVisibilityCallbackResult } from "../../channels/progress-visibility.js";
import type { VerboseLevel } from "../thinking.js";
import type { ReplyPayload } from "../types.js";
import type { InternalGetReplyOptions } from "./get-reply.types.js";
import type { TypingSignaler } from "./typing-mode.js";

export const isAudioPayload = (payload: ReplyPayload): boolean =>
  resolveSendableOutboundReplyParts(payload).mediaUrls.some(isAudioFileName);

type VerboseGateParams = {
  readVerboseLevel?: () => VerboseLevel | undefined;
  resolvedVerboseLevel: VerboseLevel;
  verboseLevelOverride?: VerboseLevel;
};

function createVerboseGate(
  params: VerboseGateParams,
  shouldEmit: (level: VerboseLevel) => boolean,
): () => boolean {
  return () => {
    // Explicit turn hints stay fixed; only inherited settings follow live session changes.
    if (params.verboseLevelOverride != null) {
      return shouldEmit(params.verboseLevelOverride);
    }
    return shouldEmit(params.readVerboseLevel?.() ?? params.resolvedVerboseLevel);
  };
}

export const createShouldEmitToolResult = (params: VerboseGateParams): (() => boolean) =>
  createVerboseGate(params, (level) => level !== "off");

export const createShouldEmitToolOutput = (params: VerboseGateParams): (() => boolean) =>
  createVerboseGate(params, (level) => level === "full");

export const signalTypingIfNeeded = async (
  payloads: ReplyPayload[],
  typingSignals: TypingSignaler,
): Promise<void> => {
  const shouldSignalTyping = payloads.some((payload) =>
    hasOutboundReplyContent(payload, { trimText: true }),
  );
  if (shouldSignalTyping) {
    await typingSignals.signalRunStart();
  }
};

/** Track visible partial replies without changing later terminal-delivery authority. */
export function bindVisiblePartialReplyObserver(opts: InternalGetReplyOptions | undefined): {
  hasDeliveredVisiblePartialReply: () => boolean;
  runOpts: InternalGetReplyOptions | undefined;
} {
  let didDeliverVisiblePartialReply = false;
  const onPartialReply = opts?.onPartialReply;
  return {
    hasDeliveredVisiblePartialReply: () => didDeliverVisiblePartialReply,
    runOpts: onPartialReply
      ? {
          ...opts,
          onPartialReply: async (payload: Parameters<NonNullable<typeof onPartialReply>>[0]) => {
            const observed = await settleProgressVisibilityCallbackResult(onPartialReply(payload));
            if (observed.visible && hasOutboundReplyContent(payload, { trimText: true })) {
              didDeliverVisiblePartialReply = true;
            }
            return observed.result;
          },
        }
      : opts,
  };
}
