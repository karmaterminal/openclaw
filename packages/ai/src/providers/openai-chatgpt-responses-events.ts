import { isRecord } from "@openclaw/normalization-core/record-coerce";
import {
  responsesRequestLifecycle,
  withResponsesRequestAcceptance,
} from "../transports/openai-responses-request-lifecycle.js";
import { createResponseModelTracker } from "../transports/openai-transport-shared.js";
import { parseRetryAfterSeconds, redactIdentifier } from "../transports/transport-utils.js";
import type { StreamOptions } from "../types.js";
import { matchesContextOverflowMessage } from "../utils/overflow.js";

// ChatGPT backend `{detail}` wordings; diagnostics keep only the class name.
const CODEX_DETAIL_CLASSES = [
  ["unsupported_parameter", /^unsupported parameter\b/i],
  ["invalid_tool_schema", /^invalid schema for function\b/i],
  [
    "invalid_input_item",
    /^(?:no tool call found for function call output|item '[^']+' of type '[^']+' was provided without)\b/i,
  ],
  ["unsupported_model", /^the '[^']+' model is not supported when using codex\b/i],
  ["store_must_be_false", /^store must be set to false\b/i],
] as const;
const CODEX_REJECTION_PARAM_RE = /^[A-Za-z0-9_]+(?:\[[0-9]+\]|\.[A-Za-z0-9_]+)*$/;

type CodexRejectionDetailClass =
  | (typeof CODEX_DETAIL_CLASSES)[number][0]
  | "context_length"
  | "unknown";

/** Content-free labels from an HTTP 4xx body. Provider prose never enters here. */
type CodexHttpRejection = {
  bodyHash?: string;
  param?: string;
  paramShape?: "invalid";
  detailClass?: CodexRejectionDetailClass;
};

export class CodexApiError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly payload?: Record<string, unknown>;
  readonly rejection?: CodexHttpRejection;

  constructor(
    message: string,
    options?: {
      code?: string;
      status?: number;
      payload?: Record<string, unknown>;
      rejection?: CodexHttpRejection;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "CodexApiError";
    this.code = options?.code;
    this.status = options?.status;
    this.payload = options?.payload;
    this.rejection = options?.rejection;
    this.cause = options?.cause;
  }
}

function classifyCodexRejectionDetail(detail: unknown): CodexRejectionDetailClass {
  if (typeof detail !== "string") {
    return "unknown";
  }
  const text = detail.trim();
  const known = CODEX_DETAIL_CLASSES.find(([, pattern]) => pattern.test(text))?.[0];
  return (
    known ?? (matchesContextOverflowMessage(text, "assistant-error") ? "context_length" : "unknown")
  );
}

function readCodexHttpRejection(
  raw: string,
  payload: Record<string, unknown> | undefined,
): CodexHttpRejection {
  const param = isRecord(payload?.error) ? payload.error.param : undefined;
  const fieldPath =
    typeof param === "string" && param.length <= 80 && CODEX_REJECTION_PARAM_RE.test(param);
  return {
    // Same digest as failover `rawErrorHash`, so hosts correlate a rejection without its text.
    ...(raw.trim() ? { bodyHash: redactIdentifier(raw, { len: 12 }) } : {}),
    ...(fieldPath ? { param } : param == null ? {} : { paramShape: "invalid" }),
    ...(payload?.detail === undefined
      ? {}
      : { detailClass: classifyCodexRejectionDetail(payload.detail) }),
  };
}

export function parseErrorResponse(raw: string, response: Response): CodexApiError {
  const { status, statusText } = response;
  let message = raw || statusText || "Request failed";
  let friendlyMessage: string | undefined;
  let code: string | undefined;
  let payload: Record<string, unknown> | undefined;

  try {
    const parsed = JSON.parse(raw) as {
      error?: {
        code?: string;
        type?: string;
        message?: string;
        plan_type?: string;
        resets_at?: number;
      };
    };
    payload = isRecord(parsed) ? parsed : undefined;
    const err = parsed?.error;
    if (err) {
      code = err.code || err.type || undefined;
      if (
        /usage_limit_reached|usage_not_included|rate_limit_exceeded/i.test(code ?? "") ||
        status === 429
      ) {
        const plan = err.plan_type ? ` (${err.plan_type.toLowerCase()} plan)` : "";
        const mins = err.resets_at
          ? Math.max(0, Math.round((err.resets_at * 1000 - Date.now()) / 60000))
          : undefined;
        const when = mins !== undefined ? ` Try again in ~${mins} min.` : "";
        friendlyMessage = `You have hit your ChatGPT usage limit${plan}.${when}`.trim();
      }
      message = err.message || friendlyMessage || message;
    }
  } catch {}

  const retryAfterSeconds = parseRetryAfterSeconds(response.headers);
  // The canonical projection retains HTTP status; retry owners read its bounded
  // terminal text for pacing, matching Anthropic HTTP error projection.
  const retryAfterSuffix = Number.isFinite(retryAfterSeconds)
    ? `; Retry-After: ${Math.ceil(retryAfterSeconds ?? 0)} seconds`
    : "";
  return new CodexApiError(`${friendlyMessage || message}${retryAfterSuffix}`, {
    code,
    status,
    payload,
    // A 4xx names the rejected request; 5xx bodies describe server state and stay unlabeled.
    rejection: status >= 400 && status < 500 ? readCodexHttpRejection(raw, payload) : undefined,
  });
}

function extractCodexEventError(event: Record<string, unknown>): {
  code?: string;
  message?: string;
} {
  const nested = isRecord(event.error) ? event.error : undefined;
  const read = (field: "code" | "message") =>
    typeof event[field] === "string"
      ? event[field]
      : typeof nested?.[field] === "string"
        ? nested[field]
        : undefined;
  return { code: read("code"), message: read("message") };
}

export async function* mapCodexEvents(
  events: AsyncIterable<Record<string, unknown>>,
  initialResponseHeaders?: Headers,
  options?: Pick<StreamOptions, "signal">,
): AsyncGenerator<Record<string, unknown>> {
  const responseModelTracker = createResponseModelTracker();
  responseModelTracker.begin(initialResponseHeaders);
  for await (const event of withResponsesRequestAcceptance(
    events,
    responsesRequestLifecycle.get(options),
    options?.signal,
  )) {
    responseModelTracker.observeEvent(event);
    const type = typeof event.type === "string" ? event.type : undefined;
    if (!type) {
      continue;
    }

    if (type === "error") {
      const { code, message } = extractCodexEventError(event);
      throw new CodexApiError(`Codex error: ${message || code || JSON.stringify(event)}`, {
        code,
        payload: event,
      });
    }

    if (
      type === "response.done" ||
      type === "response.completed" ||
      type === "response.incomplete"
    ) {
      const response = isRecord(event.response) ? event.response : undefined;
      const normalizedResponse = response
        ? {
            ...response,
            status: normalizeCodexStatus(response.status),
            model: responseModelTracker.resolve(),
          }
        : response;
      yield {
        ...event,
        type: type === "response.done" ? "response.completed" : type,
        response: normalizedResponse,
      };
      return;
    }

    yield event;
  }
}

function normalizeCodexStatus(status: unknown) {
  switch (status) {
    case "completed":
    case "incomplete":
    case "failed":
    case "cancelled":
    case "queued":
    case "in_progress":
      return status;
    default:
      return undefined;
  }
}
