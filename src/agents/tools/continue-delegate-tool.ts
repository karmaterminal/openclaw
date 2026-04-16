/**
 * continue_delegate() tool — delegated continuation.
 *
 * Dispatches a sub-agent with a typed task, mode, and delay. The delegate
 * is enqueued into the pending delegate store and consumed by agent-runner
 * after the main-session response completes.
 *
 * Subject to per-turn fan-out limit (maxDelegatesPerTurn), chain-length,
 * and token-budget guards.
 */

import { Type } from "@sinclair/typebox";
import {
  clampDelay,
  type ResolvedContinuationConfig,
} from "../../auto-reply/continuation-config.js";
import {
  enqueuePendingDelegate,
  getPendingDelegateCount,
  type DelegateReturnMode,
} from "../../auto-reply/continuation-delegate-store.js";
import { optionalStringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";

const DELEGATE_MODES = ["normal", "silent", "silent-wake", "post-compaction"] as const;

export type ContinueDelegateToolContext = {
  sessionKey: string;
  config: ResolvedContinuationConfig;
  chainDepth: number;
  chainTokens: number;
  /** Count of delegates already enqueued this turn (for fan-out enforcement). */
  turnDelegateCount: number;
};

const ContinueDelegateSchema = Type.Object({
  task: Type.String({
    description: "Task description for the delegate sub-agent.",
  }),
  delay_seconds: Type.Optional(
    Type.Number({
      description:
        "Seconds to wait before spawning the delegate. 0 = immediate. " +
        "Clamped to [minDelay, maxDelay].",
      minimum: 0,
    }),
  ),
  mode: optionalStringEnum(DELEGATE_MODES, {
    description:
      "Return mode: normal (default, echoed to channel + wakes parent), " +
      "silent (no echo, no wake), silent-wake (no echo, wakes parent), " +
      "post-compaction (released after compaction completes).",
  }),
});

export function createContinueDelegateTool(ctx: ContinueDelegateToolContext): AnyAgentTool {
  return {
    name: "continue_delegate",
    label: "Continue Delegate",
    description:
      "Dispatch a sub-agent with a scoped task. The delegate runs after the current " +
      "turn completes. Use this for background research, CI checks, enrichment, or " +
      "any work that should happen asynchronously.",
    parameters: ContinueDelegateSchema,
    displaySummary: "Dispatch continuation delegate",
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

      // Guard: per-turn fan-out
      const currentCount = ctx.turnDelegateCount + getPendingDelegateCount(ctx.sessionKey);
      if (currentCount >= ctx.config.maxDelegatesPerTurn) {
        return jsonResult({
          status: "rejected",
          reason: "max_delegates_per_turn_exceeded",
          currentCount,
          maxDelegatesPerTurn: ctx.config.maxDelegatesPerTurn,
        });
      }

      const task = readStringParam(rawParams, "task", { required: true });
      const delaySecondsRaw = readNumberParam(rawParams, "delay_seconds");
      const modeRaw = readStringParam(rawParams, "mode");
      const mode: DelegateReturnMode =
        modeRaw && DELEGATE_MODES.includes(modeRaw as DelegateReturnMode)
          ? (modeRaw as DelegateReturnMode)
          : "normal";

      const delayMs =
        typeof delaySecondsRaw === "number"
          ? delaySecondsRaw === 0
            ? 0
            : clampDelay(delaySecondsRaw * 1000, ctx.config)
          : ctx.config.defaultDelayMs;

      const count = enqueuePendingDelegate(ctx.sessionKey, {
        task,
        delayMs,
        mode,
        chainHop: ctx.chainDepth,
        enqueuedAt: Date.now(),
      });

      return jsonResult({
        status: "enqueued",
        task: task.slice(0, 120),
        delayMs,
        mode,
        pendingCount: count,
        chainDepth: ctx.chainDepth,
      });
    },
  };
}
