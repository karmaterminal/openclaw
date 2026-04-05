import { m as defaultRuntime, t as createSubsystemLogger } from "./subsystem-CJEvHE2o.js";
import { $A as buildWorkspaceSkillSnapshot, $D as resolveAgentTimeoutMs, Co as resolveSession, Cw as FailoverError, Do as resolveAgentRunContext, EP as loadModelCatalog, Eh as prepareSessionManagerForRun, Em as AGENT_LANE_SUBAGENT, Eo as updateSessionStoreAfterAgentRun, Fh as resolveBootstrapWarningSignaturesSeen, If as clearSessionAuthProfileOverride, KM as resolveSendPolicy, Md as normalizeReplyPayload, Mh as registerAgentRunContext, Mo as applyVerboseOverride, Oh as clearAgentRunContext, Oo as deliverAgentCommandResult, PD as getAcpSessionManager, Po as createDefaultDeps, QD as toAcpRuntimeError, TI as applyModelOverrideToSessionEntry, Th as runEmbeddedPiAgent, YA as getSkillsSnapshotVersion, _ as readConfigFileSnapshotForWrite, bm as resolveAcpAgentPolicyError, cm as runCliAgent, dm as normalizeSpawnedRunMetadata, em as formatAgentInternalEventsForPrompt, f as loadConfig, fw as resolveCommandSecretRefsViaGateway, gm as resolveAcpSessionCwd, gw as runWithModelFallback, hm as resolveSessionTranscriptFile, iN as updateSessionStore, ig as emitSessionTranscriptUpdate, jA as getRemoteSkillEligibility, kh as emitAgentEvent, lm as getCliSessionId, tw as buildOutboundSessionContext, um as setCliSessionId, xm as resolveAcpDispatchPolicyError, y as setRuntimeConfigSnapshot } from "./auth-profiles-D5vQ2NEm.js";
import { n as ensureAuthProfileStore } from "./store-BpAvd-ka.js";
import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-Dpv7c6Om.js";
import { r as normalizeProviderId } from "./provider-id-Bd9aU9Z8.js";
import { f as normalizeVerboseLevel, n as formatXHighModelHint, u as normalizeThinkLevel } from "./thinking.shared-CA9NbpNW.js";
import { c as normalizeAgentId, u as resolveAgentIdFromSessionKey } from "./session-key-BhxcMJEE.js";
import { a as resolveAgentDir, f as resolveAgentSkillsFilter, h as resolveEffectiveModelFallbacks, p as resolveAgentWorkspaceDir, r as listAgentIds, v as resolveSessionAgentId } from "./agent-scope-BSOSJbA_.js";
import { d as ensureAgentWorkspace } from "./workspace-CFIQ0-q3.js";
import { S as resolveThinkingDefault, f as parseModelRef, g as resolveDefaultModelForAgent, h as resolveConfiguredModelRef, l as modelKey, s as isCliProvider, t as buildAllowedModelSet, u as normalizeModelRef } from "./model-selection-CMtvxDDg.js";
import { t as formatCliCommand } from "./command-format-CR4nOXgc.js";
import { p as resolveMessageChannel } from "./message-channel-BaBrchOc.js";
import { M as mergeSessionEntry, b as isSilentReplyText, y as isSilentReplyPrefixText } from "./system-events-CNx_jtrt.js";
import { i as supportsXHighThinking, t as formatThinkingLevels } from "./thinking-BIe_TekB.js";
import { t as getAgentRuntimeCommandSecretTargetIds } from "./command-secret-targets-DayQlnoD.js";
import fs from "node:fs/promises";
import { SessionManager } from "@mariozechner/pi-coding-agent";
//#region src/commands/agent.ts
const log = createSubsystemLogger("commands/agent");
const OVERRIDE_FIELDS_CLEARED_BY_DELETE = [
	"providerOverride",
	"modelOverride",
	"authProfileOverride",
	"authProfileOverrideSource",
	"authProfileOverrideCompactionCount",
	"fallbackNoticeSelectedModel",
	"fallbackNoticeActiveModel",
	"fallbackNoticeReason",
	"claudeCliSessionId"
];
const OVERRIDE_VALUE_MAX_LENGTH = 256;
function containsControlCharacters(value) {
	for (const char of value) {
		const code = char.codePointAt(0);
		if (code === void 0) {continue;}
		if (code <= 31 || code >= 127 && code <= 159) {return true;}
	}
	return false;
}
function normalizeExplicitOverrideInput(raw, kind) {
	const trimmed = raw.trim();
	const label = kind === "provider" ? "Provider" : "Model";
	if (!trimmed) {throw new Error(`${label} override must be non-empty.`);}
	if (trimmed.length > OVERRIDE_VALUE_MAX_LENGTH) {throw new Error(`${label} override exceeds ${String(OVERRIDE_VALUE_MAX_LENGTH)} characters.`);}
	if (containsControlCharacters(trimmed)) {throw new Error(`${label} override contains invalid control characters.`);}
	return trimmed;
}
async function persistSessionEntry(params) {
	const persisted = await updateSessionStore(params.storePath, (store) => {
		const merged = mergeSessionEntry(store[params.sessionKey], params.entry);
		for (const field of OVERRIDE_FIELDS_CLEARED_BY_DELETE) {if (!Object.hasOwn(params.entry, field)) Reflect.deleteProperty(merged, field);}
		store[params.sessionKey] = merged;
		return merged;
	});
	params.sessionStore[params.sessionKey] = persisted;
}
function resolveFallbackRetryPrompt(params) {
	if (!params.isFallbackRetry) {return params.body;}
	return "Continue where you left off. The previous model attempt failed or timed out.";
}
function prependInternalEventContext(body, events) {
	if (body.includes("OpenClaw runtime context (internal):")) {return body;}
	const renderedEvents = formatAgentInternalEventsForPrompt(events);
	if (!renderedEvents) {return body;}
	return [renderedEvents, body].filter(Boolean).join("\n\n");
}
function createAcpVisibleTextAccumulator() {
	let pendingSilentPrefix = "";
	let visibleText = "";
	const startsWithWordChar = (chunk) => /^[\p{L}\p{N}]/u.test(chunk);
	const resolveNextCandidate = (base, chunk) => {
		if (!base) {return chunk;}
		if (isSilentReplyText(base, "NO_REPLY") && !chunk.startsWith(base) && startsWithWordChar(chunk)) {return chunk;}
		if (chunk.startsWith(base) && chunk.length > base.length) {return chunk;}
		return `${base}${chunk}`;
	};
	const mergeVisibleChunk = (base, chunk) => {
		if (!base) {return {
			text: chunk,
			delta: chunk
		};}
		if (chunk.startsWith(base) && chunk.length > base.length) {return {
			text: chunk,
			delta: chunk.slice(base.length)
		};}
		return {
			text: `${base}${chunk}`,
			delta: chunk
		};
	};
	return {
		consume(chunk) {
			if (!chunk) {return null;}
			if (!visibleText) {
				const leadCandidate = resolveNextCandidate(pendingSilentPrefix, chunk);
				const trimmedLeadCandidate = leadCandidate.trim();
				if (isSilentReplyText(trimmedLeadCandidate, "NO_REPLY") || isSilentReplyPrefixText(trimmedLeadCandidate, "NO_REPLY")) {
					pendingSilentPrefix = leadCandidate;
					return null;
				}
				if (pendingSilentPrefix) {
					pendingSilentPrefix = "";
					visibleText = leadCandidate;
					return {
						text: visibleText,
						delta: leadCandidate
					};
				}
			}
			const nextVisible = mergeVisibleChunk(visibleText, chunk);
			visibleText = nextVisible.text;
			return nextVisible.delta ? nextVisible : null;
		},
		finalize() {
			if (pendingSilentPrefix && !visibleText) {
				const trimmed = pendingSilentPrefix.trim();
				if (!isSilentReplyText(trimmed, "NO_REPLY")) {return trimmed;}
			}
			return visibleText.trim();
		},
		finalizeRaw() {
			return visibleText;
		}
	};
}
const ACP_TRANSCRIPT_USAGE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		total: 0
	}
};
async function persistAcpTurnTranscript(params) {
	const promptText = params.body;
	const replyText = params.finalText;
	if (!promptText && !replyText) {return params.sessionEntry;}
	const { sessionFile, sessionEntry } = await resolveSessionTranscriptFile({
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		sessionEntry: params.sessionEntry,
		sessionStore: params.sessionStore,
		storePath: params.storePath,
		agentId: params.sessionAgentId,
		threadId: params.threadId
	});
	const hadSessionFile = await fs.access(sessionFile).then(() => true).catch(() => false);
	const sessionManager = SessionManager.open(sessionFile);
	await prepareSessionManagerForRun({
		sessionManager,
		sessionFile,
		hadSessionFile,
		sessionId: params.sessionId,
		cwd: params.sessionCwd
	});
	if (promptText) {sessionManager.appendMessage({
		role: "user",
		content: promptText,
		timestamp: Date.now()
	});}
	if (replyText) {sessionManager.appendMessage({
		role: "assistant",
		content: [{
			type: "text",
			text: replyText
		}],
		api: "openai-responses",
		provider: "openclaw",
		model: "acp-runtime",
		usage: ACP_TRANSCRIPT_USAGE,
		stopReason: "stop",
		timestamp: Date.now()
	});}
	emitSessionTranscriptUpdate(sessionFile);
	return sessionEntry;
}
function resolveAgentRunTrigger(continuationTrigger) {
	return continuationTrigger ?? "user";
}
function runAgentAttempt(params) {
	const effectivePrompt = resolveFallbackRetryPrompt({
		body: params.body,
		isFallbackRetry: params.isFallbackRetry
	});
	const bootstrapPromptWarningSignaturesSeen = resolveBootstrapWarningSignaturesSeen(params.sessionEntry?.systemPromptReport);
	const bootstrapPromptWarningSignature = bootstrapPromptWarningSignaturesSeen[bootstrapPromptWarningSignaturesSeen.length - 1];
	if (isCliProvider(params.providerOverride, params.cfg)) {
		const cliSessionId = getCliSessionId(params.sessionEntry, params.providerOverride);
		const runCliWithSession = (nextCliSessionId) => runCliAgent({
			sessionId: params.sessionId,
			sessionKey: params.sessionKey,
			agentId: params.sessionAgentId,
			sessionFile: params.sessionFile,
			workspaceDir: params.workspaceDir,
			config: params.cfg,
			prompt: effectivePrompt,
			provider: params.providerOverride,
			model: params.modelOverride,
			thinkLevel: params.resolvedThinkLevel,
			timeoutMs: params.timeoutMs,
			runId: params.runId,
			extraSystemPrompt: params.opts.extraSystemPrompt,
			cliSessionId: nextCliSessionId,
			bootstrapPromptWarningSignaturesSeen,
			bootstrapPromptWarningSignature,
			images: params.isFallbackRetry ? void 0 : params.opts.images,
			streamParams: params.opts.streamParams
		});
		return runCliWithSession(cliSessionId).catch(async (err) => {
			if (err instanceof FailoverError && err.reason === "session_expired" && cliSessionId && params.sessionKey && params.sessionStore && params.storePath) {
				log.warn(`CLI session expired, clearing from session store: provider=${params.providerOverride} sessionKey=${params.sessionKey}`);
				const entry = params.sessionStore[params.sessionKey];
				if (entry) {
					const updatedEntry = { ...entry };
					if (params.providerOverride === "claude-cli") {delete updatedEntry.claudeCliSessionId;}
					if (updatedEntry.cliSessionIds) {
						const normalizedProvider = normalizeProviderId(params.providerOverride);
						const newCliSessionIds = { ...updatedEntry.cliSessionIds };
						delete newCliSessionIds[normalizedProvider];
						updatedEntry.cliSessionIds = newCliSessionIds;
					}
					updatedEntry.updatedAt = Date.now();
					await persistSessionEntry({
						sessionStore: params.sessionStore,
						sessionKey: params.sessionKey,
						storePath: params.storePath,
						entry: updatedEntry
					});
					params.sessionEntry = updatedEntry;
				}
				return runCliWithSession(void 0).then(async (result) => {
					if (result.meta.agentMeta?.sessionId && params.sessionKey && params.sessionStore && params.storePath) {
						const entry = params.sessionStore[params.sessionKey];
						if (entry) {
							const updatedEntry = { ...entry };
							setCliSessionId(updatedEntry, params.providerOverride, result.meta.agentMeta.sessionId);
							updatedEntry.updatedAt = Date.now();
							await persistSessionEntry({
								sessionStore: params.sessionStore,
								sessionKey: params.sessionKey,
								storePath: params.storePath,
								entry: updatedEntry
							});
						}
					}
					return result;
				});
			}
			throw err;
		});
	}
	const authProfileId = params.providerOverride === params.primaryProvider ? params.sessionEntry?.authProfileOverride : void 0;
	return runEmbeddedPiAgent({
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		agentId: params.sessionAgentId,
		trigger: resolveAgentRunTrigger(params.opts.continuationTrigger),
		messageChannel: params.messageChannel,
		agentAccountId: params.runContext.accountId,
		messageTo: params.opts.replyTo ?? params.opts.to,
		messageThreadId: params.opts.threadId,
		groupId: params.runContext.groupId,
		groupChannel: params.runContext.groupChannel,
		groupSpace: params.runContext.groupSpace,
		spawnedBy: params.spawnedBy,
		currentChannelId: params.runContext.currentChannelId,
		currentThreadTs: params.runContext.currentThreadTs,
		replyToMode: params.runContext.replyToMode,
		hasRepliedRef: params.runContext.hasRepliedRef,
		senderIsOwner: params.opts.senderIsOwner,
		sessionFile: params.sessionFile,
		workspaceDir: params.workspaceDir,
		config: params.cfg,
		skillsSnapshot: params.skillsSnapshot,
		prompt: effectivePrompt,
		images: params.isFallbackRetry ? void 0 : params.opts.images,
		clientTools: params.opts.clientTools,
		provider: params.providerOverride,
		model: params.modelOverride,
		authProfileId,
		authProfileIdSource: authProfileId ? params.sessionEntry?.authProfileOverrideSource : void 0,
		thinkLevel: params.resolvedThinkLevel,
		verboseLevel: params.resolvedVerboseLevel,
		timeoutMs: params.timeoutMs,
		runId: params.runId,
		lane: params.opts.lane,
		abortSignal: params.opts.abortSignal,
		extraSystemPrompt: params.opts.extraSystemPrompt,
		inputProvenance: params.opts.inputProvenance,
		streamParams: params.opts.streamParams,
		agentDir: params.agentDir,
		drainsContinuationDelegateQueue: params.opts.drainsContinuationDelegateQueue === true,
		allowTransientCooldownProbe: params.allowTransientCooldownProbe,
		onAgentEvent: params.onAgentEvent,
		bootstrapPromptWarningSignaturesSeen,
		bootstrapPromptWarningSignature
	});
}
async function prepareAgentCommandExecution(opts, runtime) {
	const message = opts.message ?? "";
	if (!message.trim()) {throw new Error("Message (--message) is required");}
	const body = prependInternalEventContext(message, opts.internalEvents);
	if (!opts.to && !opts.sessionId && !opts.sessionKey && !opts.agentId) {throw new Error("Pass --to <E.164>, --session-id, or --agent to choose a session");}
	const loadedRaw = loadConfig();
	const sourceConfig = await (async () => {
		try {
			const { snapshot } = await readConfigFileSnapshotForWrite();
			if (snapshot.valid) {return snapshot.resolved;}
		} catch {}
		return loadedRaw;
	})();
	const { resolvedConfig: cfg, diagnostics } = await resolveCommandSecretRefsViaGateway({
		config: loadedRaw,
		commandName: "agent",
		targetIds: getAgentRuntimeCommandSecretTargetIds()
	});
	setRuntimeConfigSnapshot(cfg, sourceConfig);
	const normalizedSpawned = normalizeSpawnedRunMetadata({
		spawnedBy: opts.spawnedBy,
		groupId: opts.groupId,
		groupChannel: opts.groupChannel,
		groupSpace: opts.groupSpace,
		workspaceDir: opts.workspaceDir
	});
	for (const entry of diagnostics) {runtime.log(`[secrets] ${entry}`);}
	const agentIdOverrideRaw = opts.agentId?.trim();
	const agentIdOverride = agentIdOverrideRaw ? normalizeAgentId(agentIdOverrideRaw) : void 0;
	if (agentIdOverride) {
		if (!listAgentIds(cfg).includes(agentIdOverride)) {throw new Error(`Unknown agent id "${agentIdOverrideRaw}". Use "${formatCliCommand("openclaw agents list")}" to see configured agents.`);}
	}
	if (agentIdOverride && opts.sessionKey) {
		const sessionAgentId = resolveAgentIdFromSessionKey(opts.sessionKey);
		if (sessionAgentId !== agentIdOverride) {throw new Error(`Agent id "${agentIdOverrideRaw}" does not match session key agent "${sessionAgentId}".`);}
	}
	const agentCfg = cfg.agents?.defaults;
	const configuredModel = resolveConfiguredModelRef({
		cfg,
		defaultProvider: DEFAULT_PROVIDER,
		defaultModel: DEFAULT_MODEL
	});
	const thinkingLevelsHint = formatThinkingLevels(configuredModel.provider, configuredModel.model);
	const thinkOverride = normalizeThinkLevel(opts.thinking);
	const thinkOnce = normalizeThinkLevel(opts.thinkingOnce);
	if (opts.thinking && !thinkOverride) {throw new Error(`Invalid thinking level. Use one of: ${thinkingLevelsHint}.`);}
	if (opts.thinkingOnce && !thinkOnce) {throw new Error(`Invalid one-shot thinking level. Use one of: ${thinkingLevelsHint}.`);}
	const verboseOverride = normalizeVerboseLevel(opts.verbose);
	if (opts.verbose && !verboseOverride) {throw new Error("Invalid verbose level. Use \"on\", \"full\", or \"off\".");}
	const isSubagentLane = (typeof opts.lane === "string" ? opts.lane.trim() : "") === String(AGENT_LANE_SUBAGENT);
	const timeoutSecondsRaw = opts.timeout !== void 0 ? Number.parseInt(String(opts.timeout), 10) : isSubagentLane ? 0 : void 0;
	if (timeoutSecondsRaw !== void 0 && (Number.isNaN(timeoutSecondsRaw) || timeoutSecondsRaw < 0)) {throw new Error("--timeout must be a non-negative integer (seconds; 0 means no timeout)");}
	const timeoutMs = resolveAgentTimeoutMs({
		cfg,
		overrideSeconds: timeoutSecondsRaw
	});
	const { sessionId, sessionKey, sessionEntry: sessionEntryRaw, sessionStore, storePath, isNewSession, persistedThinking, persistedVerbose } = resolveSession({
		cfg,
		to: opts.to,
		sessionId: opts.sessionId,
		sessionKey: opts.sessionKey,
		agentId: agentIdOverride
	});
	const sessionAgentId = agentIdOverride ?? resolveSessionAgentId({
		sessionKey: sessionKey ?? opts.sessionKey?.trim(),
		config: cfg
	});
	const outboundSession = buildOutboundSessionContext({
		cfg,
		agentId: sessionAgentId,
		sessionKey
	});
	const workspaceDirRaw = normalizedSpawned.workspaceDir ?? resolveAgentWorkspaceDir(cfg, sessionAgentId);
	const agentDir = resolveAgentDir(cfg, sessionAgentId);
	const workspaceDir = (await ensureAgentWorkspace({
		dir: workspaceDirRaw,
		ensureBootstrapFiles: !agentCfg?.skipBootstrap
	})).dir;
	const runId = opts.runId?.trim() || sessionId;
	const acpManager = getAcpSessionManager();
	return {
		body,
		cfg,
		normalizedSpawned,
		agentCfg,
		thinkOverride,
		thinkOnce,
		verboseOverride,
		timeoutMs,
		sessionId,
		sessionKey,
		sessionEntry: sessionEntryRaw,
		sessionStore,
		storePath,
		isNewSession,
		persistedThinking,
		persistedVerbose,
		sessionAgentId,
		outboundSession,
		workspaceDir,
		agentDir,
		runId,
		acpManager,
		acpResolution: sessionKey ? acpManager.resolveSession({
			cfg,
			sessionKey
		}) : null
	};
}
async function agentCommandInternal(opts, runtime = defaultRuntime, deps = createDefaultDeps()) {
	const prepared = await prepareAgentCommandExecution(opts, runtime);
	const { body, cfg, normalizedSpawned, agentCfg, thinkOverride, thinkOnce, verboseOverride, timeoutMs, sessionId, sessionKey, sessionStore, storePath, isNewSession, persistedThinking, persistedVerbose, sessionAgentId, outboundSession, workspaceDir, agentDir, runId, acpManager, acpResolution } = prepared;
	let sessionEntry = prepared.sessionEntry;
	try {
		if (opts.deliver === true) {
			if (resolveSendPolicy({
				cfg,
				entry: sessionEntry,
				sessionKey,
				channel: sessionEntry?.channel,
				chatType: sessionEntry?.chatType
			}) === "deny") {throw new Error("send blocked by session policy");}
		}
		if (acpResolution?.kind === "stale") {throw acpResolution.error;}
		if (acpResolution?.kind === "ready" && sessionKey) {
			const startedAt = Date.now();
			registerAgentRunContext(runId, { sessionKey });
			emitAgentEvent({
				runId,
				stream: "lifecycle",
				data: {
					phase: "start",
					startedAt
				}
			});
			const visibleTextAccumulator = createAcpVisibleTextAccumulator();
			let stopReason;
			try {
				const dispatchPolicyError = resolveAcpDispatchPolicyError(cfg);
				if (dispatchPolicyError) {throw dispatchPolicyError;}
				const agentPolicyError = resolveAcpAgentPolicyError(cfg, normalizeAgentId(acpResolution.meta.agent || resolveAgentIdFromSessionKey(sessionKey)));
				if (agentPolicyError) {throw agentPolicyError;}
				await acpManager.runTurn({
					cfg,
					sessionKey,
					text: body,
					mode: "prompt",
					requestId: runId,
					signal: opts.abortSignal,
					onEvent: (event) => {
						if (event.type === "done") {
							stopReason = event.stopReason;
							return;
						}
						if (event.type !== "text_delta") {return;}
						if (event.stream && event.stream !== "output") {return;}
						if (!event.text) {return;}
						const visibleUpdate = visibleTextAccumulator.consume(event.text);
						if (!visibleUpdate) {return;}
						emitAgentEvent({
							runId,
							stream: "assistant",
							data: {
								text: visibleUpdate.text,
								delta: visibleUpdate.delta
							}
						});
					}
				});
			} catch (error) {
				const acpError = toAcpRuntimeError({
					error,
					fallbackCode: "ACP_TURN_FAILED",
					fallbackMessage: "ACP turn failed before completion."
				});
				emitAgentEvent({
					runId,
					stream: "lifecycle",
					data: {
						phase: "error",
						error: acpError.message,
						endedAt: Date.now()
					}
				});
				throw acpError;
			}
			emitAgentEvent({
				runId,
				stream: "lifecycle",
				data: {
					phase: "end",
					endedAt: Date.now()
				}
			});
			const finalTextRaw = visibleTextAccumulator.finalizeRaw();
			const finalText = visibleTextAccumulator.finalize();
			try {
				sessionEntry = await persistAcpTurnTranscript({
					body,
					finalText: finalTextRaw,
					sessionId,
					sessionKey,
					sessionEntry,
					sessionStore,
					storePath,
					sessionAgentId,
					threadId: opts.threadId,
					sessionCwd: resolveAcpSessionCwd(acpResolution.meta) ?? workspaceDir
				});
			} catch (error) {
				log.warn(`ACP transcript persistence failed for ${sessionKey}: ${error instanceof Error ? error.message : String(error)}`);
			}
			const normalizedFinalPayload = normalizeReplyPayload({ text: finalText });
			const payloads = normalizedFinalPayload ? [normalizedFinalPayload] : [];
			const result = {
				payloads,
				meta: {
					durationMs: Date.now() - startedAt,
					aborted: opts.abortSignal?.aborted === true,
					stopReason
				}
			};
			return await deliverAgentCommandResult({
				cfg,
				deps,
				runtime,
				opts,
				outboundSession,
				sessionEntry,
				result,
				payloads
			});
		}
		let resolvedThinkLevel = thinkOnce ?? thinkOverride ?? persistedThinking;
		const resolvedVerboseLevel = verboseOverride ?? persistedVerbose ?? agentCfg?.verboseDefault;
		if (sessionKey) {registerAgentRunContext(runId, {
			sessionKey,
			verboseLevel: resolvedVerboseLevel
		});}
		const needsSkillsSnapshot = isNewSession || !sessionEntry?.skillsSnapshot;
		const skillsSnapshotVersion = getSkillsSnapshotVersion(workspaceDir);
		const skillFilter = resolveAgentSkillsFilter(cfg, sessionAgentId);
		const skillsSnapshot = needsSkillsSnapshot ? buildWorkspaceSkillSnapshot(workspaceDir, {
			config: cfg,
			eligibility: { remote: getRemoteSkillEligibility() },
			snapshotVersion: skillsSnapshotVersion,
			skillFilter
		}) : sessionEntry?.skillsSnapshot;
		if (skillsSnapshot && sessionStore && sessionKey && needsSkillsSnapshot) {
			const next = {
				...sessionEntry ?? {
					sessionId,
					updatedAt: Date.now()
				},
				sessionId,
				updatedAt: Date.now(),
				skillsSnapshot
			};
			await persistSessionEntry({
				sessionStore,
				sessionKey,
				storePath,
				entry: next
			});
			sessionEntry = next;
		}
		if (sessionStore && sessionKey) {
			const next = {
				...sessionStore[sessionKey] ?? sessionEntry ?? {
					sessionId,
					updatedAt: Date.now()
				},
				sessionId,
				updatedAt: Date.now()
			};
			if (thinkOverride) {next.thinkingLevel = thinkOverride;}
			applyVerboseOverride(next, verboseOverride);
			await persistSessionEntry({
				sessionStore,
				sessionKey,
				storePath,
				entry: next
			});
			sessionEntry = next;
		}
		const configuredDefaultRef = resolveDefaultModelForAgent({
			cfg,
			agentId: sessionAgentId
		});
		const { provider: defaultProvider, model: defaultModel } = normalizeModelRef(configuredDefaultRef.provider, configuredDefaultRef.model);
		let provider = defaultProvider;
		let model = defaultModel;
		const hasAllowlist = agentCfg?.models && Object.keys(agentCfg.models).length > 0;
		const hasStoredOverride = Boolean(sessionEntry?.modelOverride || sessionEntry?.providerOverride);
		const explicitProviderOverride = typeof opts.provider === "string" ? normalizeExplicitOverrideInput(opts.provider, "provider") : void 0;
		const explicitModelOverride = typeof opts.model === "string" ? normalizeExplicitOverrideInput(opts.model, "model") : void 0;
		const hasExplicitRunOverride = Boolean(explicitProviderOverride || explicitModelOverride);
		if (hasExplicitRunOverride && opts.allowModelOverride !== true) {throw new Error("Model override is not authorized for this caller.");}
		const needsModelCatalog = hasAllowlist || hasStoredOverride || hasExplicitRunOverride;
		let allowedModelKeys = /* @__PURE__ */ new Set();
		let allowedModelCatalog = [];
		let modelCatalog = null;
		let allowAnyModel = false;
		if (needsModelCatalog) {
			modelCatalog = await loadModelCatalog({ config: cfg });
			const allowed = buildAllowedModelSet({
				cfg,
				catalog: modelCatalog,
				defaultProvider,
				defaultModel,
				agentId: sessionAgentId
			});
			allowedModelKeys = allowed.allowedKeys;
			allowedModelCatalog = allowed.allowedCatalog;
			allowAnyModel = allowed.allowAny ?? false;
		}
		if (sessionEntry && sessionStore && sessionKey && hasStoredOverride) {
			const entry = sessionEntry;
			const overrideProvider = sessionEntry.providerOverride?.trim() || defaultProvider;
			const overrideModel = sessionEntry.modelOverride?.trim();
			if (overrideModel) {
				const normalizedOverride = normalizeModelRef(overrideProvider, overrideModel);
				const key = modelKey(normalizedOverride.provider, normalizedOverride.model);
				if (!isCliProvider(normalizedOverride.provider, cfg) && !allowAnyModel && !allowedModelKeys.has(key)) {
					const { updated } = applyModelOverrideToSessionEntry({
						entry,
						selection: {
							provider: defaultProvider,
							model: defaultModel,
							isDefault: true
						}
					});
					if (updated) {await persistSessionEntry({
						sessionStore,
						sessionKey,
						storePath,
						entry
					});}
				}
			}
		}
		const storedProviderOverride = sessionEntry?.providerOverride?.trim();
		const storedModelOverride = sessionEntry?.modelOverride?.trim();
		if (storedModelOverride) {
			const normalizedStored = normalizeModelRef(storedProviderOverride || defaultProvider, storedModelOverride);
			const key = modelKey(normalizedStored.provider, normalizedStored.model);
			if (isCliProvider(normalizedStored.provider, cfg) || allowAnyModel || allowedModelKeys.has(key)) {
				provider = normalizedStored.provider;
				model = normalizedStored.model;
			}
		}
		const providerForAuthProfileValidation = provider;
		if (hasExplicitRunOverride) {
			const explicitRef = explicitModelOverride ? explicitProviderOverride ? normalizeModelRef(explicitProviderOverride, explicitModelOverride) : parseModelRef(explicitModelOverride, provider) : explicitProviderOverride ? normalizeModelRef(explicitProviderOverride, model) : null;
			if (!explicitRef) {throw new Error("Invalid model override.");}
			const explicitKey = modelKey(explicitRef.provider, explicitRef.model);
			if (!isCliProvider(explicitRef.provider, cfg) && !allowAnyModel && !allowedModelKeys.has(explicitKey)) {throw new Error(`Model override "${explicitRef.provider}/${explicitRef.model}" is not allowed for agent "${sessionAgentId}".`);}
			provider = explicitRef.provider;
			model = explicitRef.model;
		}
		if (sessionEntry) {
			const authProfileId = sessionEntry.authProfileOverride;
			if (authProfileId) {
				const entry = sessionEntry;
				const profile = ensureAuthProfileStore().profiles[authProfileId];
				if (!profile || profile.provider !== providerForAuthProfileValidation) {
					if (sessionStore && sessionKey) {await clearSessionAuthProfileOverride({
						sessionEntry: entry,
						sessionStore,
						sessionKey,
						storePath
					});}
				}
			}
		}
		if (!resolvedThinkLevel) {
			let catalogForThinking = modelCatalog ?? allowedModelCatalog;
			if (!catalogForThinking || catalogForThinking.length === 0) {
				modelCatalog = await loadModelCatalog({ config: cfg });
				catalogForThinking = modelCatalog;
			}
			resolvedThinkLevel = resolveThinkingDefault({
				cfg,
				provider,
				model,
				catalog: catalogForThinking
			});
		}
		if (resolvedThinkLevel === "xhigh" && !supportsXHighThinking(provider, model)) {
			if (thinkOnce || thinkOverride) {throw new Error(`Thinking level "xhigh" is only supported for ${formatXHighModelHint()}.`);}
			resolvedThinkLevel = "high";
			if (sessionEntry && sessionStore && sessionKey && sessionEntry.thinkingLevel === "xhigh") {
				const entry = sessionEntry;
				entry.thinkingLevel = "high";
				entry.updatedAt = Date.now();
				await persistSessionEntry({
					sessionStore,
					sessionKey,
					storePath,
					entry
				});
			}
		}
		let sessionFile;
		if (sessionStore && sessionKey) {
			const resolvedSessionFile = await resolveSessionTranscriptFile({
				sessionId,
				sessionKey,
				sessionStore,
				storePath,
				sessionEntry,
				agentId: sessionAgentId,
				threadId: opts.threadId
			});
			sessionFile = resolvedSessionFile.sessionFile;
			sessionEntry = resolvedSessionFile.sessionEntry;
		}
		if (!sessionFile) {
			const resolvedSessionFile = await resolveSessionTranscriptFile({
				sessionId,
				sessionKey: sessionKey ?? sessionId,
				sessionEntry,
				agentId: sessionAgentId,
				threadId: opts.threadId
			});
			sessionFile = resolvedSessionFile.sessionFile;
			sessionEntry = resolvedSessionFile.sessionEntry;
		}
		const startedAt = Date.now();
		let lifecycleEnded = false;
		let result;
		let fallbackProvider = provider;
		let fallbackModel = model;
		try {
			const runContext = resolveAgentRunContext(opts);
			const messageChannel = resolveMessageChannel(runContext.messageChannel, opts.replyChannel ?? opts.channel);
			const spawnedBy = normalizedSpawned.spawnedBy ?? sessionEntry?.spawnedBy;
			const effectiveFallbacksOverride = resolveEffectiveModelFallbacks({
				cfg,
				agentId: sessionAgentId,
				hasSessionModelOverride: Boolean(storedModelOverride)
			});
			let fallbackAttemptIndex = 0;
			const fallbackResult = await runWithModelFallback({
				cfg,
				provider,
				model,
				runId,
				agentDir,
				fallbacksOverride: effectiveFallbacksOverride,
				run: (providerOverride, modelOverride, runOptions) => {
					const isFallbackRetry = fallbackAttemptIndex > 0;
					fallbackAttemptIndex += 1;
					return runAgentAttempt({
						providerOverride,
						modelOverride,
						cfg,
						sessionEntry,
						sessionId,
						sessionKey,
						sessionAgentId,
						sessionFile,
						workspaceDir,
						body,
						isFallbackRetry,
						resolvedThinkLevel,
						timeoutMs,
						runId,
						opts,
						runContext,
						spawnedBy,
						messageChannel,
						skillsSnapshot,
						resolvedVerboseLevel,
						agentDir,
						primaryProvider: providerForAuthProfileValidation,
						sessionStore,
						storePath,
						allowTransientCooldownProbe: runOptions?.allowTransientCooldownProbe,
						onAgentEvent: (evt) => {
							if (evt.stream === "lifecycle" && typeof evt.data?.phase === "string" && (evt.data.phase === "end" || evt.data.phase === "error")) {lifecycleEnded = true;}
						}
					});
				}
			});
			result = fallbackResult.result;
			fallbackProvider = fallbackResult.provider;
			fallbackModel = fallbackResult.model;
			if (!lifecycleEnded) {
				const stopReason = result.meta.stopReason;
				if (stopReason && stopReason !== "end_turn") {console.error(`[agent] run ${runId} ended with stopReason=${stopReason}`);}
				emitAgentEvent({
					runId,
					stream: "lifecycle",
					data: {
						phase: "end",
						startedAt,
						endedAt: Date.now(),
						aborted: result.meta.aborted ?? false,
						stopReason
					}
				});
			}
		} catch (err) {
			if (!lifecycleEnded) {emitAgentEvent({
				runId,
				stream: "lifecycle",
				data: {
					phase: "error",
					startedAt,
					endedAt: Date.now(),
					error: String(err)
				}
			});}
			throw err;
		}
		if (sessionStore && sessionKey) {await updateSessionStoreAfterAgentRun({
			cfg,
			contextTokensOverride: agentCfg?.contextTokens,
			sessionId,
			sessionKey,
			storePath,
			sessionStore,
			defaultProvider: provider,
			defaultModel: model,
			fallbackProvider,
			fallbackModel,
			result
		});}
		const payloads = result.payloads ?? [];
		return await deliverAgentCommandResult({
			cfg,
			deps,
			runtime,
			opts,
			outboundSession,
			sessionEntry,
			result,
			payloads
		});
	} finally {
		clearAgentRunContext(runId);
	}
}
async function agentCommand(opts, runtime = defaultRuntime, deps = createDefaultDeps()) {
	return await agentCommandInternal({
		...opts,
		senderIsOwner: opts.senderIsOwner ?? true,
		allowModelOverride: opts.allowModelOverride ?? true
	}, runtime, deps);
}
async function agentCommandFromIngress(opts, runtime = defaultRuntime, deps = createDefaultDeps()) {
	if (typeof opts.senderIsOwner !== "boolean") {throw new Error("senderIsOwner must be explicitly set for ingress agent runs.");}
	if (typeof opts.allowModelOverride !== "boolean") {throw new Error("allowModelOverride must be explicitly set for ingress agent runs.");}
	return await agentCommandInternal({
		...opts,
		senderIsOwner: opts.senderIsOwner
	}, runtime, deps);
}
//#endregion
export { agentCommandFromIngress as n, agentCommand as t };
