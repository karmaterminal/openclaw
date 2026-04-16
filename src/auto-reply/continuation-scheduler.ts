/**
 * Continuation turn scheduler.
 *
 * Provides delayed scheduling for both `continue_work()` (same-session
 * continuation) and `continue_delegate()` (sub-agent dispatch). Both tool-path
 * and token-fallback-path calls converge here.
 *
 * Scheduling uses `setTimeout` — timers are process-scoped and do not survive
 * gateway restart. When `taskFlowDelegates` is enabled, delegate queue state
 * is backed by Task Flow (handled in the delegate store, not here).
 *
 * NO generation guard is applied to inbound noise. Delayed work should not be
 * cancelled by unrelated channel activity (design decision 2026-04-15).
 */

import { logVerbose } from "../globals.js";
import { requestHeartbeatNow } from "../infra/heartbeat-wake.js";
import { enqueueSystemEvent } from "../infra/system-events.js";
import { clampDelay, type ResolvedContinuationConfig } from "./continuation-config.js";

export type ContinuationTimer = {
  /** Timer handle for cancellation. */
  handle: NodeJS.Timeout;
  /** Absolute time (Date.now()) when the timer is expected to fire. */
  dueAt: number;
  /** Session key this timer belongs to. */
  sessionKey: string;
  /** Kind of continuation: "work" for same-session, "delegate" for sub-agent. */
  kind: "work" | "delegate";
};

// Active timers keyed by sessionKey. At most one per session for work; delegates
// manage their own lifecycle through the delegate store.
const activeTimers = new Map<string, ContinuationTimer>();

/**
 * Schedule a continuation turn for the given session after a delay.
 *
 * When the timer fires, a `[continuation:wake]` system event is enqueued
 * and a heartbeat is requested to trigger the next generation cycle.
 */
export function scheduleContinuationTurn(params: {
  sessionKey: string;
  delayMs: number;
  config: ResolvedContinuationConfig;
  chainDepth: number;
  reason?: string;
}): ContinuationTimer | undefined {
  const { sessionKey, config, chainDepth, reason } = params;

  if (!config.enabled) {
    logVerbose(`[continuation] Continuation disabled — skipping schedule for ${sessionKey}`);
    return undefined;
  }

  if (chainDepth >= config.maxChainLength) {
    logVerbose(
      `[continuation] Chain depth ${chainDepth}/${config.maxChainLength} reached — ` +
        `rejecting schedule for ${sessionKey}`,
    );
    return undefined;
  }

  const delayMs = clampDelay(params.delayMs, config);

  // Cancel any existing work timer for this session
  cancelContinuationTimer(sessionKey);

  const dueAt = Date.now() + delayMs;
  const handle = setTimeout(() => {
    activeTimers.delete(sessionKey);

    const label = reason ?? "self-elected continuation";
    logVerbose(
      `[continuation:wake] Timer fired for ${sessionKey} — ` +
        `chain ${chainDepth + 1}/${config.maxChainLength}, reason: ${label}`,
    );

    enqueueSystemEvent(`[continuation:wake] ${label}`, {
      sessionKey,
      contextKey: "continuation:wake",
      trusted: true,
    });

    requestHeartbeatNow({
      reason: "continuation:wake",
      sessionKey,
    });
  }, delayMs);

  // Prevent the timer from keeping the process alive
  if (handle.unref) {
    handle.unref();
  }

  const timer: ContinuationTimer = {
    handle,
    dueAt,
    sessionKey,
    kind: "work",
  };
  activeTimers.set(sessionKey, timer);

  logVerbose(
    `[continuation] Scheduled work turn for ${sessionKey} in ${delayMs}ms ` +
      `(chain ${chainDepth + 1}/${config.maxChainLength})`,
  );

  return timer;
}

/**
 * Cancel a pending continuation timer for the given session.
 * Returns true if a timer was cancelled.
 */
export function cancelContinuationTimer(sessionKey: string): boolean {
  const existing = activeTimers.get(sessionKey);
  if (!existing) {
    return false;
  }
  clearTimeout(existing.handle);
  activeTimers.delete(sessionKey);
  logVerbose(`[continuation] Cancelled timer for ${sessionKey}`);
  return true;
}

/**
 * Get the active timer for a session, if any.
 */
export function getActiveContinuationTimer(sessionKey: string): ContinuationTimer | undefined {
  return activeTimers.get(sessionKey);
}

/**
 * Return the count of active continuation timers across all sessions.
 * Useful for diagnostics and /status telemetry.
 */
export function getActiveContinuationTimerCount(): number {
  return activeTimers.size;
}

/** Clear all timers — used for testing and shutdown. */
export function clearAllContinuationTimers(): void {
  for (const timer of activeTimers.values()) {
    clearTimeout(timer.handle);
  }
  activeTimers.clear();
}
