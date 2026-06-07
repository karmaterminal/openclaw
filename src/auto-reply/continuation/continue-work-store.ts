/**
 * Continuation work store — durable TaskFlow-backed `continue_work` elections.
 *
 * `continue_work` lets an agent elect to take ANOTHER turn in its OWN session,
 * now or after a delay. It was historically a VOLATILE `setTimeout` that fired
 * `requestHeartbeatNow` — lost on gateway restart, and (for a subagent spawned
 * by `continue_delegate`) silently dropped when the wake was never serviced or
 * the child session was torn down before it landed: hops 2+ never ran (#952).
 *
 * This store persists each election as a `continuation_work` TaskFlow task so it
 * (a) survives gateway restart — boot recovery replays it — and (b) gives
 * subagent cleanup a durable "a same-session continuation is still pending"
 * signal that keeps the child session alive until the elected turn has run.
 * Mirrors the `continuation_delegate` store, but the dispatch target is RE-ENTRY
 * of the SAME session (driven directly through the universal per-session turn
 * executor at the elected offset, decoupled from the heartbeat substrate — see
 * continue-work-dispatch.ts), NOT a new `spawnSubagentDirect` child.
 *
 * Lifecycle is intentionally QUEUED-ONLY (no transient "claimed/running" state
 * that could orphan): the election stays `queued` from enqueue until its turn
 * actually RUNS, at which point dispatch deletes it. So a busy session, a
 * crash, or a restart mid-dispatch can never silently drop the election — it is
 * always either durably queued (re-driven by boot recovery) or already run.
 *   queued     election pending; pins the session and is re-driven by recovery.
 *   (deleted)  the turn ran (or the election was superseded by a re-election's
 *              upsert, cancelled by cleanup, or given up after a loud failure).
 *
 * RFC: docs/design/continue-work-signal-v2.md §2.3/§3.1 (durable continue_work).
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
} from "../../tasks/task-flow-runtime-internal.js";

const log = createSubsystemLogger("continuation/continue-work-store");

export const CONTINUATION_WORK_CONTROLLER_ID = "core/continuation-work";

const ContinuationWorkStateSchema = z.object({
  kind: z.literal("continuation_work"),
  hop: z.number().int().positive(),
  delayMs: z.number().int().nonnegative().optional(),
  electedAt: z.number().int().nonnegative(),
  reason: z.string().optional(),
  traceparent: z.string().optional(),
});

type ContinuationWorkState = z.infer<typeof ContinuationWorkStateSchema>;

export type ClaimedContinuationWork = {
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
 * finalizes the prior election, so a session never accumulates stale rows.
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
 * Return the session's matured `queued` elections to drive — WITHOUT mutating
 * them. The election stays queued (durable, restart-safe, session-pinning)
 * until `finalizeDispatchedContinuationWork` deletes it once its turn has run.
 * Peeking (not claiming-to-running) is what makes the dispatch lossless: a busy
 * retry or a crash mid-drive leaves the election durably queued, so recovery
 * re-drives it instead of finding an orphaned half-consumed task (#952).
 */
export function claimMaturedContinuationWork(
  sessionKey: string,
  options: { now?: number } = {},
): ClaimedContinuationWork[] {
  const now = options.now ?? Date.now();
  const matured: ClaimedContinuationWork[] = [];
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
    matured.push({
      flowId: flow.flowId,
      hop: state.hop,
      ...(state.reason ? { reason: state.reason } : {}),
      ...(state.traceparent ? { traceparent: state.traceparent } : {}),
    });
  }
  return matured;
}

/**
 * Delete a dispatched election once its turn has run (or it is being given up).
 * Idempotent and keyed by `flowId`: a re-election (upsert) or cleanup cancel
 * replaces the row with a new `flowId`, so finalizing the old id is a safe
 * no-op and never deletes a fresh election.
 */
export function finalizeDispatchedContinuationWork(flowId: string): void {
  deleteTaskFlowRecordById(flowId);
}

/**
 * True while a same-session `continue_work` continuation is still pending for
 * the session — read by subagent cleanup to defer teardown so the elected turn
 * can re-enter the (kept-alive) session (#952). Any `queued` election pins:
 * the election stays queued across the elected delay, the dispatch, busy
 * retries, and (on restart) until recovery re-drives and finalizes it.
 */
export function hasPendingContinuationWork(sessionKey: string): boolean {
  return listContinuationWorkFlows(sessionKey).some((flow) => flow.status === "queued");
}

/**
 * Soonest `dueAt` across the session's queued, not-yet-matured elections, used
 * by boot recovery to re-arm a hedge timer that fires the turn at maturity
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

/** Session keys carrying a queued election, for boot-time replay. */
export function listPendingContinuationWorkSessionKeysForRecovery(): string[] {
  const sessionKeys = listTaskFlowRecords()
    .filter((flow) => isContinuationWorkFlow(flow) && flow.status === "queued")
    .map((flow) => flow.ownerKey);
  return [...new Set(sessionKeys)].toSorted();
}

/** Delete every `continuation_work` task for a session (upsert + final cleanup). */
export function cancelContinuationWork(sessionKey: string): void {
  for (const flow of listContinuationWorkFlows(sessionKey)) {
    deleteTaskFlowRecordById(flow.flowId);
  }
}
