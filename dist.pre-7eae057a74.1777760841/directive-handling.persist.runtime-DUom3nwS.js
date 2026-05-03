import { ot as listLegacyRuntimeModelProviderAliases } from "./io-5jzTw2vS.js";
import { r as normalizeProviderId } from "./provider-id-B5Rvwwf4.js";
import "./defaults-CV5sAt-u.js";
import { p as resolveSessionAgentId, x as resolveDefaultAgentId, y as resolveAgentDir } from "./agent-scope-BrwtzVtf.js";
import { a as resolveContextTokensForModel } from "./context-B7ZsdwiZ.js";
import { n as isThinkingLevelSupported, o as resolveSupportedThinkingLevel } from "./thinking-DYmORkoK.js";
import "./model-selection-DwvfvFe2.js";
import { c as updateSessionStore, f as resolveSessionStoreEntry } from "./store-DtATwbu4.js";
import { i as enqueueSystemEvent } from "./system-events-Cg3E-qpj.js";
import { t as applyModelOverrideToSessionEntry } from "./model-overrides-BDrweSNt.js";
import { t as resolveModelSelectionFromDirective } from "./directive-handling.model-selection-C8nb1FBE.js";
import { n as applyVerboseOverride, t as applyTraceOverride } from "./level-overrides-CBSi3vT9.js";
import { n as canPersistInternalVerboseDirective, r as enqueueModeSwitchEvents, t as canPersistInternalExecDirective } from "./directive-handling.shared-BYjB7_i9.js";
//#region src/auto-reply/reply/directive-handling.persist.ts
const MODEL_RUNTIME_CLEAR_VALUES = new Set(["auto", "default"]);
function resolveModelRuntimeOverride(params) {
	const rawRuntime = params.rawRuntime?.trim();
	if (!rawRuntime) return;
	const runtime = normalizeProviderId(rawRuntime);
	if (MODEL_RUNTIME_CLEAR_VALUES.has(runtime)) return { kind: "clear" };
	if (runtime === "pi") return {
		kind: "set",
		runtime: "pi"
	};
	const provider = normalizeProviderId(params.provider);
	for (const alias of listLegacyRuntimeModelProviderAliases()) {
		if (normalizeProviderId(alias.provider) !== provider) continue;
		const aliasRuntime = normalizeProviderId(alias.runtime);
		if (runtime === aliasRuntime || aliasRuntime === "codex" && runtime === "codex-app-server") return {
			kind: "set",
			runtime: alias.runtime
		};
	}
	return {
		kind: "invalid",
		runtime: rawRuntime
	};
}
async function persistInlineDirectives(params) {
	const { directives, cfg, sessionEntry, sessionStore, sessionKey, storePath, elevatedEnabled, elevatedAllowed, defaultProvider, defaultModel, aliasIndex, allowedModelKeys, initialModelLabel, formatModelSwitchEvent, agentCfg } = params;
	let { provider, model } = params;
	let thinkingRemap;
	const allowInternalExecPersistence = canPersistInternalExecDirective({
		messageProvider: params.messageProvider,
		surface: params.surface,
		gatewayClientScopes: params.gatewayClientScopes
	});
	const allowInternalVerbosePersistence = canPersistInternalVerboseDirective({
		messageProvider: params.messageProvider,
		surface: params.surface,
		gatewayClientScopes: params.gatewayClientScopes
	});
	const delegatedTraceAllowed = (params.gatewayClientScopes ?? []).includes("operator.admin");
	const agentDir = resolveAgentDir(cfg, sessionKey ? resolveSessionAgentId({
		sessionKey,
		config: cfg
	}) : resolveDefaultAgentId(cfg)) ?? params.agentDir;
	if (sessionEntry && sessionStore && sessionKey) {
		const prevElevatedLevel = sessionEntry.elevatedLevel ?? agentCfg?.elevatedDefault ?? (elevatedAllowed ? "on" : "off");
		const prevReasoningLevel = sessionEntry.reasoningLevel ?? "off";
		let elevatedChanged = directives.hasElevatedDirective && directives.elevatedLevel !== void 0 && elevatedEnabled && elevatedAllowed;
		let reasoningChanged = directives.hasReasoningDirective && directives.reasoningLevel !== void 0;
		let updated = false;
		if (directives.hasThinkDirective && directives.thinkLevel) {
			sessionEntry.thinkingLevel = directives.thinkLevel;
			updated = true;
		}
		if (directives.hasVerboseDirective && directives.verboseLevel && allowInternalVerbosePersistence) {
			applyVerboseOverride(sessionEntry, directives.verboseLevel);
			updated = true;
		}
		if (directives.hasTraceDirective && directives.traceLevel && (params.senderIsOwner || delegatedTraceAllowed)) {
			applyTraceOverride(sessionEntry, directives.traceLevel);
			updated = true;
		}
		if (directives.hasReasoningDirective && directives.reasoningLevel) {
			if (directives.reasoningLevel === "off") sessionEntry.reasoningLevel = "off";
			else sessionEntry.reasoningLevel = directives.reasoningLevel;
			reasoningChanged = reasoningChanged || directives.reasoningLevel !== prevReasoningLevel && directives.reasoningLevel !== void 0;
			updated = true;
		}
		if (directives.hasElevatedDirective && directives.elevatedLevel && elevatedEnabled && elevatedAllowed) {
			sessionEntry.elevatedLevel = directives.elevatedLevel;
			elevatedChanged = elevatedChanged || directives.elevatedLevel !== prevElevatedLevel && directives.elevatedLevel !== void 0;
			updated = true;
		}
		if (directives.hasExecDirective && directives.hasExecOptions && allowInternalExecPersistence) {
			if (directives.execHost) {
				sessionEntry.execHost = directives.execHost;
				updated = true;
			}
			if (directives.execSecurity) {
				sessionEntry.execSecurity = directives.execSecurity;
				updated = true;
			}
			if (directives.execAsk) {
				sessionEntry.execAsk = directives.execAsk;
				updated = true;
			}
			if (directives.execNode) {
				sessionEntry.execNode = directives.execNode;
				updated = true;
			}
		}
		const modelDirective = directives.hasModelDirective && params.effectiveModelDirective ? params.effectiveModelDirective : void 0;
		if (modelDirective) {
			const modelResolution = resolveModelSelectionFromDirective({
				directives: {
					...directives,
					hasModelDirective: true,
					rawModelDirective: modelDirective
				},
				cfg,
				agentDir,
				defaultProvider,
				defaultModel,
				aliasIndex,
				allowedModelKeys,
				allowedModelCatalog: [],
				provider
			});
			if (modelResolution.modelSelection) {
				const { updated: modelUpdated } = applyModelOverrideToSessionEntry({
					entry: sessionEntry,
					selection: modelResolution.modelSelection,
					profileOverride: modelResolution.profileOverride,
					markLiveSwitchPending: params.markLiveSwitchPending
				});
				const runtimeOverride = resolveModelRuntimeOverride({
					rawRuntime: directives.rawModelRuntime,
					provider: modelResolution.modelSelection.provider
				});
				if (runtimeOverride?.kind === "clear") {
					if (sessionEntry.agentRuntimeOverride) {
						delete sessionEntry.agentRuntimeOverride;
						updated = true;
					}
				} else if (runtimeOverride?.kind === "set") {
					if (sessionEntry.agentRuntimeOverride !== runtimeOverride.runtime) {
						sessionEntry.agentRuntimeOverride = runtimeOverride.runtime;
						updated = true;
					}
				} else if (runtimeOverride?.kind === "invalid") enqueueSystemEvent(`Ignored unsupported runtime ${runtimeOverride.runtime} for ${modelResolution.modelSelection.provider}.`, {
					sessionKey,
					contextKey: `model-runtime:${modelResolution.modelSelection.provider}:${runtimeOverride.runtime}`
				});
				provider = modelResolution.modelSelection.provider;
				model = modelResolution.modelSelection.model;
				const currentThinkingLevel = sessionEntry.thinkingLevel;
				if (currentThinkingLevel && !directives.hasThinkDirective && !isThinkingLevelSupported({
					provider,
					model,
					level: currentThinkingLevel
				})) {
					const remappedThinkingLevel = resolveSupportedThinkingLevel({
						provider,
						model,
						level: currentThinkingLevel
					});
					if (remappedThinkingLevel !== currentThinkingLevel) {
						sessionEntry.thinkingLevel = remappedThinkingLevel;
						thinkingRemap = {
							from: currentThinkingLevel,
							to: remappedThinkingLevel,
							provider,
							model
						};
						updated = true;
					}
				}
				const nextLabel = `${provider}/${model}`;
				if (nextLabel !== initialModelLabel) enqueueSystemEvent(formatModelSwitchEvent(nextLabel, modelResolution.modelSelection.alias), {
					sessionKey,
					contextKey: `model:${nextLabel}`
				});
				updated = updated || modelUpdated;
			}
		}
		if (directives.hasQueueDirective && directives.queueReset) {
			delete sessionEntry.queueMode;
			delete sessionEntry.queueDebounceMs;
			delete sessionEntry.queueCap;
			delete sessionEntry.queueDrop;
			updated = true;
		}
		if (updated) {
			sessionEntry.updatedAt = Date.now();
			const memResolved = resolveSessionStoreEntry({
				store: sessionStore,
				sessionKey
			});
			sessionStore[memResolved.normalizedKey] = sessionEntry;
			for (const legacyKey of memResolved.legacyKeys) delete sessionStore[legacyKey];
			if (storePath) await updateSessionStore(storePath, (store) => {
				const resolved = resolveSessionStoreEntry({
					store,
					sessionKey
				});
				store[resolved.normalizedKey] = sessionEntry;
				for (const legacyKey of resolved.legacyKeys) delete store[legacyKey];
			});
			enqueueModeSwitchEvents({
				enqueueSystemEvent,
				sessionEntry,
				sessionKey,
				elevatedChanged,
				reasoningChanged
			});
		}
	}
	return {
		provider,
		model,
		thinkingRemap,
		contextTokens: resolveContextTokensForModel({
			cfg,
			provider,
			model,
			contextTokensOverride: agentCfg?.contextTokens,
			allowAsyncLoad: false
		}) ?? 2e5
	};
}
//#endregion
export { persistInlineDirectives };
