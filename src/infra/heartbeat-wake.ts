// Tracks heartbeat wake requests, busy skips, and retry timing.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import { resolveTimerTimeoutMs } from "../shared/number-coercion.js";
import { normalizeHeartbeatWakeReason } from "./heartbeat-reason.js";

export type HeartbeatRunResult =
  | { status: "ran"; durationMs: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export const HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT = "requests-in-flight";
export const HEARTBEAT_SKIP_CRON_IN_PROGRESS = "cron-in-progress";
export const HEARTBEAT_SKIP_LANES_BUSY = "lanes-busy";
export type RetryableHeartbeatBusySkipReason =
  | typeof HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT
  | typeof HEARTBEAT_SKIP_CRON_IN_PROGRESS
  | typeof HEARTBEAT_SKIP_LANES_BUSY;

const RETRYABLE_BUSY_SKIP_REASONS = new Set([
  HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT,
  HEARTBEAT_SKIP_CRON_IN_PROGRESS,
  HEARTBEAT_SKIP_LANES_BUSY,
]);

export function isRetryableHeartbeatBusySkipReason(reason: string): boolean {
  return RETRYABLE_BUSY_SKIP_REASONS.has(reason);
}

export type HeartbeatWakeIntent = "scheduled" | "event" | "immediate" | "manual";

export type HeartbeatWakeSource =
  | "interval"
  | "manual"
  | "exec-event"
  | "notifications-event"
  | "cron"
  | "hook"
  | "background-task"
  | "background-task-blocked"
  | "acp-spawn"
  | "cli-watchdog"
  | "restart-sentinel"
  | "retry"
  | "other";

export type HeartbeatWakeOverride = {
  target?: string;
  to?: string | undefined;
  accountId?: string | undefined;
};

export type HeartbeatWakeRequest = {
  source: HeartbeatWakeSource;
  intent: HeartbeatWakeIntent;
  reason?: string;
  agentId?: string;
  sessionKey?: string;
  parentRunId?: string;
  heartbeat?: HeartbeatWakeOverride;
};

export type HeartbeatWakeHandler = (opts: HeartbeatWakeRequest) => Promise<HeartbeatRunResult>;

/**
 * Minimal view of one dequeued wake handed to the batch-dispatch hook. The hook
 * sees EVERY wake in a coalesced batch the instant `pendingWakes` is cleared,
 * before any handler runs, so it can synchronously mark cross-cutting per-wake
 * state (continuation-dispatching) for the whole batch at once. This closes the
 * window for a wake at batch position >= 2 whose own handler only runs after
 * earlier wakes' multi-second turns await. Fix #952.
 */
export type HeartbeatBatchWake = {
  reason: string;
  sessionKey?: string;
};

/**
 * Returned by the batch-dispatch hook and called by the dispatcher in its
 * finally with the wakes whose handler was actually invoked (each such handler
 * owns clearing its own mark). The hook releases marks for any wake it marked
 * but whose handler never ran — e.g. an earlier wake rejected and broke the
 * batch loop — so mark/clear stays balanced without leaning on the cleanup
 * leak-guard. Fix #952.
 */
export type HeartbeatBatchDispatchRelease = (handled: ReadonlySet<HeartbeatBatchWake>) => void;

export type HeartbeatBatchDispatchHook = (
  batch: ReadonlyArray<HeartbeatBatchWake>,
) => HeartbeatBatchDispatchRelease | void;

let heartbeatsEnabled = true;

export function setHeartbeatsEnabled(enabled: boolean) {
  heartbeatsEnabled = enabled;
}

export function areHeartbeatsEnabled(): boolean {
  return heartbeatsEnabled;
}

type WakeTimerKind = "normal" | "retry";
type PendingWakeReason = {
  source: HeartbeatWakeSource;
  intent: HeartbeatWakeIntent;
  reason: string;
  priority: number;
  requestedAt: number;
  agentId?: string;
  sessionKey?: string;
  parentRunId?: string;
  heartbeat?: HeartbeatWakeOverride;
};

let handler: HeartbeatWakeHandler | null = null;
let handlerGeneration = 0;
let batchDispatchHook: HeartbeatBatchDispatchHook | null = null;
const pendingWakes = new Map<string, PendingWakeReason>();
let scheduled = false;
let running = false;
let timer: NodeJS.Timeout | null = null;
let timerDueAt: number | null = null;
let timerKind: WakeTimerKind | null = null;

const DEFAULT_COALESCE_MS = 250;
const DEFAULT_RETRY_MS = 1_000;
const REASON_PRIORITY = {
  RETRY: 0,
  INTERVAL: 1,
  DEFAULT: 2,
  ACTION: 3,
} as const;

function resolveWakePriority(params: {
  source: HeartbeatWakeSource;
  intent: HeartbeatWakeIntent;
  reason: string;
}): number {
  if (params.intent === "manual" || params.intent === "immediate") {
    return REASON_PRIORITY.ACTION;
  }
  if (params.source === "retry" || params.reason === "retry") {
    return REASON_PRIORITY.RETRY;
  }
  if (
    params.intent === "scheduled" ||
    params.source === "interval" ||
    params.reason === "interval"
  ) {
    return REASON_PRIORITY.INTERVAL;
  }
  return REASON_PRIORITY.DEFAULT;
}

function normalizeWakeReason(reason?: string): string {
  return normalizeHeartbeatWakeReason(reason);
}

function normalizeWakeTarget(value?: string): string | undefined {
  const trimmed = normalizeOptionalString(value) ?? "";
  return trimmed || undefined;
}

function getWakeTargetKey(params: { agentId?: string; sessionKey?: string }) {
  const agentId = normalizeWakeTarget(params.agentId);
  const sessionKey = normalizeWakeTarget(params.sessionKey);
  return `${agentId ?? ""}::${sessionKey ?? ""}`;
}

function queuePendingWakeReason(params: {
  source: HeartbeatWakeSource;
  intent: HeartbeatWakeIntent;
  reason?: string;
  requestedAt?: number;
  agentId?: string;
  sessionKey?: string;
  parentRunId?: string;
  heartbeat?: HeartbeatWakeOverride;
}) {
  const requestedAt = params.requestedAt ?? Date.now();
  const normalizedReason = normalizeWakeReason(params.reason);
  const normalizedAgentId = normalizeWakeTarget(params.agentId);
  const normalizedSessionKey = normalizeWakeTarget(params.sessionKey);
  const normalizedParentRunId = normalizeWakeTarget(params.parentRunId);
  const wakeTargetKey = getWakeTargetKey({
    agentId: normalizedAgentId,
    sessionKey: normalizedSessionKey,
  });
  const next: PendingWakeReason = {
    source: params.source,
    intent: params.intent,
    reason: normalizedReason,
    priority: resolveWakePriority({
      source: params.source,
      intent: params.intent,
      reason: normalizedReason,
    }),
    requestedAt,
    agentId: normalizedAgentId,
    sessionKey: normalizedSessionKey,
    parentRunId: normalizedParentRunId,
    heartbeat: params.heartbeat,
  };
  const previous = pendingWakes.get(wakeTargetKey);
  if (!previous) {
    pendingWakes.set(wakeTargetKey, next);
    return;
  }
  const merged =
    (next.heartbeat ?? previous.heartbeat ?? next.parentRunId)
      ? {
          ...next,
          parentRunId: next.parentRunId,
          heartbeat: next.heartbeat ?? previous.heartbeat,
        }
      : next;
  if (next.priority > previous.priority) {
    pendingWakes.set(wakeTargetKey, merged);
    return;
  }
  if (next.priority === previous.priority && next.requestedAt >= previous.requestedAt) {
    pendingWakes.set(wakeTargetKey, merged);
  }
}

function schedule(coalesceMs: number, kind: WakeTimerKind = "normal") {
  const delay = resolveTimerTimeoutMs(coalesceMs, DEFAULT_COALESCE_MS, 0);
  const dueAt = Date.now() + delay;
  if (timer) {
    // Keep retry cooldown as a hard minimum delay. This prevents the
    // finally-path reschedule (often delay=0) from collapsing backoff.
    if (timerKind === "retry") {
      return;
    }
    // If existing timer fires sooner or at the same time, keep it.
    if (typeof timerDueAt === "number" && timerDueAt <= dueAt) {
      return;
    }
    // New request needs to fire sooner — preempt the existing timer.
    clearTimeout(timer);
    timer = null;
    timerDueAt = null;
    timerKind = null;
  }
  timerDueAt = dueAt;
  timerKind = kind;
  timer = setTimeout(() => {
    void (async () => {
      timer = null;
      timerDueAt = null;
      timerKind = null;
      scheduled = false;
      const active = handler;
      if (!active) {
        return;
      }
      if (running) {
        scheduled = true;
        schedule(delay, kind);
        return;
      }

      const pendingBatch = Array.from(pendingWakes.values());
      pendingWakes.clear();
      // Mark cross-cutting per-wake state for the WHOLE batch synchronously here
      // — the same tick `pendingWakes.clear()` drops the queued-wake signal — so
      // a continuation wake at batch position >= 2 (whose handler only runs after
      // earlier wakes' multi-second turns await) is never momentarily all-false
      // to a subagent-cleanup recheck. Marks are released per-handler; the
      // returned release covers wakes never handled (an earlier wake threw and
      // broke the loop). Fix #952.
      const releaseBatchDispatch = batchDispatchHook?.(pendingBatch);
      running = true;
      // Wakes handed off to a handler — that handler owns clearing its own mark,
      // so the batch release must skip them and only clear un-run wakes. Fix #952.
      const handledWakes = new Set<PendingWakeReason>();
      try {
        for (const pendingWake of pendingBatch) {
          const wakeOpts = {
            source: pendingWake.source,
            intent: pendingWake.intent,
            reason: pendingWake.reason ?? undefined,
            ...(pendingWake.agentId ? { agentId: pendingWake.agentId } : {}),
            ...(pendingWake.sessionKey ? { sessionKey: pendingWake.sessionKey } : {}),
            ...(pendingWake.parentRunId ? { parentRunId: pendingWake.parentRunId } : {}),
            ...(pendingWake.heartbeat ? { heartbeat: pendingWake.heartbeat } : {}),
          };
          handledWakes.add(pendingWake);
          const res = await active(wakeOpts);
          if (res.status === "skipped" && isRetryableHeartbeatBusySkipReason(res.reason)) {
            // The target runtime is busy; retry this wake target soon.
            queuePendingWakeReason({
              source: pendingWake.source,
              intent: pendingWake.intent,
              reason: pendingWake.reason ?? "retry",
              agentId: pendingWake.agentId,
              sessionKey: pendingWake.sessionKey,
              parentRunId: pendingWake.parentRunId,
              heartbeat: pendingWake.heartbeat,
            });
            schedule(DEFAULT_RETRY_MS, "retry");
          }
        }
      } catch {
        // Error is already logged by the heartbeat runner; schedule a retry.
        for (const pendingWake of pendingBatch) {
          queuePendingWakeReason({
            source: pendingWake.source,
            intent: pendingWake.intent,
            reason: pendingWake.reason ?? "retry",
            agentId: pendingWake.agentId,
            sessionKey: pendingWake.sessionKey,
            parentRunId: pendingWake.parentRunId,
            heartbeat: pendingWake.heartbeat,
          });
        }
        schedule(DEFAULT_RETRY_MS, "retry");
      } finally {
        running = false;
        // Clear marks for any batched wake whose handler never ran (an earlier
        // wake rejected and broke the loop); their retry re-marks next round.
        // Fix #952.
        releaseBatchDispatch?.(handledWakes);
        if (pendingWakes.size > 0 || scheduled) {
          schedule(delay, "normal");
        }
      }
    })();
  }, delay);
  timer.unref?.();
}

/**
 * Register (or clear) the heartbeat wake handler.
 * Returns a disposer function that clears this specific registration.
 * Stale disposers (from previous registrations) are no-ops, preventing
 * a race where an old runner's cleanup clears a newer runner's handler.
 */
export function setHeartbeatWakeHandler(next: HeartbeatWakeHandler | null): () => void {
  handlerGeneration += 1;
  const generation = handlerGeneration;
  handler = next;
  if (next) {
    // New lifecycle starting (e.g. after SIGUSR1 in-process restart).
    // Clear any timer metadata from the previous lifecycle so stale retry
    // cooldowns do not delay a fresh handler.
    if (timer) {
      clearTimeout(timer);
    }
    timer = null;
    timerDueAt = null;
    timerKind = null;
    // Reset module-level execution state that may be stale from interrupted
    // runs in the previous lifecycle. Without this, `running === true` from
    // an interrupted heartbeat blocks all future schedule() attempts, and
    // `scheduled === true` can cause spurious immediate re-runs.
    running = false;
    scheduled = false;
  }
  if (handler && pendingWakes.size > 0) {
    schedule(DEFAULT_COALESCE_MS, "normal");
  }
  return () => {
    if (handlerGeneration !== generation) {
      return;
    }
    if (handler !== next) {
      return;
    }
    handlerGeneration += 1;
    handler = null;
  };
}

/**
 * Register (or clear) the batch-dispatch hook invoked synchronously the instant
 * a coalesced wake batch is dequeued (right after `pendingWakes.clear()`, before
 * any handler runs). Lets a higher layer mark cross-cutting per-wake state for
 * EVERY wake in the batch at once, closing the position >= 2 window (Fix #952).
 * Returns a disposer; like `setHeartbeatWakeHandler`, a stale disposer is a
 * no-op so an old runner's cleanup cannot clear a newer runner's hook. Default
 * null = no-op.
 */
export function setHeartbeatBatchDispatchHook(next: HeartbeatBatchDispatchHook | null): () => void {
  batchDispatchHook = next;
  return () => {
    if (batchDispatchHook === next) {
      batchDispatchHook = null;
    }
  };
}

export function requestHeartbeat(opts: {
  source: HeartbeatWakeSource;
  intent: HeartbeatWakeIntent;
  reason?: string;
  coalesceMs?: number;
  agentId?: string;
  sessionKey?: string;
  parentRunId?: string;
  heartbeat?: HeartbeatWakeOverride;
}) {
  queuePendingWakeReason({
    source: opts.source,
    intent: opts.intent,
    reason: opts.reason,
    agentId: opts.agentId,
    sessionKey: opts.sessionKey,
    parentRunId: opts.parentRunId,
    heartbeat: opts.heartbeat,
  });
  schedule(opts.coalesceMs ?? DEFAULT_COALESCE_MS, "normal");
}

export function requestHeartbeatNow(opts?: {
  source?: HeartbeatWakeSource;
  intent?: HeartbeatWakeIntent;
  reason?: string;
  coalesceMs?: number;
  agentId?: string;
  sessionKey?: string;
  parentRunId?: string;
  heartbeat?: HeartbeatWakeOverride;
}) {
  requestHeartbeat({
    source: opts?.source ?? "other",
    intent: opts?.intent ?? "immediate",
    reason: opts?.reason,
    coalesceMs: opts?.coalesceMs,
    agentId: opts?.agentId,
    sessionKey: opts?.sessionKey,
    parentRunId: opts?.parentRunId,
    heartbeat: opts?.heartbeat,
  });
}

export function hasHeartbeatWakeHandler() {
  return handler !== null;
}

export function hasPendingHeartbeatWake() {
  return pendingWakes.size > 0 || Boolean(timer) || scheduled;
}

/**
 * True when a heartbeat wake targeting a specific session is still queued
 * (coalescing, not yet dispatched). Used by subagent cleanup to detect a
 * `continue_work` continuation wake that has fired its timer but whose
 * heartbeat turn has not run yet, so teardown can be deferred. Fix #952.
 */
export function hasPendingHeartbeatWakeForSession(sessionKey: string): boolean {
  const normalized = normalizeWakeTarget(sessionKey);
  if (!normalized) {
    return false;
  }
  for (const pending of pendingWakes.values()) {
    if (pending.sessionKey === normalized) {
      return true;
    }
  }
  return false;
}

export function resetHeartbeatWakeStateForTests() {
  if (timer) {
    clearTimeout(timer);
  }
  timer = null;
  timerDueAt = null;
  timerKind = null;
  pendingWakes.clear();
  scheduled = false;
  running = false;
  handlerGeneration += 1;
  handler = null;
  batchDispatchHook = null;
}
