import { a as normalizeLowercaseStringOrEmpty, c as normalizeOptionalString } from "./string-coerce-Bje8XVt9.js";
import { r as normalizeProviderId } from "./provider-id-X2THsZiv.js";
import { t as createSubsystemLogger } from "./subsystem-W9_E260X.js";
import { i as getRuntimeConfig } from "./io-DTtpq82f.js";
import "./config-DbmohW6s.js";
import { t as resolveOpenClawAgentDir } from "./agent-paths-CkJkZaS2.js";
import { b as modelSupportsInput, r as buildConfiguredModelCatalog } from "./model-selection-shared-C_hgcjGe.js";
import { t as augmentModelCatalogWithProviderPlugins } from "./provider-runtime.runtime-nnPVvs6y.js";
import { n as ensureOpenClawModelsJson } from "./models-config-B12DlGPT.js";
import { join } from "node:path";
//#region src/agents/model-catalog.ts
const log = createSubsystemLogger("model-catalog");
let modelCatalogPromise = null;
let hasLoggedModelCatalogError = false;
const defaultImportPiSdk = () => import("./agents/pi-model-discovery-runtime.js");
let importPiSdk = defaultImportPiSdk;
let modelSuppressionPromise;
function shouldLogModelCatalogTiming() {
	return process.env.OPENCLAW_DEBUG_INGRESS_TIMING === "1";
}
function loadModelSuppression() {
	modelSuppressionPromise ??= import("./model-suppression.runtime-C58mzQTQ.js");
	return modelSuppressionPromise;
}
function resetModelCatalogCache() {
	modelCatalogPromise = null;
	hasLoggedModelCatalogError = false;
}
function resetModelCatalogCacheForTest() {
	resetModelCatalogCache();
	importPiSdk = defaultImportPiSdk;
}
function __setModelCatalogImportForTest(loader) {
	importPiSdk = loader ?? defaultImportPiSdk;
}
function instantiatePiModelRegistry(piSdk, authStorage, modelsFile) {
	const Registry = piSdk.ModelRegistry;
	if (typeof Registry.create === "function") return Registry.create(authStorage, modelsFile);
	return new Registry(authStorage, modelsFile);
}
function catalogEntryDedupeKey(provider, id) {
	return `${normalizeProviderId(provider)}::${normalizeLowercaseStringOrEmpty(id)}`;
}
function appendCatalogEntriesIfAbsent(models, entries) {
	const seen = new Set(models.map((entry) => catalogEntryDedupeKey(entry.provider, entry.id)));
	for (const entry of entries) {
		const key = catalogEntryDedupeKey(entry.provider, entry.id);
		if (seen.has(key)) continue;
		models.push(entry);
		seen.add(key);
	}
}
async function loadModelCatalog(params) {
	const readOnly = params?.readOnly === true;
	if (!readOnly && params?.useCache === false) modelCatalogPromise = null;
	if (!readOnly && modelCatalogPromise) return modelCatalogPromise;
	const loadCatalog = async () => {
		const models = [];
		const timingEnabled = shouldLogModelCatalogTiming();
		const startMs = timingEnabled ? Date.now() : 0;
		const logStage = (stage, extra) => {
			if (!timingEnabled) return;
			const suffix = extra ? ` ${extra}` : "";
			log.info(`model-catalog stage=${stage} elapsedMs=${Date.now() - startMs}${suffix}`);
		};
		const sortModels = (entries) => entries.sort((a, b) => {
			const p = a.provider.localeCompare(b.provider);
			if (p !== 0) return p;
			return a.name.localeCompare(b.name);
		});
		try {
			const cfg = params?.config ?? getRuntimeConfig();
			if (!readOnly) {
				await ensureOpenClawModelsJson(cfg);
				logStage("models-json-ready");
			}
			const piSdk = await importPiSdk();
			logStage("pi-sdk-imported");
			const agentDir = resolveOpenClawAgentDir();
			const { buildShouldSuppressBuiltInModel } = await loadModelSuppression();
			logStage("catalog-deps-ready");
			const authStorage = piSdk.discoverAuthStorage(agentDir, readOnly ? { readOnly: true } : void 0);
			logStage("auth-storage-ready");
			const registry = instantiatePiModelRegistry(piSdk, authStorage, join(agentDir, "models.json"));
			logStage("registry-ready");
			const entries = Array.isArray(registry) ? registry : registry.getAll();
			logStage("registry-read", `entries=${entries.length}`);
			const shouldSuppressBuiltInModel = buildShouldSuppressBuiltInModel({ config: cfg });
			logStage("suppress-resolver-ready");
			for (const entry of entries) {
				const id = normalizeOptionalString(entry?.id) ?? "";
				if (!id) continue;
				const provider = normalizeOptionalString(entry?.provider) ?? "";
				if (!provider) continue;
				if (shouldSuppressBuiltInModel({
					provider,
					id
				})) continue;
				const name = normalizeOptionalString(entry?.name ?? id) || id;
				const contextWindow = typeof entry?.contextWindow === "number" && entry.contextWindow > 0 ? entry.contextWindow : void 0;
				const reasoning = typeof entry?.reasoning === "boolean" ? entry.reasoning : void 0;
				const input = Array.isArray(entry?.input) ? entry.input : void 0;
				const compat = entry?.compat && typeof entry.compat === "object" ? entry.compat : void 0;
				models.push({
					id,
					name,
					provider,
					contextWindow,
					reasoning,
					input,
					compat
				});
			}
			const supplemental = await augmentModelCatalogWithProviderPlugins({
				config: cfg,
				env: process.env,
				context: {
					config: cfg,
					agentDir,
					env: process.env,
					entries: [...models]
				}
			});
			if (supplemental.length > 0) appendCatalogEntriesIfAbsent(models, supplemental);
			logStage("plugin-models-merged", `entries=${models.length}`);
			const configuredModels = buildConfiguredModelCatalog({ cfg });
			if (configuredModels.length > 0) appendCatalogEntriesIfAbsent(models, configuredModels);
			logStage("configured-models-merged", `entries=${models.length}`);
			if (models.length === 0) {
				if (!readOnly) modelCatalogPromise = null;
			}
			const sorted = sortModels(models);
			logStage("complete", `entries=${sorted.length}`);
			return sorted;
		} catch (error) {
			if (!hasLoggedModelCatalogError) {
				hasLoggedModelCatalogError = true;
				log.warn(`Failed to load model catalog: ${String(error)}`);
			}
			if (!readOnly) modelCatalogPromise = null;
			if (models.length > 0) return sortModels(models);
			return [];
		}
	};
	if (readOnly) return loadCatalog();
	modelCatalogPromise = loadCatalog();
	return modelCatalogPromise;
}
/**
* Check if a model supports image input based on its catalog entry.
*/
function modelSupportsVision(entry) {
	return modelSupportsInput(entry, "image");
}
/**
* Check if a model supports native document/PDF input based on its catalog entry.
*/
function modelSupportsDocument(entry) {
	return modelSupportsInput(entry, "document");
}
//#endregion
export { resetModelCatalogCache as a, modelSupportsVision as i, loadModelCatalog as n, resetModelCatalogCacheForTest as o, modelSupportsDocument as r, __setModelCatalogImportForTest as t };
