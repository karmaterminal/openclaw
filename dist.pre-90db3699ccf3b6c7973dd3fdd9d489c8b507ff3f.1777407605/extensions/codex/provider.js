import { resolveCodexSystemPromptContribution } from "./prompt-overlay.js";
import { CODEX_APP_SERVER_AUTH_MARKER, CODEX_BASE_URL, CODEX_PROVIDER_ID, FALLBACK_CODEX_MODELS, buildCodexModelDefinition, buildCodexProviderConfig } from "./provider-catalog.js";
import { n as readCodexPluginConfig, r as resolveCodexAppServerRuntimeOptions } from "./config-C9_NiPaE.js";
import { resolvePluginConfigObject } from "openclaw/plugin-sdk/config-runtime";
import { normalizeModelCompat } from "openclaw/plugin-sdk/provider-model-shared";
//#region extensions/codex/provider.ts
const DEFAULT_DISCOVERY_TIMEOUT_MS = 2500;
const LIVE_DISCOVERY_ENV = "OPENCLAW_CODEX_DISCOVERY_LIVE";
function buildCodexProvider(options = {}) {
	return {
		id: CODEX_PROVIDER_ID,
		label: "Codex",
		docsPath: "/providers/models",
		auth: [],
		catalog: {
			order: "late",
			run: async (ctx) => {
				const pluginConfig = resolvePluginConfigObject(ctx.config, "codex") ?? (ctx.config ? void 0 : options.pluginConfig);
				return await buildCodexProviderCatalog({
					env: ctx.env,
					pluginConfig,
					listModels: options.listModels
				});
			}
		},
		staticCatalog: {
			order: "late",
			run: async () => ({ provider: buildCodexProviderConfig(FALLBACK_CODEX_MODELS) })
		},
		resolveDynamicModel: (ctx) => resolveCodexDynamicModel(ctx.modelId),
		resolveSyntheticAuth: () => ({
			apiKey: CODEX_APP_SERVER_AUTH_MARKER,
			source: "codex-app-server",
			mode: "token"
		}),
		resolveThinkingProfile: ({ modelId }) => ({ levels: [
			{ id: "off" },
			{ id: "minimal" },
			{ id: "low" },
			{ id: "medium" },
			{ id: "high" },
			...isKnownXHighCodexModel(modelId) ? [{ id: "xhigh" }] : []
		] }),
		resolveSystemPromptContribution: ({ config, modelId }) => resolveCodexSystemPromptContribution({
			config,
			modelId
		}),
		isModernModelRef: ({ modelId }) => isModernCodexModel(modelId)
	};
}
async function buildCodexProviderCatalog(options = {}) {
	const config = readCodexPluginConfig(options.pluginConfig);
	const appServer = resolveCodexAppServerRuntimeOptions({ pluginConfig: options.pluginConfig });
	const timeoutMs = normalizeTimeoutMs(config.discovery?.timeoutMs);
	let discovered = [];
	if (config.discovery?.enabled !== false && !shouldSkipLiveDiscovery(options.env)) discovered = await listModelsBestEffort({
		listModels: options.listModels ?? listCodexAppServerModelsLazy,
		timeoutMs,
		startOptions: appServer.start
	});
	return { provider: buildCodexProviderConfig(discovered.length > 0 ? discovered : FALLBACK_CODEX_MODELS) };
}
function resolveCodexDynamicModel(modelId) {
	const id = modelId.trim();
	if (!id) return;
	return normalizeModelCompat({
		...buildCodexModelDefinition({
			id,
			model: id,
			inputModalities: ["text", "image"],
			supportedReasoningEfforts: shouldDefaultToReasoningModel(id) ? ["medium"] : []
		}),
		provider: CODEX_PROVIDER_ID,
		baseUrl: CODEX_BASE_URL
	});
}
async function listModelsBestEffort(params) {
	try {
		return (await params.listModels({
			timeoutMs: params.timeoutMs,
			limit: 100,
			startOptions: params.startOptions,
			sharedClient: false
		})).models.filter((model) => !model.hidden);
	} catch {
		return [];
	}
}
async function listCodexAppServerModelsLazy(options) {
	const { listCodexAppServerModels } = await import("./models-COWB2vD5.js");
	return listCodexAppServerModels(options);
}
function normalizeTimeoutMs(value) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : DEFAULT_DISCOVERY_TIMEOUT_MS;
}
function shouldSkipLiveDiscovery(env = process.env) {
	const override = env[LIVE_DISCOVERY_ENV]?.trim().toLowerCase();
	if (override === "0" || override === "false") return true;
	return Boolean(env.VITEST) && override !== "1";
}
function shouldDefaultToReasoningModel(modelId) {
	const lower = modelId.toLowerCase();
	return lower.startsWith("gpt-5") || lower.startsWith("o1") || lower.startsWith("o3") || lower.startsWith("o4");
}
function isKnownXHighCodexModel(modelId) {
	const lower = modelId.trim().toLowerCase();
	return lower.startsWith("gpt-5") || lower.startsWith("o3") || lower.startsWith("o4") || lower.includes("codex");
}
function isModernCodexModel(modelId) {
	const lower = modelId.trim().toLowerCase();
	return lower === "gpt-5.4" || lower === "gpt-5.4-mini" || lower === "gpt-5.2";
}
//#endregion
export { buildCodexProvider, buildCodexProviderCatalog };
