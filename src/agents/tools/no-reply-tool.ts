import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

const NoReplyToolSchema = Type.Object({
  reason: Type.Optional(
    Type.String({
      description:
        "Optional brief reason for choosing silence. Logged for diagnostics; not surfaced to the channel.",
      maxLength: 512,
    }),
  ),
});

/**
 * `no_reply()` is a first-class silence primitive.
 *
 * Distinct from `sessions_yield`: yield says "I'm waiting on an external event."
 * `no_reply` says "I have nothing to say to this message — silence IS the reply."
 *
 * The tool result is the source of truth. The runtime suppresses any streamed
 * assistant text for this turn and treats the call as a clean no-output turn.
 *
 * Spec: https://github.com/karmaterminal/openclaw/issues/280
 */
export function createNoReplyTool(opts?: {
  sessionId?: string;
  onNoReply?: (reason: string | undefined) => Promise<void> | void;
}): AnyAgentTool {
  return {
    label: "Silence",
    name: "no_reply",
    description:
      "Reply with silence to the current message. Use when there is nothing worth saying and a non-empty " +
      "response would be noise (group-chat banter, broker echoes, peer chain-of-thought leaks, " +
      "heartbeats with nothing to flag). The tool result is the source of truth — no channel output is sent.",
    parameters: NoReplyToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const reason = readStringParam(params, "reason");
      if (!opts?.sessionId) {
        return jsonResult({ status: "error", error: "No session context" });
      }
      if (opts?.onNoReply) {
        await opts.onNoReply(reason || undefined);
      }
      return jsonResult({ status: "no_reply", reason: reason || undefined });
    },
  };
}
