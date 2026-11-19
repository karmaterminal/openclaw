import { isRecord } from "@openclaw/normalization-core/record-coerce";
import { getAiTransportHost } from "../host.js";
import { ResponsesStreamFailure } from "../transports/openai-responses-debug.js";
import type { ResponsesEncryptedContentAttempt } from "../transports/openai-responses-replay-internal.js";
import type { Model } from "../types.js";
import type { ProviderErrorProjection } from "../utils/provider-error.js";
import { CodexApiError } from "./openai-chatgpt-responses-events.js";
import type { RequestBody } from "./openai-chatgpt-responses-websocket-state.js";

/** The request attempt in flight when a ChatGPT Responses failure surfaces. */
export type CodexActiveRequest = {
  transport: "sse" | "websocket";
  attemptVariant: ResponsesEncryptedContentAttempt<RequestBody>["kind"];
  /** The body dispatched, or the attempt's full request when it failed before dispatch. */
  request: RequestBody;
  /** A WebSocket continuation dispatches only the input after the socket's last response. */
  requestScope: "full" | "continuation-suffix";
};

type StreamFailureKind = "timeout" | "caller-abort" | "provider-failure" | "transport";

/** Local-only failure category for transport diagnostics; never provider text. */
function classifyStreamFailure(
  error: unknown,
  signal: AbortSignal | undefined,
  requestTimedOut: boolean,
): StreamFailureKind {
  if (requestTimedOut) {
    return "timeout";
  }
  if (signal?.aborted) {
    return "caller-abort";
  }
  // CodexApiError carries a non-OK HTTP reply; both are provider decisions, not transport faults.
  return error instanceof ResponsesStreamFailure || error instanceof CodexApiError
    ? "provider-failure"
    : "transport";
}

function countInputImages(parts: unknown): number {
  return Array.isArray(parts)
    ? parts.filter((part) => isRecord(part) && part.type === "input_image").length
    : 0;
}

/** Counts that describe a request body: never item ids, text, URLs, image data or ciphertext. */
function describeRequestShape(body: RequestBody) {
  try {
    const input = body.input ?? [];
    // The current user turn starts at its user message; later tool outputs belong to it.
    const turnStart = input.findLastIndex((item) => isRecord(item) && item.role === "user");
    let reasoningItems = 0;
    let encryptedReasoningItems = 0;
    let turnImages = 0;
    let historyImages = 0;
    for (const [index, item] of input.entries()) {
      if (!isRecord(item)) {
        continue;
      }
      if (item.type === "reasoning") {
        reasoningItems += 1;
        // Only whether ciphertext was sent: never its value, length or a hash of it.
        const ciphertext = item.encrypted_content;
        encryptedReasoningItems += typeof ciphertext === "string" && ciphertext !== "" ? 1 : 0;
      }
      // User images are message content parts; tool images are function_call_output parts.
      const images = countInputImages(item.content) + countInputImages(item.output);
      historyImages += images;
      turnImages += turnStart !== -1 && index >= turnStart ? images : 0;
    }
    return {
      inputItems: input.length,
      reasoningItems,
      encryptedReasoningItems,
      turnImages,
      historyImages,
      requestBytes: new TextEncoder().encode(JSON.stringify(body)).byteLength,
    };
  } catch {
    // A payload hook can return a body off the wire shape (unserializable, or a
    // non-array input). This log runs in the stream's terminal catch, which must
    // still end the stream, so such a request is logged without counts.
    return {};
  }
}

/**
 * Log a terminated stream with locally-derived facts only: timing, a fixed failure
 * category, and the variant, scope and counts of the body this side dispatched (or
 * built, if the failure came first). No projected provider field (message, body, code,
 * type, name) is logged — all of them are provider-controlled text that can carry
 * prompt- or response-derived content.
 */
export function logCodexStreamFailure(params: {
  model: Model<"openai-chatgpt-responses">;
  transport: string;
  startedAt: number;
  stopReason: ProviderErrorProjection["stopReason"];
  error: unknown;
  signal: AbortSignal | undefined;
  requestTimedOut: boolean;
  activeRequest: CodexActiveRequest | undefined;
  silentRetries: number;
}): void {
  const { model, activeRequest } = params;
  getAiTransportHost().logWarn("openai-transport", "ChatGPT Responses stream terminated", {
    provider: model.provider,
    api: model.api,
    model: model.id,
    transport: params.transport,
    elapsedMs: Math.max(0, Date.now() - params.startedAt),
    stopReason: params.stopReason,
    failureKind: classifyStreamFailure(params.error, params.signal, params.requestTimedOut),
    // The counts describe the dispatched body: a WebSocket continuation's suffix is
    // labeled, so it is never read as the whole conversation.
    ...(activeRequest
      ? {
          requestTransport: activeRequest.transport,
          attemptVariant: activeRequest.attemptVariant,
          silentRetries: params.silentRetries,
          requestScope: activeRequest.requestScope,
          ...describeRequestShape(activeRequest.request),
        }
      : {}),
  });
}
