import "./defaults-BofKZKJ4.js";
import { p as resolveSessionAgentId, x as resolveDefaultAgentId, y as resolveAgentDir } from "./agent-scope-D-T17Rdc.js";
import { a as resolveSupportedThinkingLevel, n as isThinkingLevelSupported } from "./thinking-Bh-7MqXz.js";
import { o as updateSessionStore } from "./store-COeaE7A7.js";
import { a as resolveContextTokensForModel } from "./context-BYRc5RHZ.js";
import { i as enqueueSystemEvent } from "./system-events-B-8iLjB8.js";
import { t as applyModelOverrideToSessionEntry } from "./model-overrides-e8ISaSUe.js";
import { t as resolveModelSelectionFromDirective } from "./directive-handling.model-selection-Bhcr7ETb.js";
import { n as applyVerboseOverride, t as applyTraceOverride } from "./level-overrides-GoPZmHfp.js";
import { n as canPersistInternalVerboseDirective, r as enqueueModeSwitchEvents, t as canPersistInternalExecDirective } from "./directive-handling.shared-D1bfP-PG.js";
//#region src/auto-reply/reply/directive-handling.persist.ts
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
			sessionStore[sessionKey] = sessionEntry;
			if (storePath) await updateSessionStore(storePath, (store) => {
				store[sessionKey] = sessionEntry;
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
