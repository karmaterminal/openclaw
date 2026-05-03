import { c as normalizeOptionalString } from "./string-coerce-CjxCKZ6B.js";
import { r as normalizeProviderId } from "./provider-id-ZTkpwCTd.js";
import { _ as resolveModelRefFromString, x as modelKey } from "./model-selection-cli-BCNxTSmc.js";
import { t as buildAllowedModelSet } from "./model-selection-B7RNWcLj.js";
import { r as loadModelCatalog } from "./model-catalog-CyQ5zC3m.js";
import { o as updateSessionStore, u as resolveSessionStoreEntry } from "./store-COeaE7A7.js";
import "./sessions-THKm0e_w.js";
import { t as applyModelOverrideToSessionEntry } from "./model-overrides-e8ISaSUe.js";
import { i as resolveModelDirectiveSelection } from "./model-selection-5LC_vubr.js";
//#region src/auto-reply/reply/session-reset-model.ts
function splitBody(body) {
	const tokens = body.split(/\s+/).filter(Boolean);
	return {
		tokens,
		first: tokens[0],
		second: tokens[1],
		rest: tokens.slice(2)
	};
}
function buildSelectionFromExplicit(params) {
	const resolved = resolveModelRefFromString({
		raw: params.raw,
		defaultProvider: params.defaultProvider,
		aliasIndex: params.aliasIndex
	});
	if (!resolved) return;
	const key = modelKey(resolved.ref.provider, resolved.ref.model);
	if (params.allowedModelKeys.size > 0 && !params.allowedModelKeys.has(key)) return;
	const isDefault = resolved.ref.provider === params.defaultProvider && resolved.ref.model === params.defaultModel;
	return {
		provider: resolved.ref.provider,
		model: resolved.ref.model,
		isDefault,
		...resolved.alias ? { alias: resolved.alias } : void 0
	};
}
function applySelectionToSession(params) {
	const { selection, sessionEntry, sessionStore, sessionKey, storePath } = params;
	if (!sessionEntry || !sessionStore || !sessionKey) return;
	const { updated } = applyModelOverrideToSessionEntry({
		entry: sessionEntry,
		selection
	});
	if (!updated) return;
	sessionStore[sessionKey] = sessionEntry;
	if (storePath) updateSessionStore(storePath, (store) => {
		const resolved = resolveSessionStoreEntry({
			store,
			sessionKey
		});
		store[resolved.normalizedKey] = sessionEntry;
		for (const legacyKey of resolved.legacyKeys) delete store[legacyKey];
	}).catch(() => {});
}
async function applyResetModelOverride(params) {
	if (!params.resetTriggered) return {};
	const rawBody = normalizeOptionalString(params.bodyStripped);
	if (!rawBody) return {};
	const { tokens, first, second } = splitBody(rawBody);
	if (!first) return {};
	const catalog = params.modelCatalog ?? await loadModelCatalog({ config: params.cfg });
	const allowedModelKeys = buildAllowedModelSet({
		cfg: params.cfg,
		catalog,
		defaultProvider: params.defaultProvider,
		defaultModel: params.defaultModel,
		agentId: params.agentId
	}).allowedKeys;
	if (allowedModelKeys.size === 0) return {};
	const providers = /* @__PURE__ */ new Set();
	for (const key of allowedModelKeys) {
		const slash = key.indexOf("/");
		if (slash <= 0) continue;
		providers.add(normalizeProviderId(key.slice(0, slash)));
	}
	const resolveSelection = (raw) => resolveModelDirectiveSelection({
		raw,
		defaultProvider: params.defaultProvider,
		defaultModel: params.defaultModel,
		aliasIndex: params.aliasIndex,
		allowedModelKeys
	});
	let selection;
	let consumed = 0;
	if (providers.has(normalizeProviderId(first)) && second) {
		const resolved = resolveSelection(`${normalizeProviderId(first)}/${second}`);
		if (resolved.selection) {
			selection = resolved.selection;
			consumed = 2;
		}
	}
	if (!selection) {
		selection = buildSelectionFromExplicit({
			raw: first,
			defaultProvider: params.defaultProvider,
			defaultModel: params.defaultModel,
			aliasIndex: params.aliasIndex,
			allowedModelKeys
		});
		if (selection) consumed = 1;
	}
	if (!selection) {
		const resolved = resolveSelection(first);
		if (providers.has(normalizeProviderId(first)) || first.trim().length >= 6) {
			selection = resolved.selection;
			if (selection) consumed = 1;
		}
	}
	if (!selection) return {};
	const cleanedBody = tokens.slice(consumed).join(" ").trim();
	params.sessionCtx.BodyStripped = cleanedBody;
	params.sessionCtx.BodyForCommands = cleanedBody;
	applySelectionToSession({
		selection,
		sessionEntry: params.sessionEntry,
		sessionStore: params.sessionStore,
		sessionKey: params.sessionKey,
		storePath: params.storePath
	});
	return {
		selection,
		cleanedBody
	};
}
//#endregion
export { applyResetModelOverride };
