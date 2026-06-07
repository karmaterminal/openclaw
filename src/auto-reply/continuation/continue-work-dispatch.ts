/**
 * Continuation work dispatch — prompt same-session re-drive + restart recovery
 * for the durable `continue_work` re-entry (#952).
 *
 * `continue_work` re-enters the SAME session for another turn. At the elected
 * offset it must drive that turn PROMPTLY (RFC §2.3/§3.1) — it must NOT wait for
 * the next periodic heartbeat tick (which on a quiet seat can be ~0 in 30 min =
 * "wait forever"), and it must NOT be silently dropped by any heartbeat gate.
 *
 * Earlier attempts routed through the heartbeat substrate (`requestHeartbeatNow`
 * then a de-gated `runHeartbeatOnce`). Both fail on real seats: the wake handler
 * drops a wake whose agent is not scheduled (`state.agents` empty), and
 * `runHeartbeatOnce` itself has ~13 silent `skipped` returns — heartbeat
 * enablement, active-hours, AND cross-session lane gates like
 * `if (getSize(CommandLane.Main) > 0)` that fire whenever the PARENT's main lane
 * has anything queued. None of those belong to a subagent's elected turn.
 *
 * So dispatch drives the turn FULLY DIRECTLY through `getReplyFromConfig` — the
 * universal per-session turn executor — NEVER `requestHeartbeatNow` and NEVER
 * `runHeartbeatOnce`. We set `SessionKey` to the electing (subagent) session
 * ourselves (no #746 routing needed) and run a `work-wake` continuation turn,
 * bypassing the entire heartbeat skip-gate gauntlet. The only concurrency guard
 * kept is the session's OWN active reply run (`replyRunRegistry.isActive`) — a
 * session must not run two turns at once — which is retried here; the parent's
 * lanes are irrelevant. `getReplyFromConfig` loads the session from the store by
 * key, so the retain/cleanup gate (keeping `store[forced]` alive) stays a
 * required companion.
 *
 * The durable `continuation_work` task is the persistence layer: it stays
 * `queued` (pinning the session via the cleanup gate) until the turn actually
 * runs, so a busy retry, a crash, or a restart mid-drive can never silently drop
 * the election — `recoverPendingContinuationWork` re-drives a still-queued
 * election after a gateway restart.
 */

import { formatErrorMessage } from "../../infra/errors.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { replyRunRegistry } from "../reply/reply-run-registry.js";
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

// The re-drive retries only while the SESSION'S OWN reply run is active at the
// elected instant (not the parent's lanes — that cross-session coupling is
// exactly what dropped hop-2 on a busy seat). Bounded so a brief busy window is
// absorbed (the election stays durably queued the whole time, so a restart
// re-drives it), yet a persistently-busy session does not spin forever: after
// the budget it stays durably queued for boot recovery, logged loudly.
const CONTINUATION_TURN_RETRY_MS = 2_000;
const CONTINUATION_TURN_MAX_RETRIES = 30;

// The re-entered turn's prompt body. The substantive "continue your work"
// context arrives as the drained `[continuation:wake]` system event; this is the
// turn's user-message slot.
const CONTINUATION_TURN_BODY =
  "Continue your work. You elected to take another turn — see the continuation wake note above.";

function buildWakeEventText(hop: number, maxChainLength: number, reason?: string): string {
  return (
    `[continuation:wake] Turn ${hop}/${maxChainLength}. The agent elected to continue working.` +
    (reason ? ` Reason: ${reason}` : "")
  );
}

/**
 * Drive the elected continuation turn FULLY DIRECTLY through the universal
 * per-session executor (`getReplyFromConfig`), bypassing the heartbeat
 * substrate entirely — no `requestHeartbeatNow`, no `runHeartbeatOnce`, no
 * heartbeat skip gates. `SessionKey` is the electing session, so the turn runs
 * for it (loaded from `store[forced]`, kept alive by the cleanup gate).
 *
 * Concurrency: the SESSION'S OWN active reply run is the only guard — a session
 * must not run two turns at once — checked before driving and retried (bounded);
 * the election stays durably queued across retries so a restart re-drives it.
 * After the budget the election is LEFT queued for boot recovery (never silently
 * lost), logged loudly. The turn completing (with or without visible output)
 * finalizes the election; an unexpected throw releases it (loud) so the session
 * is not pinned forever.
 */
function driveContinuationTurn(params: {
  sessionKey: string;
  flowId: string;
  reason?: string;
  parentRunId?: string;
  attempt?: number;
}): void {
  const attempt = params.attempt ?? 0;
  // Retry while the session is transiently busy with its OWN turn (never the
  // parent's Main lane — the gate that killed hop-2 on a busy seat). The election
  // stays durably queued the whole time, so a restart re-drives it; after the
  // budget it stays queued for boot recovery (never silently lost). #952.
  const retryWhileBusy = (why: string): void => {
    if (attempt < CONTINUATION_TURN_MAX_RETRIES) {
      log.info(
        `[continuation:work-busy-retry] session=${params.sessionKey} flow=${params.flowId} attempt=${attempt} reason=${why}`,
      );
      const retry = setTimeout(() => {
        driveContinuationTurn({ ...params, attempt: attempt + 1 });
      }, CONTINUATION_TURN_RETRY_MS);
      retry.unref();
      return;
    }
    log.warn(
      `[continuation:work-busy-exhausted] session=${params.sessionKey} flow=${params.flowId} attempts=${attempt} reason=${why} (kept queued for recovery)`,
    );
  };

  if (replyRunRegistry.isActive(params.sessionKey)) {
    retryWhileBusy("self-run-active");
    return;
  }
  void (async () => {
    const { getReplyFromConfig } = await import("../reply/get-reply.js");
    const result = await getReplyFromConfig(
      {
        SessionKey: params.sessionKey,
        Body: CONTINUATION_TURN_BODY,
        Provider: "heartbeat",
      },
      {
        isHeartbeat: true,
        continuationTrigger: "work-wake",
        ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
      },
    );
    // `getReplyFromConfig` returns undefined for admission-skip, no-reply, or
    // error. Distinguish admission-skip (our drive was rejected because a turn
    // is now active on this session) from a turn that ran with no visible
    // output: only the former should retry — finalizing it would drop a due
    // continuation. Any other completion means the turn ran -> finalize.
    if (result === undefined && replyRunRegistry.isActive(params.sessionKey)) {
      retryWhileBusy("admission-skip");
      return;
    }
    finalizeDispatchedContinuationWork(params.flowId);
  })().catch((err: unknown) => {
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
