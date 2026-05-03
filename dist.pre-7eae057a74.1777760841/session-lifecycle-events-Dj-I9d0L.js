//#region src/agents/subagent-registry-spawn-runtime.ts
let countActiveRunsForSessionImpl;
let registerSubagentRunImpl;
function configureSubagentRegistrySpawnRuntime(params) {
	countActiveRunsForSessionImpl = params.countActiveRunsForSession;
	registerSubagentRunImpl = params.registerSubagentRun;
}
function countActiveRunsForSession(requesterSessionKey) {
	if (!countActiveRunsForSessionImpl) throw new Error("subagent registry spawn runtime is not configured before countActiveRunsForSession()");
	return countActiveRunsForSessionImpl(requesterSessionKey);
}
function registerSubagentRun(params) {
	if (!registerSubagentRunImpl) throw new Error("subagent registry spawn runtime is not configured before registerSubagentRun()");
	registerSubagentRunImpl(params);
}
//#endregion
//#region src/sessions/session-lifecycle-events.ts
const SESSION_LIFECYCLE_LISTENERS = /* @__PURE__ */ new Set();
function onSessionLifecycleEvent(listener) {
	SESSION_LIFECYCLE_LISTENERS.add(listener);
	return () => {
		SESSION_LIFECYCLE_LISTENERS.delete(listener);
	};
}
function emitSessionLifecycleEvent(event) {
	for (const listener of SESSION_LIFECYCLE_LISTENERS) try {
		listener(event);
	} catch {}
}
//#endregion
export { registerSubagentRun as a, countActiveRunsForSession as i, onSessionLifecycleEvent as n, configureSubagentRegistrySpawnRuntime as r, emitSessionLifecycleEvent as t };
