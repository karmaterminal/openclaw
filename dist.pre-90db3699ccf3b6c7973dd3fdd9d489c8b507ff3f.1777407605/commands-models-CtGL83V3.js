import { i as formatErrorMessage } from "./errors-CS5wW5eD.js";
import { a as normalizeLowercaseStringOrEmpty, c as normalizeOptionalString } from "./string-coerce-CjxCKZ6B.js";
import { t as createSubsystemLogger } from "./subsystem-CJBoMDt5.js";
import { u as isLoopbackIpAddress } from "./ip-BDZZzbo_.js";
import { T as validateConfigObjectWithPlugins, u as readConfigFileSnapshot } from "./io-CBRjt33P.js";
import { r as normalizeProviderId } from "./provider-id-ZTkpwCTd.js";
import { o as normalizeChannelId } from "./registry-CGsqKAN1.js";
import { t as getChannelPlugin } from "./registry-CaUS2Z2d.js";
import { p as resolveSessionAgentId, y as resolveAgentDir } from "./agent-scope-D-T17Rdc.js";
import { n as isModelsWriteEnabled } from "./commands.flags-D8n75DQv.js";
import { r as replaceConfigFile, t as ConfigMutationConflictError } from "./mutate-DLhVGTK-.js";
import "./config-BjiV0z87.js";
import "./plugins-BcqWcAy9.js";
import { _ as resolveModelRefFromString, c as buildModelAliasIndex, o as buildConfiguredAllowlistKeys } from "./model-selection-cli-BCNxTSmc.js";
import { o as resolveDefaultModelForAgent, t as buildAllowedModelSet } from "./model-selection-B7RNWcLj.js";
import { r as loadModelCatalog } from "./model-catalog-CyQ5zC3m.js";
import { r as loadBundledPluginPublicSurfaceModuleSync, t as createLazyFacadeValue } from "./facade-runtime-CJnC01aT.js";
import { t as normalizeHostname } from "./hostname-DuZoRhCc.js";
import { a as resolveConfigWriteTargetFromPathShared, n as canBypassConfigWritePolicyShared, r as formatConfigWriteDeniedMessageShared, t as authorizeConfigWriteShared } from "./config-write-policy-shared-Bh9y3cot.js";
import { h as mapLmstudioWireEntry, i as LMSTUDIO_DEFAULT_INFERENCE_BASE_URL, m as fetchLmstudioModels, t as LMSTUDIO_DEFAULT_API_KEY_ENV_VAR, v as resolveLmstudioInferenceBase, x as resolveLmstudioRequestContext } from "./lmstudio-runtime-DcY4Cy9e.js";
import { n as SELF_HOSTED_DEFAULT_COST, r as SELF_HOSTED_DEFAULT_MAX_TOKENS, t as SELF_HOSTED_DEFAULT_CONTEXT_WINDOW } from "./self-hosted-provider-defaults-amDnnpzL.js";
import { a as requireGatewayClientScopeForInternalChannel, n as rejectNonOwnerCommand, r as rejectUnauthorizedCommand } from "./command-gates-BbbTDXTE.js";
import { t as resolveModelAuthLabel } from "./model-auth-label-CDqsoD42.js";
import { t as resolveChannelAccountId } from "./channel-context-yU_lHjCl.js";
import { t as buildRemoteBaseUrlPolicy } from "./remote-http-CGRlIov8.js";
//#region src/channels/plugins/config-writes.ts
function isInternalConfigWriteMessageChannel(channel) {
	return normalizeLowercaseStringOrEmpty(channel) === "webchat";
}
function authorizeConfigWrite(params) {
	return authorizeConfigWriteShared(params);
}
function resolveConfigWriteTargetFromPath(path) {
	return resolveConfigWriteTargetFromPathShared({
		path,
		normalizeChannelId: (raw) => normalizeLowercaseStringOrEmpty(raw)
	});
}
function canBypassConfigWritePolicy(params) {
	return canBypassConfigWritePolicyShared({
		...params,
		isInternalMessageChannel: isInternalConfigWriteMessageChannel
	});
}
function formatConfigWriteDeniedMessage(params) {
	return formatConfigWriteDeniedMessageShared(params);
}
//#endregion
//#region src/auto-reply/reply/config-write-authorization.ts
function resolveConfigWriteDeniedText(params) {
	const writeAuth = authorizeConfigWrite({
		cfg: params.cfg,
		origin: {
			channelId: params.channelId,
			accountId: params.accountId
		},
		target: params.target,
		allowBypass: canBypassConfigWritePolicy({
			channel: params.channel ?? "",
			gatewayClientScopes: params.gatewayClientScopes
		})
	});
	if (writeAuth.allowed) return null;
	return formatConfigWriteDeniedMessage({
		result: writeAuth,
		fallbackChannelId: params.channelId
	});
}
//#endregion
//#region src/auto-reply/reply/models-add.ts
const log = createSubsystemLogger("models-add");
const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434";
function loadOllamaApiFacade() {
	return loadBundledPluginPublicSurfaceModuleSync({
		dirName: "ollama",
		artifactBasename: "api.js"
	});
}
const buildOllamaModelDefinition = createLazyFacadeValue(loadOllamaApiFacade, "buildOllamaModelDefinition");
const queryOllamaModelShowInfo = createLazyFacadeValue(loadOllamaApiFacade, "queryOllamaModelShowInfo");
function sanitizeUrlForLogs(raw) {
	const trimmed = normalizeOptionalString(raw);
	if (!trimmed) return;
	try {
		const url = new URL(trimmed);
		url.username = "";
		url.password = "";
		url.search = "";
		url.hash = "";
		return url.toString();
	} catch {
		return "[invalid_url]";
	}
}
function buildDefaultModelDefinition(modelId) {
	return {
		id: modelId,
		name: modelId,
		reasoning: false,
		input: ["text"],
		cost: SELF_HOSTED_DEFAULT_COST,
		contextWindow: SELF_HOSTED_DEFAULT_CONTEXT_WINDOW,
		maxTokens: SELF_HOSTED_DEFAULT_MAX_TOKENS
	};
}
function resolveConfiguredProvider(cfg, providerId) {
	const normalizedProviderId = normalizeProviderId(providerId);
	if (!normalizedProviderId) return;
	const providers = cfg.models?.providers;
	if (!providers) return;
	for (const [configuredProviderId, configuredProvider] of Object.entries(providers)) if (normalizeProviderId(configuredProviderId) === normalizedProviderId) return {
		providerKey: configuredProviderId,
		providerConfig: configuredProvider
	};
}
function buildDefaultLmstudioProviderConfig() {
	return {
		baseUrl: resolveLmstudioInferenceBase(LMSTUDIO_DEFAULT_INFERENCE_BASE_URL),
		api: "openai-completions",
		auth: "api-key",
		apiKey: LMSTUDIO_DEFAULT_API_KEY_ENV_VAR,
		models: []
	};
}
function isLocalLmstudioBaseUrl(baseUrl) {
	const trimmed = normalizeOptionalString(baseUrl);
	if (!trimmed) return false;
	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
		const hostname = normalizeHostname(parsed.hostname);
		return hostname === "localhost" || hostname === "localhost.localdomain" || isLoopbackIpAddress(hostname);
	} catch {
		return false;
	}
}
const MODEL_ADD_ADAPTERS = {
	ollama: {
		providerId: "ollama",
		bootstrapProviderConfig: () => ({
			baseUrl: OLLAMA_DEFAULT_BASE_URL,
			api: "ollama",
			apiKey: "ollama-local",
			models: []
		}),
		detect: async ({ providerConfig, modelId }) => {
			const info = await queryOllamaModelShowInfo(providerConfig.baseUrl, modelId) ?? {};
			return {
				found: typeof info.contextWindow === "number" || (info.capabilities?.length ?? 0) > 0,
				model: buildOllamaModelDefinition(modelId, info.contextWindow, info.capabilities)
			};
		}
	},
	lmstudio: {
		providerId: "lmstudio",
		bootstrapProviderConfig: () => buildDefaultLmstudioProviderConfig(),
		detect: async ({ cfg, providerConfig, modelId }) => {
			if (!isLocalLmstudioBaseUrl(providerConfig.baseUrl)) return {
				found: false,
				warnings: ["LM Studio metadata detection is limited to local baseUrl values; using defaults."]
			};
			try {
				const { apiKey, headers } = await resolveLmstudioRequestContext({
					config: {
						...cfg,
						models: {
							...cfg.models,
							providers: {
								...cfg.models?.providers,
								lmstudio: providerConfig
							}
						}
					},
					env: process.env,
					providerHeaders: providerConfig.headers
				});
				const match = (await fetchLmstudioModels({
					baseUrl: providerConfig.baseUrl,
					apiKey,
					headers,
					ssrfPolicy: buildRemoteBaseUrlPolicy(providerConfig.baseUrl)
				})).models.find((entry) => normalizeOptionalString(entry.key) === modelId);
				const base = match ? mapLmstudioWireEntry(match) : null;
				if (!base) return { found: false };
				return {
					found: true,
					model: {
						id: base.id,
						name: base.displayName,
						reasoning: base.reasoning,
						input: base.input,
						cost: base.cost,
						contextWindow: base.contextWindow,
						contextTokens: base.contextTokens,
						maxTokens: base.maxTokens
					}
				};
			} catch (error) {
				log.warn("lmstudio model metadata detection failed; using defaults", {
					baseUrl: sanitizeUrlForLogs(providerConfig.baseUrl),
					modelId,
					error: formatErrorMessage(error)
				});
				return {
					found: false,
					warnings: ["LM Studio metadata detection failed; using defaults."]
				};
			}
		}
	}
};
function canAddProvider(params) {
	const provider = normalizeProviderId(params.provider);
	if (!provider) return false;
	if (resolveConfiguredProvider(params.cfg, provider)) return true;
	return !!MODEL_ADD_ADAPTERS[provider]?.bootstrapProviderConfig?.(params.cfg);
}
function listAddableProviders(params) {
	const providers = /* @__PURE__ */ new Set();
	for (const provider of params.discoveredProviders ?? []) {
		const normalized = normalizeProviderId(provider);
		if (normalized && canAddProvider({
			cfg: params.cfg,
			provider: normalized
		})) providers.add(normalized);
	}
	for (const provider of Object.keys(params.cfg.models?.providers ?? {})) {
		const normalized = normalizeProviderId(provider);
		if (normalized) providers.add(normalized);
	}
	for (const provider of Object.keys(MODEL_ADD_ADAPTERS)) providers.add(provider);
	return [...providers].toSorted();
}
function validateAddProvider(params) {
	const provider = normalizeProviderId(params.provider);
	const providers = listAddableProviders({
		cfg: params.cfg,
		discoveredProviders: params.discoveredProviders
	});
	if (!provider || !providers.includes(provider)) return {
		ok: false,
		providers
	};
	return {
		ok: true,
		provider
	};
}
function ensureProviderConfig(params) {
	const configuredProvider = resolveConfiguredProvider(params.cfg, params.provider);
	if (configuredProvider) return {
		ok: true,
		providerKey: configuredProvider.providerKey,
		providerConfig: configuredProvider.providerConfig,
		bootstrapped: false
	};
	const bootstrapped = MODEL_ADD_ADAPTERS[params.provider]?.bootstrapProviderConfig?.(params.cfg);
	if (!bootstrapped) return { ok: false };
	return {
		ok: true,
		providerKey: params.provider,
		providerConfig: bootstrapped,
		bootstrapped: true
	};
}
async function detectModelDefinition(params) {
	const adapter = MODEL_ADD_ADAPTERS[params.provider];
	if (!adapter?.detect) return {
		model: buildDefaultModelDefinition(params.modelId),
		warnings: ["Model metadata could not be auto-detected; saved with default capabilities."]
	};
	const detected = await adapter.detect(params);
	if (detected.found && detected.model) return {
		model: detected.model,
		warnings: detected.warnings ?? []
	};
	return {
		model: buildDefaultModelDefinition(params.modelId),
		warnings: [...detected.warnings ?? [], "Model metadata could not be auto-detected; saved with default capabilities."]
	};
}
function upsertModelEntry(params) {
	const nextConfig = structuredClone(params.cfg);
	nextConfig.models ??= {};
	nextConfig.models.providers ??= {};
	const existingProvider = nextConfig.models.providers[params.providerKey];
	const providerConfig = existingProvider ? {
		...existingProvider,
		models: Array.isArray(existingProvider.models) ? [...existingProvider.models] : []
	} : {
		...params.providerConfig,
		models: Array.isArray(params.providerConfig.models) ? [...params.providerConfig.models] : []
	};
	const modelKey = normalizeLowercaseStringOrEmpty(params.model.id);
	const existed = providerConfig.models.findIndex((entry) => normalizeLowercaseStringOrEmpty(entry?.id) === modelKey) !== -1;
	if (!existed) providerConfig.models.push(params.model);
	nextConfig.models.providers[params.providerKey] = providerConfig;
	return {
		nextConfig,
		existed
	};
}
function maybeAddAllowlistEntry(params) {
	const allowlistKeys = buildConfiguredAllowlistKeys({
		cfg: params.cfg,
		defaultProvider: resolveDefaultModelForAgent({ cfg: params.cfg }).provider
	});
	if (!allowlistKeys || allowlistKeys.size === 0) return {
		nextConfig: params.cfg,
		added: false
	};
	const resolved = resolveModelRefFromString({
		raw: `${params.provider}/${params.modelId}`,
		defaultProvider: resolveDefaultModelForAgent({ cfg: params.cfg }).provider
	});
	if (!resolved) return {
		nextConfig: params.cfg,
		added: false
	};
	const normalizedKey = `${resolved.ref.provider}/${resolved.ref.model}`.toLowerCase();
	if (allowlistKeys.has(normalizedKey)) return {
		nextConfig: params.cfg,
		added: false
	};
	const nextConfig = structuredClone(params.cfg);
	nextConfig.agents ??= {};
	nextConfig.agents.defaults ??= {};
	nextConfig.agents.defaults.models ??= {};
	nextConfig.agents.defaults.models[`${params.provider}/${params.modelId}`] = {};
	return {
		nextConfig,
		added: true
	};
}
async function addModelToConfig(params) {
	const provider = normalizeProviderId(params.provider);
	const modelId = normalizeOptionalString(params.modelId) ?? "";
	if (!provider || !modelId) return {
		ok: false,
		error: "Provider and model id are required."
	};
	const snapshot = await readConfigFileSnapshot();
	if (!snapshot.valid || !snapshot.parsed || typeof snapshot.parsed !== "object") return {
		ok: false,
		error: "Config file is invalid; fix it before using /models add."
	};
	const currentConfig = structuredClone(snapshot.parsed);
	const providerResolution = ensureProviderConfig({
		cfg: currentConfig,
		provider
	});
	if (!providerResolution.ok) return {
		ok: false,
		error: `Provider "${provider}" is not configured for custom models yet. Configure the provider first, then retry /models add.`
	};
	const detected = await detectModelDefinition({
		cfg: currentConfig,
		provider,
		providerConfig: providerResolution.providerConfig,
		modelId
	});
	const upserted = upsertModelEntry({
		cfg: currentConfig,
		provider,
		providerKey: providerResolution.providerKey,
		providerConfig: providerResolution.providerConfig,
		model: detected.model
	});
	const allowlisted = maybeAddAllowlistEntry({
		cfg: upserted.nextConfig,
		provider,
		modelId
	});
	if (!(!upserted.existed || allowlisted.added || providerResolution.bootstrapped)) return {
		ok: true,
		result: {
			provider,
			modelId,
			existed: true,
			allowlistAdded: false,
			warnings: detected.warnings
		}
	};
	const validated = validateConfigObjectWithPlugins(allowlisted.nextConfig);
	if (!validated.ok) {
		const issue = validated.issues[0];
		return {
			ok: false,
			error: `Config invalid after /models add (${issue ? `${issue.path}: ${issue.message}` : "unknown validation error"}).`
		};
	}
	try {
		await replaceConfigFile({
			nextConfig: validated.config,
			...snapshot.hash !== void 0 ? { baseHash: snapshot.hash } : {}
		});
	} catch (error) {
		if (error instanceof ConfigMutationConflictError) return {
			ok: false,
			error: "Config changed while /models add was running. Retry the command."
		};
		throw error;
	}
	return {
		ok: true,
		result: {
			provider,
			modelId,
			existed: upserted.existed,
			allowlistAdded: allowlisted.added,
			warnings: detected.warnings
		}
	};
}
//#endregion
//#region src/auto-reply/reply/commands-models.ts
const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;
async function buildModelsProviderData(cfg, agentId) {
	const resolvedDefault = resolveDefaultModelForAgent({
		cfg,
		agentId
	});
	const catalog = await loadModelCatalog({ config: cfg });
	const allowed = buildAllowedModelSet({
		cfg,
		catalog,
		defaultProvider: resolvedDefault.provider,
		defaultModel: resolvedDefault.model,
		agentId
	});
	const aliasIndex = buildModelAliasIndex({
		cfg,
		defaultProvider: resolvedDefault.provider
	});
	const byProvider = /* @__PURE__ */ new Map();
	const add = (p, m) => {
		const key = normalizeProviderId(p);
		const set = byProvider.get(key) ?? /* @__PURE__ */ new Set();
		set.add(m);
		byProvider.set(key, set);
	};
	const addRawModelRef = (raw) => {
		const trimmed = normalizeOptionalString(raw);
		if (!trimmed) return;
		const resolved = resolveModelRefFromString({
			raw: trimmed,
			defaultProvider: resolvedDefault.provider,
			aliasIndex
		});
		if (!resolved) return;
		add(resolved.ref.provider, resolved.ref.model);
	};
	const addModelConfigEntries = () => {
		const modelConfig = cfg.agents?.defaults?.model;
		if (typeof modelConfig === "string") addRawModelRef(modelConfig);
		else if (modelConfig && typeof modelConfig === "object") {
			addRawModelRef(modelConfig.primary);
			for (const fallback of modelConfig.fallbacks ?? []) addRawModelRef(fallback);
		}
		const imageConfig = cfg.agents?.defaults?.imageModel;
		if (typeof imageConfig === "string") addRawModelRef(imageConfig);
		else if (imageConfig && typeof imageConfig === "object") {
			addRawModelRef(imageConfig.primary);
			for (const fallback of imageConfig.fallbacks ?? []) addRawModelRef(fallback);
		}
	};
	for (const entry of allowed.allowedCatalog) add(entry.provider, entry.id);
	for (const raw of Object.keys(cfg.agents?.defaults?.models ?? {})) addRawModelRef(raw);
	add(resolvedDefault.provider, resolvedDefault.model);
	addModelConfigEntries();
	const providers = [...byProvider.keys()].toSorted();
	const modelNames = /* @__PURE__ */ new Map();
	for (const entry of catalog) if (entry.name && entry.name !== entry.id) modelNames.set(`${normalizeProviderId(entry.provider)}/${entry.id}`, entry.name);
	return {
		byProvider,
		providers,
		resolvedDefault,
		modelNames
	};
}
function formatProviderLine(params) {
	return `- ${params.provider} (${params.count})`;
}
function parseListArgs(tokens) {
	const provider = normalizeOptionalString(tokens[0]);
	let page = 1;
	let all = false;
	for (const token of tokens.slice(1)) {
		const lower = normalizeLowercaseStringOrEmpty(token);
		if (lower === "all" || lower === "--all") {
			all = true;
			continue;
		}
		if (lower.startsWith("page=")) {
			const value = Number.parseInt(lower.slice(5), 10);
			if (Number.isFinite(value) && value > 0) page = value;
			continue;
		}
		if (/^[0-9]+$/.test(lower)) {
			const value = Number.parseInt(lower, 10);
			if (Number.isFinite(value) && value > 0) page = value;
		}
	}
	let pageSize = PAGE_SIZE_DEFAULT;
	for (const token of tokens) {
		const lower = normalizeLowercaseStringOrEmpty(token);
		if (lower.startsWith("limit=") || lower.startsWith("size=")) {
			const rawValue = lower.slice(lower.indexOf("=") + 1);
			const value = Number.parseInt(rawValue, 10);
			if (Number.isFinite(value) && value > 0) pageSize = Math.min(PAGE_SIZE_MAX, value);
		}
	}
	return {
		action: "list",
		provider: provider ? normalizeProviderId(provider) : void 0,
		page,
		pageSize,
		all
	};
}
function parseModelsArgs(raw) {
	const trimmed = raw.trim();
	if (!trimmed) return { action: "providers" };
	const tokens = trimmed.split(/\s+/g).filter(Boolean);
	switch (normalizeLowercaseStringOrEmpty(tokens[0])) {
		case "providers": return { action: "providers" };
		case "list": return parseListArgs(tokens.slice(1));
		case "add": return {
			action: "add",
			provider: normalizeOptionalString(tokens[1]),
			modelId: normalizeOptionalString(tokens.slice(2).join(" "))
		};
		default: return parseListArgs(tokens);
	}
}
function resolveProviderLabel(params) {
	const authLabel = resolveModelAuthLabel({
		provider: params.provider,
		cfg: params.cfg,
		sessionEntry: params.sessionEntry,
		agentDir: params.agentDir
	});
	if (!authLabel || authLabel === "unknown") return params.provider;
	return `${params.provider} · 🔑 ${authLabel}`;
}
function formatModelsAvailableHeader(params) {
	return `Models (${resolveProviderLabel({
		provider: params.provider,
		cfg: params.cfg,
		agentDir: params.agentDir,
		sessionEntry: params.sessionEntry
	})}) — ${params.total} available`;
}
function buildModelsMenuText(params) {
	return [
		"Providers:",
		...params.providers.map((provider) => formatProviderLine({
			provider,
			count: params.byProvider.get(provider)?.size ?? 0
		})),
		"",
		"Use: /models <provider>",
		"Switch: /model <provider/model>",
		...params.includeAddAction ? ["Add: /models add"] : []
	].join("\n");
}
function formatCopyableCommand(command) {
	return [
		"```text",
		command,
		"```"
	].join("\n");
}
function buildAddExamples(addableProviders) {
	const examples = [];
	if (addableProviders.includes("ollama")) examples.push("/models add ollama glm-5.1:cloud");
	if (addableProviders.includes("lmstudio")) examples.push("/models add lmstudio qwen/qwen3.5-9b");
	if (addableProviders.includes("codex")) examples.push("/models add codex gpt-5.4-mini");
	if (addableProviders.includes("openai-codex")) examples.push("/models add openai-codex gpt-5.4");
	if (examples.length === 0) examples.push("/models add <provider> <modelId>");
	return examples.slice(0, 3);
}
function resolveWriteProvider(params) {
	if (params.parsed.action !== "add") return;
	return params.parsed.provider ? normalizeProviderId(params.parsed.provider) : void 0;
}
function buildProviderInfos(params) {
	return params.providers.map((provider) => ({
		id: provider,
		count: params.byProvider.get(provider)?.size ?? 0
	}));
}
async function resolveModelsCommandReply(params) {
	const body = params.commandBodyNormalized.trim();
	if (!body.startsWith("/models")) return null;
	const parsed = parseModelsArgs(body.replace(/^\/models\b/i, "").trim());
	const { byProvider, providers, modelNames } = await buildModelsProviderData(params.cfg, params.agentId);
	const commandPlugin = params.surface ? getChannelPlugin(params.surface) : null;
	const providerInfos = buildProviderInfos({
		providers,
		byProvider
	});
	const modelsWriteEnabled = isModelsWriteEnabled(params.cfg);
	if (parsed.action === "providers") {
		const channelData = (modelsWriteEnabled ? commandPlugin?.commands?.buildModelsMenuChannelData?.({ providers: providerInfos }) : null) ?? commandPlugin?.commands?.buildModelsProviderChannelData?.({ providers: providerInfos });
		if (channelData) return {
			text: "Select a provider:",
			channelData
		};
		return { text: buildModelsMenuText({
			providers,
			byProvider,
			includeAddAction: modelsWriteEnabled
		}) };
	}
	if (parsed.action === "add") {
		if (!modelsWriteEnabled) return { text: "⚠️ /models add is disabled. Set commands.modelsWrite=true to enable model registration." };
		const addableProviders = listAddableProviders({
			cfg: params.cfg,
			discoveredProviders: providers
		});
		if (!parsed.provider) {
			const channelData = commandPlugin?.commands?.buildModelsAddProviderChannelData?.({ providers: addableProviders.map((id) => ({ id })) });
			return {
				text: [
					"Add a model: choose a provider, then send one of these example commands.",
					"",
					"These examples use models that already exist for those providers.",
					"",
					...buildAddExamples(addableProviders).flatMap((example) => [formatCopyableCommand(example), ""]),
					"Generic form:",
					formatCopyableCommand("/models add <provider> <modelId>"),
					"",
					"Providers:",
					...addableProviders.map((provider) => `- ${provider}`)
				].join("\n"),
				...channelData ? { channelData } : {}
			};
		}
		const validatedProvider = validateAddProvider({
			cfg: params.cfg,
			provider: parsed.provider,
			discoveredProviders: providers
		});
		if (!validatedProvider.ok) return { text: [
			`Unknown provider: ${parsed.provider}`,
			"",
			"Available providers:",
			...validatedProvider.providers.map((provider) => `- ${provider}`),
			"",
			"Use:",
			"/models add <provider> <modelId>"
		].join("\n") };
		if (!parsed.modelId) return { text: [
			`Add a model to ${validatedProvider.provider}:`,
			"",
			"Use:",
			formatCopyableCommand(`/models add ${validatedProvider.provider} <modelId>`),
			"",
			"Browse current models:",
			formatCopyableCommand(`/models ${validatedProvider.provider}`)
		].join("\n") };
		const added = await addModelToConfig({
			cfg: params.cfg,
			provider: validatedProvider.provider,
			modelId: parsed.modelId
		});
		if (!added.ok) return { text: `⚠️ ${added.error}` };
		const modelRef = `${added.result.provider}/${added.result.modelId}`;
		const warnings = added.result.warnings.length > 0 ? ["", ...added.result.warnings.map((warning) => `- ${warning}`)] : [];
		const allowlistNote = added.result.allowlistAdded ? " and added to the allowlist" : "";
		return { text: [
			added.result.existed ? `✅ Model already exists: ${modelRef}${allowlistNote}.` : `✅ Added model: ${modelRef}${allowlistNote}.`,
			"Browse:",
			`/models ${added.result.provider}`,
			"",
			"Switch now:",
			`/model ${modelRef}`,
			...warnings
		].join("\n") };
	}
	const { provider, page, pageSize, all } = parsed;
	if (!provider) {
		const channelData = commandPlugin?.commands?.buildModelsProviderChannelData?.({ providers: providerInfos });
		if (channelData) return {
			text: "Select a provider:",
			channelData
		};
		return { text: buildModelsMenuText({
			providers,
			byProvider,
			includeAddAction: modelsWriteEnabled
		}) };
	}
	if (!byProvider.has(provider)) return { text: [
		`Unknown provider: ${provider}`,
		"",
		"Available providers:",
		...providers.map((entry) => `- ${entry}`),
		"",
		"Use: /models <provider>"
	].join("\n") };
	const models = [...byProvider.get(provider) ?? /* @__PURE__ */ new Set()].toSorted();
	const total = models.length;
	if (total === 0) return { text: [
		`Models (${resolveProviderLabel({
			provider,
			cfg: params.cfg,
			agentDir: params.agentDir,
			sessionEntry: params.sessionEntry
		})}) — none`,
		"",
		"Browse: /models",
		"Switch: /model <provider/model>"
	].join("\n") };
	const interactivePageSize = 8;
	const interactiveTotalPages = Math.max(1, Math.ceil(total / interactivePageSize));
	const interactivePage = Math.max(1, Math.min(page, interactiveTotalPages));
	const interactiveChannelData = commandPlugin?.commands?.buildModelsListChannelData?.({
		provider,
		models,
		currentModel: params.currentModel,
		currentPage: interactivePage,
		totalPages: interactiveTotalPages,
		pageSize: interactivePageSize,
		modelNames
	});
	if (interactiveChannelData) return {
		text: formatModelsAvailableHeader({
			provider,
			total,
			cfg: params.cfg,
			agentDir: params.agentDir,
			sessionEntry: params.sessionEntry
		}),
		channelData: interactiveChannelData
	};
	const effectivePageSize = all ? total : pageSize;
	const pageCount = effectivePageSize > 0 ? Math.ceil(total / effectivePageSize) : 1;
	const safePage = all ? 1 : Math.max(1, Math.min(page, pageCount));
	if (!all && page !== safePage) return { text: [
		`Page out of range: ${page} (valid: 1-${pageCount})`,
		"",
		`Try: /models list ${provider} ${safePage}`,
		`All: /models list ${provider} all`
	].join("\n") };
	const startIndex = (safePage - 1) * effectivePageSize;
	const endIndexExclusive = Math.min(total, startIndex + effectivePageSize);
	const pageModels = models.slice(startIndex, endIndexExclusive);
	const lines = [`Models (${resolveProviderLabel({
		provider,
		cfg: params.cfg,
		agentDir: params.agentDir,
		sessionEntry: params.sessionEntry
	})}) — showing ${startIndex + 1}-${endIndexExclusive} of ${total} (page ${safePage}/${pageCount})`];
	for (const id of pageModels) lines.push(`- ${provider}/${id}`);
	lines.push("", "Switch: /model <provider/model>");
	if (!all && safePage < pageCount) lines.push(`More: /models list ${provider} ${safePage + 1}`);
	if (!all) lines.push(`All: /models list ${provider} all`);
	return { text: lines.join("\n") };
}
const handleModelsCommand = async (params, allowTextCommands) => {
	if (!allowTextCommands) return null;
	const commandBodyNormalized = params.command.commandBodyNormalized.trim();
	if (!commandBodyNormalized.startsWith("/models")) return null;
	const parsed = parseModelsArgs(commandBodyNormalized.replace(/^\/models\b/i, "").trim());
	const unauthorized = rejectUnauthorizedCommand(params, "/models");
	if (unauthorized) return unauthorized;
	if (parsed.action === "add") {
		if (!isModelsWriteEnabled(params.cfg)) return {
			shouldContinue: false,
			reply: { text: "⚠️ /models add is disabled. Set commands.modelsWrite=true to enable model registration." }
		};
		const commandLabel = "/models add";
		const nonOwner = rejectNonOwnerCommand(params, commandLabel);
		if (nonOwner) return nonOwner;
		const missingAdminScope = requireGatewayClientScopeForInternalChannel(params, {
			label: commandLabel,
			allowedScopes: ["operator.admin"],
			missingText: "❌ /models add requires operator.admin for gateway clients."
		});
		if (missingAdminScope) return missingAdminScope;
		const writeProvider = resolveWriteProvider({
			cfg: params.cfg,
			parsed
		});
		if (writeProvider) {
			const channelId = params.command.channelId ?? normalizeChannelId(params.command.channel);
			const accountId = resolveChannelAccountId({
				cfg: params.cfg,
				ctx: params.ctx,
				command: params.command
			});
			for (const path of [
				[
					"models",
					"providers",
					writeProvider
				],
				[
					"models",
					"providers",
					writeProvider,
					"models"
				],
				[
					"agents",
					"defaults",
					"models"
				]
			]) {
				const deniedText = resolveConfigWriteDeniedText({
					cfg: params.cfg,
					channel: params.command.channel,
					channelId,
					accountId,
					gatewayClientScopes: params.ctx.GatewayClientScopes,
					target: resolveConfigWriteTargetFromPath(path)
				});
				if (deniedText) return {
					shouldContinue: false,
					reply: { text: deniedText }
				};
			}
		}
	}
	const modelsAgentId = params.sessionKey ? resolveSessionAgentId({
		sessionKey: params.sessionKey,
		config: params.cfg
	}) : params.agentId ?? "main";
	const modelsAgentDir = modelsAgentId === (params.agentId ?? "main") && params.agentDir ? params.agentDir : resolveAgentDir(params.cfg, modelsAgentId);
	const targetSessionEntry = params.sessionStore?.[params.sessionKey] ?? params.sessionEntry;
	const reply = await resolveModelsCommandReply({
		cfg: params.cfg,
		commandBodyNormalized,
		surface: params.ctx.Surface,
		currentModel: params.model ? `${params.provider}/${params.model}` : void 0,
		agentId: modelsAgentId,
		agentDir: modelsAgentDir,
		sessionEntry: targetSessionEntry
	});
	if (!reply) return null;
	return {
		reply,
		shouldContinue: false
	};
};
//#endregion
export { resolveConfigWriteDeniedText as a, resolveModelsCommandReply as i, formatModelsAvailableHeader as n, resolveConfigWriteTargetFromPath as o, handleModelsCommand as r, buildModelsProviderData as t };
