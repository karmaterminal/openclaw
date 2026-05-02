import { Type, type Static } from "typebox";
import type { ContinueWorkRequest } from "../../auto-reply/continuation/types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { AnyAgentTool } from "./common.js";
import { asToolParamsRecord, jsonResult, parseToolParams, ToolInputError } from "./common.js";

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
        "Seconds to wait before the next turn fires. 0 or omitted = immediate. " +
        "Clamped to continuation.minDelayMs / maxDelayMs from config.",
    }),
  ),
});

type ContinueWorkToolParams = Static<typeof ContinueWorkToolSchema>;

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
      const sessionKey = opts.agentSessionKey;

      if (!sessionKey) {
        throw new ToolInputError(
          "continue_work requires an active session. Not available in sessionless contexts.",
        );
      }

      const rawParams = asToolParamsRecord(args);
      const params: ContinueWorkToolParams = parseToolParams(ContinueWorkToolSchema, {
        ...rawParams,
        ...(typeof rawParams.reason === "string"
          ? { reason: rawParams.reason.slice(0, 1024) }
          : {}),
      });
      const reason = params.reason.trim().slice(0, 1024);
      if (!reason) {
        throw new ToolInputError("reason required");
      }
      if (params.delaySeconds !== undefined && params.delaySeconds < 0) {
        throw new ToolInputError("delaySeconds must be a non-negative number.");
      }
      const delaySeconds = params.delaySeconds ?? 0;

      log.debug(
        `[continue_work:request] session=${sessionKey} delaySeconds=${delaySeconds} reason=${reason.slice(0, 80)}`,
      );
      opts.requestContinuation({
        reason,
        delaySeconds,
      });

      return jsonResult({
        status: "scheduled",
        delaySeconds,
      });
    },
  };
}
