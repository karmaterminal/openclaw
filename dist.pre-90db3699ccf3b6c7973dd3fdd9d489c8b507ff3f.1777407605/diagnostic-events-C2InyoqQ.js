//#region src/infra/diagnostic-events.ts
function getDiagnosticEventsState() {
	const globalStore = globalThis;
	if (!globalStore.__openclawDiagnosticEventsState) globalStore.__openclawDiagnosticEventsState = {
		enabled: true,
		seq: 0,
		listeners: /* @__PURE__ */ new Set(),
		dispatchDepth: 0
	};
	return globalStore.__openclawDiagnosticEventsState;
}
function isDiagnosticsEnabled(config) {
	return config?.diagnostics?.enabled !== false;
}
function setDiagnosticsEnabledForProcess(enabled) {
	getDiagnosticEventsState().enabled = enabled;
}
function areDiagnosticsEnabledForProcess() {
	return getDiagnosticEventsState().enabled;
}
function emitDiagnosticEvent(event) {
	const state = getDiagnosticEventsState();
	if (!state.enabled) return;
	if (state.dispatchDepth > 100) {
		console.error(`[diagnostic-events] recursion guard tripped at depth=${state.dispatchDepth}, dropping type=${event.type}`);
		return;
	}
	const enriched = {
		...event,
		seq: state.seq += 1,
		ts: Date.now()
	};
	state.dispatchDepth += 1;
	for (const listener of state.listeners) try {
		listener(enriched);
	} catch (err) {
		const errorMessage = err instanceof Error ? err.stack ?? err.message : typeof err === "string" ? err : String(err);
		console.error(`[diagnostic-events] listener error type=${enriched.type} seq=${enriched.seq}: ${errorMessage}`);
	}
	state.dispatchDepth -= 1;
}
function onDiagnosticEvent(listener) {
	const state = getDiagnosticEventsState();
	state.listeners.add(listener);
	return () => {
		state.listeners.delete(listener);
	};
}
function resetDiagnosticEventsForTest() {
	const state = getDiagnosticEventsState();
	state.enabled = true;
	state.seq = 0;
	state.listeners.clear();
	state.dispatchDepth = 0;
}
//#endregion
export { resetDiagnosticEventsForTest as a, onDiagnosticEvent as i, emitDiagnosticEvent as n, setDiagnosticsEnabledForProcess as o, isDiagnosticsEnabled as r, areDiagnosticsEnabledForProcess as t };
