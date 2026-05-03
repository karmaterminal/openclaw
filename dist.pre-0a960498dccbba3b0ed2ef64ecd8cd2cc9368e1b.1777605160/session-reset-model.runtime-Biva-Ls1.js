import { c as normalizeOptionalString } from "./string-coerce-C1IzJjqi.js";
import { r as normalizeProviderId } from "./provider-id-BLh32HP1.js";
import { t as resolveAgentModelFallbackValues } from "./model-input-BkKFdMSQ.js";
import { h as resolveModelRefFromString, t as buildAllowedModelSetWithFallbacks, y as modelKey } from "./model-selection-shared-grYiFZof.js";
import { l as resolveSessionStoreEntry, o as updateSessionStore } from "./store-Ci-m4oZ1.js";
import "./sessions-BL1W8Rqf.js";
import { t as applyModelOverrideToSessionEntry } from "./model-overrides-BuOWq2OH.js";
import { t as resolveModelDirectiveSelection } from "./model-selection-directive-DF0d_4A_.js";
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
async function loadResetModelCatalog(cfg) {
	const { loadModelCatalog } = await import("./model-catalog-Coigqpaf.js");
	return loadModelCatalog({ config: cfg });
}
async function resolveResetFallbackModels(params) {
	if (params.agentId) {
		const { resolveAgentModelFallbacksOverride } = await import("./agent-scope-Cl-asc8m.js");
		const override = resolveAgentModelFallbacksOverride(params.cfg, params.agentId);
		if (override !== void 0) return override;
	}
	return resolveAgentModelFallbackValues(params.cfg.agents?.defaults?.model);
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
	const catalog = params.modelCatalog ?? await loadResetModelCatalog(params.cfg);
	const allowedModelKeys = buildAllowedModelSetWithFallbacks({
		cfg: params.cfg,
		catalog,
		defaultProvider: params.defaultProvider,
		defaultModel: params.defaultModel,
		fallbackModels: await resolveResetFallbackModels({
			cfg: params.cfg,
			agentId: params.agentId
		})
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
