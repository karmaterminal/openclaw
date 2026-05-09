import { Type } from "typebox";
import { createExpiringMapCache } from "../../config/cache-utils.js";
import { generateSecureToken } from "../../infra/secure-random.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { sanitizeForLog } from "../../terminal/ansi.js";
import { classifyCompactionReason } from "../pi-embedded-runner/compact-reasons.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, ToolInputError } from "./common.js";

const log = createSubsystemLogger("continuation/request-compaction");

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Minimum context usage (0-1) before the tool will accept a compaction request. */
const MIN_CONTEXT_THRESHOLD = 0.7;

/** Minimum milliseconds between compaction requests per session. */
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

/** Volitional compaction counts are status-only diagnostics, not durable state. */
const VOLITIONAL_COMPACTION_COUNT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const REQUEST_COMPACTION_REASON_MAX_LENGTH = 8192;

export type RequestCompactionInvocation = {
  sessionKey: string;
  sessionId: string;
  runId?: string;
  diagId: string;
  trigger: "volitional";
  reason: string;
  contextUsage: number;
  requestedAtMs: number;
};

/**
 * Per-session state for guards.
 *
 * Module-level map — same volatility contract as continuation-delegate-store.
 * Does not survive gateway restarts. This is intentional: the guards are
 * rate-limiters, not durable state. A restart resets the cooldown, which is
 * fine — the session itself is fresh.
 */
const sessionGuardState = createExpiringMapCache<
  string,
  {
    lastRequestMs: number;
  }
>({
  ttlMs: RATE_LIMIT_MS,
});

/**
 * Tracks sessions that have a compaction request in-flight.
 * Used to dedup — if the agent calls request_compaction twice before the
 * first one completes, the second call returns "already pending".
 */
const pendingCompactionSessions = new Set<string>();

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const RequestCompactionToolSchema = Type.Object({
  reason: Type.String({
    description:
      "Why the agent is requesting compaction now. Logged for diagnostics and not used as compaction prompt input. " +
      `Up to ${REQUEST_COMPACTION_REASON_MAX_LENGTH} characters; put larger handoff context in memory files or staged delegates. ` +
      "Example: 'context pressure at 92%, working state evacuated to memory files and 2 post-compaction delegates staged.'",
    maxLength: REQUEST_COMPACTION_REASON_MAX_LENGTH,
  }),
});

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export type RequestCompactionToolOpts = {
  /** Current session key (e.g. "telegram:12345"). */
  agentSessionKey?: string;
  /** Session id (the Pi session UUID). */
  sessionId?: string;
  /** Stable run identifier for this agent invocation. */
  runId?: string;
  /**
   * Returns the current context usage as a fraction (0-1), or null when unknown
   * (e.g. inventory-only path used by /status surface reflection).
   * Injected so the tool does not reach into session internals.
   */
  getContextUsage: () => number | null;
  /**
   * Async function that triggers compaction. Injected so the tool does not
   * import the heavy compaction module directly. The caller provides a
   * closure over `compactEmbeddedPiSession` with all required session params.
   */
  triggerCompaction: (
    request: RequestCompactionInvocation,
  ) => Promise<{ ok: boolean; compacted: boolean; reason?: string }>;
  enqueueSystemEvent?: typeof enqueueSystemEvent;
};

function createCompactionDiagId(now = Date.now()): string {
  return `ovf-${now.toString(36)}-${generateSecureToken(4)}`;
}

function formatErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatReasonForLog(reason: string): string {
  return sanitizeForLog(reason.replace(/\s+/g, " ")).trim();
}

function isCompactionSkipCode(code: string): boolean {
  return (
    code === "no_compactable_entries" ||
    code === "below_threshold" ||
    code === "already_compacted_recently"
  );
}

function notifyCompactionFailure(params: {
  enqueue: typeof enqueueSystemEvent;
  sessionKey: string;
  runId?: string;
  sessionId?: string;
  diagId: string;
  code: string;
  reason: string;
}): void {
  try {
    params.enqueue(
      `[system:compaction-failed] Volitional compaction request ${params.diagId} failed (code=${params.code}, reason=${params.reason}). Your evacuated state was NOT compacted. Staged post-compaction delegates remain pending. Either re-call request_compaction (rate limit allowing) or yield with the evacuation as-is.`,
      { sessionKey: params.sessionKey },
    );
  } catch (err) {
    log.error(
      `[request_compaction:failure-event-error] session=${params.sessionKey} runId=${params.runId ?? params.sessionId} ` +
        `diagId=${params.diagId} code=${params.code} error=${formatErrorMessage(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

/**
 * Creates the `request_compaction` tool.
 *
 * This tool allows the agent to **request** compaction after it has prepared —
 * evacuated working state to memory files, staged post-compaction delegates,
 * or otherwise accepted the context loss.
 *
 * The tool is ASYNC: it enqueues compaction and returns immediately. The
 * compaction runs between turns via the lane queue, not during the tool call.
 *
 * Guards (all checked before compaction is enqueued):
 *   - **Dedup:** a compaction request is not already pending for this session.
 *   - **Context threshold:** context usage must be >= 70%.
 *   - **Rate limit:** at most one compaction per 5 minutes per session.
 */
export function createRequestCompactionTool(opts: RequestCompactionToolOpts): AnyAgentTool {
  return {
    label: "Compaction",
    name: "request_compaction",
    description:
      "Request compaction of the current session to reclaim context window space. " +
      "Call this AFTER you have evacuated working state (memory files, post-compaction delegates, RESUMPTION.md). " +
      "The reason is diagnostic metadata only, capped at 8192 characters; put larger handoff context in files or delegates. " +
      "Guards: context must be >= 70% full, and rate-limited to once per 5 minutes per session. " +
      "Compaction is async — it runs after your turn completes. " +
      "Prefer this over waiting for automatic compaction when you have context-pressure awareness and want " +
      "to control the timing of state evacuation.",
    parameters: RequestCompactionToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const sessionKey = opts.agentSessionKey;

      if (!sessionKey) {
        throw new ToolInputError(
          "request_compaction requires an active session. Not available in sessionless contexts.",
        );
      }

      if (!opts.sessionId) {
        throw new ToolInputError(
          "request_compaction requires a sessionId. Session may not be fully initialized.",
        );
      }

      const reason = readStringParam(params, "reason", { required: true }).slice(
        0,
        REQUEST_COMPACTION_REASON_MAX_LENGTH,
      );
      const logReason = formatReasonForLog(reason);

      // ----- Guard 0: Dedup — compaction already pending -----
      if (pendingCompactionSessions.has(sessionKey)) {
        log.debug(`[request_compaction:already-pending] session=${sessionKey}`);
        return jsonResult({
          status: "already_pending",
          reason: "A compaction request is already in-flight for this session.",
        });
      }

      // ----- Guard 1: Context threshold -----
      const contextUsage = opts.getContextUsage();
      if (contextUsage === null) {
        log.debug(`[request_compaction:context-unknown] session=${sessionKey}`);
        return jsonResult({
          status: "rejected",
          guard: "context_threshold",
          reason: `Context usage is unknown for this session; request_compaction is unavailable on inventory-only paths.`,
        });
      }
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

      // ----- Guard 2: Rate limit -----
      const now = Date.now();
      const diagId = createCompactionDiagId(now);
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

      // ----- All guards passed — enqueue compaction -----
      log.info(
        `[request_compaction:enqueuing] session=${sessionKey} runId=${opts.runId ?? opts.sessionId} ` +
          `diagId=${diagId} trigger=volitional usage=${(contextUsage * 100).toFixed(1)}% reason=${logReason}`,
      );

      // Fire-and-forget: compaction runs via the lane queue after the current
      // agent turn releases the session lane. We do NOT await — the tool
      // returns immediately so the agent can finish its response.
      pendingCompactionSessions.add(sessionKey);
      const request: RequestCompactionInvocation = {
        sessionKey,
        sessionId: opts.sessionId,
        ...(opts.runId ? { runId: opts.runId } : {}),
        diagId,
        trigger: "volitional",
        reason,
        contextUsage,
        requestedAtMs: now,
      };
      const notifyFailure = (code: string, failureReason: string) =>
        notifyCompactionFailure({
          enqueue: opts.enqueueSystemEvent ?? enqueueSystemEvent,
          sessionKey,
          runId: opts.runId,
          sessionId: opts.sessionId,
          diagId,
          code,
          reason: failureReason,
        });
      void opts
        .triggerCompaction(request)
        .then(
          (result) => {
            if (result.ok && result.compacted) {
              sessionGuardState.set(sessionKey, {
                lastRequestMs: Date.now(),
              });
              log.info(
                `[request_compaction:resolved-success] session=${sessionKey} runId=${opts.runId ?? opts.sessionId} ` +
                  `diagId=${diagId} trigger=volitional outcome=compacted`,
              );
              incrementVolitionalCompactionCount(sessionKey);
              return;
            }
            const code = classifyCompactionReason(result.reason);
            const failureReason = result.reason ?? "";
            if (result.ok && isCompactionSkipCode(code)) {
              log.info(
                `[request_compaction:resolved-skip] session=${sessionKey} runId=${opts.runId ?? opts.sessionId} ` +
                  `diagId=${diagId} trigger=volitional outcome=skipped code=${code} reason=${failureReason}`,
              );
              return;
            }
            log.warn(
              `[request_compaction:resolved-failure] session=${sessionKey} runId=${opts.runId ?? opts.sessionId} ` +
                `diagId=${diagId} trigger=volitional outcome=failed code=${code} ok=${result.ok} compacted=${result.compacted} reason=${failureReason}`,
            );
            notifyFailure(code, failureReason);
          },
          (err: unknown) => {
            const message = formatErrorMessage(err);
            const code = classifyCompactionReason(message);
            log.error(
              `[request_compaction:background-error] session=${sessionKey} runId=${opts.runId ?? opts.sessionId} ` +
                `diagId=${diagId} trigger=volitional outcome=failed code=${code} error=${message}`,
            );
            notifyFailure(code, message);
          },
        )
        .finally(() => {
          pendingCompactionSessions.delete(sessionKey);
        });

      return jsonResult({
        status: "compaction_requested",
        compactionRequestId: diagId,
        trigger: "volitional",
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
// Volitional compaction counter (module-level, survives compaction)
// ---------------------------------------------------------------------------

const volitionalCompactionCounts = createExpiringMapCache<string, number>({
  ttlMs: VOLITIONAL_COMPACTION_COUNT_TTL_MS,
});

/** Increment the volitional compaction counter for a session. */
export function incrementVolitionalCompactionCount(sessionKey: string): void {
  volitionalCompactionCounts.set(sessionKey, (volitionalCompactionCounts.get(sessionKey) ?? 0) + 1);
}

/** Get the volitional compaction count for a session. */
export function getVolitionalCompactionCount(sessionKey: string): number {
  return volitionalCompactionCounts.get(sessionKey) ?? 0;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Reset per-session guard state. Exported for tests only. */
export function _resetGuardState(sessionKey?: string): void {
  if (sessionKey) {
    sessionGuardState.delete(sessionKey);
    pendingCompactionSessions.delete(sessionKey);
  } else {
    sessionGuardState.clear();
    pendingCompactionSessions.clear();
  }
}

/** Mark a session as having a pending compaction. Exported for tests only. */
export function _setPending(sessionKey: string): void {
  pendingCompactionSessions.add(sessionKey);
}

/** Reset volitional compaction counters. Exported for tests only. */
export function _resetVolitionalCounts(sessionKey?: string): void {
  if (sessionKey) {
    volitionalCompactionCounts.delete(sessionKey);
  } else {
    volitionalCompactionCounts.clear();
  }
}

/** Expose constants for test assertions. */
export const _guards = {
  MIN_CONTEXT_THRESHOLD,
  RATE_LIMIT_MS,
  VOLITIONAL_COMPACTION_COUNT_TTL_MS,
} as const;
