/**
 * `request_compaction` tool — agent-initiated volitional compaction.
 *
 * Allows the agent to prepare working state (write memory files, stage
 * post-compaction delegates), then request compaction on its own schedule
 * rather than waiting for overflow.
 *
 * Tool-only — no response-token fallback. Async: the tool returns immediately,
 * compaction runs between turns.
 *
 * Guards:
 * - Context floor (70%): prevents wasteful compaction
 * - Rate limit (1 per 5 min): prevents compaction loops
 * - Dedup: rejects if compaction already in-flight
 *
 * NO generation guard — removed 2026-04-15. Compaction should not be
 * blocked by unrelated channel activity.
 *
 * RFC: docs/design/continue-work-signal-v2.md §2.4, §4.3
 */

import { Type } from "@sinclair/typebox";
import { createExpiringMapCache } from "../../config/cache-utils.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, ToolInputError } from "./common.js";

const log = createSubsystemLogger("continuation/request-compaction");

/**
 * Mirrors `isCompactionSkipReason` from auto-reply/reply/commands-compact.ts.
 * Kept local to avoid cross-package coupling (agents/tools → auto-reply/reply);
 * the predicate is small and stable.
 */
function isLegitSkipReason(reason?: string): boolean {
  const text = (reason ?? "").toLowerCase().trim();
  return (
    text.includes("nothing to compact") ||
    text.includes("below threshold") ||
    text.includes("already compacted") ||
    text.includes("no real conversation messages")
  );
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Minimum context usage (0-1) before the tool will accept a compaction request. */
const MIN_CONTEXT_THRESHOLD = 0.7;

/** Minimum milliseconds between compaction requests per session. */
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

/** Volitional compaction counts are status-only diagnostics, not durable state. */
const VOLITIONAL_COMPACTION_COUNT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// DELIBERATELY VOLATILE: rate-limit cooldown. A restart resets the 5-min
// cooldown, which is harmless — the session itself is fresh after restart.
const sessionGuardState = createExpiringMapCache<string, { lastRequestMs: number }>({
  ttlMs: RATE_LIMIT_MS,
});

// DELIBERATELY VOLATILE: tracks in-flight async compaction operations.
// Process-scoped by nature — the async operation doesn't survive restart.
const pendingCompactionSessions = new Set<string>();

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const RequestCompactionToolSchema = Type.Object({
  reason: Type.String({
    description:
      "Why the agent is requesting compaction now. Logged for diagnostics. " +
      "Example: 'context pressure at 92%, working state evacuated to memory files and 2 post-compaction delegates staged.'",
    maxLength: 1024,
  }),
});

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export type RequestCompactionToolOpts = {
  agentSessionKey?: string;
  sessionId?: string;
  getContextUsage: () => number;
  triggerCompaction: () => Promise<{ ok: boolean; compacted: boolean; reason?: string }>;
};

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createRequestCompactionTool(opts: RequestCompactionToolOpts): AnyAgentTool {
  return {
    label: "Continuation",
    name: "request_compaction",
    description:
      "Request context compaction for this session. Use after you have written memory files " +
      "and/or staged post-compaction delegates, when you want to proactively compact rather than " +
      "waiting for overflow. Compaction runs after your current turn completes. " +
      "Requires at least 70% context usage. Rate-limited to once per 5 minutes.",
    parameters: RequestCompactionToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const sessionKey = opts.agentSessionKey;

      if (!sessionKey) {
        throw new ToolInputError("request_compaction requires an active session.");
      }

      if (!opts.sessionId) {
        throw new ToolInputError(
          "request_compaction requires a sessionId. Session may not be fully initialized.",
        );
      }

      const reason = readStringParam(params, "reason", { required: true }).slice(0, 1024);

      // Guard: Dedup
      if (pendingCompactionSessions.has(sessionKey)) {
        log.debug(`[request_compaction:already-pending] session=${sessionKey}`);
        return jsonResult({
          status: "already_pending",
          reason: "A compaction request is already in-flight for this session.",
        });
      }

      // Guard: Context threshold
      const contextUsage = opts.getContextUsage();
      if (contextUsage < MIN_CONTEXT_THRESHOLD) {
        log.debug(
          `[request_compaction:below-threshold] session=${sessionKey} usage=${(contextUsage * 100).toFixed(1)}%`,
        );
        return jsonResult({
          status: "rejected",
          guard: "context_threshold",
          contextUsage: Math.round(contextUsage * 100),
          threshold: Math.round(MIN_CONTEXT_THRESHOLD * 100),
          reason: `Context usage (${Math.round(contextUsage * 100)}%) is below the minimum threshold (${Math.round(MIN_CONTEXT_THRESHOLD * 100)}%). Compaction is not needed yet.`,
        });
      }

      // Guard: Rate limit
      const now = Date.now();
      const guard = sessionGuardState.get(sessionKey);
      if (guard && now - guard.lastRequestMs < RATE_LIMIT_MS) {
        const remainingMs = RATE_LIMIT_MS - (now - guard.lastRequestMs);
        const remainingSec = Math.ceil(remainingMs / 1000);
        log.debug(
          `[request_compaction:rate-limited] session=${sessionKey} remainingSec=${remainingSec}`,
        );
        return jsonResult({
          status: "rejected",
          guard: "rate_limit",
          retryAfterSeconds: remainingSec,
          reason: `Rate limited. Next compaction request allowed in ${remainingSec}s.`,
        });
      }

      // All guards passed — enqueue compaction.
      log.info(
        `[request_compaction:enqueuing] session=${sessionKey} usage=${(contextUsage * 100).toFixed(1)}% reason=${reason}`,
      );

      sessionGuardState.set(sessionKey, { lastRequestMs: now });

      // Fire-and-forget: compaction runs after the current turn releases the session lane.
      pendingCompactionSessions.add(sessionKey);
      void opts
        .triggerCompaction()
        .then(
          (result) => {
            if (result.ok && result.compacted) {
              incrementVolitionalCompactionCount(sessionKey);
            } else if (isLegitSkipReason(result.reason)) {
              // bug #639: legitimate no-ops (below threshold, nothing to
              // compact, etc.) are expected outcomes — log at info to keep
              // journals readable.
              log.info(
                `[request_compaction:resolved-skip] session=${sessionKey} reason=${result.reason ?? "unspecified"}`,
              );
            } else {
              // bug #639: surface resolve-with-failure (distinct from the catch-path
              // background-error) so volitional compactions that silently fail
              // (e.g. wrong provider, model unavailable) are visible in journals.
              log.warn(
                `[request_compaction:resolved-failure] session=${sessionKey} ok=${result.ok} compacted=${result.compacted} reason=${result.reason ?? "unspecified"}`,
              );
            }
          },
          (err: unknown) => {
            log.error(
              `[request_compaction:background-error] session=${sessionKey} error=${err instanceof Error ? err.message : String(err)}`,
            );
          },
        )
        .finally(() => {
          pendingCompactionSessions.delete(sessionKey);
        });

      return jsonResult({
        status: "compaction_requested",
        contextUsage: Math.round(contextUsage * 100),
        reason,
        note:
          "Compaction has been enqueued and will run after your turn completes. " +
          "Post-compaction context will be injected on the next turn. " +
          "Any staged post-compaction delegates will be dispatched.",
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Volitional compaction counter
// ---------------------------------------------------------------------------

const volitionalCompactionCounts = createExpiringMapCache<string, number>({
  ttlMs: VOLITIONAL_COMPACTION_COUNT_TTL_MS,
});

export function incrementVolitionalCompactionCount(sessionKey: string): void {
  volitionalCompactionCounts.set(sessionKey, (volitionalCompactionCounts.get(sessionKey) ?? 0) + 1);
}

export function getVolitionalCompactionCount(sessionKey: string): number {
  return volitionalCompactionCounts.get(sessionKey) ?? 0;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function _resetGuardState(sessionKey?: string): void {
  if (sessionKey) {
    sessionGuardState.delete(sessionKey);
    pendingCompactionSessions.delete(sessionKey);
  } else {
    sessionGuardState.clear();
    pendingCompactionSessions.clear();
  }
}

export function _setPending(sessionKey: string): void {
  pendingCompactionSessions.add(sessionKey);
}

export function _resetVolitionalCounts(sessionKey?: string): void {
  if (sessionKey) {
    volitionalCompactionCounts.delete(sessionKey);
  } else {
    volitionalCompactionCounts.clear();
  }
}

export const _guards = {
  MIN_CONTEXT_THRESHOLD,
  RATE_LIMIT_MS,
  VOLITIONAL_COMPACTION_COUNT_TTL_MS,
} as const;
