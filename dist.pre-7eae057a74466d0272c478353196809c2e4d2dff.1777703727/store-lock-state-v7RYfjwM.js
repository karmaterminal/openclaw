import { t as clearSessionStoreCaches } from "./store-cache-BlX9FKkX.js";
//#region src/config/sessions/store-lock-state.ts
const LOCK_QUEUES = /* @__PURE__ */ new Map();
function clearSessionStoreCacheForTest() {
	clearSessionStoreCaches();
	for (const queue of LOCK_QUEUES.values()) for (const task of queue.pending) task.reject(/* @__PURE__ */ new Error("session store queue cleared for test"));
	LOCK_QUEUES.clear();
}
async function drainSessionStoreLockQueuesForTest() {
	while (LOCK_QUEUES.size > 0) {
		const queues = [...LOCK_QUEUES.values()];
		for (const queue of queues) {
			for (const task of queue.pending) task.reject(/* @__PURE__ */ new Error("session store queue cleared for test"));
			queue.pending.length = 0;
		}
		const activeDrains = queues.flatMap((queue) => queue.drainPromise ? [queue.drainPromise] : []);
		if (activeDrains.length === 0) {
			LOCK_QUEUES.clear();
			return;
		}
		await Promise.allSettled(activeDrains);
	}
}
function getSessionStoreLockQueueSizeForTest() {
	return LOCK_QUEUES.size;
}
//#endregion
export { getSessionStoreLockQueueSizeForTest as i, clearSessionStoreCacheForTest as n, drainSessionStoreLockQueuesForTest as r, LOCK_QUEUES as t };
