import { Type } from "typebox";
import {
  clampDelayMs,
  resolveContinuationRuntimeConfig,
} from "../../auto-reply/continuation/config.js";
import type { ContinueWorkRequest } from "../../auto-reply/continuation/types.js";
import { formatActiveContinuationTraceparent } from "../../infra/continuation-tracer.js";
import {
  DIAGNOSTIC_TRACEPARENT_PATTERN,
  normalizeDiagnosticTraceparent,
} from "../../infra/diagnostic-trace-context.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam, ToolInputError } from "./common.js";

const log = createSubsystemLogger("continuation/continue-work");

export type { ContinueWorkRequest } from "../../auto-reply/continuation/types.js";

const ContinueWorkToolSchema = Type.Object({
  reason: Type.String({
    description:
      "Why another turn is needed before you yield. Logged for diagnostics and continuation context.",
    maxLength: 1024,
  }),
  delaySeconds: Type.Optional(
    Type.Number({
      minimum: 0,
      description:
        "Seconds to wait before the next turn fires. Omit to use the configured default delay. " +
        "Set 0 to request the earliest allowed wake. The runtime clamps to continuation.minDelayMs / maxDelayMs.",
    }),
  ),
  traceparent: Type.Optional(
    Type.String({
      description:
        "Optional W3C traceparent override. When omitted, the tool derives the parent " +
        "context from the openclaw runtime's active trace scope (set at gateway entry points). " +
        "Supply this only when injecting cross-process trace context.",
      pattern: DIAGNOSTIC_TRACEPARENT_PATTERN,
    }),
  ),
});

export type ContinueWorkToolOpts = {
  agentSessionKey?: string;
  requestContinuation: (request: ContinueWorkRequest) => void;
};

export function createContinueWorkTool(opts: ContinueWorkToolOpts): AnyAgentTool {
  return {
    label: "Continuation",
    name: "continue_work",
    description:
      "Request another turn for this session. Use when you have more work to do but want to yield the current turn first. " +
      "Equivalent to CONTINUE_WORK bracket syntax but as a structured tool call.",
    parameters: ContinueWorkToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const sessionKey = opts.agentSessionKey;

      if (!sessionKey) {
        throw new ToolInputError(
          "continue_work requires an active session. Not available in sessionless contexts.",
        );
      }

      const reason = readStringParam(params, "reason", { required: true }).slice(0, 1024);
      const parsedDelaySeconds = readNumberParam(params, "delaySeconds", { strict: true });
      if (parsedDelaySeconds !== undefined && parsedDelaySeconds < 0) {
        throw new ToolInputError("delaySeconds must be a non-negative number.");
      }
      const requestedDelaySeconds = parsedDelaySeconds;
      const effectiveDelayMs = clampDelayMs(
        requestedDelaySeconds !== undefined ? requestedDelaySeconds * 1000 : undefined,
        resolveContinuationRuntimeConfig(),
      );
      const effectiveDelaySeconds = effectiveDelayMs / 1000;
      const traceparentRaw = readStringParam(params, "traceparent");
      const explicitTraceparent =
        traceparentRaw !== undefined ? normalizeDiagnosticTraceparent(traceparentRaw) : undefined;
      if (traceparentRaw !== undefined && !explicitTraceparent) {
        throw new ToolInputError("traceparent must be a valid W3C traceparent header.");
      }
      const traceparent = explicitTraceparent ?? formatActiveContinuationTraceparent();
      const traceContextFields = traceparent ? { traceparent } : {};

      log.debug(
        `[continue_work:request] session=${sessionKey} requestedDelaySeconds=${requestedDelaySeconds ?? "default"} effectiveDelaySeconds=${effectiveDelaySeconds} reason=${reason.slice(0, 80)}`,
      );
      opts.requestContinuation({
        reason,
        ...(requestedDelaySeconds !== undefined ? { delaySeconds: requestedDelaySeconds } : {}),
        ...traceContextFields,
      });

      return jsonResult({
        status: "scheduled",
        delaySeconds: effectiveDelaySeconds,
        ...(requestedDelaySeconds !== undefined ? { requestedDelaySeconds } : {}),
        ...traceContextFields,
      });
    },
  };
}
