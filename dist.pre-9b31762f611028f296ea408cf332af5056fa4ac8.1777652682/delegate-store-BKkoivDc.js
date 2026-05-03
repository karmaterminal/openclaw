import { t as createSubsystemLogger } from "./subsystem-DRUx3zf3.js";
import { i as failFlow, o as finishFlow, r as deleteTaskFlowRecordById, t as createManagedTaskFlow, u as listTaskFlowsForOwnerKey } from "./task-flow-runtime-internal-Cipn47SX.js";
import { z } from "zod";
//#region src/auto-reply/continuation/delegate-store.ts
/**
* Continuation delegate store — pure TaskFlow-backed.
*
* Every delegate operation goes through TaskFlow (SQLite persistence).
* Zero volatile Maps. Delegates survive gateway restarts by design.
*
* Adds Zod validation on state payloads, a `releasedAt` audit trail, and
* `failFlow` for corrupt records on top of the base TaskFlow store.
*
* RFC: docs/design/continue-work-signal-v2.md §5.4
*/
const log = createSubsystemLogger("continuation/delegate-store");
const CONTINUATION_DELEGATE_CONTROLLER_ID = "core/continuation-delegate";
const CONTINUATION_POST_COMPACTION_CONTROLLER_ID = "core/continuation-post-compaction";
const PendingDelegateStateSchema = z.object({
	kind: z.literal("continuation_delegate"),
	task: z.string().min(1),
	delayMs: z.number().int().nonnegative().optional(),
	silent: z.boolean().optional(),
	silentWake: z.boolean().optional(),
	postCompaction: z.boolean().optional()
});
function buildDelegateGoal(delegate) {
	const task = delegate.task.trim();
	const isPostCompaction = delegate.mode === "post-compaction";
	if (!task) return isPostCompaction ? "Post-compaction continuation delegate" : "Continuation delegate";
	const excerpt = task.length > 80 ? `${task.slice(0, 77)}...` : task;
	return isPostCompaction ? `Post-compaction delegate: ${excerpt}` : `Continuation delegate: ${excerpt}`;
}
function buildDelegateState(delegate) {
	return {
		kind: "continuation_delegate",
		task: delegate.task,
		...delegate.delayMs !== void 0 ? { delayMs: delegate.delayMs } : {},
		...delegate.mode === "silent" ? { silent: true } : {},
		...delegate.mode === "silent-wake" ? { silentWake: true } : {},
		...delegate.mode === "post-compaction" ? { postCompaction: true } : {}
	};
}
function isPendingDelegateFlow(flow) {
	return flow.syncMode === "managed" && flow.controllerId === "core/continuation-delegate";
}
function isPostCompactionDelegateFlow(flow) {
	return flow.syncMode === "managed" && flow.controllerId === "core/continuation-post-compaction";
}
function listQueuedPendingFlows(sessionKey) {
	return listTaskFlowsForOwnerKey(sessionKey).filter((flow) => isPendingDelegateFlow(flow) && flow.status === "queued").toSorted((a, b) => a.createdAt - b.createdAt);
}
function listQueuedPostCompactionFlows(sessionKey) {
	return listTaskFlowsForOwnerKey(sessionKey).filter((flow) => isPostCompactionDelegateFlow(flow) && flow.status === "queued").toSorted((a, b) => a.createdAt - b.createdAt);
}
function decodeDelegateState(flow) {
	const parsed = PendingDelegateStateSchema.safeParse(flow.stateJson);
	return parsed.success ? parsed.data : void 0;
}
function flowToDelegate(flow, state) {
	let mode;
	if (state.postCompaction === true) mode = "post-compaction";
	else if (state.silentWake === true) mode = "silent-wake";
	else if (state.silent === true) mode = "silent";
	return {
		task: state.task,
		...state.delayMs !== void 0 ? { delayMs: state.delayMs } : {},
		...mode !== void 0 ? { mode } : {}
	};
}
/**
* Enqueue a delegate from the `continue_delegate` tool.
*/
function enqueuePendingDelegate(sessionKey, delegate) {
	const isPostCompaction = delegate.mode === "post-compaction";
	createManagedTaskFlow({
		ownerKey: sessionKey,
		controllerId: isPostCompaction ? CONTINUATION_POST_COMPACTION_CONTROLLER_ID : CONTINUATION_DELEGATE_CONTROLLER_ID,
		notifyPolicy: "silent",
		goal: buildDelegateGoal(delegate),
		currentStep: isPostCompaction ? "Staged for release after compaction" : "Queued for continuation dispatch",
		stateJson: buildDelegateState(delegate)
	});
}
/**
* Consume pending delegates for a session whose `delayMs` horizon has matured.
*
* Filters by `Date.now() >= flow.createdAt + (state.delayMs ?? 0)`. Matured
* entries are finished with the `releasedAt` audit trail and returned in FIFO
* order. Unmatured entries are left in `queued` state to be re-checked on the
* next consume cycle (filter-at-consume; preserves `mode=silent` no-wake
* semantics so a quiet-channel session is not woken solely to drain a delegate
* whose horizon has not yet matured).
*
* Skips corrupt payloads via `failFlow`. Only pushes delegates where
* `finishFlow` was applied (concurrency-safe).
*
* Callers that need to know when to retry the consume cycle in a quiet channel
* should call `peekSoonestUnmaturedDelegateDueAt(sessionKey)` immediately after
* this returns. Pairing avoids a separate query path.
*/
function consumePendingDelegates(sessionKey) {
	const delegates = [];
	const now = Date.now();
	for (const flow of listQueuedPendingFlows(sessionKey)) {
		const state = decodeDelegateState(flow);
		if (!state) {
			log.warn(`[continuation:delegate-decode-failed] flowId=${flow.flowId} session=${sessionKey} raw=${JSON.stringify(flow.stateJson).slice(0, 200)}`);
			failFlow({
				flowId: flow.flowId,
				expectedRevision: flow.revision,
				currentStep: "Rejected invalid continuation payload",
				blockedSummary: "Pending continuation delegate payload could not be decoded."
			});
			continue;
		}
		if (now < flow.createdAt + (state.delayMs ?? 0)) continue;
		if (!finishFlow({
			flowId: flow.flowId,
			expectedRevision: flow.revision,
			currentStep: "Released to continuation scheduler",
			stateJson: {
				...state,
				releasedAt: Date.now()
			}
		}).applied) continue;
		delegates.push(flowToDelegate(flow, state));
	}
	return delegates;
}
/**
* Peek the soonest `dueAt` (createdAt + delayMs) across queued, unmatured
* pending delegates for a session.
*
* Returns `undefined` if there are no unmatured entries. Used by
* `dispatchToolDelegates` to arm a hedge `setTimeout` so unmatured entries
* still fire in fully-quiet channels where no further response-finalize
* arrives.
*/
function peekSoonestUnmaturedDelegateDueAt(sessionKey) {
	const now = Date.now();
	let soonest;
	for (const flow of listQueuedPendingFlows(sessionKey)) {
		const state = decodeDelegateState(flow);
		if (!state) continue;
		const dueAt = flow.createdAt + (state.delayMs ?? 0);
		if (dueAt <= now) continue;
		if (soonest === void 0 || dueAt < soonest) soonest = dueAt;
	}
	return soonest;
}
/**
* Count pending delegates without consuming them.
*/
function pendingDelegateCount(sessionKey) {
	return listQueuedPendingFlows(sessionKey).length;
}
/**
* Cancel all pending delegates for a session (both regular and post-compaction).
*/
function cancelPendingDelegates(sessionKey) {
	for (const flow of listTaskFlowsForOwnerKey(sessionKey).filter((f) => isPendingDelegateFlow(f) || isPostCompactionDelegateFlow(f))) deleteTaskFlowRecordById(flow.flowId);
}
/**
* Stage a delegate for release after compaction.
*/
function stagePostCompactionDelegate(sessionKey, delegate) {
	enqueuePendingDelegate(sessionKey, {
		task: delegate.task,
		mode: "post-compaction"
	});
}
/**
* Consume staged post-compaction delegates. Same lifecycle as consumePendingDelegates.
*/
function consumeStagedPostCompactionDelegates(sessionKey) {
	const delegates = [];
	for (const flow of listQueuedPostCompactionFlows(sessionKey)) {
		const state = decodeDelegateState(flow);
		if (!state) {
			log.warn(`[continuation:post-compaction-decode-failed] flowId=${flow.flowId} session=${sessionKey} raw=${JSON.stringify(flow.stateJson).slice(0, 200)}`);
			failFlow({
				flowId: flow.flowId,
				expectedRevision: flow.revision,
				currentStep: "Rejected invalid post-compaction payload",
				blockedSummary: "Staged post-compaction delegate payload could not be decoded."
			});
			continue;
		}
		if (!finishFlow({
			flowId: flow.flowId,
			expectedRevision: flow.revision,
			currentStep: "Released after compaction",
			stateJson: {
				...state,
				releasedAt: Date.now()
			}
		}).applied) continue;
		delegates.push(flowToDelegate(flow, state));
	}
	return delegates;
}
function stagedPostCompactionDelegateCount(sessionKey) {
	return listQueuedPostCompactionFlows(sessionKey).length;
}
const delayedReservations = /* @__PURE__ */ new Map();
function addDelayedContinuationReservation(sessionKey, reservation) {
	const existing = delayedReservations.get(sessionKey);
	if (existing) existing.push(reservation);
	else delayedReservations.set(sessionKey, [reservation]);
}
function takeDelayedContinuationReservation(sessionKey, reservationId) {
	const list = delayedReservations.get(sessionKey);
	if (!list) return null;
	const idx = list.findIndex((r) => r.id === reservationId);
	if (idx === -1) return null;
	const [reservation] = list.splice(idx, 1);
	if (list.length === 0) delayedReservations.delete(sessionKey);
	return reservation;
}
function delayedContinuationReservationCount(sessionKey) {
	return delayedReservations.get(sessionKey)?.length ?? 0;
}
function highestDelayedContinuationReservationHop(sessionKey) {
	const list = delayedReservations.get(sessionKey);
	if (!list || list.length === 0) return 0;
	return Math.max(...list.map((r) => r.plannedHop));
}
function clearDelayedContinuationReservations(sessionKey) {
	delayedReservations.delete(sessionKey);
}
//#endregion
export { consumeStagedPostCompactionDelegates as a, highestDelayedContinuationReservationHop as c, stagePostCompactionDelegate as d, stagedPostCompactionDelegateCount as f, consumePendingDelegates as i, peekSoonestUnmaturedDelegateDueAt as l, cancelPendingDelegates as n, delayedContinuationReservationCount as o, takeDelayedContinuationReservation as p, clearDelayedContinuationReservations as r, enqueuePendingDelegate as s, addDelayedContinuationReservation as t, pendingDelegateCount as u };
