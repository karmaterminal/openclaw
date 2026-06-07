/**
 * Continuation work store — durable TaskFlow-backed `continue_work` elections.
 *
 * `continue_work` lets an agent elect to take ANOTHER turn in its OWN session,
 * now or after a delay. It was historically a VOLATILE `setTimeout` that fired
 * `requestHeartbeatNow` — lost on gateway restart, and (for a subagent spawned
 * by `continue_delegate`) silently dropped when the child session-store entry
 * was deleted by cleanup before the wake landed: hops 2+ never ran (#952).
 *
 * This store persists each election as a `continuation_work` TaskFlow task so it
 * (a) survives gateway restart — boot recovery replays the un-dispatched
 * election — and (b) gives subagent cleanup a durable "a same-session
 * continuation is still pending" signal that keeps the child session alive until
 * the elected turn has run. Mirrors the `continuation_delegate` store, but the
 * dispatch target is RE-ENTRY of the SAME session (driven directly through
 * `runHeartbeatOnce` at the elected offset, decoupled from the periodic
 * heartbeat scheduler — see continue-work-dispatch.ts), NOT a new
 * `spawnSubagentDirect` child.
 *
 * Lifecycle — at most one task per session; `enqueueContinuationWork` upserts:
 *   queued   election recorded; pins the session until `dueAt = electedAt +
 *            delayMs` and its turn has been dispatched. The durable, restart-safe
 *            state: boot recovery re-arms / fires it.
 *   running  turn dispatched (`runHeartbeatOnce` driven); the re-entered turn
 *            is in flight. Pins the session through the dispatch→turn handoff
 *            window (bounded by `CONTINUATION_WORK_HANDOFF_GRACE_MS`); a live
 *            reply run on the session is the longer-turn backstop in the gate.
 *            NOT restart-durable on purpose — a `running` task seen at boot is an
 *            orphan whose wake either already ran or was lost, so recovery purges
 *            it rather than re-firing (re-firing would double-drive a turn).
 *   deleted  released by the next election's upsert, by subagent cleanup, or by
 *            boot recovery purging an orphaned `running`.
 *
 * RFC: docs/design/continue-work-signal-v2.md §5 (durable continue_work, #956).
 */

import { z } from "zod";
import { normalizeDiagnosticTraceparent } from "../../infra/diagnostic-trace-context.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { TaskFlowRecord } from "../../tasks/task-flow-registry.types.js";
import {
  createManagedTaskFlow,
  deleteTaskFlowRecordById,
  failFlow,
  listTaskFlowRecords,
  listTaskFlowsForOwnerKey,
  updateFlowRecordByIdExpectedRevision,
} from "../../tasks/task-flow-runtime-internal.js";

const log = createSubsystemLogger("continuation/continue-work-store");

export const CONTINUATION_WORK_CONTROLLER_ID = "core/continuation-work";

// How long a `running` (dispatched, turn-in-flight) task keeps pinning the
// session after dispatch. It only needs to cover the window between driving the
// turn (`runHeartbeatOnce`) and the re-entered reply run registering active
// (sub-second to a few seconds), during which the reply-active signal is briefly
// false. A longer in-flight turn is held by the live-reply-run backstop in the
// subagent cleanup gate, not by this grace. Generous so a momentarily-busy
// gateway cannot strand the handoff and reopen #952, yet bounded so a dropped
// turn cannot pin a child session forever.
export const CONTINUATION_WORK_HANDOFF_GRACE_MS = 60_000;

const ContinuationWorkStateSchema = z.object({
  kind: z.literal("continuation_work"),
  hop: z.number().int().positive(),
  delayMs: z.number().int().nonnegative().optional(),
  electedAt: z.number().int().nonnegative(),
  dispatchedAt: z.number().int().nonnegative().optional(),
  reason: z.string().optional(),
  traceparent: z.string().optional(),
});

type ContinuationWorkState = z.infer<typeof ContinuationWorkStateSchema>;

export type PendingContinuationWork = {
  flowId: string;
  hop: number;
  reason?: string;
  traceparent?: string;
};

export type EnqueueContinuationWorkParams = {
  hop: number;
  delayMs?: number;
  reason?: string;
  traceparent?: string;
  electedAt?: number;
};

function isContinuationWorkFlow(flow: TaskFlowRecord): boolean {
  return flow.syncMode === "managed" && flow.controllerId === CONTINUATION_WORK_CONTROLLER_ID;
}

function listContinuationWorkFlows(sessionKey: string): TaskFlowRecord[] {
  return listTaskFlowsForOwnerKey(sessionKey).filter(isContinuationWorkFlow);
}

function decodeState(flow: TaskFlowRecord): ContinuationWorkState | undefined {
  const parsed = ContinuationWorkStateSchema.safeParse(flow.stateJson);
  return parsed.success ? parsed.data : undefined;
}

function failUndecodableFlow(flow: TaskFlowRecord, sessionKey: string): void {
  log.warn(
    `[continuation:work-decode-failed] flowId=${flow.flowId} session=${sessionKey} raw=${JSON.stringify(flow.stateJson).slice(0, 200)}`,
  );
  failFlow({
    flowId: flow.flowId,
    expectedRevision: flow.revision,
    currentStep: "Rejected invalid continuation_work payload",
    blockedSummary: "Pending continuation_work payload could not be decoded.",
  });
}

function dueAt(state: ContinuationWorkState): number {
  return state.electedAt + (state.delayMs ?? 0);
}

function buildGoal(hop: number, reason: string | undefined): string {
  const suffix = reason?.trim() ? `: ${reason.trim().slice(0, 77)}` : "";
  return `Continuation work (turn ${hop})${suffix}`;
}

/**
 * Record (or replace) the session's pending `continue_work` election.
 *
 * Upsert: at most one `continuation_work` task per session. A re-election on the
 * woken turn replaces the prior task in a single synchronous call, so the
 * subagent cleanup gate never observes a zero-pending gap mid-chain (which would
 * delete the child session and strand the next hop — #952). The replace also
 * finalizes the prior `running` task, so a session never accumulates stale rows.
 */
export function enqueueContinuationWork(
  sessionKey: string,
  params: EnqueueContinuationWorkParams,
): void {
  cancelContinuationWork(sessionKey);
  const electedAt = params.electedAt ?? Date.now();
  const traceparent = normalizeDiagnosticTraceparent(params.traceparent);
  const state: ContinuationWorkState = {
    kind: "continuation_work",
    hop: params.hop,
    ...(params.delayMs !== undefined ? { delayMs: params.delayMs } : {}),
    electedAt,
    ...(params.reason?.trim() ? { reason: params.reason.trim() } : {}),
    ...(traceparent ? { traceparent } : {}),
  };
  createManagedTaskFlow({
    ownerKey: sessionKey,
    controllerId: CONTINUATION_WORK_CONTROLLER_ID,
    notifyPolicy: "silent",
    goal: buildGoal(params.hop, params.reason),
    currentStep: "Queued for continuation re-entry",
    stateJson: state,
  });
}

/**
 * Claim matured `queued` elections for a session and mark them `running`.
 *
 * `queued` tasks whose `dueAt` has passed are claimed → `running` so the gate
 * keeps pinning the session across the dispatch→re-entry handoff. Returns the
 * elections whose claim was applied so the caller drives exactly one
 * continuation turn per claim (concurrency-safe via expected-revision CAS).
 * Already-`running` tasks are NOT re-claimed: driving a turn is not idempotent,
 * so a dispatched election is consumed exactly once.
 */
export function consumeMaturedContinuationWork(
  sessionKey: string,
  options: { now?: number } = {},
): PendingContinuationWork[] {
  const now = options.now ?? Date.now();
  const claimed: PendingContinuationWork[] = [];
  for (const flow of listContinuationWorkFlows(sessionKey)) {
    if (flow.status !== "queued") {
      continue;
    }
    const state = decodeState(flow);
    if (!state) {
      failUndecodableFlow(flow, sessionKey);
      continue;
    }
    if (now < dueAt(state)) {
      continue;
    }
    const result = updateFlowRecordByIdExpectedRevision({
      flowId: flow.flowId,
      expectedRevision: flow.revision,
      patch: {
        status: "running",
        currentStep: "Dispatched continuation re-entry wake",
        stateJson: { ...state, dispatchedAt: now },
        updatedAt: now,
      },
    });
    if (!result.applied) {
      continue;
    }
    claimed.push({
      flowId: flow.flowId,
      hop: state.hop,
      ...(state.reason ? { reason: state.reason } : {}),
      ...(state.traceparent ? { traceparent: state.traceparent } : {}),
    });
  }
  return claimed;
}

/**
 * True while a same-session `continue_work` continuation is still pending for
 * the session — read by subagent cleanup to defer teardown so the wake can
 * re-enter the (kept-alive) session as a heartbeat turn (#952). A `queued` task
 * always pins (the durable election, possibly far-future `dueAt`); a `running`
 * task pins only within the post-dispatch handoff grace, after which the gate's
 * live-reply-run backstop owns a longer in-flight turn.
 */
export function hasPendingContinuationWork(sessionKey: string, now = Date.now()): boolean {
  for (const flow of listContinuationWorkFlows(sessionKey)) {
    if (flow.status === "queued") {
      return true;
    }
    if (flow.status !== "running") {
      continue;
    }
    const state = decodeState(flow);
    const dispatchedAt = state?.dispatchedAt ?? flow.updatedAt;
    if (now - dispatchedAt <= CONTINUATION_WORK_HANDOFF_GRACE_MS) {
      return true;
    }
  }
  return false;
}

/**
 * Soonest `dueAt` across the session's queued, not-yet-matured elections, used
 * by boot recovery to re-arm a hedge timer that fires the wake at maturity
 * (e.g. `continue_work(3600s)` elected before a restart still fires on time).
 */
export function peekSoonestUnmaturedContinuationWorkDueAt(
  sessionKey: string,
  now = Date.now(),
): number | undefined {
  let soonest: number | undefined;
  for (const flow of listContinuationWorkFlows(sessionKey)) {
    if (flow.status !== "queued") {
      continue;
    }
    const state = decodeState(flow);
    if (!state) {
      continue;
    }
    const at = dueAt(state);
    if (at <= now) {
      continue;
    }
    if (soonest === undefined || at < soonest) {
      soonest = at;
    }
  }
  return soonest;
}

/**
 * Delete the session's already-dispatched (`running`) elections.
 *
 * Used by boot recovery: a `running` task seen at startup is an orphan — the
 * process that fired its wake is gone, so the wake either already drove its turn
 * (and the chain advanced or ended) or was lost. Either way it must not be
 * re-fired (a re-fire would double-drive a turn / restart a finished chain), so
 * recovery purges it. `queued` elections are left untouched for re-arming.
 * Returns the number of orphaned `running` tasks purged.
 */
export function purgeOrphanedRunningContinuationWork(sessionKey: string): number {
  let purged = 0;
  for (const flow of listContinuationWorkFlows(sessionKey)) {
    if (flow.status !== "running") {
      continue;
    }
    deleteTaskFlowRecordById(flow.flowId);
    purged += 1;
  }
  return purged;
}

/** Session keys carrying a queued/running election, for boot-time replay. */
export function listPendingContinuationWorkSessionKeysForRecovery(): string[] {
  const sessionKeys = listTaskFlowRecords()
    .filter(
      (flow) =>
        isContinuationWorkFlow(flow) && (flow.status === "queued" || flow.status === "running"),
    )
    .map((flow) => flow.ownerKey);
  return [...new Set(sessionKeys)].toSorted();
}

/** Delete every `continuation_work` task for a session (upsert + final cleanup). */
export function cancelContinuationWork(sessionKey: string): void {
  for (const flow of listContinuationWorkFlows(sessionKey)) {
    deleteTaskFlowRecordById(flow.flowId);
  }
}
