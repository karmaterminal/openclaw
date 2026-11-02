import { isRecord } from "@openclaw/normalization-core/record-coerce";
import {
  responsesRequestLifecycle,
  withResponsesRequestAcceptance,
} from "../transports/openai-responses-request-lifecycle.js";
import { createResponseModelTracker } from "../transports/openai-transport-shared.js";
import { parseRetryAfterSeconds } from "../transports/transport-utils.js";
import type { StreamOptions } from "../types.js";

export class CodexApiError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly payload?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      code?: string;
      status?: number;
      payload?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "CodexApiError";
    this.code = options?.code;
    this.status = options?.status;
    this.payload = options?.payload;
    this.cause = options?.cause;
  }
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
