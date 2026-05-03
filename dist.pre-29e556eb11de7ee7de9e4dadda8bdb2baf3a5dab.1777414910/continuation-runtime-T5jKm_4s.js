import { a as loadConfig } from "./io-Cs-0dhMf.js";
import "./config-DaTMB1pm.js";
//#region src/auto-reply/reply/continuation-runtime.ts
const DEFAULT_CONTINUATION_DELAY_MS = 15e3;
const DEFAULT_CONTINUATION_MIN_DELAY_MS = 5e3;
const DEFAULT_CONTINUATION_MAX_DELAY_MS = 3e5;
const DEFAULT_CONTINUATION_MAX_CHAIN_LENGTH = 10;
const DEFAULT_CONTINUATION_COST_CAP_TOKENS = 5e5;
const DEFAULT_CONTINUATION_MAX_DELEGATES_PER_TURN = 5;
function clampPositiveInt(value, fallback) {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
	return Math.max(1, Math.trunc(value));
}
function clampNonNegativeDelayMs(value, fallback) {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return fallback;
	return Math.max(0, Math.trunc(value));
}
function clampNonNegativeInt(value, fallback) {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return fallback;
	return Math.max(0, Math.trunc(value));
}
function clampOptionalUnitInterval(value) {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1) return;
	return value;
}
function resolveContinuationRuntimeConfig(cfg = loadConfig()) {
	const continuation = cfg.agents?.defaults?.continuation;
	return {
		enabled: continuation?.enabled === true,
		taskFlowDelegates: continuation?.taskFlowDelegates === true,
		defaultDelayMs: clampNonNegativeDelayMs(continuation?.defaultDelayMs, DEFAULT_CONTINUATION_DELAY_MS),
		minDelayMs: clampNonNegativeDelayMs(continuation?.minDelayMs, DEFAULT_CONTINUATION_MIN_DELAY_MS),
		maxDelayMs: clampNonNegativeDelayMs(continuation?.maxDelayMs, DEFAULT_CONTINUATION_MAX_DELAY_MS),
		maxChainLength: clampPositiveInt(continuation?.maxChainLength, DEFAULT_CONTINUATION_MAX_CHAIN_LENGTH),
		costCapTokens: clampNonNegativeInt(continuation?.costCapTokens, DEFAULT_CONTINUATION_COST_CAP_TOKENS),
		maxDelegatesPerTurn: clampPositiveInt(continuation?.maxDelegatesPerTurn, DEFAULT_CONTINUATION_MAX_DELEGATES_PER_TURN),
		contextPressureThreshold: clampOptionalUnitInterval(continuation?.contextPressureThreshold)
	};
}
function resolveMaxDelegatesPerTurn(cfg = loadConfig()) {
	return resolveContinuationRuntimeConfig(cfg).maxDelegatesPerTurn;
}
//#endregion
export { resolveMaxDelegatesPerTurn as n, resolveContinuationRuntimeConfig as t };
