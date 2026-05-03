import { t as sanitizeForLog } from "./ansi-Cis6s4Rt.js";
import { t as createSubsystemLogger } from "./subsystem-CJBoMDt5.js";
import { t as isCliProvider } from "./model-selection-cli-BCNxTSmc.js";
import "./model-selection-B7RNWcLj.js";
import { t as emitSessionTranscriptUpdate } from "./transcript-events-BSJWlilY.js";
import { r as resolveSessionTranscriptFile } from "./transcript-DTxF1v8R.js";
import { nt as buildUsageWithNoCost } from "./compaction-runtime-context-BXR92FQ8.js";
import { o as prepareSessionManagerForRun } from "./selection-ZVDtlkUN.js";
import { o as resolveBootstrapWarningSignaturesSeen } from "./bootstrap-budget-D3YMWmaU.js";
import { t as FailoverError } from "./failover-error-Bly4bj4L.js";
import { i as emitAgentEvent } from "./agent-events-CN4p9Z8t.js";
import { t as normalizeReplyPayload } from "./normalize-reply-D9qpdj0n.js";
import { t as runEmbeddedPiAgent } from "./pi-embedded-runner-BrTbOgS7.js";
import "./pi-embedded-CdgYjVtp.js";
import { t as runCliAgent } from "./cli-runner-DvgrclIe.js";
import { r as getCliSessionBinding, s as setCliSessionBinding } from "./cli-session-GscASrM6.js";
import { a as resolveFallbackRetryPrompt, i as createAcpVisibleTextAccumulator, o as sessionFileHasContent, r as claudeCliSessionTranscriptHasContent, t as persistSessionEntry } from "./attempt-execution.shared-C6yidzvK.js";
import { t as clearCliSessionInStore } from "./session-store-CW7yhVMZ.js";
import fs from "node:fs/promises";
import { SessionManager } from "@mariozechner/pi-coding-agent";
//#region src/agents/command/attempt-execution.ts
const log = createSubsystemLogger("agents/agent-command");
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
function resolveTranscriptUsage(usage) {
	if (!usage) return ACP_TRANSCRIPT_USAGE;
	return buildUsageWithNoCost({
		input: usage.input,
		output: usage.output,
		cacheRead: usage.cacheRead,
		cacheWrite: usage.cacheWrite,
		totalTokens: usage.total
	});
}
async function persistTextTurnTranscript(params) {
	const promptText = params.body;
	const replyText = params.finalText;
	if (!promptText && !replyText) return params.sessionEntry;
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
	if (promptText) sessionManager.appendMessage({
		role: "user",
		content: promptText,
		timestamp: Date.now()
	});
	if (replyText) sessionManager.appendMessage({
		role: "assistant",
		content: [{
			type: "text",
			text: replyText
		}],
		api: params.assistant.api,
		provider: params.assistant.provider,
		model: params.assistant.model,
		usage: resolveTranscriptUsage(params.assistant.usage),
		stopReason: "stop",
		timestamp: Date.now()
	});
	emitSessionTranscriptUpdate(sessionFile);
	return sessionEntry;
}
function resolveCliTranscriptReplyText(result) {
	const visibleText = result.meta.finalAssistantVisibleText?.trim();
	if (visibleText) return visibleText;
	return (result.payloads ?? []).filter((payload) => !payload.isError && !payload.isReasoning).map((payload) => payload.text?.trim() ?? "").filter(Boolean).join("\n\n");
}
function isClaudeCliProvider(provider) {
	return provider.trim().toLowerCase() === "claude-cli";
}
async function persistAcpTurnTranscript(params) {
	return await persistTextTurnTranscript({
		...params,
		assistant: {
			api: "openai-responses",
			provider: "openclaw",
			model: "acp-runtime"
		}
	});
}
async function persistCliTurnTranscript(params) {
	const replyText = resolveCliTranscriptReplyText(params.result);
	const provider = params.result.meta.agentMeta?.provider?.trim() ?? "cli";
	const model = params.result.meta.agentMeta?.model?.trim() ?? "default";
	return await persistTextTurnTranscript({
		body: params.body,
		finalText: replyText,
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		sessionEntry: params.sessionEntry,
		sessionStore: params.sessionStore,
		storePath: params.storePath,
		sessionAgentId: params.sessionAgentId,
		threadId: params.threadId,
		sessionCwd: params.sessionCwd,
		assistant: {
			api: "cli",
			provider,
			model,
			usage: params.result.meta.agentMeta?.usage
		}
	});
}
function runAgentAttempt(params) {
	const effectivePrompt = resolveFallbackRetryPrompt({
		body: params.body,
		isFallbackRetry: params.isFallbackRetry,
		sessionHasHistory: params.sessionHasHistory
	});
	const bootstrapPromptWarningSignaturesSeen = resolveBootstrapWarningSignaturesSeen(params.sessionEntry?.systemPromptReport);
	const bootstrapPromptWarningSignature = bootstrapPromptWarningSignaturesSeen[bootstrapPromptWarningSignaturesSeen.length - 1];
	const authProfileId = params.providerOverride === params.authProfileProvider ? params.sessionEntry?.authProfileOverride : void 0;
	if (isCliProvider(params.providerOverride, params.cfg)) {
		const cliSessionBinding = getCliSessionBinding(params.sessionEntry, params.providerOverride);
		const resolveReusableCliSessionBinding = async () => {
			if (!isClaudeCliProvider(params.providerOverride) || !cliSessionBinding?.sessionId || await claudeCliSessionTranscriptHasContent({ sessionId: cliSessionBinding.sessionId })) return cliSessionBinding;
			log.warn(`cli session reset: provider=${sanitizeForLog(params.providerOverride)} reason=transcript-missing sessionKey=${params.sessionKey ?? params.sessionId}`);
			if (params.sessionKey && params.sessionStore && params.storePath) params.sessionEntry = await clearCliSessionInStore({
				provider: params.providerOverride,
				sessionKey: params.sessionKey,
				sessionStore: params.sessionStore,
				storePath: params.storePath
			}) ?? params.sessionEntry;
		};
		const runCliWithSession = (nextCliSessionId, activeCliSessionBinding = cliSessionBinding) => runCliAgent({
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
			cliSessionBinding: nextCliSessionId === activeCliSessionBinding?.sessionId ? activeCliSessionBinding : void 0,
			authProfileId,
			bootstrapPromptWarningSignaturesSeen,
			bootstrapPromptWarningSignature,
			images: params.isFallbackRetry ? void 0 : params.opts.images,
			imageOrder: params.isFallbackRetry ? void 0 : params.opts.imageOrder,
			skillsSnapshot: params.skillsSnapshot,
			streamParams: params.opts.streamParams,
			messageProvider: params.messageChannel,
			agentAccountId: params.runContext.accountId,
			senderIsOwner: params.opts.senderIsOwner
		});
		return resolveReusableCliSessionBinding().then(async (activeCliSessionBinding) => {
			try {
				return await runCliWithSession(activeCliSessionBinding?.sessionId, activeCliSessionBinding);
			} catch (err) {
				if (err instanceof FailoverError && err.reason === "session_expired" && activeCliSessionBinding?.sessionId && params.sessionKey && params.sessionStore && params.storePath) {
					log.warn(`CLI session expired, clearing from session store: provider=${sanitizeForLog(params.providerOverride)} sessionKey=${params.sessionKey}`);
					params.sessionEntry = await clearCliSessionInStore({
						provider: params.providerOverride,
						sessionKey: params.sessionKey,
						sessionStore: params.sessionStore,
						storePath: params.storePath
					}) ?? params.sessionEntry;
					return await runCliWithSession(void 0).then(async (result) => {
						if (result.meta.agentMeta?.cliSessionBinding?.sessionId && params.sessionKey && params.sessionStore && params.storePath) {
							const entry = params.sessionStore[params.sessionKey];
							if (entry) {
								const updatedEntry = { ...entry };
								setCliSessionBinding(updatedEntry, params.providerOverride, result.meta.agentMeta.cliSessionBinding);
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
			}
		});
	}
	return runEmbeddedPiAgent({
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		agentId: params.sessionAgentId,
		trigger: "user",
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
		imageOrder: params.isFallbackRetry ? void 0 : params.opts.imageOrder,
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
		bootstrapContextMode: params.opts.bootstrapContextMode,
		bootstrapContextRunKind: params.opts.bootstrapContextRunKind,
		drainsContinuationDelegateQueue: params.opts.drainsContinuationDelegateQueue,
		internalEvents: params.opts.internalEvents,
		inputProvenance: params.opts.inputProvenance,
		streamParams: params.opts.streamParams,
		agentDir: params.agentDir,
		allowTransientCooldownProbe: params.allowTransientCooldownProbe,
		cleanupBundleMcpOnRunEnd: params.opts.cleanupBundleMcpOnRunEnd,
		onAgentEvent: params.onAgentEvent,
		bootstrapPromptWarningSignaturesSeen,
		bootstrapPromptWarningSignature
	});
}
function buildAcpResult(params) {
	const normalizedFinalPayload = normalizeReplyPayload({ text: params.payloadText });
	return {
		payloads: normalizedFinalPayload ? [normalizedFinalPayload] : [],
		meta: {
			durationMs: Date.now() - params.startedAt,
			aborted: params.abortSignal?.aborted === true,
			stopReason: params.stopReason
		}
	};
}
function emitAcpLifecycleStart(params) {
	emitAgentEvent({
		runId: params.runId,
		stream: "lifecycle",
		data: {
			phase: "start",
			startedAt: params.startedAt
		}
	});
}
function emitAcpLifecycleEnd(params) {
	emitAgentEvent({
		runId: params.runId,
		stream: "lifecycle",
		data: {
			phase: "end",
			endedAt: Date.now()
		}
	});
}
function emitAcpLifecycleError(params) {
	emitAgentEvent({
		runId: params.runId,
		stream: "lifecycle",
		data: {
			phase: "error",
			error: params.message,
			endedAt: Date.now()
		}
	});
}
function emitAcpAssistantDelta(params) {
	emitAgentEvent({
		runId: params.runId,
		stream: "assistant",
		data: {
			text: params.text,
			delta: params.delta
		}
	});
}
//#endregion
export { buildAcpResult, createAcpVisibleTextAccumulator, emitAcpAssistantDelta, emitAcpLifecycleEnd, emitAcpLifecycleError, emitAcpLifecycleStart, persistAcpTurnTranscript, persistCliTurnTranscript, runAgentAttempt, sessionFileHasContent };
