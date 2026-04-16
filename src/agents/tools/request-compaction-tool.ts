/**
 * request_compaction() tool — agent-initiated volitional compaction.
 *
 * Allows the agent to prepare working state and then request compaction on its
 * own schedule rather than waiting for context overflow. Enqueues compaction
 * and returns immediately — compaction runs between turns.
 *
 * Tool-only: no response-token fallback.
 *
 * Guards:
 *   - Context floor: rejected below 70% context usage
 *   - Rate limit: max 1 per 5 minutes
 */

import { Type } from "@sinclair/typebox";
import type { ResolvedContinuationConfig } from "../../auto-reply/continuation-config.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

const CONTEXT_FLOOR_RATIO = 0.7;
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

// Per-session last-request timestamps for rate limiting
const lastRequestBySession = new Map<string, number>();

export type RequestCompactionToolContext = {
  sessionKey: string;
  config: ResolvedContinuationConfig;
  /** Current context usage ratio (0–1). */
  contextRatio: number;
  /** Callback to enqueue compaction for post-turn execution. */
  onRequestCompaction: () => void;
};

const RequestCompactionSchema = Type.Object({
  reason: Type.Optional(
    Type.String({
      description: "Brief reason for requesting compaction (for observability).",
    }),
  ),
});

export function createRequestCompactionTool(ctx: RequestCompactionToolContext): AnyAgentTool {
  return {
    name: "request_compaction",
    label: "Request Compaction",
    description:
      "Request compaction of the current session after you have prepared working state " +
      "(written memory files, staged post-compaction delegates). Compaction runs between " +
      "turns, not immediately. Only available when context usage is above 70%.",
    parameters: RequestCompactionSchema,
    displaySummary: "Request session compaction",
    async execute(_toolCallId, params) {
      const rawParams = (params ?? {}) as Record<string, unknown>;
      const reason = readStringParam(rawParams, "reason") ?? "agent-initiated compaction";

      // Guard: context floor
      if (ctx.contextRatio < CONTEXT_FLOOR_RATIO) {
        return jsonResult({
          status: "rejected",
          reason: "context_floor",
          contextRatio: Math.round(ctx.contextRatio * 100),
          requiredRatio: Math.round(CONTEXT_FLOOR_RATIO * 100),
        });
      }

      // Guard: rate limit
      const now = Date.now();
      const lastRequest = lastRequestBySession.get(ctx.sessionKey);
      if (lastRequest && now - lastRequest < RATE_LIMIT_MS) {
        const remainingMs = RATE_LIMIT_MS - (now - lastRequest);
        return jsonResult({
          status: "rejected",
          reason: "rate_limited",
          retryAfterMs: remainingMs,
        });
      }

      lastRequestBySession.set(ctx.sessionKey, now);
      ctx.onRequestCompaction();

      return jsonResult({
        status: "enqueued",
        reason,
        contextRatio: Math.round(ctx.contextRatio * 100),
      });
    },
  };
}

/** Clear rate-limit state — used for testing. */
export function clearCompactionRateLimits(): void {
  lastRequestBySession.clear();
}
