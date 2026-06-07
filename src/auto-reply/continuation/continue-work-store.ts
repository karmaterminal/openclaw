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
 * (a) survives gateway restart — boot recovery replays it — and (b) gives
 * subagent cleanup a durable "a same-session continuation is still pending"
 * signal that keeps the child session alive until the elected turn has run.
 * Mirrors the `continuation_delegate` store, but the dispatch target is RE-ENTRY
 * of the SAME session (a heartbeat wake), NOT a new `spawnSubagentDirect` child.
 *
 * Lifecycle — one task per session; `enqueueContinuationWork` upserts:
 *   queued   election recorded; pins the session until `dueAt = electedAt +
 *            delayMs` and its wake has been dispatched. Survives restart.
 *   running  wake dispatched (`requestHeartbeatNow` fired); the re-entered turn
 *            is in flight. Pins the session through the dispatch→turn handoff
 *            window (bounded by `CONTINUATION_WORK_HANDOFF_GRACE_MS`); a live
 *            reply run on the session is the longer-turn backstop in the gate.
 *   deleted  released by the next election's upsert or by session cleanup.
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

// How long a `running` (dispatched, wake-in-flight) task keeps pinning the
// session after dispatch when no reply run has registered active yet. It only
// needs to cover the `requestHeartbeatNow` coalesce + heartbeat re-entry
// startup window (sub-second to a few seconds); a longer in-flight turn is held
// by the live-reply-run backstop in the subagent cleanup gate, not by this
// grace. Generous so a momentarily-busy gateway cannot strand the handoff and
// reopen #952, yet bounded so a dropped wake cannot pin a child session
// forever.
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
 * delete the child session and strand the next hop — #952).
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
 * Claim matured elections for a session and mark them `running` (dispatched).
 *
 * `queued` tasks whose `dueAt` has passed are claimed → `running` so the gate
 * keeps pinning the session across the dispatch→re-entry handoff. With
 * `includeRunning` (boot recovery), already-`running` tasks are re-claimed too:
 * a wake dispatched before a crash never re-entered, so it must be re-fired.
 * Returns the elections whose claim was applied so the caller fires exactly one
 * `requestHeartbeatNow` per claim (concurrency-safe via expected-revision CAS).
 */
export function consumeMaturedContinuationWork(
  sessionKey: string,
  options: { now?: number; includeRunning?: boolean } = {},
): PendingContinuationWork[] {
  const now = options.now ?? Date.now();
  const claimed: PendingContinuationWork[] = [];
  for (const flow of listContinuationWorkFlows(sessionKey)) {
    const isQueuedMatured = flow.status === "queued";
    const isRunningRecoverable = options.includeRunning === true && flow.status === "running";
    if (!isQueuedMatured && !isRunningRecoverable) {
      continue;
    }
    const state = decodeState(flow);
    if (!state) {
      log.warn(
        `[continuation:work-decode-failed] flowId=${flow.flowId} session=${sessionKey} raw=${JSON.stringify(flow.stateJson).slice(0, 200)}`,
      );
      failFlow({
        flowId: flow.flowId,
        expectedRevision: flow.revision,
        currentStep: "Rejected invalid continuation_work payload",
        blockedSummary: "Pending continuation_work payload could not be decoded.",
      });
      continue;
    }
    if (isQueuedMatured && now < dueAt(state)) {
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
