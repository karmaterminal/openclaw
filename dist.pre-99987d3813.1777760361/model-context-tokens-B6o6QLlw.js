import { i as formatErrorMessage } from "./errors-RZvg4nzL.js";
import { t as createSubsystemLogger } from "./subsystem-W9_E260X.js";
import { p as resolveSessionAgentId } from "./agent-scope-DfXPuZUf.js";
import { m as triggerInternalHook, n as createInternalHookEvent } from "./internal-hooks-CL2mvBNh.js";
import { r as isCompactionCheckpointTranscriptFileName } from "./artifacts-6qAY7t34.js";
import { c as updateSessionStore } from "./store-APN60wqF.js";
import "./sessions-DTfZDTku.js";
import { l as emitSessionTranscriptUpdate } from "./transcript-y-FZWM2K.js";
import { d as resolveGatewaySessionStoreTarget } from "./session-utils-MHYarXtm.js";
import { t as log$1 } from "./logger-3KEv9Tay.js";
import { n as getActiveMemorySearchManager } from "./memory-runtime--tlqOtHw.js";
import { t as resolveMemorySearchConfig } from "./memory-search-M3EfUllE.js";
import fs from "node:fs";
import path from "node:path";
import fs$1 from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { SessionManager } from "@mariozechner/pi-coding-agent";
//#region src/gateway/session-compaction-checkpoints.ts
const log = createSubsystemLogger("gateway/session-compaction-checkpoints");
const MAX_COMPACTION_CHECKPOINTS_PER_SESSION = 25;
function trimSessionCheckpoints(checkpoints) {
	if (!Array.isArray(checkpoints) || checkpoints.length === 0) return {
		kept: void 0,
		removed: []
	};
	const kept = checkpoints.slice(-MAX_COMPACTION_CHECKPOINTS_PER_SESSION);
	return {
		kept,
		removed: checkpoints.slice(0, Math.max(0, checkpoints.length - kept.length))
	};
}
function sessionStoreCheckpoints(entry) {
	return Array.isArray(entry?.compactionCheckpoints) ? [...entry.compactionCheckpoints] : [];
}
function resolveSessionCompactionCheckpointReason(params) {
	if (params.trigger === "manual" || params.trigger === "volitional") return "manual";
	if (params.timedOut) return "timeout-retry";
	if (params.trigger === "overflow") return "overflow-retry";
	return "auto-threshold";
}
function captureCompactionCheckpointSnapshot(params) {
	const getLeafId = params.sessionManager && typeof params.sessionManager.getLeafId === "function" ? params.sessionManager.getLeafId.bind(params.sessionManager) : null;
	const sessionFile = params.sessionFile.trim();
	if (!getLeafId || !sessionFile) return null;
	const maxBytes = params.maxBytes ?? 67108864;
	try {
		const stat = fs.statSync(sessionFile);
		if (!stat.isFile() || stat.size > maxBytes) return null;
	} catch {
		return null;
	}
	const leafId = getLeafId();
	if (!leafId) return null;
	const parsedSessionFile = path.parse(sessionFile);
	const snapshotFile = path.join(parsedSessionFile.dir, `${parsedSessionFile.name}.checkpoint.${randomUUID()}${parsedSessionFile.ext || ".jsonl"}`);
	try {
		fs.copyFileSync(sessionFile, snapshotFile);
	} catch {
		return null;
	}
	let snapshotSession;
	try {
		snapshotSession = SessionManager.open(snapshotFile, path.dirname(snapshotFile));
	} catch {
		try {
			fs.unlinkSync(snapshotFile);
		} catch {}
		return null;
	}
	const getSessionId = snapshotSession && typeof snapshotSession.getSessionId === "function" ? snapshotSession.getSessionId.bind(snapshotSession) : null;
	if (!getSessionId) return null;
	return {
		sessionId: getSessionId(),
		sessionFile: snapshotFile,
		leafId
	};
}
async function cleanupCompactionCheckpointSnapshot(snapshot) {
	if (!snapshot?.sessionFile) return;
	try {
		await fs$1.unlink(snapshot.sessionFile);
	} catch {}
}
async function cleanupTrimmedCompactionCheckpointFiles(params) {
	if (params.removed.length === 0) return;
	const retainedPaths = new Set((params.retained ?? []).map((checkpoint) => checkpoint.preCompaction.sessionFile?.trim()).filter((filePath) => Boolean(filePath)));
	const snapshotDir = path.resolve(path.dirname(params.currentSnapshotFile));
	for (const checkpoint of params.removed) {
		const sessionFile = checkpoint.preCompaction.sessionFile?.trim();
		if (!sessionFile || retainedPaths.has(sessionFile)) continue;
		const resolvedSessionFile = path.resolve(sessionFile);
		if (path.dirname(resolvedSessionFile) !== snapshotDir || !isCompactionCheckpointTranscriptFileName(path.basename(resolvedSessionFile))) continue;
		try {
			await fs$1.unlink(resolvedSessionFile);
		} catch {}
	}
}
async function persistSessionCompactionCheckpoint(params) {
	const target = resolveGatewaySessionStoreTarget({
		cfg: params.cfg,
		key: params.sessionKey
	});
	const createdAt = params.createdAt ?? Date.now();
	const checkpoint = {
		checkpointId: randomUUID(),
		sessionKey: target.canonicalKey,
		sessionId: params.sessionId,
		createdAt,
		reason: params.reason,
		...typeof params.tokensBefore === "number" ? { tokensBefore: params.tokensBefore } : {},
		...typeof params.tokensAfter === "number" ? { tokensAfter: params.tokensAfter } : {},
		...params.summary?.trim() ? { summary: params.summary.trim() } : {},
		...params.firstKeptEntryId?.trim() ? { firstKeptEntryId: params.firstKeptEntryId.trim() } : {},
		preCompaction: {
			sessionId: params.snapshot.sessionId,
			sessionFile: params.snapshot.sessionFile,
			leafId: params.snapshot.leafId
		},
		postCompaction: {
			sessionId: params.sessionId,
			...params.postSessionFile?.trim() ? { sessionFile: params.postSessionFile.trim() } : {},
			...params.postLeafId?.trim() ? { leafId: params.postLeafId.trim() } : {},
			...params.postEntryId?.trim() ? { entryId: params.postEntryId.trim() } : {}
		}
	};
	let stored = false;
	let trimmedCheckpoints;
	await updateSessionStore(target.storePath, (store) => {
		const existing = store[target.canonicalKey];
		if (!existing?.sessionId) return;
		const checkpoints = sessionStoreCheckpoints(existing);
		checkpoints.push(checkpoint);
		trimmedCheckpoints = trimSessionCheckpoints(checkpoints);
		store[target.canonicalKey] = {
			...existing,
			updatedAt: Math.max(existing.updatedAt ?? 0, createdAt),
			compactionCheckpoints: trimmedCheckpoints.kept
		};
		stored = true;
	});
	if (!stored) {
		log.warn("skipping compaction checkpoint persist: session not found", { sessionKey: params.sessionKey });
		return null;
	}
	await cleanupTrimmedCompactionCheckpointFiles({
		removed: trimmedCheckpoints?.removed ?? [],
		retained: trimmedCheckpoints?.kept,
		currentSnapshotFile: params.snapshot.sessionFile
	});
	return checkpoint;
}
function listSessionCompactionCheckpoints(entry) {
	return sessionStoreCheckpoints(entry).toSorted((a, b) => b.createdAt - a.createdAt);
}
function getSessionCompactionCheckpoint(params) {
	const checkpointId = params.checkpointId.trim();
	if (!checkpointId) return;
	return listSessionCompactionCheckpoints(params.entry).find((checkpoint) => checkpoint.checkpointId === checkpointId);
}
//#endregion
//#region src/agents/pi-embedded-runner/compaction-hooks.ts
function resolvePostCompactionIndexSyncMode(config) {
	const mode = config?.agents?.defaults?.compaction?.postIndexSync;
	if (mode === "off" || mode === "async" || mode === "await") return mode;
	return "async";
}
async function runPostCompactionSessionMemorySync(params) {
	if (!params.config) return;
	try {
		const sessionFile = params.sessionFile.trim();
		if (!sessionFile) return;
		const agentId = resolveSessionAgentId({
			sessionKey: params.sessionKey,
			config: params.config
		});
		const resolvedMemory = resolveMemorySearchConfig(params.config, agentId);
		if (!resolvedMemory || !resolvedMemory.sources.includes("sessions")) return;
		if (!resolvedMemory.sync.sessions.postCompactionForce) return;
		const { manager } = await getActiveMemorySearchManager({
			cfg: params.config,
			agentId
		});
		if (!manager?.sync) return;
		await manager.sync({
			reason: "post-compaction",
			sessionFiles: [sessionFile]
		});
	} catch (err) {
		log$1.warn(`memory sync skipped (post-compaction): ${formatErrorMessage(err)}`);
	}
}
function syncPostCompactionSessionMemory(params) {
	if (params.mode === "off" || !params.config) return Promise.resolve();
	const syncTask = runPostCompactionSessionMemorySync({
		config: params.config,
		sessionKey: params.sessionKey,
		sessionFile: params.sessionFile
	});
	if (params.mode === "await") return syncTask;
	return Promise.resolve();
}
async function runPostCompactionSideEffects(params) {
	const sessionFile = params.sessionFile.trim();
	if (!sessionFile) return;
	emitSessionTranscriptUpdate(sessionFile);
	await syncPostCompactionSessionMemory({
		config: params.config,
		sessionKey: params.sessionKey,
		sessionFile,
		mode: resolvePostCompactionIndexSyncMode(params.config)
	});
}
function asCompactionHookRunner(hookRunner) {
	if (!hookRunner) return null;
	return {
		hasHooks: (hookName) => hookRunner.hasHooks?.(hookName) ?? false,
		runBeforeCompaction: hookRunner.runBeforeCompaction?.bind(hookRunner),
		runAfterCompaction: hookRunner.runAfterCompaction?.bind(hookRunner)
	};
}
function estimateTokenCountSafe(messages, estimateTokensFn) {
	try {
		let total = 0;
		for (const message of messages) total += estimateTokensFn(message);
		return total;
	} catch {
		return;
	}
}
function buildBeforeCompactionHookMetrics(params) {
	return {
		messageCountOriginal: params.originalMessages.length,
		tokenCountOriginal: estimateTokenCountSafe(params.originalMessages, params.estimateTokensFn),
		messageCountBefore: params.currentMessages.length,
		tokenCountBefore: params.observedTokenCount ?? estimateTokenCountSafe(params.currentMessages, params.estimateTokensFn)
	};
}
async function runBeforeCompactionHooks(params) {
	const missingSessionKey = !params.sessionKey || !params.sessionKey.trim();
	const hookSessionKey = params.sessionKey?.trim() || params.sessionId;
	try {
		await triggerInternalHook(createInternalHookEvent("session", "compact:before", hookSessionKey, {
			sessionId: params.sessionId,
			missingSessionKey,
			messageCount: params.metrics.messageCountBefore,
			tokenCount: params.metrics.tokenCountBefore,
			messageCountOriginal: params.metrics.messageCountOriginal,
			tokenCountOriginal: params.metrics.tokenCountOriginal
		}));
	} catch (err) {
		log$1.warn("session:compact:before hook failed", {
			errorMessage: formatErrorMessage(err),
			errorStack: err instanceof Error ? err.stack : void 0
		});
	}
	if (params.hookRunner?.hasHooks?.("before_compaction")) try {
		await params.hookRunner.runBeforeCompaction?.({
			messageCount: params.metrics.messageCountBefore,
			tokenCount: params.metrics.tokenCountBefore
		}, {
			sessionId: params.sessionId,
			agentId: params.sessionAgentId,
			sessionKey: hookSessionKey,
			workspaceDir: params.workspaceDir,
			messageProvider: params.messageProvider
		});
	} catch (err) {
		log$1.warn("before_compaction hook failed", {
			errorMessage: formatErrorMessage(err),
			errorStack: err instanceof Error ? err.stack : void 0
		});
	}
	return {
		hookSessionKey,
		missingSessionKey
	};
}
function estimateTokensAfterCompaction(params) {
	const tokensAfter = estimateTokenCountSafe(params.messagesAfter, params.estimateTokensFn);
	if (tokensAfter === void 0) return;
	const sanityCheckBaseline = params.observedTokenCount ?? params.fullSessionTokensBefore;
	if (sanityCheckBaseline > 0 && tokensAfter > (params.observedTokenCount !== void 0 ? sanityCheckBaseline : sanityCheckBaseline * 1.1)) return;
	return tokensAfter;
}
async function runAfterCompactionHooks(params) {
	try {
		await triggerInternalHook(createInternalHookEvent("session", "compact:after", params.hookSessionKey, {
			sessionId: params.sessionId,
			missingSessionKey: params.missingSessionKey,
			messageCount: params.messageCountAfter,
			tokenCount: params.tokensAfter,
			compactedCount: params.compactedCount,
			summaryLength: params.summaryLength,
			tokensBefore: params.tokensBefore,
			tokensAfter: params.tokensAfter,
			firstKeptEntryId: params.firstKeptEntryId
		}));
	} catch (err) {
		log$1.warn("session:compact:after hook failed", {
			errorMessage: formatErrorMessage(err),
			errorStack: err instanceof Error ? err.stack : void 0
		});
	}
	if (params.hookRunner?.hasHooks?.("after_compaction")) try {
		await params.hookRunner.runAfterCompaction?.({
			messageCount: params.messageCountAfter,
			tokenCount: params.tokensAfter,
			compactedCount: params.compactedCount,
			sessionFile: params.sessionFile
		}, {
			sessionId: params.sessionId,
			agentId: params.sessionAgentId,
			sessionKey: params.hookSessionKey,
			workspaceDir: params.workspaceDir,
			messageProvider: params.messageProvider
		});
	} catch (err) {
		log$1.warn("after_compaction hook failed", {
			errorMessage: formatErrorMessage(err),
			errorStack: err instanceof Error ? err.stack : void 0
		});
	}
}
//#endregion
//#region src/agents/pi-embedded-runner/model-context-tokens.ts
function readPiModelContextTokens(model) {
	const value = model?.contextTokens;
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
//#endregion
export { runAfterCompactionHooks as a, captureCompactionCheckpointSnapshot as c, listSessionCompactionCheckpoints as d, persistSessionCompactionCheckpoint as f, estimateTokensAfterCompaction as i, cleanupCompactionCheckpointSnapshot as l, asCompactionHookRunner as n, runBeforeCompactionHooks as o, resolveSessionCompactionCheckpointReason as p, buildBeforeCompactionHookMetrics as r, runPostCompactionSideEffects as s, readPiModelContextTokens as t, getSessionCompactionCheckpoint as u };
