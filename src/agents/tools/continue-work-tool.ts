/**
 * continue_work() tool — self-elected same-session continuation.
 *
 * Schedules another turn for the current session after an optional delay.
 * The call is fire-and-forget: it schedules the continuation and returns
 * immediately. The current turn completes normally.
 *
 * Subject to chain-length and token-budget guards.
 */

import { Type } from "@sinclair/typebox";
import {
  clampDelay,
  type ResolvedContinuationConfig,
} from "../../auto-reply/continuation-config.js";
import { scheduleContinuationTurn } from "../../auto-reply/continuation-scheduler.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";

export type ContinueWorkToolContext = {
  sessionKey: string;
  config: ResolvedContinuationConfig;
  chainDepth: number;
  chainTokens: number;
};

const ContinueWorkSchema = Type.Object({
  delay_seconds: Type.Optional(
    Type.Number({
      description:
        "Seconds to wait after the current turn completes before scheduling the next turn. " +
        "Defaults to the configured default delay. Clamped to [minDelay, maxDelay].",
      minimum: 0,
    }),
  ),
  reason: Type.Optional(
    Type.String({
      description: "Brief reason for continuing (for observability/logging).",
    }),
  ),
});

export function createContinueWorkTool(ctx: ContinueWorkToolContext): AnyAgentTool {
  return {
    name: "continue_work",
    label: "Continue Work",
    description:
      "Schedule another turn for this session after an optional delay. " +
      "Use this when you have more work to do and want to continue in the next turn. " +
      "The current turn completes normally; the follow-up happens after.",
    parameters: ContinueWorkSchema,
    displaySummary: "Schedule continuation turn",
    async execute(_toolCallId, params) {
      const rawParams = (params ?? {}) as Record<string, unknown>;

      // Guard: chain depth
      if (ctx.chainDepth >= ctx.config.maxChainLength) {
        return jsonResult({
          status: "rejected",
          reason: "chain_depth_exceeded",
          chainDepth: ctx.chainDepth,
          maxChainLength: ctx.config.maxChainLength,
        });
      }

      // Guard: token budget
      if (ctx.chainTokens >= ctx.config.costCapTokens) {
        return jsonResult({
          status: "rejected",
          reason: "cost_cap_exceeded",
          chainTokens: ctx.chainTokens,
          costCapTokens: ctx.config.costCapTokens,
        });
      }

      const delaySecondsRaw = readNumberParam(rawParams, "delay_seconds");
      const reason = readStringParam(rawParams, "reason") ?? "self-elected continuation";

      const delayMs =
        typeof delaySecondsRaw === "number"
          ? clampDelay(delaySecondsRaw * 1000, ctx.config)
          : ctx.config.defaultDelayMs;

      const timer = scheduleContinuationTurn({
        sessionKey: ctx.sessionKey,
        delayMs,
        config: ctx.config,
        chainDepth: ctx.chainDepth,
        reason,
      });

      if (!timer) {
        return jsonResult({
          status: "rejected",
          reason: "scheduling_failed",
        });
      }

      return jsonResult({
        status: "scheduled",
        delayMs,
        chainDepth: ctx.chainDepth + 1,
        maxChainLength: ctx.config.maxChainLength,
      });
    },
  };
}
