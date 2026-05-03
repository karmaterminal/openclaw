import { i as formatErrorMessage } from "./errors-Jbvi20TW.js";
import { m as resolveUserPath } from "./utils-BMRcljdi.js";
import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER, t as DEFAULT_CONTEXT_TOKENS } from "./defaults-CV5sAt-u.js";
import { m as resolveSessionAgentIds } from "./agent-scope-BrwtzVtf.js";
import { t as getGlobalHookRunner } from "./hook-runner-global-D1eSoMau.js";
import { i as resolveContextEngine } from "./registry-DvoJjSGd.js";
import { t as resolveOpenClawAgentDir } from "./agent-paths-CACD-vsQ.js";
import { i as enqueueCommandInLane } from "./command-queue-CjIh2XS5.js";
import { t as log } from "./logger-BZ5LifbK.js";
import { t as maybeCompactAgentHarnessSession } from "./selection-CIwFPFCV.js";
import { n as resolveGlobalLane, r as resolveSessionLane } from "./lanes-CMSVuwSB.js";
import { t as ensureContextEnginesInitialized } from "./init-D4-zijWo.js";
import { c as captureCompactionCheckpointSnapshot, f as persistSessionCompactionCheckpoint, l as cleanupCompactionCheckpointSnapshot, n as asCompactionHookRunner, p as resolveSessionCompactionCheckpointReason, s as runPostCompactionSideEffects, t as readPiModelContextTokens } from "./model-context-tokens-wij3r71a.js";
import { o as resolveContextWindowInfo } from "./context-window-guard-Dy55JcQy.js";
import { l as runContextEngineMaintenance } from "./attempt.tool-run-context-rCF7Cy5w.js";
import { o as buildEmbeddedCompactionRuntimeContext, s as resolveEmbeddedCompactionTarget } from "./attempt.thread-helpers-tYeZpzc1.js";
import { t as ensureRuntimePluginsLoaded } from "./runtime-plugins-BY_mTPBS.js";
import { n as resolveModelAsync } from "./model-Cu2ISJ0g.js";
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
	const contextEngine = await resolveContextEngine(params.config);
	const agentDir = params.agentDir ?? resolveOpenClawAgentDir();
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
				workspaceDir: resolveUserPath(params.workspaceDir),
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
			if (result.ok && result.compacted) {
				if (params.config && params.sessionKey && checkpointSnapshot) try {
					const postLeafId = SessionManager.open(params.sessionFile).getLeafId() ?? void 0;
					checkpointSnapshotRetained = await persistSessionCompactionCheckpoint({
						cfg: params.config,
						sessionKey: params.sessionKey,
						sessionId: params.sessionId,
						reason: resolveSessionCompactionCheckpointReason({ trigger: params.trigger }),
						snapshot: checkpointSnapshot,
						summary: result.result?.summary,
						firstKeptEntryId: result.result?.firstKeptEntryId,
						tokensBefore: result.result?.tokensBefore,
						tokensAfter: result.result?.tokensAfter,
						postSessionFile: params.sessionFile,
						postLeafId,
						postEntryId: postLeafId
					}) !== null;
				} catch (err) {
					log.warn("failed to persist compaction checkpoint", { errorMessage: formatErrorMessage(err) });
				}
				await runContextEngineMaintenance({
					contextEngine,
					sessionId: params.sessionId,
					sessionKey: params.sessionKey,
					sessionFile: params.sessionFile,
					reason: "compaction",
					runtimeContext
				});
			}
			if (engineOwnsCompaction && result.ok && result.compacted) await runPostCompactionSideEffects({
				config: params.config,
				sessionKey: params.sessionKey,
				sessionFile: params.sessionFile
			});
			if (result.ok && result.compacted && hookRunner?.hasHooks?.("after_compaction") && hookRunner.runAfterCompaction) try {
				await hookRunner.runAfterCompaction({
					messageCount: -1,
					compactedCount: -1,
					tokenCount: result.result?.tokensAfter,
					sessionFile: params.sessionFile
				}, hookCtx);
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
					details: result.result.details
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
			ownerNumbers: params.params.ownerNumbers
		}),
		tokenBudget: params.contextTokenBudget,
		currentTokenCount: params.params.currentTokenCount
	};
}
//#endregion
export { compactEmbeddedPiSession as t };
