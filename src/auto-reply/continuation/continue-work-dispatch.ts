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
 * scheduler; the durable task is the source of truth, so after a gateway restart
 * `recoverPendingContinuationWork` replays the un-dispatched election — the
 * capability the old volatile-only path lacked (lost on restart; dropped when
 * subagent cleanup deleted the session before the wake landed — #952).
 */

import { requestHeartbeatNow } from "../../infra/heartbeat-wake.js";
import { resolveContinuationRuntimeConfig } from "./config.js";
import {
  consumeMaturedContinuationWork,
  listPendingContinuationWorkSessionKeysForRecovery,
  peekSoonestUnmaturedContinuationWorkDueAt,
  purgeOrphanedRunningContinuationWork,
} from "./continue-work-store.js";
import {
  registerContinuationTimerHandle,
  retainContinuationTimerRef,
  unregisterContinuationTimerHandle,
} from "./state.js";

/**
 * Fire the heartbeat re-entry wake for every matured election on a session.
 *
 * Claims matured `queued` `continuation_work` tasks (queued→running) and fires
 * one `requestHeartbeatNow({ reason: "continuation" })` per claim. The #746
 * exemption routes that wake back to the same session for a fresh turn. The
 * claim is an expected-revision CAS, so a duplicate timer (e.g. the in-process
 * timer racing a recovery hedge) dispatches zero extra wakes.
 */
export function dispatchContinuationWork(params: {
  sessionKey: string;
  parentRunId?: string;
  now?: number;
}): number {
  const now = params.now ?? Date.now();
  const matured = consumeMaturedContinuationWork(params.sessionKey, { now });
  // One election per session (the store upserts), and `requestHeartbeatNow`
  // coalesces, so a single wake re-enters the session for the elected turn.
  if (matured.length > 0) {
    requestHeartbeatNow({
      sessionKey: params.sessionKey,
      reason: "continuation",
      ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    });
  }
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
 * Honors the continuation deny-gate, then per session: purges any orphaned
 * `running` task (a dispatched election whose wake was already consumed or lost
 * — re-firing would double-drive a turn), dispatches a matured `queued`
 * election now, and re-arms a hedge timer for a still-unmatured `queued`
 * election so a delayed `continue_work(delay)` fires on time even though its
 * volatile timer was lost. Only un-dispatched (`queued`) elections survive a
 * restart — exactly the capability the volatile-only path lacked.
 */
export function recoverPendingContinuationWork(
  params: { log?: (message: string) => void; now?: number } = {},
): { sessions: number; dispatched: number; purged: number } {
  if (!resolveContinuationRuntimeConfig().enabled) {
    return { sessions: 0, dispatched: 0, purged: 0 };
  }
  const now = params.now ?? Date.now();
  const sessionKeys = listPendingContinuationWorkSessionKeysForRecovery();
  let dispatched = 0;
  let purged = 0;
  for (const sessionKey of sessionKeys) {
    purged += purgeOrphanedRunningContinuationWork(sessionKey);
    dispatched += dispatchContinuationWork({ sessionKey, now });
    const soonest = peekSoonestUnmaturedContinuationWorkDueAt(sessionKey, now);
    if (soonest !== undefined) {
      scheduleContinuationWorkDispatch({ sessionKey, fireInMs: soonest - now });
    }
  }
  if (sessionKeys.length > 0) {
    params.log?.(
      `[continuation:work-recovery] sessions=${sessionKeys.length} dispatched=${dispatched} purged=${purged}`,
    );
  }
  return { sessions: sessionKeys.length, dispatched, purged };
}
