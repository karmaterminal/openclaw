import { o as delayedContinuationReservationCount } from "./delegate-store-BKkoivDc.js";
import "./continuation-delegate-store-Dx7H-XP9.js";
//#region src/auto-reply/reply/continuation-state.ts
const continuationGenerations = /* @__PURE__ */ new Map();
const continuationTimerRefs = /* @__PURE__ */ new Map();
const continuationTimerHandles = /* @__PURE__ */ new Map();
const delegatePendingFlags = /* @__PURE__ */ new Map();
function setDelegatePending(sessionKey) {
	delegatePendingFlags.set(sessionKey, true);
}
function clearDelegatePending(sessionKey) {
	delegatePendingFlags.delete(sessionKey);
	bumpContinuationGeneration(sessionKey);
	maybeDropContinuationGeneration(sessionKey);
}
function clearDelegatePendingIfNoDelayedReservations(sessionKey) {
	if (delayedContinuationReservationCount(sessionKey) === 0) clearDelegatePending(sessionKey);
}
function currentContinuationGeneration(sessionKey) {
	return continuationGenerations.get(sessionKey) ?? 0;
}
function bumpContinuationGeneration(sessionKey) {
	const next = currentContinuationGeneration(sessionKey) + 1;
	continuationGenerations.set(sessionKey, next);
	return next;
}
function hasLiveContinuationTimerRefs(sessionKey) {
	return (continuationTimerRefs.get(sessionKey) ?? 0) > 0;
}
function maybeDropContinuationGeneration(sessionKey) {
	if (hasLiveContinuationTimerRefs(sessionKey)) return;
	if (delayedContinuationReservationCount(sessionKey) > 0) return;
	continuationGenerations.delete(sessionKey);
}
function retainContinuationTimerRef(sessionKey) {
	continuationTimerRefs.set(sessionKey, (continuationTimerRefs.get(sessionKey) ?? 0) + 1);
}
function releaseContinuationTimerRef(sessionKey) {
	const current = continuationTimerRefs.get(sessionKey) ?? 0;
	if (current <= 1) continuationTimerRefs.delete(sessionKey);
	else continuationTimerRefs.set(sessionKey, current - 1);
	maybeDropContinuationGeneration(sessionKey);
}
function registerContinuationTimerHandle(sessionKey, handle) {
	const existing = continuationTimerHandles.get(sessionKey);
	if (existing) {
		existing.add(handle);
		return;
	}
	continuationTimerHandles.set(sessionKey, new Set([handle]));
}
function unregisterContinuationTimerHandle(sessionKey, handle) {
	const existing = continuationTimerHandles.get(sessionKey);
	if (!existing?.delete(handle)) return false;
	if (existing.size === 0) continuationTimerHandles.delete(sessionKey);
	releaseContinuationTimerRef(sessionKey);
	return true;
}
function clearTrackedContinuationTimers(sessionKey) {
	const existing = continuationTimerHandles.get(sessionKey);
	if (!existing || existing.size === 0) return;
	continuationTimerHandles.delete(sessionKey);
	for (const handle of existing) {
		clearTimeout(handle);
		setTimeout(() => {
			releaseContinuationTimerRef(sessionKey);
		}, 0).unref();
	}
}
//#endregion
export { currentContinuationGeneration as a, releaseContinuationTimerRef as c, unregisterContinuationTimerHandle as d, clearTrackedContinuationTimers as i, retainContinuationTimerRef as l, clearDelegatePending as n, maybeDropContinuationGeneration as o, clearDelegatePendingIfNoDelayedReservations as r, registerContinuationTimerHandle as s, bumpContinuationGeneration as t, setDelegatePending as u };
