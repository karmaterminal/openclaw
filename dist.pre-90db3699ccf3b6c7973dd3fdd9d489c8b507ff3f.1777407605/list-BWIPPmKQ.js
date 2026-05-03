import { a as normalizeLowercaseStringOrEmpty, c as normalizeOptionalString } from "./string-coerce-CjxCKZ6B.js";
import { _ as shortenHomePath } from "./utils-CB8xp0O4.js";
import { r as writeRuntimeJson } from "./runtime-Dy0KdPiM.js";
import { r as theme, t as colorize } from "./theme-BrRleVfL.js";
import { G as getShellEnvAppliedKeys, J as shouldEnableShellEnvFallback, r as createConfigIO } from "./io-CBRjt33P.js";
import { r as normalizeProviderId } from "./provider-id-ZTkpwCTd.js";
import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-BofKZKJ4.js";
import { t as sanitizeTerminalText } from "./safe-text-DC97lJF2.js";
import { n as resolveAgentModelPrimaryValue, t as resolveAgentModelFallbackValues } from "./model-input-DMvh113T.js";
import { i as resolveAgentExplicitModelPrimary, s as resolveAgentModelFallbacksOverride, y as resolveAgentDir } from "./agent-scope-D-T17Rdc.js";
import "./config-BjiV0z87.js";
import { u as resolveAuthStorePathForDisplay } from "./source-check-80U6FTE-.js";
import { i as ensureAuthProfileStoreWithoutExternalProfiles } from "./store-De_brRTx.js";
import { t as resolveOpenClawAgentDir } from "./agent-paths-yYk0N-bh.js";
import { u as isNonSecretApiKeyMarker, v as resolveProviderEnvApiKeyCandidates } from "./model-auth-markers-U2294Wcj.js";
import { t as modelKey } from "./model-ref-shared-CWZQlO4A.js";
import { C as parseModelRef, _ as resolveModelRefFromString, c as buildModelAliasIndex, m as resolveConfiguredModelRef, t as isCliProvider, x as modelKey$1 } from "./model-selection-cli-BCNxTSmc.js";
import "./model-selection-B7RNWcLj.js";
import { t as resolveEnvApiKey } from "./model-auth-env-BPk5alE5.js";
import { n as resolveAwsSdkEnvVarName } from "./model-auth-runtime-shared-7xTwSNzs.js";
import { r as loadModelCatalog } from "./model-catalog-CyQ5zC3m.js";
import { a as discoverModels, i as discoverAuthStorage, l as resolveRuntimeSyntheticAuthProviderRefs } from "./pi-model-discovery-CC03N-69.js";
import { i as resolveAuthProfileDisplayLabel } from "./auth-profiles-k8Wc2Eeh.js";
import { n as listProfilesForProvider } from "./profiles-DQiFenPb.js";
import { u as resolveProfileUnusableUntilForDisplay } from "./usage-CjcxlRTg.js";
import { i as getCustomProviderApiKey, l as resolveUsableCustomProviderApiKey, o as hasUsableCustomProviderApiKey } from "./model-auth-CnLreLvU.js";
import { n as shouldSuppressBuiltInModel } from "./model-suppression-BAe_s6rf.js";
import { r as resolveModelWithRegistry } from "./model-C2LXeqL4.js";
import { f as isLocalBaseUrl, i as formatTokenK, n as ensureFlagCompatibility, s as resolveKnownAgentId } from "./shared-BBGZUNzS.js";
import { n as buildAuthHealthSummary, r as formatRemainingShort, t as DEFAULT_OAUTH_WARN_MS } from "./auth-health-CSdCpe_l.js";
import { t as maskApiKey } from "./mask-api-key-Cz5exTHD.js";
import { n as loadModelsConfigWithSource, t as loadModelsConfig } from "./load-config-DHG5jnc2.js";
import { t as loadProviderCatalogModelsForList } from "./list.runtime-BtqzuLCv.js";
import { i as truncate, n as isRich, r as pad, t as formatTag } from "./list.format-CaGpMS7k.js";
import path from "node:path";
//#region src/commands/models/list.configured.ts
const DISPLAY_MODEL_PARSE_OPTIONS$2 = { allowPluginNormalization: false };
function resolveConfiguredEntries(cfg) {
	const resolvedDefault = resolveConfiguredModelRef({
		cfg,
		defaultProvider: DEFAULT_PROVIDER,
		defaultModel: DEFAULT_MODEL,
		...DISPLAY_MODEL_PARSE_OPTIONS$2
	});
	const aliasIndex = buildModelAliasIndex({
		cfg,
		defaultProvider: DEFAULT_PROVIDER,
		...DISPLAY_MODEL_PARSE_OPTIONS$2
	});
	const order = [];
	const tagsByKey = /* @__PURE__ */ new Map();
	const aliasesByKey = /* @__PURE__ */ new Map();
	for (const [key, aliases] of aliasIndex.byKey.entries()) aliasesByKey.set(key, aliases);
	const addEntry = (ref, tag) => {
		const key = modelKey$1(ref.provider, ref.model);
		if (!tagsByKey.has(key)) {
			tagsByKey.set(key, /* @__PURE__ */ new Set());
			order.push(key);
		}
		tagsByKey.get(key)?.add(tag);
	};
	const addResolvedModelRef = (raw, tag) => {
		const resolved = resolveModelRefFromString({
			raw,
			defaultProvider: DEFAULT_PROVIDER,
			aliasIndex,
			...DISPLAY_MODEL_PARSE_OPTIONS$2
		});
		if (resolved) addEntry(resolved.ref, tag);
	};
	addEntry(resolvedDefault, "default");
	const modelFallbacks = resolveAgentModelFallbackValues(cfg.agents?.defaults?.model);
	const imageFallbacks = resolveAgentModelFallbackValues(cfg.agents?.defaults?.imageModel);
	const imagePrimary = resolveAgentModelPrimaryValue(cfg.agents?.defaults?.imageModel) ?? "";
	modelFallbacks.forEach((raw, idx) => {
		addResolvedModelRef(raw, `fallback#${idx + 1}`);
	});
	if (imagePrimary) addResolvedModelRef(imagePrimary, "image");
	imageFallbacks.forEach((raw, idx) => {
		addResolvedModelRef(raw, `img-fallback#${idx + 1}`);
	});
	for (const key of Object.keys(cfg.agents?.defaults?.models ?? {})) {
		const parsed = parseModelRef(key, DEFAULT_PROVIDER, DISPLAY_MODEL_PARSE_OPTIONS$2);
		if (!parsed) continue;
		addEntry(parsed, "configured");
	}
	return { entries: order.map((key) => {
		const slash = key.indexOf("/");
		return {
			key,
			ref: {
				provider: slash === -1 ? key : key.slice(0, slash),
				model: slash === -1 ? "" : key.slice(slash + 1)
			},
			tags: tagsByKey.get(key) ?? /* @__PURE__ */ new Set(),
			aliases: aliasesByKey.get(key) ?? []
		};
	}) };
}
//#endregion
//#region src/commands/models/list.errors.ts
const MODEL_AVAILABILITY_UNAVAILABLE_CODE = "MODEL_AVAILABILITY_UNAVAILABLE";
function formatErrorWithStack(err) {
	if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`;
	return String(err);
}
function shouldFallbackToAuthHeuristics(err) {
	if (!(err instanceof Error)) return false;
	return err.code === MODEL_AVAILABILITY_UNAVAILABLE_CODE;
}
//#endregion
//#region src/commands/models/list.model-row.ts
function authStoreHasProviderProfile(authStore, provider) {
	return Object.values(authStore.profiles ?? {}).some((credential) => credential.provider === provider);
}
function toModelRow$1(params) {
	const { model, key, tags, aliases = [], availableKeys, cfg, authStore, allowProviderAvailabilityFallback = false } = params;
	if (!model) return {
		key,
		name: key,
		input: "-",
		contextWindow: null,
		local: null,
		available: null,
		tags: [...tags, "missing"],
		missing: true
	};
	const input = model.input.join("+") || "text";
	const local = isLocalBaseUrl(model.baseUrl);
	const modelIsAvailable = availableKeys?.has(modelKey(model.provider, model.id)) ?? false;
	const available = availableKeys !== void 0 && !allowProviderAvailabilityFallback ? modelIsAvailable : modelIsAvailable || (cfg && authStore ? (params.hasAuthForProvider ?? ((input) => authStoreHasProviderProfile(input.authStore, input.provider)))({
		provider: model.provider,
		cfg,
		authStore
	}) : false);
	const aliasTags = aliases.length > 0 ? [`alias:${aliases.join(",")}`] : [];
	const mergedTags = new Set(tags);
	if (aliasTags.length > 0) {
		for (const tag of mergedTags) if (tag === "alias" || tag.startsWith("alias:")) mergedTags.delete(tag);
		for (const tag of aliasTags) mergedTags.add(tag);
	}
	return {
		key,
		name: model.name || model.id,
		input,
		contextWindow: model.contextWindow ?? null,
		local,
		available,
		tags: Array.from(mergedTags),
		missing: false
	};
}
//#endregion
//#region src/commands/models/list.registry.ts
const hasAuthForProvider = (provider, cfg, authStore) => {
	if (!cfg || !authStore) return false;
	if (listProfilesForProvider(authStore, provider).length > 0) return true;
	if (provider === "amazon-bedrock" && resolveAwsSdkEnvVarName()) return true;
	if (resolveEnvApiKey(provider)) return true;
	if (hasUsableCustomProviderApiKey(cfg, provider)) return true;
	if (resolveRuntimeSyntheticAuthProviderRefs().includes(provider)) return true;
	return false;
};
function createAvailabilityUnavailableError(message) {
	const err = new Error(message);
	err.code = MODEL_AVAILABILITY_UNAVAILABLE_CODE;
	return err;
}
function normalizeAvailabilityError(err) {
	if (shouldFallbackToAuthHeuristics(err) && err instanceof Error) return err;
	return createAvailabilityUnavailableError(`Model availability unavailable: getAvailable() failed.\n${formatErrorWithStack(err)}`);
}
function validateAvailableModels(availableModels) {
	if (!Array.isArray(availableModels)) throw createAvailabilityUnavailableError("Model availability unavailable: getAvailable() returned a non-array value.");
	for (const model of availableModels) if (!model || typeof model !== "object" || typeof model.provider !== "string" || typeof model.id !== "string") throw createAvailabilityUnavailableError("Model availability unavailable: getAvailable() returned invalid model entries.");
	return availableModels;
}
function loadAvailableModels(registry, cfg) {
	let availableModels;
	try {
		availableModels = registry.getAvailable();
	} catch (err) {
		throw normalizeAvailabilityError(err);
	}
	try {
		return validateAvailableModels(availableModels).filter((model) => !shouldSuppressBuiltInModel({
			provider: model.provider,
			id: model.id,
			baseUrl: model.baseUrl,
			config: cfg
		}));
	} catch (err) {
		throw normalizeAvailabilityError(err);
	}
}
async function loadModelRegistry(cfg, opts) {
	const agentDir = resolveOpenClawAgentDir();
	const registry = discoverModels(discoverAuthStorage(agentDir), agentDir, { providerFilter: opts?.providerFilter });
	const models = registry.getAll().filter((model) => !shouldSuppressBuiltInModel({
		provider: model.provider,
		id: model.id,
		baseUrl: model.baseUrl,
		config: cfg
	}));
	let availableKeys;
	let availabilityErrorMessage;
	try {
		const availableModels = loadAvailableModels(registry, cfg);
		availableKeys = new Set(availableModels.map((model) => modelKey$1(model.provider, model.id)));
	} catch (err) {
		if (!shouldFallbackToAuthHeuristics(err)) throw err;
		availableKeys = void 0;
		if (!availabilityErrorMessage) availabilityErrorMessage = formatErrorWithStack(err);
	}
	return {
		registry,
		models,
		availableKeys,
		availabilityErrorMessage
	};
}
function toModelRow(params) {
	return toModelRow$1({
		...params,
		hasAuthForProvider: ({ provider, cfg, authStore }) => hasAuthForProvider(provider, cfg, authStore)
	});
}
//#endregion
//#region src/commands/models/list.rows.ts
function matchesRowFilter(filter, model) {
	if (filter.provider && normalizeProviderId(model.provider) !== filter.provider) return false;
	if (filter.local && !isLocalBaseUrl(model.baseUrl ?? "")) return false;
	return true;
}
function buildRow(params) {
	const configured = params.context.configuredByKey.get(params.key);
	return toModelRow({
		model: params.model,
		key: params.key,
		tags: configured ? Array.from(configured.tags) : [],
		aliases: configured?.aliases ?? [],
		availableKeys: params.context.availableKeys,
		cfg: params.context.cfg,
		authStore: params.context.authStore,
		allowProviderAvailabilityFallback: params.allowProviderAvailabilityFallback ?? false
	});
}
function shouldSuppressListModel(params) {
	if (params.context.skipRuntimeModelSuppression) return false;
	return shouldSuppressBuiltInModel({
		provider: params.model.provider,
		id: params.model.id,
		baseUrl: params.model.baseUrl,
		config: params.context.cfg
	});
}
async function loadListModelRegistry(cfg, opts) {
	const loaded = await loadModelRegistry(cfg, opts);
	return {
		...loaded,
		discoveredKeys: new Set(loaded.models.map((model) => modelKey$1(model.provider, model.id)))
	};
}
function appendDiscoveredRows(params) {
	const seenKeys = /* @__PURE__ */ new Set();
	const sorted = [...params.models].toSorted((a, b) => {
		const providerCompare = a.provider.localeCompare(b.provider);
		if (providerCompare !== 0) return providerCompare;
		return a.id.localeCompare(b.id);
	});
	for (const model of sorted) {
		if (shouldSuppressListModel({
			model,
			context: params.context
		})) continue;
		if (!matchesRowFilter(params.context.filter, model)) continue;
		const key = modelKey$1(model.provider, model.id);
		params.rows.push(buildRow({
			model,
			key,
			context: params.context
		}));
		seenKeys.add(key);
	}
	return seenKeys;
}
async function appendCatalogSupplementRows(params) {
	const catalog = await loadModelCatalog({ config: params.context.cfg });
	for (const entry of catalog) {
		if (params.context.filter.provider && normalizeProviderId(entry.provider) !== params.context.filter.provider) continue;
		const key = modelKey$1(entry.provider, entry.id);
		if (params.seenKeys.has(key)) continue;
		const model = resolveModelWithRegistry({
			provider: entry.provider,
			modelId: entry.id,
			modelRegistry: params.modelRegistry,
			cfg: params.context.cfg
		});
		if (!model || !matchesRowFilter(params.context.filter, model)) continue;
		if (shouldSuppressListModel({
			model,
			context: params.context
		})) continue;
		params.rows.push(buildRow({
			model,
			key,
			context: params.context,
			allowProviderAvailabilityFallback: !params.context.discoveredKeys.has(key)
		}));
		params.seenKeys.add(key);
	}
	if (params.context.filter.local) return;
	await appendProviderCatalogRows({
		rows: params.rows,
		context: params.context,
		seenKeys: params.seenKeys
	});
}
async function appendProviderCatalogRows(params) {
	for (const model of await loadProviderCatalogModelsForList({
		cfg: params.context.cfg,
		agentDir: params.context.agentDir,
		providerFilter: params.context.filter.provider
	})) {
		if (!matchesRowFilter(params.context.filter, model)) continue;
		if (shouldSuppressListModel({
			model,
			context: params.context
		})) continue;
		const key = modelKey$1(model.provider, model.id);
		if (params.seenKeys.has(key)) continue;
		params.rows.push(buildRow({
			model,
			key,
			context: params.context,
			allowProviderAvailabilityFallback: !params.context.discoveredKeys.has(key)
		}));
		params.seenKeys.add(key);
	}
}
function appendConfiguredRows(params) {
	for (const entry of params.entries) {
		if (params.context.filter.provider && normalizeProviderId(entry.ref.provider) !== params.context.filter.provider) continue;
		const model = resolveModelWithRegistry({
			provider: entry.ref.provider,
			modelId: entry.ref.model,
			modelRegistry: params.modelRegistry,
			cfg: params.context.cfg
		});
		if (params.context.filter.local && model && !isLocalBaseUrl(model.baseUrl ?? "")) continue;
		if (params.context.filter.local && !model) continue;
		if (model && shouldSuppressListModel({
			model,
			context: params.context
		})) continue;
		params.rows.push(toModelRow({
			model,
			key: entry.key,
			tags: Array.from(entry.tags),
			aliases: entry.aliases,
			availableKeys: params.context.availableKeys,
			cfg: params.context.cfg,
			authStore: params.context.authStore,
			allowProviderAvailabilityFallback: model ? !params.context.discoveredKeys.has(modelKey$1(model.provider, model.id)) : false
		}));
	}
}
//#endregion
//#region src/commands/models/list.table.ts
const MODEL_PAD = 42;
const INPUT_PAD = 10;
const CTX_PAD = 8;
const LOCAL_PAD = 5;
const AUTH_PAD = 5;
function printModelTable(rows, runtime, opts = {}) {
	if (opts.json) {
		writeRuntimeJson(runtime, {
			count: rows.length,
			models: rows
		});
		return;
	}
	if (opts.plain) {
		for (const row of rows) runtime.log(sanitizeTerminalText(row.key));
		return;
	}
	const rich = isRich(opts);
	const header = [
		pad("Model", MODEL_PAD),
		pad("Input", INPUT_PAD),
		pad("Ctx", CTX_PAD),
		pad("Local", LOCAL_PAD),
		pad("Auth", AUTH_PAD),
		"Tags"
	].join(" ");
	runtime.log(rich ? theme.heading(header) : header);
	for (const row of rows) {
		const keyLabel = pad(truncate(sanitizeTerminalText(row.key), MODEL_PAD), MODEL_PAD);
		const inputLabel = pad(sanitizeTerminalText(row.input) || "-", INPUT_PAD);
		const ctxLabel = pad(formatTokenK(row.contextWindow), CTX_PAD);
		const localLabel = pad(row.local === null ? "-" : row.local ? "yes" : "no", LOCAL_PAD);
		const authLabel = pad(row.available === null ? "-" : row.available ? "yes" : "no", AUTH_PAD);
		const tags = row.tags.map(sanitizeTerminalText);
		const tagsLabel = tags.length > 0 ? rich ? tags.map((tag) => formatTag(tag, rich)).join(",") : tags.join(",") : "";
		const coloredInput = colorize(rich, row.input.includes("image") ? theme.accentBright : theme.info, inputLabel);
		const coloredLocal = colorize(rich, row.local === null ? theme.muted : row.local ? theme.success : theme.muted, localLabel);
		const coloredAuth = colorize(rich, row.available === null ? theme.muted : row.available ? theme.success : theme.error, authLabel);
		const line = [
			rich ? theme.accent(keyLabel) : keyLabel,
			coloredInput,
			ctxLabel,
			coloredLocal,
			coloredAuth,
			tagsLabel
		].join(" ");
		runtime.log(line);
	}
}
//#endregion
//#region src/commands/models/list.list-command.ts
const DISPLAY_MODEL_PARSE_OPTIONS$1 = { allowPluginNormalization: false };
async function modelsListCommand(opts, runtime) {
	ensureFlagCompatibility(opts);
	const providerFilter = (() => {
		const raw = opts.provider?.trim();
		if (!raw) return;
		if (/\s/u.test(raw)) {
			runtime.error(`Invalid provider filter "${raw}". Use a provider id such as "moonshot", not a display label.`);
			process.exitCode = 1;
			return null;
		}
		return parseModelRef(`${raw}/_`, "openai", DISPLAY_MODEL_PARSE_OPTIONS$1)?.provider ?? normalizeLowercaseStringOrEmpty(raw);
	})();
	if (providerFilter === null) return;
	const { ensureAuthProfileStore, ensureOpenClawModelsJson, resolveOpenClawAgentDir } = await import("./list.runtime-D2UULdng.js");
	const { sourceConfig, resolvedConfig: cfg } = await loadModelsConfigWithSource({
		commandName: "models list",
		runtime
	});
	const authStore = ensureAuthProfileStore();
	const agentDir = resolveOpenClawAgentDir();
	let modelRegistry;
	let discoveredKeys = /* @__PURE__ */ new Set();
	let availableKeys;
	let availabilityErrorMessage;
	const useProviderCatalogFastPath = Boolean(opts.all && providerFilter === "codex");
	try {
		if (!useProviderCatalogFastPath) {
			await ensureOpenClawModelsJson(sourceConfig ?? cfg);
			const loaded = await loadListModelRegistry(cfg, {
				sourceConfig,
				providerFilter
			});
			modelRegistry = loaded.registry;
			discoveredKeys = loaded.discoveredKeys;
			availableKeys = loaded.availableKeys;
			availabilityErrorMessage = loaded.availabilityErrorMessage;
		}
	} catch (err) {
		runtime.error(`Model registry unavailable:\n${formatErrorWithStack(err)}`);
		process.exitCode = 1;
		return;
	}
	if (availabilityErrorMessage !== void 0) runtime.error(`Model availability lookup failed; falling back to auth heuristics for discovered models: ${availabilityErrorMessage}`);
	const { entries } = resolveConfiguredEntries(cfg);
	const configuredByKey = new Map(entries.map((entry) => [entry.key, entry]));
	const rows = [];
	const rowContext = {
		cfg,
		agentDir,
		authStore,
		availableKeys,
		configuredByKey,
		discoveredKeys,
		filter: {
			provider: providerFilter,
			local: opts.local
		},
		skipRuntimeModelSuppression: useProviderCatalogFastPath
	};
	if (opts.all) {
		const seenKeys = appendDiscoveredRows({
			rows,
			models: modelRegistry?.getAll() ?? [],
			context: rowContext
		});
		if (modelRegistry) await appendCatalogSupplementRows({
			rows,
			modelRegistry,
			context: rowContext,
			seenKeys
		});
		else if (useProviderCatalogFastPath) await appendProviderCatalogRows({
			rows,
			context: rowContext,
			seenKeys
		});
	} else {
		const registry = modelRegistry;
		if (!registry) {
			runtime.error("Model registry unavailable.");
			process.exitCode = 1;
			return;
		}
		appendConfiguredRows({
			rows,
			entries,
			modelRegistry: registry,
			context: rowContext
		});
	}
	if (rows.length === 0) {
		runtime.log("No models found.");
		return;
	}
	printModelTable(rows, runtime, opts);
}
//#endregion
//#region src/commands/models/list.auth-overview.ts
function formatMarkerOrSecret(value) {
	return isNonSecretApiKeyMarker(value, { includeEnvVarName: false }) ? `marker(${value.trim()})` : maskApiKey(value);
}
function formatProfileSecretLabel(params) {
	const value = normalizeOptionalString(params.value) ?? "";
	if (value) {
		const display = formatMarkerOrSecret(value);
		return params.kind === "token" ? `token:${display}` : display;
	}
	if (params.ref) {
		const refLabel = `ref(${params.ref.source}:${params.ref.id})`;
		return params.kind === "token" ? `token:${refLabel}` : refLabel;
	}
	return params.kind === "token" ? "token:missing" : "missing";
}
function resolveProviderAuthOverview(params) {
	const { provider, cfg, store } = params;
	const now = Date.now();
	const profiles = listProfilesForProvider(store, provider);
	const withUnusableSuffix = (base, profileId) => {
		const unusableUntil = resolveProfileUnusableUntilForDisplay(store, profileId);
		if (!unusableUntil || now >= unusableUntil) return base;
		const stats = store.usageStats?.[profileId];
		return `${base} [${typeof stats?.disabledUntil === "number" && now < stats.disabledUntil ? `disabled${stats.disabledReason ? `:${stats.disabledReason}` : ""}` : "cooldown"} ${formatRemainingShort(unusableUntil - now)}]`;
	};
	const labels = profiles.map((profileId) => {
		const profile = store.profiles[profileId];
		if (!profile) return `${profileId}=missing`;
		if (profile.type === "api_key") return withUnusableSuffix(`${profileId}=${formatProfileSecretLabel({
			value: profile.key,
			ref: profile.keyRef,
			kind: "api-key"
		})}`, profileId);
		if (profile.type === "token") return withUnusableSuffix(`${profileId}=${formatProfileSecretLabel({
			value: profile.token,
			ref: profile.tokenRef,
			kind: "token"
		})}`, profileId);
		const display = resolveAuthProfileDisplayLabel({
			cfg,
			store,
			profileId
		});
		const suffix = display === profileId ? "" : display.startsWith(profileId) ? display.slice(profileId.length).trim() : `(${display})`;
		return withUnusableSuffix(`${profileId}=OAuth${suffix ? ` ${suffix}` : ""}`, profileId);
	});
	const oauthCount = profiles.filter((id) => store.profiles[id]?.type === "oauth").length;
	const tokenCount = profiles.filter((id) => store.profiles[id]?.type === "token").length;
	const apiKeyCount = profiles.filter((id) => store.profiles[id]?.type === "api_key").length;
	const envKey = resolveEnvApiKey(provider);
	const customKey = getCustomProviderApiKey(cfg, provider);
	const usableCustomKey = resolveUsableCustomProviderApiKey({
		cfg,
		provider
	});
	return {
		provider,
		effective: (() => {
			if (profiles.length > 0) return {
				kind: "profiles",
				detail: shortenHomePath(resolveAuthStorePathForDisplay())
			};
			if (envKey) {
				const normalizedSource = normalizeLowercaseStringOrEmpty(envKey.source);
				return {
					kind: "env",
					detail: envKey.source.includes("OAUTH_TOKEN") || normalizedSource.includes("oauth") ? "OAuth (env)" : maskApiKey(envKey.apiKey)
				};
			}
			if (usableCustomKey) return {
				kind: "models.json",
				detail: formatMarkerOrSecret(usableCustomKey.apiKey)
			};
			if (params.syntheticAuth) return {
				kind: "synthetic",
				detail: params.syntheticAuth.source
			};
			return {
				kind: "missing",
				detail: "missing"
			};
		})(),
		profiles: {
			count: profiles.length,
			oauth: oauthCount,
			token: tokenCount,
			apiKey: apiKeyCount,
			labels
		},
		...envKey ? { env: {
			value: (() => {
				const normalizedSource = normalizeLowercaseStringOrEmpty(envKey.source);
				return envKey.source.includes("OAUTH_TOKEN") || normalizedSource.includes("oauth") ? "OAuth (env)" : maskApiKey(envKey.apiKey);
			})(),
			source: envKey.source
		} } : {},
		...customKey ? { modelsJson: {
			value: formatMarkerOrSecret(customKey),
			source: `models.json: ${shortenHomePath(params.modelsPath)}`
		} } : {},
		...params.syntheticAuth ? { syntheticAuth: params.syntheticAuth } : {}
	};
}
//#endregion
//#region src/commands/models/list.status-command.ts
let providerUsageRuntimePromise;
let progressRuntimePromise;
let terminalTableRuntimePromise;
let listProbeRuntimePromise;
const DISPLAY_MODEL_PARSE_OPTIONS = { allowPluginNormalization: false };
function loadProviderUsageRuntime() {
	providerUsageRuntimePromise ??= import("./provider-usage-DWdcACfx.js");
	return providerUsageRuntimePromise;
}
function loadProgressRuntime() {
	progressRuntimePromise ??= import("./progress-DwQvkpbz.js");
	return progressRuntimePromise;
}
function loadTerminalTableRuntime() {
	terminalTableRuntimePromise ??= import("./table-BBwk9G6x.js");
	return terminalTableRuntimePromise;
}
function loadListProbeRuntime() {
	listProbeRuntimePromise ??= import("./list.probe-D-xK4-VA.js");
	return listProbeRuntimePromise;
}
async function modelsStatusCommand(opts, runtime) {
	ensureFlagCompatibility(opts);
	if (opts.plain && opts.probe) throw new Error("--probe cannot be used with --plain output.");
	const configPath = createConfigIO().configPath;
	const cfg = await loadModelsConfig({
		commandName: "models status",
		runtime
	});
	const agentId = resolveKnownAgentId({
		cfg,
		rawAgentId: opts.agent
	});
	const agentDir = agentId ? resolveAgentDir(cfg, agentId) : resolveOpenClawAgentDir();
	const agentModelPrimary = agentId ? resolveAgentExplicitModelPrimary(cfg, agentId) : void 0;
	const agentFallbacksOverride = agentId ? resolveAgentModelFallbacksOverride(cfg, agentId) : void 0;
	const resolved = resolveConfiguredModelRef({
		cfg: agentModelPrimary && agentModelPrimary.length > 0 ? {
			...cfg,
			agents: {
				...cfg.agents,
				defaults: {
					...cfg.agents?.defaults,
					model: {
						...typeof cfg.agents?.defaults?.model === "object" ? cfg.agents.defaults.model : {},
						primary: agentModelPrimary
					}
				}
			}
		} : cfg,
		defaultProvider: DEFAULT_PROVIDER,
		defaultModel: DEFAULT_MODEL,
		...DISPLAY_MODEL_PARSE_OPTIONS
	});
	const rawDefaultsModel = resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model) ?? "";
	const rawModel = agentModelPrimary ?? rawDefaultsModel;
	const resolvedLabel = `${resolved.provider}/${resolved.model}`;
	const defaultLabel = rawModel || resolvedLabel;
	const defaultsFallbacks = resolveAgentModelFallbackValues(cfg.agents?.defaults?.model);
	const fallbacks = agentFallbacksOverride ?? defaultsFallbacks;
	const imageModel = resolveAgentModelPrimaryValue(cfg.agents?.defaults?.imageModel) ?? "";
	const imageFallbacks = resolveAgentModelFallbackValues(cfg.agents?.defaults?.imageModel);
	const aliases = Object.entries(cfg.agents?.defaults?.models ?? {}).reduce((acc, [key, entry]) => {
		const alias = normalizeOptionalString(entry?.alias);
		if (alias) acc[alias] = key;
		return acc;
	}, {});
	const allowed = Object.keys(cfg.agents?.defaults?.models ?? {});
	const store = ensureAuthProfileStoreWithoutExternalProfiles(agentDir);
	const modelsPath = path.join(agentDir, "models.json");
	const providersFromStore = new Set(Object.values(store.profiles).map((profile) => normalizeProviderId(profile.provider)).filter((p) => Boolean(p)));
	const providersFromConfig = new Set(Object.keys(cfg.models?.providers ?? {}).map((p) => typeof p === "string" ? normalizeProviderId(p) : "").filter(Boolean));
	const providersFromModels = /* @__PURE__ */ new Set();
	const providersInUse = /* @__PURE__ */ new Set();
	for (const raw of [
		defaultLabel,
		...fallbacks,
		imageModel,
		...imageFallbacks,
		...allowed
	]) {
		const parsed = parseModelRef(raw ?? "", DEFAULT_PROVIDER, DISPLAY_MODEL_PARSE_OPTIONS);
		if (parsed?.provider) providersFromModels.add(normalizeProviderId(parsed.provider));
	}
	for (const raw of [
		defaultLabel,
		...fallbacks,
		imageModel,
		...imageFallbacks
	]) {
		const parsed = parseModelRef(raw ?? "", DEFAULT_PROVIDER, DISPLAY_MODEL_PARSE_OPTIONS);
		if (parsed?.provider) providersInUse.add(normalizeProviderId(parsed.provider));
	}
	const providersFromEnv = /* @__PURE__ */ new Set();
	for (const provider of Object.keys(resolveProviderEnvApiKeyCandidates()).toSorted()) if (resolveEnvApiKey(provider)) providersFromEnv.add(provider);
	const syntheticAuthByProvider = new Map(resolveRuntimeSyntheticAuthProviderRefs().map((provider) => [normalizeProviderId(provider), {
		value: "plugin-owned",
		source: "plugin synthetic auth"
	}]));
	const providers = Array.from(new Set([
		...providersFromStore,
		...providersFromConfig,
		...providersFromModels,
		...providersFromEnv
	])).map((p) => normalizeOptionalString(p) ?? "").filter(Boolean).toSorted((a, b) => a.localeCompare(b));
	const applied = getShellEnvAppliedKeys();
	const shellFallbackEnabled = shouldEnableShellEnvFallback(process.env) || cfg.env?.shellEnv?.enabled === true;
	const providerAuth = providers.map((provider) => resolveProviderAuthOverview({
		provider,
		cfg,
		store,
		modelsPath,
		syntheticAuth: syntheticAuthByProvider.get(provider)
	})).filter((entry) => {
		return entry.profiles.count > 0 || Boolean(entry.env) || Boolean(entry.modelsJson) || Boolean(entry.syntheticAuth);
	});
	const providerAuthMap = new Map(providerAuth.map((entry) => [entry.provider, entry]));
	const missingProvidersInUse = Array.from(providersInUse).filter((provider) => !providerAuthMap.has(provider)).filter((provider) => !syntheticAuthByProvider.has(provider)).filter((provider) => !isCliProvider(provider, cfg)).toSorted((a, b) => a.localeCompare(b));
	const probeProfileIds = (() => {
		if (!opts.probeProfile) return [];
		return (Array.isArray(opts.probeProfile) ? opts.probeProfile : [opts.probeProfile]).flatMap((value) => (value ?? "").split(",")).map((value) => value.trim()).filter(Boolean);
	})();
	const probeTimeoutMs = opts.probeTimeout ? Number(opts.probeTimeout) : 8e3;
	if (!Number.isFinite(probeTimeoutMs) || probeTimeoutMs <= 0) throw new Error("--probe-timeout must be a positive number (ms).");
	const probeConcurrency = opts.probeConcurrency ? Number(opts.probeConcurrency) : 2;
	if (!Number.isFinite(probeConcurrency) || probeConcurrency <= 0) throw new Error("--probe-concurrency must be > 0.");
	const probeMaxTokens = opts.probeMaxTokens ? Number(opts.probeMaxTokens) : 8;
	if (!Number.isFinite(probeMaxTokens) || probeMaxTokens <= 0) throw new Error("--probe-max-tokens must be > 0.");
	const aliasIndex = buildModelAliasIndex({
		cfg,
		defaultProvider: DEFAULT_PROVIDER,
		...DISPLAY_MODEL_PARSE_OPTIONS
	});
	const modelCandidates = [
		rawModel || resolvedLabel,
		...fallbacks,
		imageModel,
		...imageFallbacks,
		...allowed
	].filter(Boolean).map((raw) => resolveModelRefFromString({
		raw: raw ?? "",
		defaultProvider: DEFAULT_PROVIDER,
		aliasIndex,
		...DISPLAY_MODEL_PARSE_OPTIONS
	})?.ref).filter((ref) => Boolean(ref)).map((ref) => `${ref.provider}/${ref.model}`);
	let probeSummary;
	if (opts.probe) {
		const [{ withProgressTotals }, { runAuthProbes }] = await Promise.all([loadProgressRuntime(), loadListProbeRuntime()]);
		probeSummary = await withProgressTotals({
			label: "Probing auth profiles…",
			total: 1
		}, async (update) => {
			return await runAuthProbes({
				cfg,
				providers,
				modelCandidates,
				options: {
					provider: opts.probeProvider,
					profileIds: probeProfileIds,
					timeoutMs: probeTimeoutMs,
					concurrency: probeConcurrency,
					maxTokens: probeMaxTokens
				},
				onProgress: update
			});
		});
	}
	const providersWithOauth = providerAuth.filter((entry) => entry.profiles.oauth > 0 || entry.profiles.token > 0 || entry.env?.value === "OAuth (env)").map((entry) => {
		const count = entry.profiles.oauth + entry.profiles.token + (entry.env?.value === "OAuth (env)" ? 1 : 0);
		return `${entry.provider} (${count})`;
	});
	const authHealth = buildAuthHealthSummary({
		store,
		cfg,
		warnAfterMs: DEFAULT_OAUTH_WARN_MS
	});
	const oauthProfiles = authHealth.profiles.filter((profile) => profile.type === "oauth" || profile.type === "token");
	const unusableProfiles = (() => {
		const now = Date.now();
		const out = [];
		for (const profileId of Object.keys(store.usageStats ?? {})) {
			const unusableUntil = resolveProfileUnusableUntilForDisplay(store, profileId);
			if (!unusableUntil || now >= unusableUntil) continue;
			const stats = store.usageStats?.[profileId];
			const kind = typeof stats?.disabledUntil === "number" && now < stats.disabledUntil ? "disabled" : "cooldown";
			out.push({
				profileId,
				provider: store.profiles[profileId]?.provider,
				kind,
				reason: stats?.disabledReason,
				until: unusableUntil,
				remainingMs: unusableUntil - now
			});
		}
		return out.toSorted((a, b) => a.remainingMs - b.remainingMs);
	})();
	const checkStatus = (() => {
		const hasExpiredOrMissing = oauthProfiles.some((profile) => ["expired", "missing"].includes(profile.status)) || missingProvidersInUse.length > 0;
		const hasExpiring = oauthProfiles.some((profile) => profile.status === "expiring");
		if (hasExpiredOrMissing) return 1;
		if (hasExpiring) return 2;
		return 0;
	})();
	if (opts.json) {
		writeRuntimeJson(runtime, {
			configPath,
			...agentId ? { agentId } : {},
			agentDir,
			defaultModel: defaultLabel,
			resolvedDefault: resolvedLabel,
			fallbacks,
			imageModel: imageModel || null,
			imageFallbacks,
			...agentId ? { modelConfig: {
				defaultSource: agentModelPrimary ? "agent" : "defaults",
				fallbacksSource: agentFallbacksOverride !== void 0 ? "agent" : "defaults"
			} } : {},
			aliases,
			allowed,
			auth: {
				storePath: resolveAuthStorePathForDisplay(agentDir),
				shellEnvFallback: {
					enabled: shellFallbackEnabled,
					appliedKeys: applied
				},
				providersWithOAuth: providersWithOauth,
				missingProvidersInUse,
				providers: providerAuth,
				unusableProfiles,
				oauth: {
					warnAfterMs: authHealth.warnAfterMs,
					profiles: authHealth.profiles,
					providers: authHealth.providers
				},
				probes: probeSummary
			}
		});
		if (opts.check) runtime.exit(checkStatus);
		return;
	}
	if (opts.plain) {
		runtime.log(resolvedLabel);
		if (opts.check) runtime.exit(checkStatus);
		return;
	}
	const rich = isRich(opts);
	const label = (value) => colorize(rich, theme.accent, value.padEnd(14));
	const labelWithSource = (value, source) => label(source ? `${value} (${source})` : value);
	const displayDefault = rawModel && rawModel !== resolvedLabel ? `${resolvedLabel} (from ${rawModel})` : resolvedLabel;
	runtime.log(`${label("Config")}${colorize(rich, theme.muted, ":")} ${colorize(rich, theme.info, shortenHomePath(configPath))}`);
	runtime.log(`${label("Agent dir")}${colorize(rich, theme.muted, ":")} ${colorize(rich, theme.info, shortenHomePath(agentDir))}`);
	runtime.log(`${labelWithSource("Default", agentId ? agentModelPrimary ? "agent" : "defaults" : void 0)}${colorize(rich, theme.muted, ":")} ${colorize(rich, theme.success, displayDefault)}`);
	runtime.log(`${labelWithSource(`Fallbacks (${fallbacks.length || 0})`, agentId ? agentFallbacksOverride !== void 0 ? "agent" : "defaults" : void 0)}${colorize(rich, theme.muted, ":")} ${colorize(rich, fallbacks.length ? theme.warn : theme.muted, fallbacks.length ? fallbacks.join(", ") : "-")}`);
	runtime.log(`${labelWithSource("Image model", agentId ? "defaults" : void 0)}${colorize(rich, theme.muted, ":")} ${colorize(rich, imageModel ? theme.accentBright : theme.muted, imageModel || "-")}`);
	runtime.log(`${labelWithSource(`Image fallbacks (${imageFallbacks.length || 0})`, agentId ? "defaults" : void 0)}${colorize(rich, theme.muted, ":")} ${colorize(rich, imageFallbacks.length ? theme.accentBright : theme.muted, imageFallbacks.length ? imageFallbacks.join(", ") : "-")}`);
	runtime.log(`${label(`Aliases (${Object.keys(aliases).length || 0})`)}${colorize(rich, theme.muted, ":")} ${colorize(rich, Object.keys(aliases).length ? theme.accent : theme.muted, Object.keys(aliases).length ? Object.entries(aliases).map(([alias, target]) => rich ? `${theme.accentDim(alias)} ${theme.muted("->")} ${theme.info(target)}` : `${alias} -> ${target}`).join(", ") : "-")}`);
	runtime.log(`${label(`Configured models (${allowed.length || 0})`)}${colorize(rich, theme.muted, ":")} ${colorize(rich, allowed.length ? theme.info : theme.muted, allowed.length ? allowed.join(", ") : "all")}`);
	runtime.log("");
	runtime.log(colorize(rich, theme.heading, "Auth overview"));
	runtime.log(`${label("Auth store")}${colorize(rich, theme.muted, ":")} ${colorize(rich, theme.info, shortenHomePath(resolveAuthStorePathForDisplay(agentDir)))}`);
	runtime.log(`${label("Shell env")}${colorize(rich, theme.muted, ":")} ${colorize(rich, shellFallbackEnabled ? theme.success : theme.muted, shellFallbackEnabled ? "on" : "off")}${applied.length ? colorize(rich, theme.muted, ` (applied: ${applied.join(", ")})`) : ""}`);
	runtime.log(`${label(`Providers w/ OAuth/tokens (${providersWithOauth.length || 0})`)}${colorize(rich, theme.muted, ":")} ${colorize(rich, providersWithOauth.length ? theme.info : theme.muted, providersWithOauth.length ? providersWithOauth.join(", ") : "-")}`);
	const formatKey = (key) => colorize(rich, theme.warn, key);
	const formatKeyValue = (key, value) => `${formatKey(key)}=${colorize(rich, theme.info, value)}`;
	const formatSeparator = () => colorize(rich, theme.muted, " | ");
	for (const entry of providerAuth) {
		const separator = formatSeparator();
		const bits = [];
		bits.push(formatKeyValue("effective", `${colorize(rich, theme.accentBright, entry.effective.kind)}:${colorize(rich, theme.muted, entry.effective.detail)}`));
		if (entry.profiles.count > 0) {
			bits.push(formatKeyValue("profiles", `${entry.profiles.count} (oauth=${entry.profiles.oauth}, token=${entry.profiles.token}, api_key=${entry.profiles.apiKey})`));
			if (entry.profiles.labels.length > 0) bits.push(colorize(rich, theme.info, entry.profiles.labels.join(", ")));
		}
		if (entry.env) bits.push(formatKeyValue("env", `${entry.env.value}${separator}${formatKeyValue("source", entry.env.source)}`));
		if (entry.modelsJson) bits.push(formatKeyValue("models.json", `${entry.modelsJson.value}${separator}${formatKeyValue("source", entry.modelsJson.source)}`));
		if (entry.syntheticAuth) bits.push(formatKeyValue("synthetic", `${entry.syntheticAuth.value}${separator}${formatKeyValue("source", entry.syntheticAuth.source)}`));
		runtime.log(`- ${theme.heading(entry.provider)} ${bits.join(separator)}`);
	}
	if (missingProvidersInUse.length > 0) {
		const { buildProviderAuthRecoveryHint } = await import("./provider-auth-guidance-Dlk10hLL.js");
		runtime.log("");
		runtime.log(colorize(rich, theme.heading, "Missing auth"));
		for (const provider of missingProvidersInUse) {
			const hint = buildProviderAuthRecoveryHint({
				provider,
				config: cfg,
				includeEnvVar: true
			});
			runtime.log(`- ${theme.heading(provider)} ${hint}`);
		}
	}
	runtime.log("");
	runtime.log(colorize(rich, theme.heading, "OAuth/token status"));
	if (oauthProfiles.length === 0) runtime.log(colorize(rich, theme.muted, "- none"));
	else {
		const { formatUsageWindowSummary, loadProviderUsageSummary, resolveUsageProviderId } = await loadProviderUsageRuntime();
		const usageByProvider = /* @__PURE__ */ new Map();
		const usageProviders = Array.from(new Set(oauthProfiles.map((profile) => resolveUsageProviderId(profile.provider)).filter((provider) => Boolean(provider))));
		if (usageProviders.length > 0) try {
			const usageSummary = await loadProviderUsageSummary({
				providers: usageProviders,
				agentDir,
				timeoutMs: 3500
			});
			for (const snapshot of usageSummary.providers) {
				const formatted = formatUsageWindowSummary(snapshot, {
					now: Date.now(),
					maxWindows: 2,
					includeResets: true
				});
				if (formatted) usageByProvider.set(snapshot.provider, formatted);
			}
		} catch {}
		const formatStatus = (status) => {
			if (status === "ok") return colorize(rich, theme.success, "ok");
			if (status === "static") return colorize(rich, theme.muted, "static");
			if (status === "expiring") return colorize(rich, theme.warn, "expiring");
			if (status === "missing") return colorize(rich, theme.warn, "unknown");
			return colorize(rich, theme.error, "expired");
		};
		const profilesByProvider = /* @__PURE__ */ new Map();
		for (const profile of oauthProfiles) {
			const current = profilesByProvider.get(profile.provider);
			if (current) current.push(profile);
			else profilesByProvider.set(profile.provider, [profile]);
		}
		for (const [provider, profiles] of profilesByProvider) {
			const usageKey = resolveUsageProviderId(provider);
			const usage = usageKey ? usageByProvider.get(usageKey) : void 0;
			const usageSuffix = usage ? colorize(rich, theme.muted, ` usage: ${usage}`) : "";
			runtime.log(`- ${colorize(rich, theme.heading, provider)}${usageSuffix}`);
			for (const profile of profiles) {
				const labelText = profile.label || profile.profileId;
				const label = colorize(rich, theme.accent, labelText);
				const status = formatStatus(profile.status);
				const expiry = profile.status === "static" ? "" : profile.expiresAt ? ` expires in ${formatRemainingShort(profile.remainingMs)}` : " expires unknown";
				runtime.log(`  - ${label} ${status}${expiry}`);
			}
		}
	}
	if (probeSummary) {
		const [{ getTerminalTableWidth, renderTable }, { describeProbeSummary, formatProbeLatency, sortProbeResults }] = await Promise.all([loadTerminalTableRuntime(), loadListProbeRuntime()]);
		runtime.log("");
		runtime.log(colorize(rich, theme.heading, "Auth probes"));
		if (probeSummary.results.length === 0) runtime.log(colorize(rich, theme.muted, "- none"));
		else {
			const tableWidth = getTerminalTableWidth();
			const sorted = sortProbeResults(probeSummary.results);
			const statusColor = (status) => {
				if (status === "ok") return theme.success;
				if (status === "rate_limit") return theme.warn;
				if (status === "timeout" || status === "billing") return theme.warn;
				if (status === "auth" || status === "format") return theme.error;
				if (status === "no_model") return theme.muted;
				return theme.muted;
			};
			const rows = sorted.map((result) => {
				const status = colorize(rich, statusColor(result.status), result.status);
				const latency = formatProbeLatency(result.latencyMs);
				const modelLabel = result.model ?? `${result.provider}/-`;
				const modeLabel = result.mode ? ` ${colorize(rich, theme.muted, `(${result.mode})`)}` : "";
				const profile = `${colorize(rich, theme.accent, result.label)}${modeLabel}`;
				const detail = result.error?.trim();
				const detailLabel = detail ? `\n${colorize(rich, theme.muted, `↳ ${detail}`)}` : "";
				const statusLabel = `${status}${colorize(rich, theme.muted, ` · ${latency}`)}${detailLabel}`;
				return {
					Model: colorize(rich, theme.heading, modelLabel),
					Profile: profile,
					Status: statusLabel
				};
			});
			runtime.log(renderTable({
				width: tableWidth,
				columns: [
					{
						key: "Model",
						header: "Model",
						minWidth: 18
					},
					{
						key: "Profile",
						header: "Profile",
						minWidth: 24
					},
					{
						key: "Status",
						header: "Status",
						minWidth: 12
					}
				],
				rows
			}).trimEnd());
			runtime.log(colorize(rich, theme.muted, describeProbeSummary(probeSummary)));
		}
	}
	if (opts.check) runtime.exit(checkStatus);
}
//#endregion
export { modelsListCommand as n, modelsStatusCommand as t };
