import { i as formatErrorMessage } from "./errors-RZvg4nzL.js";
import { p as resolveUserPath } from "./utils-DvkbxKCZ.js";
import { m as resolveSessionAgentIds } from "./agent-scope-DfXPuZUf.js";
import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER, t as DEFAULT_CONTEXT_TOKENS } from "./defaults-CyUAeHC6.js";
import { t as getGlobalHookRunner } from "./hook-runner-global-CbPxjSBS.js";
import { i as resolveContextEngine } from "./registry-Rm7RI0b2.js";
import { t as resolveOpenClawAgentDir } from "./agent-paths-CkJkZaS2.js";
import { t as ensureContextEnginesInitialized } from "./init-CmKFRfXB.js";
import { c as captureCompactionCheckpointSnapshot, f as persistSessionCompactionCheckpoint, l as cleanupCompactionCheckpointSnapshot, n as asCompactionHookRunner, p as resolveSessionCompactionCheckpointReason, s as runPostCompactionSideEffects, t as readPiModelContextTokens } from "./model-context-tokens-B6o6QLlw.js";
import { i as enqueueCommandInLane } from "./command-queue-DaWipAKS.js";
import { a as resolveContextWindowInfo } from "./context-window-guard-CcgNxg6q.js";
import { t as maybeCompactAgentHarnessSession } from "./selection-CJrCnQoW.js";
import { n as shouldRotateCompactionTranscript, t as rotateTranscriptAfterCompaction } from "./compaction-successor-transcript-BCy1H5AJ.js";
import { t as log } from "./logger-3KEv9Tay.js";
import { n as resolveGlobalLane, r as resolveSessionLane } from "./lanes-qE95BSYo.js";
import { t as runContextEngineMaintenance } from "./context-engine-maintenance-D_zcDKZX.js";
import { n as resolveEmbeddedCompactionTarget, t as buildEmbeddedCompactionRuntimeContext } from "./compaction-runtime-context-DBx7M5Yi.js";
import { t as ensureRuntimePluginsLoaded } from "./runtime-plugins-D5pyxESf.js";
import { n as resolveModelAsync } from "./model-DgTjq0II.js";
import { SessionManager } from "@mariozechner/pi-coding-agent";
//#region src/agents/pi-embedded-runner/compact.queued.ts
/**
* Compacts a session with lane queueing (session lane + global lane).
* Use this from outside a lane context. If already inside a lane, use
* `compactEmbeddedPiSessionDirect` to avoid deadlocks.
*/
async function compactEmbeddedPiSession(params) {
	ensureRuntimePluginsLoaded({
		config: params.config,
		workspaceDir: params.workspaceDir,
		allowGatewaySubagentBinding: params.allowGatewaySubagentBinding
	});
	ensureContextEnginesInitialized();
	const agentDir = params.agentDir ?? resolveOpenClawAgentDir();
	const resolvedWorkspaceDir = resolveUserPath(params.workspaceDir);
	const contextEngine = await resolveContextEngine(params.config, {
		agentDir,
		workspaceDir: resolvedWorkspaceDir
	});
	let contextTokenBudget = params.contextTokenBudget;
	if (!contextTokenBudget || !Number.isFinite(contextTokenBudget) || contextTokenBudget <= 0) {
		const resolvedCompactionTarget = resolveEmbeddedCompactionTarget({
			config: params.config,
			provider: params.provider,
			modelId: params.model,
			authProfileId: params.authProfileId,
			defaultProvider: DEFAULT_PROVIDER,
			defaultModel: DEFAULT_MODEL
		});
		const ceProvider = resolvedCompactionTarget.provider ?? "openai";
		const ceModelId = resolvedCompactionTarget.model ?? "gpt-5.5";
		const { model: ceModel } = await resolveModelAsync(ceProvider, ceModelId, agentDir, params.config);
		const ceRuntimeModel = ceModel;
		contextTokenBudget = resolveContextWindowInfo({
			cfg: params.config,
			provider: ceProvider,
			modelId: ceModelId,
			modelContextTokens: readPiModelContextTokens(ceModel),
			modelContextWindow: ceRuntimeModel?.contextWindow,
			defaultTokens: DEFAULT_CONTEXT_TOKENS
		}).tokens;
	}
	const contextEngineRuntimeContext = buildCompactionContextEngineRuntimeContext({
		params,
		agentDir,
		contextTokenBudget
	});
	const harnessResult = await maybeCompactAgentHarnessSession({
		...params,
		contextEngine,
		contextTokenBudget,
		contextEngineRuntimeContext
	});
	if (harnessResult) {
		await contextEngine.dispose?.();
		return harnessResult;
	}
	const sessionLane = resolveSessionLane(params.sessionKey?.trim() || params.sessionId);
	const globalLane = resolveGlobalLane(params.lane);
	const enqueueGlobal = params.enqueue ?? ((task, opts) => enqueueCommandInLane(globalLane, task, opts));
	return enqueueCommandInLane(sessionLane, () => enqueueGlobal(async () => {
		let checkpointSnapshot = null;
		let checkpointSnapshotRetained = false;
		try {
			const engineOwnsCompaction = contextEngine.info.ownsCompaction === true;
			checkpointSnapshot = engineOwnsCompaction ? captureCompactionCheckpointSnapshot({
				sessionManager: SessionManager.open(params.sessionFile),
				sessionFile: params.sessionFile
			}) : null;
			const hookRunner = engineOwnsCompaction ? asCompactionHookRunner(getGlobalHookRunner()) : null;
			const hookSessionKey = params.sessionKey?.trim() || params.sessionId;
			const { sessionAgentId } = resolveSessionAgentIds({
				sessionKey: params.sessionKey,
				config: params.config
			});
			const resolvedMessageProvider = params.messageChannel ?? params.messageProvider;
			const hookCtx = {
				sessionId: params.sessionId,
				agentId: sessionAgentId,
				sessionKey: hookSessionKey,
				workspaceDir: resolvedWorkspaceDir,
				messageProvider: resolvedMessageProvider
			};
			const runtimeContext = contextEngineRuntimeContext;
			if (hookRunner?.hasHooks?.("before_compaction") && hookRunner.runBeforeCompaction) try {
				await hookRunner.runBeforeCompaction({
					messageCount: -1,
					sessionFile: params.sessionFile
				}, hookCtx);
			} catch (err) {
				log.warn("before_compaction hook failed", { errorMessage: formatErrorMessage(err) });
			}
			const result = await contextEngine.compact({
				sessionId: params.sessionId,
				sessionKey: params.sessionKey,
				sessionFile: params.sessionFile,
				tokenBudget: contextTokenBudget,
				currentTokenCount: params.currentTokenCount,
				compactionTarget: params.trigger === "manual" ? "threshold" : "budget",
				customInstructions: params.customInstructions,
				force: params.trigger === "manual",
				runtimeContext
			});
			const delegatedSessionId = result.result?.sessionId;
			const delegatedSessionFile = result.result?.sessionFile;
			const delegatedRotatedTranscript = typeof delegatedSessionId === "string" && delegatedSessionId !== params.sessionId || typeof delegatedSessionFile === "string" && delegatedSessionFile !== params.sessionFile;
			let postCompactionSessionId = delegatedSessionId ?? params.sessionId;
			let postCompactionSessionFile = delegatedSessionFile ?? params.sessionFile;
			let postCompactionLeafId;
			if (result.ok && result.compacted) {
				if (shouldRotateCompactionTranscript(params.config) && !delegatedRotatedTranscript) try {
					const rotation = await rotateTranscriptAfterCompaction({
						sessionManager: SessionManager.open(params.sessionFile),
						sessionFile: params.sessionFile
					});
					if (rotation.rotated) {
						postCompactionSessionId = rotation.sessionId ?? postCompactionSessionId;
						postCompactionSessionFile = rotation.sessionFile ?? postCompactionSessionFile;
						postCompactionLeafId = rotation.leafId;
						log.info(`[compaction] rotated active transcript after context-engine compaction (sessionKey=${params.sessionKey ?? params.sessionId})`);
					}
				} catch (err) {
					log.warn("failed to rotate compacted transcript", { errorMessage: formatErrorMessage(err) });
				}
				if (params.config && params.sessionKey && checkpointSnapshot) try {
					const postLeafId = postCompactionLeafId ?? SessionManager.open(postCompactionSessionFile).getLeafId() ?? void 0;
					checkpointSnapshotRetained = await persistSessionCompactionCheckpoint({
						cfg: params.config,
						sessionKey: params.sessionKey,
						sessionId: postCompactionSessionId,
						reason: resolveSessionCompactionCheckpointReason({ trigger: params.trigger }),
						snapshot: checkpointSnapshot,
						summary: result.result?.summary,
						firstKeptEntryId: result.result?.firstKeptEntryId,
						tokensBefore: result.result?.tokensBefore,
						tokensAfter: result.result?.tokensAfter,
						postSessionFile: postCompactionSessionFile,
						postLeafId,
						postEntryId: postLeafId
					}) !== null;
				} catch (err) {
					log.warn("failed to persist compaction checkpoint", { errorMessage: formatErrorMessage(err) });
				}
				await runContextEngineMaintenance({
					contextEngine,
					sessionId: postCompactionSessionId,
					sessionKey: params.sessionKey,
					sessionFile: postCompactionSessionFile,
					reason: "compaction",
					runtimeContext
				});
			}
			if (engineOwnsCompaction && result.ok && result.compacted) await runPostCompactionSideEffects({
				config: params.config,
				sessionKey: params.sessionKey,
				sessionFile: postCompactionSessionFile
			});
			if (result.ok && result.compacted && hookRunner?.hasHooks?.("after_compaction") && hookRunner.runAfterCompaction) try {
				const afterHookCtx = {
					...hookCtx,
					sessionId: postCompactionSessionId
				};
				await hookRunner.runAfterCompaction({
					messageCount: -1,
					compactedCount: -1,
					tokenCount: result.result?.tokensAfter,
					sessionFile: postCompactionSessionFile
				}, afterHookCtx);
			} catch (err) {
				log.warn("after_compaction hook failed", { errorMessage: formatErrorMessage(err) });
			}
			return {
				ok: result.ok,
				compacted: result.compacted,
				reason: result.reason,
				result: result.result ? {
					summary: result.result.summary ?? "",
					firstKeptEntryId: result.result.firstKeptEntryId ?? "",
					tokensBefore: result.result.tokensBefore,
					tokensAfter: result.result.tokensAfter,
					details: result.result.details,
					...postCompactionSessionId !== params.sessionId ? { sessionId: postCompactionSessionId } : {},
					...postCompactionSessionFile !== params.sessionFile ? { sessionFile: postCompactionSessionFile } : {}
				} : void 0
			};
		} finally {
			if (!checkpointSnapshotRetained) await cleanupCompactionCheckpointSnapshot(checkpointSnapshot);
			await contextEngine.dispose?.();
		}
	}));
}
function buildCompactionContextEngineRuntimeContext(params) {
	return {
		...params.params,
		...buildEmbeddedCompactionRuntimeContext({
			sessionKey: params.params.sessionKey,
			messageChannel: params.params.messageChannel,
			messageProvider: params.params.messageProvider,
			agentAccountId: params.params.agentAccountId,
			currentChannelId: params.params.currentChannelId,
			currentThreadTs: params.params.currentThreadTs,
			currentMessageId: params.params.currentMessageId,
			authProfileId: params.params.authProfileId,
			workspaceDir: params.params.workspaceDir,
			agentDir: params.agentDir,
			config: params.params.config,
			skillsSnapshot: params.params.skillsSnapshot,
			senderIsOwner: params.params.senderIsOwner,
			senderId: params.params.senderId,
			provider: params.params.provider,
			modelId: params.params.model,
			thinkLevel: params.params.thinkLevel,
			reasoningLevel: params.params.reasoningLevel,
			bashElevated: params.params.bashElevated,
			extraSystemPrompt: params.params.extraSystemPrompt,
			sourceReplyDeliveryMode: params.params.sourceReplyDeliveryMode,
			ownerNumbers: params.params.ownerNumbers
		}),
		tokenBudget: params.contextTokenBudget,
		currentTokenCount: params.params.currentTokenCount
	};
}
//#endregion
export { compactEmbeddedPiSession as t };
