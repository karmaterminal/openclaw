//#region src/agents/agent-runtime-policy.ts
function resolveAgentRuntimePolicy(container) {
	const preferred = container?.agentRuntime;
	if (hasAgentRuntimePolicy(preferred)) return preferred;
}
function hasAgentRuntimePolicy(value) {
	return Boolean(value?.id?.trim() || value?.fallback);
}
//#endregion
//#region src/secrets/channel-env-var-names.ts
const UNSAFE_CHANNEL_ENV_VAR_TRIGGER_NAMES = new Set([
	"CI",
	"HOME",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"LOGNAME",
	"NODE_ENV",
	"OLDPWD",
	"PATH",
	"PWD",
	"SHELL",
	"SSH_AUTH_SOCK",
	"TEMP",
	"TERM",
	"TMP",
	"TMPDIR",
	"USER"
]);
function isSafeChannelEnvVarTriggerName(key) {
	const normalized = key.trim().toUpperCase();
	return /^[A-Z][A-Z0-9_]*$/.test(normalized) && !UNSAFE_CHANNEL_ENV_VAR_TRIGGER_NAMES.has(normalized);
}
//#endregion
export { resolveAgentRuntimePolicy as n, isSafeChannelEnvVarTriggerName as t };
