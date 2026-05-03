import { n as createIsolatedCodexAppServerClient, r as getSharedCodexAppServerClient } from "./shared-client-C5M1Nphx.js";
//#region extensions/codex/src/app-server/models.ts
async function listCodexAppServerModels(options = {}) {
	const timeoutMs = options.timeoutMs ?? 2500;
	const useSharedClient = options.sharedClient !== false;
	const client = useSharedClient ? await getSharedCodexAppServerClient({
		startOptions: options.startOptions,
		timeoutMs,
		authProfileId: options.authProfileId
	}) : await createIsolatedCodexAppServerClient({
		startOptions: options.startOptions,
		timeoutMs,
		authProfileId: options.authProfileId
	});
	try {
		return readModelListResult(await client.request("model/list", {
			limit: options.limit ?? null,
			cursor: options.cursor ?? null,
			includeHidden: options.includeHidden ?? null
		}, { timeoutMs }));
	} finally {
		if (!useSharedClient) client.close();
	}
}
function readModelListResult(value) {
	if (!isJsonObjectValue(value) || !Array.isArray(value.data)) return { models: [] };
	const models = value.data.map((entry) => readCodexModel(entry)).filter((entry) => entry !== void 0);
	const nextCursor = typeof value.nextCursor === "string" ? value.nextCursor : void 0;
	return {
		models,
		...nextCursor ? { nextCursor } : {}
	};
}
function readCodexModel(value) {
	if (!isJsonObjectValue(value)) return;
	const id = readNonEmptyString(value.id);
	const model = readNonEmptyString(value.model) ?? id;
	if (!id || !model) return;
	return {
		id,
		model,
		...readNonEmptyString(value.displayName) ? { displayName: readNonEmptyString(value.displayName) } : {},
		...readNonEmptyString(value.description) ? { description: readNonEmptyString(value.description) } : {},
		...typeof value.hidden === "boolean" ? { hidden: value.hidden } : {},
		...typeof value.isDefault === "boolean" ? { isDefault: value.isDefault } : {},
		inputModalities: readStringArray(value.inputModalities),
		supportedReasoningEfforts: readReasoningEfforts(value.supportedReasoningEfforts),
		...readNonEmptyString(value.defaultReasoningEffort) ? { defaultReasoningEffort: readNonEmptyString(value.defaultReasoningEffort) } : {}
	};
}
function readReasoningEfforts(value) {
	if (!Array.isArray(value)) return [];
	const efforts = value.map((entry) => {
		if (!isJsonObjectValue(entry)) return;
		return readNonEmptyString(entry.reasoningEffort);
	}).filter((entry) => entry !== void 0);
	return [...new Set(efforts)];
}
function readStringArray(value) {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map((entry) => readNonEmptyString(entry)).filter((entry) => entry !== void 0))];
}
function readNonEmptyString(value) {
	if (typeof value !== "string") return;
	return value.trim() || void 0;
}
function isJsonObjectValue(value) {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
//#endregion
export { listCodexAppServerModels };
