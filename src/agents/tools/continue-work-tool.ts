/**
 * `continue_work` tool — self-elected same-session continuation.
 *
 * The agent calls this to request another turn after the current one completes.
 * The tool writes the request to the continuation delegate store; the runner
 * reads it post-response to arm the timer.
 *
 * Uses the same "tool writes, runner reads" store pattern as continue_delegate,
 * avoiding deep callback threading through the execution stack.
 *
 * RFC: docs/design/continue-work-signal-v2.md §2.2
 */

import { Type } from "@sinclair/typebox";
import { setPendingWorkRequest } from "../../auto-reply/continuation/delegate-store.js";
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

export function createContinueWorkTool(opts: { agentSessionKey?: string }): AnyAgentTool {
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

      // Write to the store — runner reads post-response.
      setPendingWorkRequest(sessionKey, { reason, delaySeconds });

      // Log at info level for observability parity.
      log.info(`[continue_work:scheduled] session=${sessionKey} delaySeconds=${delaySeconds}`);

      return jsonResult({
        status: "scheduled",
        delaySeconds,
      });
    },
  };
}
