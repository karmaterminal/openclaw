import type { AssistantMessage, ToolResultMessage } from "@openclaw/llm-core";
import { isRecord } from "@openclaw/normalization-core/record-coerce";
import type { AgentEventSink } from "./agent-stream-response.js";
import { createFailureMessage } from "./turn-interruption.js";
import type { AgentLoopConfig, AgentMessage, AgentToolCall } from "./types.js";

const REPEATED_TOOL_ERROR_LIMIT = 2;

type RepeatedToolErrorState = {
  lastKey?: string;
  repeatCount: number;
};

type RepeatedToolErrorArgumentSummary = {
  normalizedHash: string;
  normalizedLength: number;
};

type RepeatedToolErrorDiagnostic = {
  toolName: string;
  argumentSummary: RepeatedToolErrorArgumentSummary;
  error: string;
  repeatCount: number;
};

function normalizeToolErrorValue(value: unknown): unknown {
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeToolErrorValue(entry)]),
    );
  }
  if (Array.isArray(value)) {
    return value.map(normalizeToolErrorValue);
  }
  return value;
}

function stringifyNormalizedToolErrorValue(value: unknown): string {
  return JSON.stringify(normalizeToolErrorValue(value)) ?? "null";
}

function toSnakeCaseToolArgKey(key: string): string {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function readToolArg(record: Record<string, unknown>, key: string): unknown {
  if (Object.hasOwn(record, key)) {
    return record[key];
  }
  const snakeKey = toSnakeCaseToolArgKey(key);
  return snakeKey !== key && Object.hasOwn(record, snakeKey) ? record[snakeKey] : undefined;
}

function normalizeOptionalToolString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeOptionalToolNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeOptionalToolStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return value === undefined ? undefined : [`<${typeof value}>`];
  }
  const normalized = value.flatMap((entry) => {
    const text = normalizeOptionalToolString(entry);
    return text ? [text] : [];
  });
  return normalized.length > 0 ? [...new Set(normalized)].toSorted() : undefined;
}

function normalizeContinueDelegateToolErrorArguments(args: unknown): unknown {
  if (!isRecord(args)) {
    return normalizeToolErrorValue(args);
  }

  const record = args;
  const task = normalizeOptionalToolString(readToolArg(record, "task"));
  const delaySeconds = normalizeOptionalToolNumber(readToolArg(record, "delaySeconds"));
  const mode = normalizeOptionalToolString(readToolArg(record, "mode"))?.toLowerCase();
  const targetSessionKey = normalizeOptionalToolString(readToolArg(record, "targetSessionKey"));
  const targetSessionKeys = normalizeOptionalToolStringArray(
    readToolArg(record, "targetSessionKeys"),
  );
  const fanoutMode = normalizeOptionalToolString(readToolArg(record, "fanoutMode"))?.toLowerCase();
  const model = normalizeOptionalToolString(readToolArg(record, "model"));

  return normalizeToolErrorValue({
    ...(task ? { task } : {}),
    ...(delaySeconds !== undefined ? { delaySeconds } : {}),
    ...(mode && mode !== "normal" ? { mode } : {}),
    ...(targetSessionKey ? { targetSessionKey } : {}),
    ...(targetSessionKeys ? { targetSessionKeys } : {}),
    ...(fanoutMode ? { fanoutMode } : {}),
    ...(model && model.toLowerCase() !== "default" ? { model } : {}),
  });
}

function normalizeToolErrorArguments(toolName: string, args: unknown): unknown {
  if (toolName === "continue_delegate") {
    return normalizeContinueDelegateToolErrorArguments(args);
  }
  return normalizeToolErrorValue(args);
}

function sanitizeToolErrorText(error: string): string {
  return error
    .replace(/\bhttps?:\/\/[^\s"'`<>]+/gi, "[url]")
    .replace(/\bagent:[^\s,;)\]}]+/gi, "agent:[redacted]")
    .replace(
      /\bauthorization\s*[:=]\s*(?:(?:bearer|basic|bot|token)\s+)?[^\s,;]+/gi,
      "authorization=[redacted]",
    )
    .replace(
      /\b(api[_-]?key|token|secret|password|authorization|credential|session(?:_id)?|traceparent)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .replace(/(^|[\s(["'=])((?:~|\.{1,2}|[A-Za-z]:)?\/[^\s"'`)>,;]+)/g, "$1[path]")
    .replace(/"[^"\n]{1,200}"/g, '"[redacted]"')
    .replace(/'[^'\n]{1,200}'/g, "'[redacted]'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1024);
}

function normalizeToolErrorKey(error: string): string {
  return sanitizeToolErrorText(error)
    .toLowerCase()
    .replace(/\b[0-9a-f]{8,}\b/g, "[id]")
    .replace(/\b\d{4,}\b/g, "[number]");
}

function summarizeNormalizedToolErrorArguments(
  normalizedArgs: string,
): RepeatedToolErrorArgumentSummary {
  const redactedArgs = sanitizeToolErrorText(normalizedArgs);
  let hash = 0x811c9dc5;
  for (let index = 0; index < redactedArgs.length; index += 1) {
    hash ^= redactedArgs.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return {
    normalizedHash: hash.toString(16).padStart(8, "0"),
    normalizedLength: redactedArgs.length,
  };
}

function extractToolResultErrorText(result: ToolResultMessage): string {
  const details = result.details;
  if (isRecord(details)) {
    if (typeof details.error === "string" && details.error.trim()) {
      return details.error.trim();
    }
    if (typeof details.message === "string" && details.message.trim()) {
      return details.message.trim();
    }
  }
  return result.content
    .flatMap((entry) => (entry.type === "text" ? [entry.text.trim()] : []))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function observeRepeatedToolError(params: {
  state: RepeatedToolErrorState;
  assistantMessage: AssistantMessage;
  toolResults: ToolResultMessage[];
}): RepeatedToolErrorDiagnostic | undefined {
  if (params.toolResults.length === 0) {
    params.state.lastKey = undefined;
    params.state.repeatCount = 0;
    return undefined;
  }

  const failures = params.toolResults
    .filter((result) => result.isError)
    .flatMap((result) => {
      const toolCall = params.assistantMessage.content.find(
        (entry): entry is AgentToolCall =>
          entry.type === "toolCall" &&
          entry.id === result.toolCallId &&
          entry.name === result.toolName,
      );
      const extractedError = extractToolResultErrorText(result);
      const sanitizedError = sanitizeToolErrorText(extractedError) || "Tool call failed.";
      return toolCall
        ? [
            {
              toolName: result.toolName,
              normalizedArgs: stringifyNormalizedToolErrorValue(
                normalizeToolErrorArguments(result.toolName, toolCall.arguments),
              ),
              error: sanitizedError,
              errorKey: normalizeToolErrorKey(extractedError || sanitizedError),
            },
          ]
        : [];
    });
  if (failures.length === 0) {
    params.state.lastKey = undefined;
    params.state.repeatCount = 0;
    return undefined;
  }
  const canonicalFailures = failures
    .map((failure) => ({
      toolName: failure.toolName,
      normalizedArgs: failure.normalizedArgs,
      errorKey: failure.errorKey,
    }))
    .toSorted((left, right) =>
      stringifyNormalizedToolErrorValue(left).localeCompare(
        stringifyNormalizedToolErrorValue(right),
      ),
    );
  const key = stringifyNormalizedToolErrorValue(canonicalFailures);
  params.state.repeatCount = params.state.lastKey === key ? params.state.repeatCount + 1 : 1;
  params.state.lastKey = key;
  if (params.state.repeatCount < REPEATED_TOOL_ERROR_LIMIT) {
    return undefined;
  }
  const primary = failures[0];
  if (!primary) {
    throw new Error("Expected at least one repeated tool error failure.");
  }
  const argumentSummarySource =
    failures.length === 1
      ? primary.normalizedArgs
      : stringifyNormalizedToolErrorValue(
          failures.map((failure) => failure.normalizedArgs).toSorted(),
        );
  return {
    toolName: failures.length === 1 ? primary.toolName : `${failures.length} tools`,
    argumentSummary: summarizeNormalizedToolErrorArguments(argumentSummarySource),
    error:
      failures.length === 1 ? primary.error : failures.map((failure) => failure.error).join("; "),
    repeatCount: params.state.repeatCount,
  };
}

function createRepeatedToolErrorAssistantMessage(
  config: AgentLoopConfig,
  diagnostic: RepeatedToolErrorDiagnostic,
): AssistantMessage {
  const publicError = diagnostic.error.replace(/\s+Received arguments:.*$/iu, "").trim();
  const text =
    `Stopped after ${diagnostic.repeatCount} identical failed ${diagnostic.toolName} tool calls. ` +
    (publicError || "Tool call failed.");
  const errorMessage = "Repeated tool-call failure loop.";
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: config.model.api,
    provider: config.model.provider,
    model: config.model.id,
    usage: createFailureMessage(config.model, errorMessage, false).usage,
    stopReason: "error",
    errorMessage,
    errorCode: "repeated_tool_error",
    errorType: "tool_error_loop",
    diagnostics: [
      {
        type: "repeated_tool_error",
        timestamp: Date.now(),
        error: {
          name: "RepeatedToolError",
          message: errorMessage,
          code: "repeated_tool_error",
        },
        details: {
          toolName: diagnostic.toolName,
          argumentSummary: diagnostic.argumentSummary,
          error: diagnostic.error,
          repeatCount: diagnostic.repeatCount,
          disposition: "terminated",
        },
      },
    ],
    timestamp: Date.now(),
  };
}

/**
 * Per-run guard that ends the loop with a terminal assistant turn once the same
 * tool failure repeats. The caller returns immediately when `terminate` is true.
 */
export function createRepeatedToolErrorGuard() {
  const state: RepeatedToolErrorState = { repeatCount: 0 };
  return {
    async terminate(params: {
      config: AgentLoopConfig;
      message: AssistantMessage;
      toolResults: ToolResultMessage[];
      newMessages: AgentMessage[];
      emit: AgentEventSink;
    }): Promise<boolean> {
      const { config, emit, newMessages } = params;
      const repeatedToolError = observeRepeatedToolError({
        state,
        assistantMessage: params.message,
        toolResults: params.toolResults,
      });
      if (!repeatedToolError) {
        return false;
      }
      const terminalMessage = createRepeatedToolErrorAssistantMessage(config, repeatedToolError);
      newMessages.push(terminalMessage);
      await emit({ type: "turn_start" });
      await emit({ type: "message_start", message: terminalMessage });
      await emit({ type: "message_end", message: terminalMessage });
      await emit({ type: "turn_end", message: terminalMessage, toolResults: [] });
      await emit({ type: "agent_end", messages: newMessages });
      return true;
    },
  };
}
