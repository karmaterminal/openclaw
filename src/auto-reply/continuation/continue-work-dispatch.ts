/**
 * Continuation work dispatch — prompt same-session re-drive + restart recovery
 * for the durable `continue_work` re-entry (#952).
 *
 * `continue_work` re-enters the SAME session for another turn. At the elected
 * offset it must drive that turn PROMPTLY (RFC §2.3/§3.1) — it must NOT wait for
 * the next periodic heartbeat tick (which on a quiet seat can be ~0 in 30 min =
 * "wait forever"). The precursor rang `requestHeartbeatNow()` (RFC §4.4's
 * heartbeat "parent doorbell"): that wake is serviced only by the periodic
 * heartbeat scheduler, whose handler drops a wake whose agent is not currently
 * scheduled (`run()` returns `disabled` when `state.agents` is empty). On a seat
 * with no/sparse heartbeat agents the subagent continuation wake was a silent
 * no-op and hop-2 never re-entered.
 *
 * So dispatch drives the elected turn DIRECTLY through `runHeartbeatOnce` (the
 * per-session turn executor) — NEVER `requestHeartbeatNow`. The #746 routing
 * exemption keeps a subagent wake on its own session and the reply path runs a
 * `work-wake` continuation turn. Continuation re-entry is exempted from
 * `runHeartbeatOnce`'s heartbeat-eligibility / active-hours gates (it is an
 * explicit budgeted election, not a periodic heartbeat), and the per-agent
 * scheduler-deferral gate (`evaluateWakeDeferral`) lives in the bypassed `run()`
 * handler — so the drive is not gated by any heartbeat-enablement, active-hours,
 * or scheduler-cadence check. Remaining busy/lane skips are retryable and are
 * retried here (the session must not run two turns at once).
 *
 * The durable `continuation_work` task is the persistence layer: it stays
 * `queued` (pinning the session via the cleanup gate) until the turn actually
 * runs, so a busy retry, a crash, or a restart mid-drive can never silently drop
 * the election — `recoverPendingContinuationWork` re-drives a still-queued
 * election after a gateway restart.
 */

import { formatErrorMessage } from "../../infra/errors.js";
import { runHeartbeatOnce } from "../../infra/heartbeat-runner.js";
import { isRetryableHeartbeatBusySkipReason } from "../../infra/heartbeat-wake.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { resolveContinuationRuntimeConfig } from "./config.js";
import {
  claimMaturedContinuationWork,
  finalizeDispatchedContinuationWork,
  listPendingContinuationWorkSessionKeysForRecovery,
  peekSoonestUnmaturedContinuationWorkDueAt,
} from "./continue-work-store.js";
import {
  registerContinuationTimerHandle,
  retainContinuationTimerRef,
  unregisterContinuationTimerHandle,
} from "./state.js";

const log = createSubsystemLogger("continuation/continue-work-dispatch");

// The re-drive retries only while the target session is transiently busy (an
// active reply run or a busy lane at the elected instant). Bounded so a brief
// busy window is absorbed (the election stays durably queued the whole time, so
// a restart re-drives it), yet a persistently-busy session does not spin
// forever: after the budget it stays durably queued for boot recovery, logged
// loudly. ~60s covers a hop that started a hair before the elected instant.
const CONTINUATION_TURN_RETRY_MS = 2_000;
const CONTINUATION_TURN_MAX_RETRIES = 30;

function buildWakeEventText(hop: number, maxChainLength: number, reason?: string): string {
  return (
    `[continuation:wake] Turn ${hop}/${maxChainLength}. The agent elected to continue working.` +
    (reason ? ` Reason: ${reason}` : "")
  );
}

/**
 * Drive the elected continuation turn PROMPTLY for the session, decoupled from
 * the periodic heartbeat scheduler.
 *
 * On a successful turn the election is deleted. A retryable busy skip (the
 * session is mid-turn or its lane is briefly busy at the elected instant)
 * re-drives after a short delay, bounded; the election stays durably queued
 * across retries so a restart re-drives it. After the retry budget the election
 * is LEFT queued (boot recovery re-drives — never silently lost), logged loudly.
 * A non-retryable skip / failure releases the election (loud give-up) so the
 * session can be torn down instead of pinning forever.
 */
function driveContinuationTurn(params: {
  sessionKey: string;
  flowId: string;
  reason?: string;
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
      if (result.status === "ran") {
        finalizeDispatchedContinuationWork(params.flowId);
        return;
      }
      const retryable =
        result.status === "skipped" && isRetryableHeartbeatBusySkipReason(result.reason);
      if (retryable && attempt < CONTINUATION_TURN_MAX_RETRIES) {
        log.info(
          `[continuation:work-busy-retry] session=${params.sessionKey} flow=${params.flowId} attempt=${attempt} reason=${result.reason}`,
        );
        const retry = setTimeout(() => {
          driveContinuationTurn({ ...params, attempt: attempt + 1 });
        }, CONTINUATION_TURN_RETRY_MS);
        retry.unref();
        return;
      }
      if (retryable) {
        // Persistently busy: leave the election durably queued so boot recovery
        // re-drives it (never silently lost). Loud so a stuck session surfaces.
        log.warn(
          `[continuation:work-busy-exhausted] session=${params.sessionKey} flow=${params.flowId} attempts=${attempt} reason=${result.reason} (kept queued for recovery)`,
        );
        return;
      }
      // Non-retryable skip / failure: release the election so the session is not
      // pinned forever. Loud — a continuation re-entry should not skip here.
      log.warn(
        `[continuation:work-drive-gaveup] session=${params.sessionKey} flow=${params.flowId} attempts=${attempt} status=${result.status} reason=${result.reason}`,
      );
      finalizeDispatchedContinuationWork(params.flowId);
    })
    .catch((err: unknown) => {
      log.warn(
        `[continuation:work-drive-error] session=${params.sessionKey} flow=${params.flowId} attempts=${attempt}: ${formatErrorMessage(err)}`,
      );
      finalizeDispatchedContinuationWork(params.flowId);
    });
}

/**
 * Drive the elected continuation turn for every matured election on a session.
 *
 * Claims matured `queued` `continuation_work` elections (peek — they stay queued
 * until the turn runs), injects the `[continuation:wake]` system event so the
 * re-entered turn (including a boot-recovered one) continues the work rather
 * than running a generic heartbeat, then drives each turn directly. One election
 * per session (the store upserts).
 */
export function dispatchContinuationWork(params: {
  sessionKey: string;
  parentRunId?: string;
  now?: number;
}): number {
  const now = params.now ?? Date.now();
  const matured = claimMaturedContinuationWork(params.sessionKey, { now });
  if (matured.length === 0) {
    return 0;
  }
  const maxChainLength = resolveContinuationRuntimeConfig().maxChainLength;
  for (const election of matured) {
    // Inject the continuation context at dispatch (not at arm time) so a
    // boot-recovered re-drive gets it too — the recovery path previously
    // re-entered with a bare heartbeat prompt. System events are volatile, so
    // enqueuing here (once per claimed election) cannot duplicate across
    // restart. Fix #952.
    enqueueSystemEvent(buildWakeEventText(election.hop, maxChainLength, election.reason), {
      sessionKey: params.sessionKey,
      trusted: true,
    });
    driveContinuationTurn({
      sessionKey: params.sessionKey,
      flowId: election.flowId,
      ...(election.reason ? { reason: election.reason } : {}),
      ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    });
  }
  return matured.length;
}

/**
 * Arm an unref'd in-process timer that dispatches the session's continuation
 * turn at `fireInMs`. Used by boot recovery to re-arm a hedge for a delayed
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
 * Honors the continuation deny-gate, then per session: drives a matured `queued`
 * election now (re-injecting its `[continuation:wake]` context) and re-arms a
 * hedge timer for a still-unmatured `queued` election so a delayed
 * `continue_work(delay)` fires on time even though its volatile timer was lost.
 * The lossless queued-only lifecycle means there is nothing to purge — a
 * still-queued election is simply re-driven.
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
    dispatched += dispatchContinuationWork({ sessionKey, now });
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
