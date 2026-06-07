/**
 * Continuation work dispatch — wake dispatch + restart recovery for the durable
 * `continue_work` re-entry (#952, #956).
 *
 * `continue_work` re-enters the SAME session for another turn via the existing
 * heartbeat-wake path (`requestHeartbeatNow({ reason: "continuation" })`, routed
 * back to the session by the #746 exemption) — it never spawns a subagent.
 *
 * The three election sites (turn-1 spawn-init, main agent-runner, follow-up
 * runner) each persist their election as a durable `continuation_work` task via
 * `enqueueContinuationWork`, then drive their in-process `setTimeout` through
 * `dispatchContinuationWork`. The volatile timer is only the in-process
 * scheduler; the durable task is the source of truth, so after a gateway
 * restart `recoverPendingContinuationWork` replays the wake — the capability the
 * old volatile-only path lacked (lost on restart; dropped when subagent cleanup
 * deleted the session before the wake landed — #952).
 */

import { requestHeartbeatNow } from "../../infra/heartbeat-wake.js";
import { resolveContinuationRuntimeConfig } from "./config.js";
import {
  consumeMaturedContinuationWork,
  listPendingContinuationWorkSessionKeysForRecovery,
  peekSoonestUnmaturedContinuationWorkDueAt,
} from "./continue-work-store.js";
import {
  registerContinuationTimerHandle,
  retainContinuationTimerRef,
  unregisterContinuationTimerHandle,
} from "./state.js";

/**
 * Fire the heartbeat re-entry wake for every matured election on a session.
 *
 * Claims matured `continuation_work` tasks (queued→running, or crash-orphaned
 * `running` on recovery via `includeRunning`) and fires one
 * `requestHeartbeatNow({ reason: "continuation" })` per claim. The #746
 * exemption routes that wake back to the same session for a fresh turn. The
 * claim is an expected-revision CAS, so a duplicate timer (e.g. the in-process
 * timer racing a recovery hedge) dispatches zero extra wakes.
 */
export function dispatchContinuationWork(params: {
  sessionKey: string;
  parentRunId?: string;
  now?: number;
  includeRunning?: boolean;
}): number {
  const matured = consumeMaturedContinuationWork(params.sessionKey, {
    ...(params.now !== undefined ? { now: params.now } : {}),
    ...(params.includeRunning ? { includeRunning: true } : {}),
  });
  matured.forEach(() => {
    requestHeartbeatNow({
      sessionKey: params.sessionKey,
      reason: "continuation",
      ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    });
  });
  return matured.length;
}

/**
 * Arm an unref'd in-process timer that dispatches the session's continuation
 * wake at `fireInMs`. Used by boot recovery to re-arm a hedge for a delayed
 * election whose original volatile timer was lost on restart; the election
 * sites arm their own timers inline (preserving per-site telemetry) and call
 * `dispatchContinuationWork` directly.
 */
export function scheduleContinuationWorkDispatch(params: {
  sessionKey: string;
  fireInMs: number;
  parentRunId?: string;
}): void {
  const { sessionKey } = params;
  retainContinuationTimerRef(sessionKey);
  const handle = setTimeout(
    () => {
      try {
        dispatchContinuationWork({
          sessionKey,
          ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
        });
      } finally {
        unregisterContinuationTimerHandle(sessionKey, handle);
      }
    },
    Math.max(0, params.fireInMs),
  );
  registerContinuationTimerHandle(sessionKey, handle);
  handle.unref();
}

/**
 * Replay durable `continue_work` elections after a gateway restart.
 *
 * Mirrors `recoverPendingContinuationDelegates`: honors the continuation
 * deny-gate, dispatches matured (and crash-orphaned `running`) elections now,
 * and re-arms a hedge timer for any still-unmatured election so a delayed
 * `continue_work(delay)` fires on time even though its volatile timer was lost.
 */
export function recoverPendingContinuationWork(
  params: { log?: (message: string) => void; now?: number } = {},
): { sessions: number; dispatched: number } {
  if (!resolveContinuationRuntimeConfig().enabled) {
    return { sessions: 0, dispatched: 0 };
  }
  const now = params.now ?? Date.now();
  const sessionKeys = listPendingContinuationWorkSessionKeysForRecovery();
  let dispatched = 0;
  for (const sessionKey of sessionKeys) {
    dispatched += dispatchContinuationWork({ sessionKey, now, includeRunning: true });
    const soonest = peekSoonestUnmaturedContinuationWorkDueAt(sessionKey, now);
    if (soonest !== undefined) {
      scheduleContinuationWorkDispatch({ sessionKey, fireInMs: soonest - now });
    }
  }
  if (sessionKeys.length > 0) {
    params.log?.(
      `[continuation:work-recovery] sessions=${sessionKeys.length} dispatched=${dispatched}`,
    );
  }
  return { sessions: sessionKeys.length, dispatched };
}
