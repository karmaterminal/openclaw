import { a as normalizeLowercaseStringOrEmpty, c as normalizeOptionalString } from "./string-coerce-C1IzJjqi.js";
import { n as defaultRuntime } from "./runtime-Dx7oeLYq.js";
import { r as logVerbose } from "./globals-D40f4_2X.js";
import { u as resolveAgentIdFromSessionKey } from "./session-key-Ba6CwwIP.js";
import { p as resolveSessionAgentId } from "./agent-scope-BrwtzVtf.js";
import { t as matchesSkillFilter } from "./filter-CQ-Gbx9h.js";
import { t as getGlobalHookRunner } from "./hook-runner-global-D1eSoMau.js";
import { a as resolveSessionFilePathOptions, i as resolveSessionFilePath } from "./paths-aVTuLlts.js";
import { c as updateSessionStore, f as resolveSessionStoreEntry, l as updateSessionStoreEntry } from "./store-Cf_mjUkP.js";
import "./sessions-CTeI8wwA.js";
import { o as resolveStableSessionEndTranscript } from "./session-transcript-files.fs-D6QqSh_y.js";
import { a as emitContinuationQueueDrainSpan } from "./continuation-tracer-BI--oqde.js";
import { n as drainSystemEventEntries } from "./system-events-Cg3E-qpj.js";
import { i as resolveUserTimezone } from "./date-time-DJSmU-XH.js";
import { t as canExecRequestNode } from "./exec-defaults-BJc65LUE.js";
import { t as buildWorkspaceSkillSnapshot } from "./workspace-Dj_e-cAT.js";
import "./skills-CN68vLCM.js";
import { n as getSkillsSnapshotVersion, o as shouldRefreshSnapshotForVersion } from "./refresh-state-Dod8b2gG.js";
import { t as ensureSkillsWatcher } from "./refresh-DYS4OasM.js";
import { t as getRemoteSkillEligibility } from "./skills-remote-Cqqtr2Gi.js";
import { n as buildSessionStartHookPayload, t as buildSessionEndHookPayload } from "./session-hooks-D9VrGZap.js";
import { t as buildChannelSummary } from "./channel-summary-CC3MUiqd.js";
import { n as formatZonedTimestamp, r as resolveTimezone, t as formatUtcTimestamp } from "./format-datetime-CqnqWZp8.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
//#region src/auto-reply/reply/session-system-events.ts
/** Drain queued system events, format as `System:` lines, return the block (or undefined). */
async function drainFormattedSystemEvents(params) {
	const compactSystemEvent = (line) => {
		const trimmed = line.trim();
		if (!trimmed) return null;
		const lower = normalizeLowercaseStringOrEmpty(trimmed);
		if (lower.includes("reason periodic")) return null;
		if (lower.startsWith("read heartbeat.md")) return null;
		if (lower.includes("heartbeat poll") || lower.includes("heartbeat wake")) return null;
		if (trimmed.startsWith("Node:")) return trimmed.replace(/ · last input [^·]+/i, "").trim();
		return trimmed;
	};
	const resolveSystemEventTimezone = (cfg) => {
		const raw = normalizeOptionalString(cfg.agents?.defaults?.envelopeTimezone);
		if (!raw) return { mode: "local" };
		const lowered = normalizeLowercaseStringOrEmpty(raw);
		if (lowered === "utc" || lowered === "gmt") return { mode: "utc" };
		if (lowered === "local" || lowered === "host") return { mode: "local" };
		if (lowered === "user") return {
			mode: "iana",
			timeZone: resolveUserTimezone(cfg.agents?.defaults?.userTimezone)
		};
		const explicit = resolveTimezone(raw);
		return explicit ? {
			mode: "iana",
			timeZone: explicit
		} : { mode: "local" };
	};
	const formatSystemEventTimestamp = (ts, cfg) => {
		const date = new Date(ts);
		if (Number.isNaN(date.getTime())) return "unknown-time";
		const zone = resolveSystemEventTimezone(cfg);
		if (zone.mode === "utc") return formatUtcTimestamp(date, { displaySeconds: true });
		if (zone.mode === "local") return formatZonedTimestamp(date, { displaySeconds: true }) ?? "unknown-time";
		return formatZonedTimestamp(date, {
			timeZone: zone.timeZone,
			displaySeconds: true
		}) ?? "unknown-time";
	};
	const systemLines = [];
	const queued = drainSystemEventEntries(params.sessionKey);
	const drainedContinuationCount = queued.filter((event) => event.text.startsWith("[continuation:")).length;
	emitContinuationQueueDrainSpan({
		drainedCount: queued.length,
		drainedContinuationCount,
		log: (message) => defaultRuntime.log(message)
	});
	systemLines.push(...queued.flatMap((event) => {
		const compacted = compactSystemEvent(event.text);
		if (!compacted) return [];
		const prefix = event.trusted === false ? "System (untrusted)" : "System";
		const timestamp = `[${formatSystemEventTimestamp(event.ts, params.cfg)}]`;
		return compacted.split("\n").map((subline, index) => `${prefix}: ${index === 0 ? `${timestamp} ` : ""}${subline}`);
	}));
	if (params.isMainSession && params.isNewSession) {
		const summary = await buildChannelSummary(params.cfg);
		if (summary.length > 0) systemLines.unshift(...summary.flatMap((line) => line.split("\n").map((subline) => `System: ${subline}`)));
	}
	if (systemLines.length === 0) return;
	return systemLines.join("\n");
}
//#endregion
//#region src/auto-reply/reply/session-updates.ts
async function persistSessionEntryUpdate(params) {
	if (!params.sessionStore || !params.sessionKey) return;
	const sessionKey = params.sessionKey;
	{
		const memResolved = resolveSessionStoreEntry({
			store: params.sessionStore,
			sessionKey
		});
		params.sessionStore[memResolved.normalizedKey] = {
			...memResolved.existing,
			...params.nextEntry
		};
		for (const legacyKey of memResolved.legacyKeys) delete params.sessionStore[legacyKey];
	}
	if (!params.storePath) return;
	await updateSessionStore(params.storePath, (store) => {
		const resolved = resolveSessionStoreEntry({
			store,
			sessionKey: params.sessionKey
		});
		store[resolved.normalizedKey] = {
			...resolved.existing,
			...params.nextEntry
		};
		for (const legacyKey of resolved.legacyKeys) delete store[legacyKey];
	});
}
function emitCompactionSessionLifecycleHooks(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner) return;
	if (hookRunner.hasHooks("session_end")) {
		const transcript = resolveStableSessionEndTranscript({
			sessionId: params.previousEntry.sessionId,
			storePath: params.storePath,
			sessionFile: params.previousEntry.sessionFile,
			agentId: resolveAgentIdFromSessionKey(params.sessionKey)
		});
		const payload = buildSessionEndHookPayload({
			sessionId: params.previousEntry.sessionId,
			sessionKey: params.sessionKey,
			cfg: params.cfg,
			reason: "compaction",
			sessionFile: transcript.sessionFile,
			transcriptArchived: transcript.transcriptArchived,
			nextSessionId: params.nextEntry.sessionId
		});
		hookRunner.runSessionEnd(payload.event, payload.context).catch((err) => {
			logVerbose(`session_end hook failed: ${String(err)}`);
		});
	}
	if (hookRunner.hasHooks("session_start")) {
		const payload = buildSessionStartHookPayload({
			sessionId: params.nextEntry.sessionId,
			sessionKey: params.sessionKey,
			cfg: params.cfg,
			resumedFrom: params.previousEntry.sessionId
		});
		hookRunner.runSessionStart(payload.event, payload.context).catch((err) => {
			logVerbose(`session_start hook failed: ${String(err)}`);
		});
	}
}
async function ensureSkillSnapshot(params) {
	if (process.env.OPENCLAW_TEST_FAST === "1") return {
		sessionEntry: params.sessionEntry,
		skillsSnapshot: params.sessionEntry?.skillsSnapshot,
		systemSent: params.sessionEntry?.systemSent ?? false
	};
	const { sessionEntry, sessionStore, sessionKey, storePath, sessionId, isFirstTurnInSession, workspaceDir, cfg, skillFilter } = params;
	let nextEntry = sessionEntry;
	let systemSent = sessionEntry?.systemSent ?? false;
	const sessionAgentId = resolveSessionAgentId({
		sessionKey,
		config: cfg
	});
	const remoteEligibility = getRemoteSkillEligibility({ advertiseExecNode: canExecRequestNode({
		cfg,
		sessionEntry,
		sessionKey,
		agentId: sessionAgentId
	}) });
	const snapshotVersion = getSkillsSnapshotVersion(workspaceDir);
	const existingSnapshot = nextEntry?.skillsSnapshot;
	ensureSkillsWatcher({
		workspaceDir,
		config: cfg
	});
	const shouldRefreshSnapshot = shouldRefreshSnapshotForVersion(existingSnapshot?.version, snapshotVersion) || !matchesSkillFilter(existingSnapshot?.skillFilter, skillFilter);
	const buildSnapshot = () => buildWorkspaceSkillSnapshot(workspaceDir, {
		config: cfg,
		agentId: sessionAgentId,
		skillFilter,
		eligibility: { remote: remoteEligibility },
		snapshotVersion
	});
	if (isFirstTurnInSession && sessionStore && sessionKey) {
		const current = nextEntry ?? resolveSessionStoreEntry({
			store: sessionStore,
			sessionKey
		}).existing ?? {
			sessionId: sessionId ?? crypto.randomUUID(),
			updatedAt: Date.now()
		};
		const skillSnapshot = !current.skillsSnapshot || shouldRefreshSnapshot ? buildSnapshot() : current.skillsSnapshot;
		nextEntry = {
			...current,
			sessionId: sessionId ?? current.sessionId ?? crypto.randomUUID(),
			updatedAt: Date.now(),
			systemSent: true,
			skillsSnapshot: skillSnapshot
		};
		await persistSessionEntryUpdate({
			sessionStore,
			sessionKey,
			storePath,
			nextEntry
		});
		systemSent = true;
	}
	const skillsSnapshot = Boolean(nextEntry?.skillsSnapshot) && (nextEntry?.skillsSnapshot !== existingSnapshot || !shouldRefreshSnapshot) ? nextEntry?.skillsSnapshot : shouldRefreshSnapshot || !nextEntry?.skillsSnapshot ? buildSnapshot() : nextEntry.skillsSnapshot;
	if (skillsSnapshot && sessionStore && sessionKey && !isFirstTurnInSession && (!nextEntry?.skillsSnapshot || shouldRefreshSnapshot)) {
		const current = nextEntry ?? {
			sessionId: sessionId ?? crypto.randomUUID(),
			updatedAt: Date.now()
		};
		nextEntry = {
			...current,
			sessionId: sessionId ?? current.sessionId ?? crypto.randomUUID(),
			updatedAt: Date.now(),
			skillsSnapshot
		};
		await persistSessionEntryUpdate({
			sessionStore,
			sessionKey,
			storePath,
			nextEntry
		});
	}
	return {
		sessionEntry: nextEntry,
		skillsSnapshot,
		systemSent
	};
}
async function incrementCompactionCount(params) {
	const { sessionEntry, sessionStore, sessionKey, storePath, cfg, now = Date.now(), amount = 1, tokensAfter, newSessionId } = params;
	if (!sessionStore || !sessionKey) return;
	const memResolved = resolveSessionStoreEntry({
		store: sessionStore,
		sessionKey
	});
	const entry = memResolved.existing ?? sessionEntry;
	if (!entry) return;
	const incrementBy = Math.max(0, amount);
	const nextCount = (entry.compactionCount ?? 0) + incrementBy;
	const updates = {
		compactionCount: nextCount,
		lastContextPressureBand: void 0,
		updatedAt: now
	};
	if (newSessionId && newSessionId !== entry.sessionId) {
		updates.sessionId = newSessionId;
		updates.sessionFile = resolveCompactionSessionFile({
			entry,
			sessionKey,
			storePath,
			newSessionId
		});
	}
	if (tokensAfter != null && tokensAfter > 0) {
		updates.totalTokens = tokensAfter;
		updates.totalTokensFresh = true;
		updates.inputTokens = void 0;
		updates.outputTokens = void 0;
		updates.cacheRead = void 0;
		updates.cacheWrite = void 0;
	}
	sessionStore[memResolved.normalizedKey] = {
		...entry,
		...updates
	};
	for (const legacyKey of memResolved.legacyKeys) delete sessionStore[legacyKey];
	if (storePath) await updateSessionStoreEntry({
		storePath,
		sessionKey,
		update: async () => updates
	});
	if (newSessionId && newSessionId !== entry.sessionId && cfg) emitCompactionSessionLifecycleHooks({
		cfg,
		sessionKey,
		storePath,
		previousEntry: entry,
		nextEntry: sessionStore[memResolved.normalizedKey]
	});
	return nextCount;
}
function resolveCompactionSessionFile(params) {
	const pathOpts = resolveSessionFilePathOptions({
		agentId: resolveAgentIdFromSessionKey(params.sessionKey),
		storePath: params.storePath
	});
	const rewrittenSessionFile = rewriteSessionFileForNewSessionId({
		sessionFile: params.entry.sessionFile,
		previousSessionId: params.entry.sessionId,
		nextSessionId: params.newSessionId
	});
	const normalizedRewrittenSessionFile = rewrittenSessionFile && path.isAbsolute(rewrittenSessionFile) ? canonicalizeAbsoluteSessionFilePath(rewrittenSessionFile) : rewrittenSessionFile;
	return resolveSessionFilePath(params.newSessionId, normalizedRewrittenSessionFile ? { sessionFile: normalizedRewrittenSessionFile } : void 0, pathOpts);
}
function canonicalizeAbsoluteSessionFilePath(filePath) {
	const resolved = path.resolve(filePath);
	const missingSegments = [];
	let cursor = resolved;
	while (true) try {
		return path.join(fs.realpathSync(cursor), ...missingSegments.toReversed());
	} catch {
		const parent = path.dirname(cursor);
		if (parent === cursor) return resolved;
		missingSegments.push(path.basename(cursor));
		cursor = parent;
	}
}
function rewriteSessionFileForNewSessionId(params) {
	const trimmed = normalizeOptionalString(params.sessionFile);
	if (!trimmed) return;
	const base = path.basename(trimmed);
	if (!base.endsWith(".jsonl")) return;
	const withoutExt = base.slice(0, -6);
	if (withoutExt === params.previousSessionId) return path.join(path.dirname(trimmed), `${params.nextSessionId}.jsonl`);
	if (withoutExt.startsWith(`${params.previousSessionId}-topic-`)) return path.join(path.dirname(trimmed), `${params.nextSessionId}${base.slice(params.previousSessionId.length)}`);
	const forkMatch = withoutExt.match(/^(\d{4}-\d{2}-\d{2}T[\w-]+(?:Z|[+-]\d{2}(?:-\d{2})?)?)_(.+)$/);
	if (forkMatch?.[2] === params.previousSessionId) return path.join(path.dirname(trimmed), `${forkMatch[1]}_${params.nextSessionId}.jsonl`);
}
//#endregion
export { incrementCompactionCount as n, drainFormattedSystemEvents as r, ensureSkillSnapshot as t };
