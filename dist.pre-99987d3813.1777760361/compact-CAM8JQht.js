import { i as formatErrorMessage } from "./errors-RZvg4nzL.js";
import { p as resolveUserPath } from "./utils-DvkbxKCZ.js";
import { a as isSubagentSessionKey, i as isCronSessionKey } from "./session-key-utils-B26T5hOk.js";
import { m as resolveSessionAgentIds } from "./agent-scope-DfXPuZUf.js";
import { n as resolveOwnerDisplaySetting } from "./owner-display-CiTTVhXw.js";
import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER, t as DEFAULT_CONTEXT_TOKENS } from "./defaults-CyUAeHC6.js";
import { u as normalizeMessageChannel } from "./message-channel-DgTkFEBi.js";
import { r as wrapStreamFnTextTransforms } from "./plugin-text-transforms-DSd5ujzr.js";
import { t as getGlobalHookRunner } from "./hook-runner-global-CbPxjSBS.js";
import { n as acquireSessionWriteLock, o as resolveSessionLockMaxHoldFromTimeout } from "./session-write-lock-K7vHGDEi.js";
import { F as resolveProviderTextTransforms, K as transformProviderSystemPrompt, x as prepareProviderRuntimeAuth } from "./provider-runtime-CbKqm0yg.js";
import { t as resolveOpenClawAgentDir } from "./agent-paths-CkJkZaS2.js";
import { n as applyLocalNoAuthHeaderOverride, r as getApiKeyForModel, t as applyAuthHeaderOverride, u as resolveModelAuthMode } from "./model-auth-B0VX5Kxx.js";
import { t as isAcpRuntimeSpawnAvailable } from "./availability-BFPeok_L.js";
import { n as ensureOpenClawModelsJson } from "./models-config-B12DlGPT.js";
import { a as runAfterCompactionHooks, c as captureCompactionCheckpointSnapshot, f as persistSessionCompactionCheckpoint, i as estimateTokensAfterCompaction, l as cleanupCompactionCheckpointSnapshot, n as asCompactionHookRunner, o as runBeforeCompactionHooks, p as resolveSessionCompactionCheckpointReason, r as buildBeforeCompactionHookMetrics, s as runPostCompactionSideEffects, t as readPiModelContextTokens } from "./model-context-tokens-B6o6QLlw.js";
import { a as resolveContextWindowInfo } from "./context-window-guard-CcgNxg6q.js";
import { t as getMachineDisplayName } from "./machine-name-gkQJscAl.js";
import { n as extractModelCompat } from "./provider-model-compat-5JsLClXq.js";
import { n as buildTtsSystemPromptHint } from "./tts-runtime-Cwx2jJaC.js";
import "./tts-CUSZMri9.js";
import { A as consumeCompactionSafeguardCancelReason, C as validateReplayTurns, D as buildEmbeddedExtensionFactories, E as limitHistoryTurns, I as guardSessionManager, K as isReasoningTagProvider, L as repairSessionFileIfNeeded, M as compactWithSafetyTimeout, N as resolveCompactionTimeoutMs, O as hasMeaningfulConversationContent, R as collectRuntimeChannelCapabilities, S as sanitizeSessionHistory, T as getDmHistoryLimitFromSessionKey, _ as resolveEmbeddedAgentStreamFn, a as mapThinkingLevel, b as trackSessionManagerAccess, c as collectAllowedToolNames, d as applySystemPromptOverrideToSession, f as buildEmbeddedSystemPrompt, g as resolveEmbeddedAgentBaseStreamFn, h as resolveEmbeddedAgentApiKey, i as flushPendingToolResultsAfterIdle, j as setCompactionSafeguardCancelReason, k as isRealConversationMessage, l as collectRegisteredToolNames, n as shouldRotateCompactionTranscript, o as splitSdkTools, p as createSystemPromptOverride, r as dedupeDuplicateUserMessagesForCompaction, t as rotateTranscriptAfterCompaction, u as toSessionToolAllowlist, v as resolveEmbeddedRunSkillEntries, w as buildEmbeddedMessageActionDiscoveryInput, y as prewarmSessionFile } from "./compaction-successor-transcript-BCy1H5AJ.js";
import { a as resolveContextInjectionMode, i as resolveBootstrapContextForRun, r as makeBootstrapWarn } from "./bootstrap-files-DHRvrX6u.js";
import { t as resolveHeartbeatPromptForSystemPrompt } from "./heartbeat-system-prompt-GgBePb3F.js";
import { i as ensureSessionHeader } from "./google-DOSfeqQ6.js";
import { r as pickFallbackThinkingLevel } from "./pi-embedded-helpers-BCdH26FE.js";
import { a as listChannelSupportedActions, c as resolveChannelReactionGuidance, o as resolveChannelMessageToolHints } from "./channel-tools-BTBp-1RJ.js";
import { i as resolveOpenClawReferencePaths } from "./docs-path-DIWmvFM2.js";
import { t as buildModelAliasLines } from "./model-alias-lines-DJ2g50X8.js";
import { s as supportsModelTools } from "./tool-result-middleware-D-sH54kd.js";
import { t as log } from "./logger-3KEv9Tay.js";
import { i as sanitizeToolUseResultPairing } from "./session-transcript-repair-OPD38lTb.js";
import { t as registerProviderStreamForModel } from "./provider-stream-BWhGSMXf.js";
import { t as createBundleLspToolRuntime } from "./pi-bundle-lsp-runtime-DW8yzkOX.js";
import { t as createBundleMcpToolRuntime } from "./pi-bundle-mcp-materialize-CwlYy9fV.js";
import "./pi-bundle-mcp-tools-ClCYHpoW.js";
import { i as formatUnknownCompactionReasonDetail, o as resolveCompactionFailureReason, r as classifyCompactionReason, s as createCompactionDiagId } from "./request-compaction-tool-BO8e_IxA.js";
import { l as createPreparedEmbeddedPiSettingsManager } from "./tool-result-truncation-DvH7IKwl.js";
import { r as applyPiCompactionSettingsFromConfig } from "./pi-settings-he7Ftapi.js";
import { t as createOpenClawCodingTools } from "./pi-tools-BaanW2ye.js";
import { o as resolveSandboxContext } from "./sandbox-DkLicFcl.js";
import { t as detectRuntimeShell } from "./shell-utils-CD0aHmgK.js";
import { n as applySkillEnvOverridesFromSnapshot, t as applySkillEnvOverrides } from "./env-overrides-FkgJuEoY.js";
import { s as resolveSkillsPromptForRun } from "./workspace-BC1EtjUv.js";
import "./skills-CtBOrA9U.js";
import { t as resolveSystemPromptOverride } from "./system-prompt-override-CaKRsW2d.js";
import { i as resolveUserTimezone, r as resolveUserTimeFormat, t as formatUserTime } from "./date-time-KdFpd-Sf.js";
import { t as applyExtraParamsToAgent } from "./extra-params-B7D5HkvY.js";
import { t as applyFinalEffectiveToolPolicy } from "./effective-tool-policy-DgTdZMCd.js";
import { t as buildEmbeddedSandboxInfo } from "./sandbox-info-7JK2d_hb.js";
import { n as resolveEmbeddedCompactionTarget } from "./compaction-runtime-context-DBx7M5Yi.js";
import { a as shouldUseOpenAIWebSocketTransport } from "./attempt.thread-helpers-LYOdChkP.js";
import { t as ensureRuntimePluginsLoaded } from "./runtime-plugins-D5pyxESf.js";
import { n as resolveModelAsync } from "./model-DgTjq0II.js";
import { r as buildAgentRuntimePlan } from "./build-D2H5nn6c.js";
import fs from "node:fs/promises";
import os from "node:os";
import { DefaultResourceLoader, SessionManager, createAgentSession, estimateTokens } from "@mariozechner/pi-coding-agent";
//#region src/agents/pi-embedded-runner/manual-compaction-boundary.ts
function serializeSessionFile(header, entries) {
	return [JSON.stringify(header), ...entries.map((entry) => JSON.stringify(entry))].join("\n") + "\n";
}
function replaceLatestCompactionBoundary(params) {
	return params.entries.map((entry) => {
		if (entry.type !== "compaction" || entry.id !== params.compactionEntryId) return entry;
		return {
			...entry,
			firstKeptEntryId: entry.id
		};
	});
}
async function hardenManualCompactionBoundary(params) {
	const sessionManager = SessionManager.open(params.sessionFile);
	if (typeof sessionManager.getHeader !== "function" || typeof sessionManager.getLeafEntry !== "function" || typeof sessionManager.buildSessionContext !== "function" || typeof sessionManager.getEntries !== "function") return {
		applied: false,
		messages: []
	};
	const header = sessionManager.getHeader();
	const leaf = sessionManager.getLeafEntry();
	if (!header || leaf?.type !== "compaction") {
		const sessionContext = sessionManager.buildSessionContext();
		return {
			applied: false,
			leafId: typeof sessionManager.getLeafId === "function" ? sessionManager.getLeafId() ?? void 0 : void 0,
			messages: sessionContext.messages
		};
	}
	if (params.preserveRecentTail) {
		const sessionContext = sessionManager.buildSessionContext();
		return {
			applied: false,
			firstKeptEntryId: leaf.firstKeptEntryId,
			leafId: typeof sessionManager.getLeafId === "function" ? sessionManager.getLeafId() ?? void 0 : void 0,
			messages: sessionContext.messages
		};
	}
	if (leaf.firstKeptEntryId === leaf.id) {
		const sessionContext = sessionManager.buildSessionContext();
		return {
			applied: false,
			firstKeptEntryId: leaf.id,
			leafId: typeof sessionManager.getLeafId === "function" ? sessionManager.getLeafId() ?? void 0 : void 0,
			messages: sessionContext.messages
		};
	}
	const content = serializeSessionFile(header, replaceLatestCompactionBoundary({
		entries: sessionManager.getEntries(),
		compactionEntryId: leaf.id
	}));
	const tmpFile = `${params.sessionFile}.manual-compaction-tmp`;
	await fs.writeFile(tmpFile, content, "utf-8");
	await fs.rename(tmpFile, params.sessionFile);
	const refreshed = SessionManager.open(params.sessionFile);
	const sessionContext = refreshed.buildSessionContext();
	return {
		applied: true,
		firstKeptEntryId: leaf.id,
		leafId: refreshed.getLeafId() ?? void 0,
		messages: sessionContext.messages
	};
}
//#endregion
//#region src/agents/pi-embedded-runner/compact.ts
function hasRealConversationContent(msg, messages, index) {
	return isRealConversationMessage(msg, messages, index);
}
function prepareCompactionSessionAgent(params) {
	params.session.agent.streamFn = resolveEmbeddedAgentStreamFn({
		currentStreamFn: resolveEmbeddedAgentBaseStreamFn({ session: params.session }),
		providerStreamFn: params.providerStreamFn,
		shouldUseWebSocketTransport: params.shouldUseWebSocketTransport,
		wsApiKey: params.wsApiKey,
		sessionId: params.sessionId,
		signal: params.signal,
		model: params.effectiveModel,
		resolvedApiKey: params.resolvedApiKey,
		authStorage: params.authStorage
	});
	const providerTextTransforms = resolveProviderTextTransforms({
		provider: params.provider,
		config: params.config,
		workspaceDir: params.effectiveWorkspace
	});
	if (providerTextTransforms) params.session.agent.streamFn = wrapStreamFnTextTransforms({
		streamFn: params.session.agent.streamFn,
		input: providerTextTransforms.input,
		output: providerTextTransforms.output,
		transformSystemPrompt: false
	});
	const preparedRuntimeExtraParams = params.runtimePlan?.transport.resolveExtraParams({
		thinkingLevel: params.thinkLevel,
		agentId: params.sessionAgentId,
		workspaceDir: params.effectiveWorkspace,
		model: params.effectiveModel
	});
	return applyExtraParamsToAgent(params.session.agent, params.config, params.provider, params.modelId, void 0, params.thinkLevel, params.sessionAgentId, params.effectiveWorkspace, params.effectiveModel, params.agentDir, void 0, preparedRuntimeExtraParams ? { preparedExtraParams: preparedRuntimeExtraParams } : void 0);
}
function resolveCompactionProviderStream(params) {
	return registerProviderStreamForModel({
		model: params.effectiveModel,
		cfg: params.config,
		agentDir: params.agentDir,
		workspaceDir: params.effectiveWorkspace
	});
}
function normalizeObservedTokenCount(value) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : void 0;
}
function getMessageTextChars(msg) {
	const content = msg.content;
	if (typeof content === "string") return content.length;
	if (!Array.isArray(content)) return 0;
	let total = 0;
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		const text = block.text;
		if (typeof text === "string") total += text.length;
	}
	return total;
}
function resolveMessageToolLabel(msg) {
	const candidate = msg.toolName ?? msg.name ?? msg.tool;
	return typeof candidate === "string" && candidate.trim().length > 0 ? candidate : void 0;
}
function summarizeCompactionMessages(messages) {
	let historyTextChars = 0;
	let toolResultChars = 0;
	const contributors = [];
	let estTokens = 0;
	let tokenEstimationFailed = false;
	for (const msg of messages) {
		const role = typeof msg.role === "string" ? msg.role : "unknown";
		const chars = getMessageTextChars(msg);
		historyTextChars += chars;
		if (role === "toolResult") toolResultChars += chars;
		contributors.push({
			role,
			chars,
			tool: resolveMessageToolLabel(msg)
		});
		if (!tokenEstimationFailed) try {
			estTokens += estimateTokens(msg);
		} catch {
			tokenEstimationFailed = true;
		}
	}
	return {
		messages: messages.length,
		historyTextChars,
		toolResultChars,
		estTokens: tokenEstimationFailed ? void 0 : estTokens,
		contributors: contributors.toSorted((a, b) => b.chars - a.chars).slice(0, 3)
	};
}
function containsRealConversationMessages(messages) {
	return messages.some((message, index, allMessages) => hasRealConversationContent(message, allMessages, index));
}
/**
* Core compaction logic without lane queueing.
* Use this when already inside a session/global lane to avoid deadlocks.
*/
async function compactEmbeddedPiSessionDirect(params) {
	const startedAt = Date.now();
	const diagId = params.diagId?.trim() || createCompactionDiagId();
	const trigger = params.trigger ?? "manual";
	const attempt = params.attempt ?? 1;
	const maxAttempts = params.maxAttempts ?? 1;
	const runId = params.runId ?? params.sessionId;
	const resolvedWorkspace = resolveUserPath(params.workspaceDir);
	ensureRuntimePluginsLoaded({
		config: params.config,
		workspaceDir: resolvedWorkspace,
		allowGatewaySubagentBinding: params.allowGatewaySubagentBinding
	});
	const resolvedCompactionTarget = resolveEmbeddedCompactionTarget({
		config: params.config,
		provider: params.provider,
		modelId: params.model,
		authProfileId: params.authProfileId,
		defaultProvider: DEFAULT_PROVIDER,
		defaultModel: DEFAULT_MODEL
	});
	const provider = resolvedCompactionTarget.provider ?? "openai";
	const modelId = resolvedCompactionTarget.model ?? "gpt-5.5";
	const authProfileId = resolvedCompactionTarget.authProfileId;
	let thinkLevel = params.thinkLevel ?? "off";
	const attemptedThinking = /* @__PURE__ */ new Set();
	const fail = (reason) => {
		const failureReason = classifyCompactionReason(reason);
		const detail = failureReason === "unknown" ? formatUnknownCompactionReasonDetail(reason) : void 0;
		const detailSuffix = detail ? ` detail=${detail}` : "";
		log.warn(`[compaction-diag] end runId=${runId} sessionKey=${params.sessionKey ?? params.sessionId} diagId=${diagId} trigger=${trigger} provider=${provider}/${modelId} attempt=${attempt} maxAttempts=${maxAttempts} outcome=failed reason=${failureReason}${detailSuffix} durationMs=${Date.now() - startedAt}`);
		return {
			ok: false,
			compacted: false,
			reason
		};
	};
	const agentDir = params.agentDir ?? resolveOpenClawAgentDir();
	await ensureOpenClawModelsJson(params.config, agentDir);
	const { model, error, authStorage, modelRegistry } = await resolveModelAsync(provider, modelId, agentDir, params.config);
	if (!model) return fail(error ?? `Unknown model: ${provider}/${modelId}`);
	let runtimeModel = model;
	let apiKeyInfo = null;
	let hasRuntimeAuthExchange = false;
	try {
		apiKeyInfo = await getApiKeyForModel({
			model: runtimeModel,
			cfg: params.config,
			profileId: authProfileId,
			agentDir,
			workspaceDir: resolvedWorkspace
		});
		if (!apiKeyInfo.apiKey) {
			if (apiKeyInfo.mode !== "aws-sdk") throw new Error(`No API key resolved for provider "${runtimeModel.provider}" (auth mode: ${apiKeyInfo.mode}).`);
		} else {
			const preparedAuth = await prepareProviderRuntimeAuth({
				provider: runtimeModel.provider,
				config: params.config,
				workspaceDir: resolvedWorkspace,
				env: process.env,
				context: {
					config: params.config,
					agentDir,
					workspaceDir: resolvedWorkspace,
					env: process.env,
					provider: runtimeModel.provider,
					modelId,
					model: runtimeModel,
					apiKey: apiKeyInfo.apiKey,
					authMode: apiKeyInfo.mode,
					profileId: apiKeyInfo.profileId
				}
			});
			if (preparedAuth?.baseUrl) runtimeModel = {
				...runtimeModel,
				baseUrl: preparedAuth.baseUrl
			};
			const runtimeApiKey = preparedAuth?.apiKey ?? apiKeyInfo.apiKey;
			hasRuntimeAuthExchange = Boolean(preparedAuth?.apiKey);
			if (!runtimeApiKey) throw new Error(`Provider "${runtimeModel.provider}" runtime auth returned no apiKey.`);
			authStorage.setRuntimeApiKey(runtimeModel.provider, runtimeApiKey);
		}
	} catch (err) {
		return fail(formatErrorMessage(err));
	}
	await fs.mkdir(resolvedWorkspace, { recursive: true });
	const sandboxSessionKey = params.sandboxSessionKey?.trim() || params.sessionKey?.trim() || params.sessionId;
	const sandbox = await resolveSandboxContext({
		config: params.config,
		sessionKey: sandboxSessionKey,
		workspaceDir: resolvedWorkspace
	});
	const effectiveWorkspace = sandbox?.enabled ? sandbox.workspaceAccess === "rw" ? resolvedWorkspace : sandbox.workspaceDir : resolvedWorkspace;
	await fs.mkdir(effectiveWorkspace, { recursive: true });
	await ensureSessionHeader({
		sessionFile: params.sessionFile,
		sessionId: params.sessionId,
		cwd: effectiveWorkspace
	});
	const { sessionAgentId: effectiveSkillAgentId } = resolveSessionAgentIds({
		sessionKey: params.sessionKey,
		config: params.config
	});
	let restoreSkillEnv;
	let compactionSessionManager = null;
	let checkpointSnapshot = null;
	let checkpointSnapshotRetained = false;
	try {
		const { shouldLoadSkillEntries, skillEntries } = resolveEmbeddedRunSkillEntries({
			workspaceDir: effectiveWorkspace,
			config: params.config,
			agentId: effectiveSkillAgentId,
			skillsSnapshot: params.skillsSnapshot
		});
		restoreSkillEnv = params.skillsSnapshot ? applySkillEnvOverridesFromSnapshot({
			snapshot: params.skillsSnapshot,
			config: params.config
		}) : applySkillEnvOverrides({
			skills: skillEntries ?? [],
			config: params.config
		});
		const skillsPrompt = resolveSkillsPromptForRun({
			skillsSnapshot: params.skillsSnapshot,
			entries: shouldLoadSkillEntries ? skillEntries : void 0,
			config: params.config,
			workspaceDir: effectiveWorkspace,
			agentId: effectiveSkillAgentId
		});
		const sessionLabel = params.sessionKey ?? params.sessionId;
		const resolvedMessageProvider = params.messageChannel ?? params.messageProvider;
		const { contextFiles } = resolveContextInjectionMode(params.config) === "never" ? { contextFiles: [] } : await resolveBootstrapContextForRun({
			workspaceDir: effectiveWorkspace,
			config: params.config,
			sessionKey: params.sessionKey,
			sessionId: params.sessionId,
			warn: makeBootstrapWarn({
				sessionLabel,
				warn: (message) => log.warn(message)
			})
		});
		const runtimeModelWithContext = runtimeModel;
		const ctxInfo = resolveContextWindowInfo({
			cfg: params.config,
			provider,
			modelId,
			modelContextTokens: readPiModelContextTokens(runtimeModel),
			modelContextWindow: runtimeModelWithContext.contextWindow,
			defaultTokens: DEFAULT_CONTEXT_TOKENS
		});
		const effectiveModel = applyAuthHeaderOverride(applyLocalNoAuthHeaderOverride(ctxInfo.tokens < (runtimeModelWithContext.contextWindow ?? Infinity) ? {
			...runtimeModelWithContext,
			contextWindow: ctxInfo.tokens
		} : runtimeModelWithContext, apiKeyInfo), hasRuntimeAuthExchange ? null : apiKeyInfo, params.config);
		const runtimePlan = params.runtimePlan ?? buildAgentRuntimePlan({
			provider,
			modelId,
			model: effectiveModel,
			modelApi: effectiveModel.api,
			harnessId: params.agentHarnessId,
			harnessRuntime: params.agentHarnessId,
			authProfileProvider: authProfileId?.split(":", 1)[0],
			sessionAuthProfileId: authProfileId,
			config: params.config,
			workspaceDir: effectiveWorkspace,
			agentDir,
			agentId: effectiveSkillAgentId,
			thinkingLevel: thinkLevel
		});
		const runAbortController = new AbortController();
		const toolsRaw = createOpenClawCodingTools({
			exec: { elevated: params.bashElevated },
			sandbox,
			messageProvider: resolvedMessageProvider,
			agentAccountId: params.agentAccountId,
			sessionKey: sandboxSessionKey,
			sessionId: params.sessionId,
			runId: params.runId,
			groupId: params.groupId,
			groupChannel: params.groupChannel,
			groupSpace: params.groupSpace,
			spawnedBy: params.spawnedBy,
			senderId: params.senderId,
			senderName: params.senderName,
			senderUsername: params.senderUsername,
			senderE164: params.senderE164,
			senderIsOwner: params.senderIsOwner,
			allowGatewaySubagentBinding: params.allowGatewaySubagentBinding,
			agentDir,
			workspaceDir: effectiveWorkspace,
			config: params.config,
			abortSignal: runAbortController.signal,
			modelProvider: model.provider,
			modelId,
			modelCompat: extractModelCompat(effectiveModel),
			modelApi: model.api,
			modelContextWindowTokens: ctxInfo.tokens,
			modelAuthMode: resolveModelAuthMode(model.provider, params.config, void 0, { workspaceDir: effectiveWorkspace })
		});
		const toolsEnabled = supportsModelTools(runtimeModel);
		const runtimePlanModelContext = {
			workspaceDir: effectiveWorkspace,
			modelApi: model.api,
			model
		};
		const tools = runtimePlan.tools.normalize(toolsEnabled ? toolsRaw : [], runtimePlanModelContext);
		const bundleMcpRuntime = toolsEnabled ? await createBundleMcpToolRuntime({
			workspaceDir: effectiveWorkspace,
			cfg: params.config,
			reservedToolNames: tools.map((tool) => tool.name)
		}) : void 0;
		const bundleLspRuntime = toolsEnabled ? await createBundleLspToolRuntime({
			workspaceDir: effectiveWorkspace,
			cfg: params.config,
			reservedToolNames: [...tools.map((tool) => tool.name), ...bundleMcpRuntime?.tools.map((tool) => tool.name) ?? []]
		}) : void 0;
		const filteredBundledTools = applyFinalEffectiveToolPolicy({
			bundledTools: [...bundleMcpRuntime?.tools ?? [], ...bundleLspRuntime?.tools ?? []],
			config: params.config,
			sandboxToolPolicy: sandbox?.tools,
			sessionKey: sandboxSessionKey,
			modelProvider: model.provider,
			modelId,
			messageProvider: resolvedMessageProvider,
			agentAccountId: params.agentAccountId,
			groupId: params.groupId,
			groupChannel: params.groupChannel,
			groupSpace: params.groupSpace,
			spawnedBy: params.spawnedBy,
			senderId: params.senderId,
			senderName: params.senderName,
			senderUsername: params.senderUsername,
			senderE164: params.senderE164,
			senderIsOwner: params.senderIsOwner,
			warn: (message) => log.warn(message)
		});
		const effectiveTools = [...tools, ...filteredBundledTools];
		const allowedToolNames = collectAllowedToolNames({ tools: effectiveTools });
		runtimePlan.tools.logDiagnostics(effectiveTools, runtimePlanModelContext);
		const machineName = await getMachineDisplayName();
		const runtimeChannel = normalizeMessageChannel(params.messageChannel ?? params.messageProvider);
		const runtimeCapabilities = collectRuntimeChannelCapabilities({
			cfg: params.config,
			channel: runtimeChannel,
			accountId: params.agentAccountId
		});
		const reactionGuidance = runtimeChannel && params.config ? resolveChannelReactionGuidance({
			cfg: params.config,
			channel: runtimeChannel,
			accountId: params.agentAccountId
		}) : void 0;
		const { defaultAgentId, sessionAgentId } = resolveSessionAgentIds({
			sessionKey: params.sessionKey,
			config: params.config
		});
		const channelActions = runtimeChannel ? listChannelSupportedActions(buildEmbeddedMessageActionDiscoveryInput({
			cfg: params.config,
			channel: runtimeChannel,
			currentChannelId: params.currentChannelId,
			currentThreadTs: params.currentThreadTs,
			currentMessageId: params.currentMessageId,
			accountId: params.agentAccountId,
			sessionKey: params.sessionKey,
			sessionId: params.sessionId,
			agentId: sessionAgentId,
			senderId: params.senderId,
			senderIsOwner: params.senderIsOwner
		})) : void 0;
		const messageToolHints = runtimeChannel ? resolveChannelMessageToolHints({
			cfg: params.config,
			channel: runtimeChannel,
			accountId: params.agentAccountId
		}) : void 0;
		const runtimeInfo = {
			host: machineName,
			os: `${os.type()} ${os.release()}`,
			arch: os.arch(),
			node: process.version,
			model: `${provider}/${modelId}`,
			shell: detectRuntimeShell(),
			channel: runtimeChannel,
			capabilities: runtimeCapabilities,
			channelActions
		};
		const sandboxInfo = buildEmbeddedSandboxInfo(sandbox, params.bashElevated);
		const reasoningTagHint = isReasoningTagProvider(provider, {
			config: params.config,
			workspaceDir: effectiveWorkspace,
			env: process.env,
			modelId,
			modelApi: model.api,
			model
		});
		const userTimezone = resolveUserTimezone(params.config?.agents?.defaults?.userTimezone);
		const userTimeFormat = resolveUserTimeFormat(params.config?.agents?.defaults?.timeFormat);
		const userTime = formatUserTime(/* @__PURE__ */ new Date(), userTimezone, userTimeFormat);
		const promptMode = isSubagentSessionKey(params.sessionKey) || isCronSessionKey(params.sessionKey) ? "minimal" : "full";
		const openClawReferences = await resolveOpenClawReferencePaths({
			workspaceDir: effectiveWorkspace,
			argv1: process.argv[1],
			cwd: effectiveWorkspace,
			moduleUrl: import.meta.url
		});
		const ttsHint = params.config ? buildTtsSystemPromptHint(params.config, sessionAgentId) : void 0;
		const ownerDisplay = resolveOwnerDisplaySetting(params.config);
		const promptContributionContext = {
			config: params.config,
			agentDir,
			workspaceDir: effectiveWorkspace,
			provider,
			modelId,
			promptMode,
			runtimeChannel,
			runtimeCapabilities,
			agentId: sessionAgentId
		};
		const promptContribution = runtimePlan.prompt.resolveSystemPromptContribution(promptContributionContext);
		const buildSystemPromptOverride = (defaultThinkLevel) => {
			const builtSystemPrompt = resolveSystemPromptOverride({
				config: params.config,
				agentId: sessionAgentId
			}) ?? buildEmbeddedSystemPrompt({
				workspaceDir: effectiveWorkspace,
				defaultThinkLevel,
				reasoningLevel: params.reasoningLevel ?? "off",
				extraSystemPrompt: params.extraSystemPrompt,
				ownerNumbers: params.ownerNumbers,
				ownerDisplay: ownerDisplay.ownerDisplay,
				ownerDisplaySecret: ownerDisplay.ownerDisplaySecret,
				reasoningTagHint,
				heartbeatPrompt: resolveHeartbeatPromptForSystemPrompt({
					config: params.config,
					agentId: sessionAgentId,
					defaultAgentId
				}),
				skillsPrompt,
				docsPath: openClawReferences.docsPath ?? void 0,
				sourcePath: openClawReferences.sourcePath ?? void 0,
				ttsHint,
				promptMode,
				sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
				acpEnabled: isAcpRuntimeSpawnAvailable({
					config: params.config,
					sandboxed: sandboxInfo?.enabled === true
				}),
				runtimeInfo,
				reactionGuidance,
				messageToolHints,
				sandboxInfo,
				tools: effectiveTools,
				modelAliasLines: buildModelAliasLines(params.config),
				userTimezone,
				userTime,
				userTimeFormat,
				contextFiles,
				memoryCitationsMode: params.config?.memory?.citations,
				promptContribution
			});
			return createSystemPromptOverride(transformProviderSystemPrompt({
				provider,
				config: params.config,
				workspaceDir: effectiveWorkspace,
				context: {
					systemPrompt: builtSystemPrompt,
					config: params.config,
					agentDir,
					workspaceDir: effectiveWorkspace,
					provider,
					modelId,
					promptMode,
					runtimeChannel,
					runtimeCapabilities,
					agentId: sessionAgentId
				}
			}));
		};
		const compactionTimeoutMs = resolveCompactionTimeoutMs(params.config);
		const sessionLock = await acquireSessionWriteLock({
			sessionFile: params.sessionFile,
			maxHoldMs: resolveSessionLockMaxHoldFromTimeout({ timeoutMs: compactionTimeoutMs })
		});
		try {
			await repairSessionFileIfNeeded({
				sessionFile: params.sessionFile,
				warn: (message) => log.warn(message)
			});
			await prewarmSessionFile(params.sessionFile);
			const transcriptPolicy = runtimePlan.transcript.resolvePolicy(runtimePlanModelContext);
			const sessionManager = guardSessionManager(SessionManager.open(params.sessionFile), {
				agentId: sessionAgentId,
				sessionKey: params.sessionKey,
				config: params.config,
				contextWindowTokens: ctxInfo.tokens,
				allowSyntheticToolResults: transcriptPolicy.allowSyntheticToolResults,
				missingToolResultText: model.api === "openai-responses" || model.api === "azure-openai-responses" || model.api === "openai-codex-responses" ? "aborted" : void 0,
				allowedToolNames
			});
			checkpointSnapshot = captureCompactionCheckpointSnapshot({
				sessionManager,
				sessionFile: params.sessionFile
			});
			compactionSessionManager = sessionManager;
			trackSessionManagerAccess(params.sessionFile);
			const settingsManager = createPreparedEmbeddedPiSettingsManager({
				cwd: effectiveWorkspace,
				agentDir,
				cfg: params.config,
				contextTokenBudget: ctxInfo.tokens
			});
			const resourceLoader = new DefaultResourceLoader({
				cwd: resolvedWorkspace,
				agentDir,
				settingsManager,
				extensionFactories: buildEmbeddedExtensionFactories({
					cfg: params.config,
					sessionManager,
					provider,
					modelId,
					model
				})
			});
			await resourceLoader.reload();
			applyPiCompactionSettingsFromConfig({
				settingsManager,
				cfg: params.config,
				contextTokenBudget: ctxInfo.tokens
			});
			const { customTools } = splitSdkTools({
				tools: effectiveTools,
				sandboxEnabled: !!sandbox?.enabled
			});
			const sessionToolAllowlist = toSessionToolAllowlist(collectRegisteredToolNames(customTools));
			const providerStreamFn = resolveCompactionProviderStream({
				effectiveModel,
				config: params.config,
				agentDir,
				effectiveWorkspace
			});
			const shouldUseWebSocketTransport = shouldUseOpenAIWebSocketTransport({
				provider,
				modelApi: effectiveModel.api,
				modelBaseUrl: effectiveModel.baseUrl
			});
			const wsApiKey = shouldUseWebSocketTransport ? await resolveEmbeddedAgentApiKey({
				provider,
				resolvedApiKey: hasRuntimeAuthExchange ? void 0 : apiKeyInfo?.apiKey,
				authStorage
			}) : void 0;
			if (shouldUseWebSocketTransport && !wsApiKey) log.warn(`[ws-stream] no API key for provider=${provider}; keeping compaction HTTP transport`);
			while (true) {
				attemptedThinking.add(thinkLevel);
				let session;
				try {
					session = (await createAgentSession({
						cwd: effectiveWorkspace,
						agentDir,
						authStorage,
						modelRegistry,
						model: effectiveModel,
						thinkingLevel: mapThinkingLevel(thinkLevel),
						tools: sessionToolAllowlist,
						customTools,
						sessionManager,
						settingsManager,
						resourceLoader
					})).session;
					applySystemPromptOverrideToSession(session, buildSystemPromptOverride(thinkLevel)());
					session.setActiveToolsByName(sessionToolAllowlist);
					prepareCompactionSessionAgent({
						session,
						providerStreamFn,
						shouldUseWebSocketTransport,
						wsApiKey,
						sessionId: params.sessionId,
						signal: runAbortController.signal,
						effectiveModel,
						resolvedApiKey: hasRuntimeAuthExchange ? void 0 : apiKeyInfo?.apiKey,
						authStorage,
						config: params.config,
						provider,
						modelId,
						thinkLevel,
						sessionAgentId,
						effectiveWorkspace,
						agentDir,
						runtimePlan
					});
					const dedupedValidated = dedupeDuplicateUserMessagesForCompaction(await validateReplayTurns({
						messages: await sanitizeSessionHistory({
							messages: session.messages,
							modelApi: model.api,
							modelId,
							provider,
							allowedToolNames,
							config: params.config,
							workspaceDir: effectiveWorkspace,
							env: process.env,
							model,
							sessionManager,
							sessionId: params.sessionId,
							policy: transcriptPolicy
						}),
						modelApi: model.api,
						modelId,
						provider,
						config: params.config,
						workspaceDir: effectiveWorkspace,
						env: process.env,
						model,
						sessionId: params.sessionId,
						policy: transcriptPolicy
					}));
					session.agent.state.messages = dedupedValidated;
					const originalMessages = session.messages.slice();
					const truncated = limitHistoryTurns(session.messages, getDmHistoryLimitFromSessionKey(params.sessionKey, params.config));
					const limited = transcriptPolicy.repairToolUseResultPairing ? sanitizeToolUseResultPairing(truncated, {
						erroredAssistantResultPolicy: "drop",
						...model.api === "openai-responses" || model.api === "azure-openai-responses" || model.api === "openai-codex-responses" ? { missingToolResultText: "aborted" } : {}
					}) : truncated;
					if (limited.length > 0) session.agent.state.messages = limited;
					const hookRunner = asCompactionHookRunner(getGlobalHookRunner());
					const observedTokenCount = normalizeObservedTokenCount(params.currentTokenCount);
					const beforeHookMetrics = buildBeforeCompactionHookMetrics({
						originalMessages,
						currentMessages: session.messages,
						observedTokenCount,
						estimateTokensFn: estimateTokens
					});
					const { hookSessionKey, missingSessionKey } = await runBeforeCompactionHooks({
						hookRunner,
						sessionId: params.sessionId,
						sessionKey: params.sessionKey,
						sessionAgentId,
						workspaceDir: effectiveWorkspace,
						messageProvider: resolvedMessageProvider,
						metrics: beforeHookMetrics
					});
					const { messageCountOriginal } = beforeHookMetrics;
					const diagEnabled = log.isEnabled("debug");
					const preMetrics = diagEnabled ? summarizeCompactionMessages(session.messages) : void 0;
					if (diagEnabled && preMetrics) {
						log.debug(`[compaction-diag] start runId=${runId} sessionKey=${params.sessionKey ?? params.sessionId} diagId=${diagId} trigger=${trigger} provider=${provider}/${modelId} attempt=${attempt} maxAttempts=${maxAttempts} pre.messages=${preMetrics.messages} pre.historyTextChars=${preMetrics.historyTextChars} pre.toolResultChars=${preMetrics.toolResultChars} pre.estTokens=${preMetrics.estTokens ?? "unknown"}`);
						log.debug(`[compaction-diag] contributors diagId=${diagId} top=${JSON.stringify(preMetrics.contributors)}`);
					}
					if (!containsRealConversationMessages(session.messages)) {
						log.info(`[compaction] skipping — no real conversation messages (sessionKey=${params.sessionKey ?? params.sessionId})`);
						return {
							ok: true,
							compacted: false,
							reason: "no real conversation messages"
						};
					}
					const compactStartedAt = Date.now();
					const messageCountCompactionInput = messageCountOriginal;
					let fullSessionTokensBefore = 0;
					try {
						fullSessionTokensBefore = limited.reduce((sum, msg) => sum + estimateTokens(msg), 0);
					} catch {}
					const activeSession = session;
					const result = await compactWithSafetyTimeout(() => {
						setCompactionSafeguardCancelReason(compactionSessionManager, void 0);
						return activeSession.compact(params.customInstructions);
					}, compactionTimeoutMs, {
						abortSignal: params.abortSignal,
						onCancel: () => {
							activeSession.abortCompaction();
						}
					});
					let effectiveFirstKeptEntryId = result.firstKeptEntryId;
					let postCompactionLeafId = typeof sessionManager.getLeafId === "function" ? sessionManager.getLeafId() ?? void 0 : void 0;
					let transcriptRotationSessionManager = sessionManager;
					if (params.trigger === "manual") try {
						const hardenedBoundary = await hardenManualCompactionBoundary({
							sessionFile: params.sessionFile,
							preserveRecentTail: typeof params.config?.agents?.defaults?.compaction?.keepRecentTokens === "number"
						});
						if (hardenedBoundary.applied) {
							effectiveFirstKeptEntryId = hardenedBoundary.firstKeptEntryId ?? effectiveFirstKeptEntryId;
							postCompactionLeafId = hardenedBoundary.leafId ?? postCompactionLeafId;
							session.agent.state.messages = hardenedBoundary.messages;
							transcriptRotationSessionManager = SessionManager.open(params.sessionFile);
						}
					} catch (err) {
						log.warn("[compaction] failed to harden manual compaction boundary", { errorMessage: formatErrorMessage(err) });
					}
					const tokensAfter = estimateTokensAfterCompaction({
						messagesAfter: session.messages,
						observedTokenCount,
						fullSessionTokensBefore,
						estimateTokensFn: estimateTokens
					});
					const messageCountAfter = session.messages.length;
					const compactedCount = Math.max(0, messageCountCompactionInput - messageCountAfter);
					let transcriptRotation = { rotated: false };
					if (shouldRotateCompactionTranscript(params.config)) try {
						transcriptRotation = await rotateTranscriptAfterCompaction({
							sessionManager: transcriptRotationSessionManager,
							sessionFile: params.sessionFile
						});
					} catch (err) {
						log.warn("[compaction] post-compaction transcript rotation failed", {
							errorMessage: formatErrorMessage(err),
							errorStack: err instanceof Error ? err.stack : void 0
						});
					}
					const activeSessionId = transcriptRotation.sessionId ?? params.sessionId;
					const activeSessionFile = transcriptRotation.sessionFile ?? params.sessionFile;
					const activePostLeafId = transcriptRotation.leafId ?? postCompactionLeafId;
					if (transcriptRotation.rotated) log.info(`[compaction] rotated active transcript after compaction (sessionKey=${params.sessionKey ?? params.sessionId})`);
					await runPostCompactionSideEffects({
						config: params.config,
						sessionKey: params.sessionKey,
						sessionFile: activeSessionFile
					});
					if (params.config && params.sessionKey && checkpointSnapshot) try {
						checkpointSnapshotRetained = await persistSessionCompactionCheckpoint({
							cfg: params.config,
							sessionKey: params.sessionKey,
							sessionId: activeSessionId,
							reason: resolveSessionCompactionCheckpointReason({ trigger: params.trigger }),
							snapshot: checkpointSnapshot,
							summary: result.summary,
							firstKeptEntryId: effectiveFirstKeptEntryId,
							tokensBefore: observedTokenCount ?? result.tokensBefore,
							tokensAfter,
							postSessionFile: activeSessionFile,
							postLeafId: activePostLeafId,
							postEntryId: activePostLeafId,
							createdAt: compactStartedAt
						}) !== null;
					} catch (err) {
						log.warn("failed to persist compaction checkpoint", { errorMessage: formatErrorMessage(err) });
					}
					const postMetrics = diagEnabled ? summarizeCompactionMessages(session.messages) : void 0;
					if (diagEnabled && preMetrics && postMetrics) log.debug(`[compaction-diag] end runId=${runId} sessionKey=${params.sessionKey ?? params.sessionId} diagId=${diagId} trigger=${trigger} provider=${provider}/${modelId} attempt=${attempt} maxAttempts=${maxAttempts} outcome=compacted reason=none durationMs=${Date.now() - compactStartedAt} retrying=false post.messages=${postMetrics.messages} post.historyTextChars=${postMetrics.historyTextChars} post.toolResultChars=${postMetrics.toolResultChars} post.estTokens=${postMetrics.estTokens ?? "unknown"} delta.messages=${postMetrics.messages - preMetrics.messages} delta.historyTextChars=${postMetrics.historyTextChars - preMetrics.historyTextChars} delta.toolResultChars=${postMetrics.toolResultChars - preMetrics.toolResultChars} delta.estTokens=${typeof preMetrics.estTokens === "number" && typeof postMetrics.estTokens === "number" ? postMetrics.estTokens - preMetrics.estTokens : "unknown"}`);
					await runAfterCompactionHooks({
						hookRunner,
						sessionId: activeSessionId,
						sessionAgentId,
						hookSessionKey,
						missingSessionKey,
						workspaceDir: effectiveWorkspace,
						messageProvider: resolvedMessageProvider,
						messageCountAfter,
						tokensAfter,
						compactedCount,
						sessionFile: activeSessionFile,
						summaryLength: typeof result.summary === "string" ? result.summary.length : void 0,
						tokensBefore: result.tokensBefore,
						firstKeptEntryId: effectiveFirstKeptEntryId
					});
					return {
						ok: true,
						compacted: true,
						result: {
							summary: result.summary,
							firstKeptEntryId: effectiveFirstKeptEntryId,
							tokensBefore: observedTokenCount ?? result.tokensBefore,
							tokensAfter,
							details: result.details,
							sessionId: transcriptRotation.sessionId,
							sessionFile: transcriptRotation.sessionFile
						}
					};
				} catch (err) {
					const fallbackThinking = pickFallbackThinkingLevel({
						message: formatErrorMessage(err),
						attempted: attemptedThinking
					});
					if (fallbackThinking) {
						log.warn(`[compaction] request rejected for ${provider}/${modelId}; retrying with ${fallbackThinking}`);
						thinkLevel = fallbackThinking;
						continue;
					}
					throw err;
				} finally {
					try {
						await flushPendingToolResultsAfterIdle({
							agent: session?.agent,
							sessionManager,
							clearPendingOnTimeout: true
						});
					} catch {}
					try {
						session?.dispose();
					} catch {}
				}
			}
		} finally {
			try {
				await bundleMcpRuntime?.dispose();
			} catch {}
			try {
				await bundleLspRuntime?.dispose();
			} catch {}
			await sessionLock.release();
		}
	} catch (err) {
		return fail(resolveCompactionFailureReason({
			reason: formatErrorMessage(err),
			safeguardCancelReason: consumeCompactionSafeguardCancelReason(compactionSessionManager)
		}));
	} finally {
		if (!checkpointSnapshotRetained) await cleanupCompactionCheckpointSnapshot(checkpointSnapshot);
		restoreSkillEnv?.();
	}
}
const __testing = {
	hasRealConversationContent,
	hasMeaningfulConversationContent,
	containsRealConversationMessages,
	estimateTokensAfterCompaction,
	buildBeforeCompactionHookMetrics,
	hardenManualCompactionBoundary,
	resolveCompactionProviderStream,
	prepareCompactionSessionAgent,
	runBeforeCompactionHooks,
	runAfterCompactionHooks,
	runPostCompactionSideEffects
};
//#endregion
export { __testing, compactEmbeddedPiSessionDirect, runPostCompactionSideEffects };
