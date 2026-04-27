import { Type } from "typebox";
import {
  type ContinuationSpanAttrs,
  getContinuationTracer,
} from "../../infra/continuation-tracer.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam, ToolInputError } from "./common.js";

const log = createSubsystemLogger("continuation/continue-work");

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
        "Seconds to wait before the next turn fires. 0 or omitted = immediate. " +
        "Clamped to continuation.minDelayMs / maxDelayMs from config.",
    }),
  ),
});

export type ContinueWorkRequest = {
  reason: string;
  delaySeconds: number;
};

export type ContinueWorkToolOpts = {
  agentSessionKey?: string;
  requestContinuation: (request: ContinueWorkRequest) => void;
  /**
   * Optional chain context for OTEL `continuation.work` span emission
   * (#334 Slice 2). When omitted the span still emits with `delay.ms` +
   * `reason.preview` populated; chain attributes are added only when
   * known. Producers that wire chain context (Slice 3+ and substrate
   * integrations) populate this so spans correlate across chain steps.
   *
   * Additive contract: callers that don't pass `chainContext` see no
   * behavior change beyond a noop-tracer span being opened+closed.
   */
  chainContext?: () =>
    | {
        readonly chainId?: string;
        readonly chainStepRemaining?: number;
      }
    | undefined;
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
      const delaySeconds = parsedDelaySeconds ?? 0;

      log.debug(
        `[continue_work:request] session=${sessionKey} delaySeconds=${delaySeconds} reason=${reason.slice(0, 80)}`,
      );

      // #334 Slice 2 chunk 2 — emit `continuation.work` span around the
      // requestContinuation call. The default tracer is no-op so callers
      // that don't install one (Slice 3 hasn't landed yet) see no
      // behavior change.
      const tracer = getContinuationTracer();
      const chain = opts.chainContext?.();
      const attrs: ContinuationSpanAttrs = {
        "delay.ms": Math.round(delaySeconds * 1000),
        "reason.preview": reason.slice(0, 80),
        ...(chain?.chainId !== undefined ? { "chain.id": chain.chainId } : {}),
        ...(chain?.chainStepRemaining !== undefined
          ? { "chain.step.remaining": chain.chainStepRemaining }
          : {}),
      };
      const span = tracer.startSpan("continuation.work", { attributes: attrs });
      try {
        opts.requestContinuation({
          reason,
          delaySeconds,
        });
        span.setStatus("OK");
      } catch (err) {
        span.recordException(err);
        span.setStatus("ERROR", err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        span.end();
      }

      return jsonResult({
        status: "scheduled",
        delaySeconds,
      });
    },
  };
}
