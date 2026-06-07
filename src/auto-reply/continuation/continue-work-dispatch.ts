/**
 * Continuation work dispatch — prompt same-session re-drive + restart recovery
 * for the durable `continue_work` re-entry (#952, #956).
 *
 * `continue_work` re-enters the SAME session for another turn. At the elected
 * offset it must drive that turn PROMPTLY (RFC §2.3/§3.1) — it must NOT wait for
 * the next periodic heartbeat tick (which on a quiet seat can be ~0 in 30 min =
 * "wait forever"). The precursor implementation rang `requestHeartbeatNow()`,
 * but that is the heartbeat "parent doorbell" (RFC §4.4): the wake is serviced
 * only by the periodic heartbeat scheduler, whose targeted path drops a wake
 * whose agent is not currently scheduled (`run()` returns `disabled` when
 * `state.agents` is empty). On a seat with no/sparse heartbeat agents the
 * subagent continuation wake was a silent no-op and hop-2 never re-entered.
 *
 * So dispatch drives the elected turn DIRECTLY through `runHeartbeatOnce` (the
 * per-session turn executor), decoupled from the periodic scheduler. The #746
 * routing exemption re-enters the same (subagent) session and the reply path
 * runs the turn as a `work-wake` continuation. The durable `continuation_work`
 * task remains the persistence layer: it pins the session via the cleanup gate
 * so the re-drive lands on a live session, and `recoverPendingContinuationWork`
 * replays an un-dispatched election after a gateway restart.
 */

import { formatErrorMessage } from "../../infra/errors.js";
import { runHeartbeatOnce } from "../../infra/heartbeat-runner.js";
import { isRetryableHeartbeatBusySkipReason } from "../../infra/heartbeat-wake.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
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

const log = createSubsystemLogger("continuation/continue-work-dispatch");

// The re-drive retries only while the target session is transiently busy (an
// active reply run or a busy lane at the elected instant). Bounded so a session
// that never frees cannot re-drive forever; the durable election's `running`
// state pins the session across these retries (and the cleanup gate keeps it
// alive), so a brief busy window cannot strand hop-2.
const CONTINUATION_TURN_RETRY_MS = 1_000;
const CONTINUATION_TURN_MAX_RETRIES = 8;

/**
 * Drive the elected continuation turn PROMPTLY for the session, decoupled from
 * the periodic heartbeat scheduler.
 *
 * Invokes `runHeartbeatOnce` directly (not `requestHeartbeatNow`): the per-run
 * executor re-enters the session — the #746 exemption keeps a subagent wake on
 * its own session — and runs a `work-wake` continuation turn even when no
 * heartbeat agent is scheduled. A retryable busy skip (the session is mid-turn
 * or its lane is briefly busy at the elected instant) re-drives after a short
 * delay, bounded, mirroring the wake layer's retry without depending on it.
 */
function driveContinuationTurn(params: {
  sessionKey: string;
  parentRunId?: string;
  attempt?: number;
}): void {
  const attempt = params.attempt ?? 0;
  void runHeartbeatOnce({
    sessionKey: params.sessionKey,
    reason: "continuation",
    intent: "immediate",
    ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
  })
    .then((result) => {
      if (
        result.status === "skipped" &&
        isRetryableHeartbeatBusySkipReason(result.reason) &&
        attempt < CONTINUATION_TURN_MAX_RETRIES
      ) {
        const retry = setTimeout(() => {
          driveContinuationTurn({ ...params, attempt: attempt + 1 });
        }, CONTINUATION_TURN_RETRY_MS);
        retry.unref();
      }
    })
    .catch((err: unknown) => {
      log.warn(
        `[continuation:work-drive-failed] session=${params.sessionKey} attempt=${attempt}: ${formatErrorMessage(err)}`,
      );
    });
}

/**
 * Drive the elected continuation turn for every matured election on a session.
 *
 * Claims matured `queued` `continuation_work` tasks (queued→running) and drives
 * the continuation turn PROMPTLY via `runHeartbeatOnce` (not the periodic
 * heartbeat scheduler). One election per session (the store upserts), so a
 * single drive re-enters the session for the elected turn. The claim is an
 * expected-revision CAS, so a duplicate timer (e.g. the in-process timer racing
 * a recovery hedge) drives zero extra turns.
 */
export function dispatchContinuationWork(params: {
  sessionKey: string;
  parentRunId?: string;
  now?: number;
}): number {
  const now = params.now ?? Date.now();
  const matured = consumeMaturedContinuationWork(params.sessionKey, { now });
  if (matured.length > 0) {
    driveContinuationTurn({
      sessionKey: params.sessionKey,
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
