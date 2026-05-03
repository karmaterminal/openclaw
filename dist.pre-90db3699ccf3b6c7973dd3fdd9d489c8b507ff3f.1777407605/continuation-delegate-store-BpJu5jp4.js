import { d as requestFlowCancel, g as updateFlowRecordByIdExpectedRevision, o as finishFlow, t as createManagedTaskFlow, u as listTaskFlowsForOwnerKey } from "./task-flow-runtime-internal-rBVJ7RDQ.js";
//#region src/auto-reply/continuation-delegate-store-taskflow.ts
const CONTROLLER_ID = "core/continuation-delegate";
function delegateToStateJson(delegate) {
	const state = { task: delegate.task };
	if (delegate.delayMs != null) state.delayMs = delegate.delayMs;
	if (delegate.silent != null) state.silent = delegate.silent;
	if (delegate.silentWake != null) state.silentWake = delegate.silentWake;
	return state;
}
function flowToDelegate(flow) {
	const state = flow.stateJson ?? {};
	const delegate = { task: typeof state.task === "string" ? state.task : flow.goal };
	if (typeof state.delayMs === "number") delegate.delayMs = state.delayMs;
	if (typeof state.silent === "boolean") delegate.silent = state.silent;
	if (typeof state.silentWake === "boolean") delegate.silentWake = state.silentWake;
	return delegate;
}
function listPendingFlows(sessionKey) {
	return listTaskFlowsForOwnerKey(sessionKey).filter((f) => f.controllerId === CONTROLLER_ID && f.status === "queued").toSorted((a, b) => a.createdAt - b.createdAt);
}
/**
* Enqueue a pending delegate as a TaskFlow record.
*/
function taskFlowEnqueuePendingDelegate(sessionKey, delegate) {
	createManagedTaskFlow({
		ownerKey: sessionKey,
		controllerId: CONTROLLER_ID,
		goal: delegate.task,
		stateJson: delegateToStateJson(delegate),
		status: "queued"
	});
}
/**
* Consume (drain) all pending delegates for a session.
* Returns delegates in FIFO order and transitions backing flow records
* from "queued" → "succeeded" (proper lifecycle, not delete).
*
* Collect-then-cleanup: delegates are converted first so callers always
* receive them even if finishFlow() fails for some records.
*/
function taskFlowConsumePendingDelegates(sessionKey) {
	const flows = listPendingFlows(sessionKey);
	const delegates = flows.map((flow) => flowToDelegate(flow));
	for (const flow of flows) try {
		finishFlow({
			flowId: flow.flowId,
			expectedRevision: flow.revision
		});
	} catch (err) {
		console.warn(`[continuation-delegate] finishFlow failed for flowId=${flow.flowId}: ${err instanceof Error ? err.message : String(err)}`);
	}
	return delegates;
}
/**
* Count of pending delegates for a session without consuming them.
*/
function taskFlowPendingDelegateCount(sessionKey) {
	return listPendingFlows(sessionKey).length;
}
/**
* Cancel all pending TaskFlow delegates for a session.
* Called when an external message arrives or a session is reset.
* Records persist with cancelled status for audit trail.
*/
function taskFlowCancelPendingDelegates(sessionKey) {
	const flows = listPendingFlows(sessionKey);
	for (const flow of flows) {
		const cancelResult = requestFlowCancel({
			flowId: flow.flowId,
			expectedRevision: flow.revision
		});
		if (cancelResult.applied) updateFlowRecordByIdExpectedRevision({
			flowId: flow.flowId,
			expectedRevision: cancelResult.flow.revision,
			patch: {
				status: "cancelled",
				endedAt: Date.now()
			}
		});
	}
}
//#endregion
//#region src/auto-reply/continuation-delegate-store.ts
/**
* Module-level store for `continue_delegate` tool calls.
*
* The tool writes pending delegates here during execution. After the agent's
* response finalizes, `agent-runner.ts` reads and consumes them, feeding them
* into the same continuation scheduler that bracket-parsed signals use.
*
* This is the "tool writes → runner reads" pattern. Precedent:
* `sessions_spawn` writes to the sub-agent registry during its tool call,
* and the runner reads completion events later. Same topology.
*
* The store is keyed by session key. Multiple delegates per turn are supported
* (the tool can be called N times in one turn). The runner consumes all pending
* delegates after the run completes.
*
* When `taskFlowDelegates` is enabled, pending delegates are backed by the
* Task Flow registry (SQLite persistence). Otherwise, the volatile in-memory
* Map is used (default).
*/
let taskFlowDelegatesEnabled = false;
/**
* Enable or disable the Task Flow-backed delegate store.
* Called by agent-runner at startup based on
* `agents.defaults.continuation.taskFlowDelegates`.
*/
function setTaskFlowDelegatesEnabled(enabled) {
	taskFlowDelegatesEnabled = enabled;
}
const pendingDelegates = /* @__PURE__ */ new Map();
const delayedReservations = /* @__PURE__ */ new Map();
/**
* Called by the `continue_delegate` tool during execution.
* Appends a delegate to the pending list for the session.
*/
function enqueuePendingDelegate(sessionKey, delegate) {
	if (taskFlowDelegatesEnabled) {
		taskFlowEnqueuePendingDelegate(sessionKey, delegate);
		return;
	}
	const existing = pendingDelegates.get(sessionKey) ?? [];
	existing.push(delegate);
	pendingDelegates.set(sessionKey, existing);
}
/**
* Called by `agent-runner.ts` after the run completes.
* Returns and removes all pending delegates for the session.
* Returns an empty array if none are pending.
*/
function consumePendingDelegates(sessionKey) {
	if (taskFlowDelegatesEnabled) return taskFlowConsumePendingDelegates(sessionKey);
	const delegates = pendingDelegates.get(sessionKey) ?? [];
	pendingDelegates.delete(sessionKey);
	return delegates;
}
/**
* Returns the count of pending delegates for a session without consuming them.
* Used by the tool to report chain position in its return value.
*/
function pendingDelegateCount(sessionKey) {
	if (taskFlowDelegatesEnabled) return taskFlowPendingDelegateCount(sessionKey);
	return pendingDelegates.get(sessionKey)?.length ?? 0;
}
/**
* Cancel and remove all pending delegates for a session.
* For the volatile store this is a no-op (delegates are turn-local).
* For the Task Flow store this cancels and deletes the flow records.
*/
function cancelPendingDelegates(sessionKey) {
	if (taskFlowDelegatesEnabled) {
		taskFlowCancelPendingDelegates(sessionKey);
		return;
	}
	pendingDelegates.delete(sessionKey);
}
function addDelayedContinuationReservation(sessionKey, reservation) {
	const existing = delayedReservations.get(sessionKey) ?? [];
	existing.push(reservation);
	delayedReservations.set(sessionKey, existing);
}
function delayedContinuationReservationCount(sessionKey) {
	return delayedReservations.get(sessionKey)?.length ?? 0;
}
function highestDelayedContinuationReservationHop(sessionKey) {
	const reservations = delayedReservations.get(sessionKey);
	if (!reservations || reservations.length === 0) return 0;
	let highestHop = 0;
	for (const reservation of reservations) if (reservation.plannedHop > highestHop) highestHop = reservation.plannedHop;
	return highestHop;
}
function takeDelayedContinuationReservation(sessionKey, reservationId) {
	const existing = delayedReservations.get(sessionKey);
	if (!existing || existing.length === 0) return;
	const idx = existing.findIndex((reservation) => reservation.id === reservationId);
	if (idx < 0) return;
	const [removed] = existing.splice(idx, 1);
	if (existing.length === 0) delayedReservations.delete(sessionKey);
	return removed;
}
function clearDelayedContinuationReservations(sessionKey) {
	delayedReservations.delete(sessionKey);
}
const stagedPostCompactionDelegates = /* @__PURE__ */ new Map();
function stagePostCompactionDelegate(sessionKey, delegate) {
	const existing = stagedPostCompactionDelegates.get(sessionKey) ?? [];
	existing.push(delegate);
	stagedPostCompactionDelegates.set(sessionKey, existing);
}
function consumeStagedPostCompactionDelegates(sessionKey) {
	const delegates = stagedPostCompactionDelegates.get(sessionKey) ?? [];
	stagedPostCompactionDelegates.delete(sessionKey);
	return delegates;
}
function stagedPostCompactionDelegateCount(sessionKey) {
	return stagedPostCompactionDelegates.get(sessionKey)?.length ?? 0;
}
//#endregion
export { consumeStagedPostCompactionDelegates as a, highestDelayedContinuationReservationHop as c, stagePostCompactionDelegate as d, stagedPostCompactionDelegateCount as f, consumePendingDelegates as i, pendingDelegateCount as l, cancelPendingDelegates as n, delayedContinuationReservationCount as o, takeDelayedContinuationReservation as p, clearDelayedContinuationReservations as r, enqueuePendingDelegate as s, addDelayedContinuationReservation as t, setTaskFlowDelegatesEnabled as u };
