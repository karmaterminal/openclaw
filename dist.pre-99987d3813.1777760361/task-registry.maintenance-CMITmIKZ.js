import { a as normalizeLowercaseStringOrEmpty, c as normalizeOptionalString } from "./string-coerce-Bje8XVt9.js";
import { t as createSubsystemLogger } from "./subsystem-W9_E260X.js";
import { o as parseAgentSessionKey } from "./session-key-utils-B26T5hOk.js";
import { i as sweepExpiredPluginStateEntries, r as isPluginStateDatabaseOpen } from "./plugin-state-store-Bt_3U6mT.js";
import { c as getAgentRunContext } from "./agent-events-DE3So3Se.js";
import { u as resolveStorePath } from "./paths-BCOWYnec.js";
import { t as loadSessionStore } from "./store-load-CDajuL7y.js";
import "./sessions-DTfZDTku.js";
import { r as getSessionBindingService } from "./session-binding-service-CyE0msFO.js";
import { C as setTaskCleanupAfterById, S as resolveTaskForLookupToken, g as markTaskLostById, i as ensureTaskRegistryReady, r as deleteTaskRecordById, s as getTaskById, u as listTaskRecords, v as markTaskTerminalById, y as maybeDeliverTaskTerminalUpdate } from "./task-registry-DuS80T1g.js";
import { n as summarizeTaskRecords } from "./task-registry.summary-BZmh87Mw.js";
import "./runtime-internal-9Z7tvLc1.js";
import { l as tryRecoverTaskBeforeMarkLost } from "./detached-task-runtime-i2h5BcKG.js";
import { n as loadCronStoreSync, r as resolveCronStorePath } from "./store-BZ2CNV4g.js";
import { n as getAcpSessionManager } from "./manager-BxBU1JKt.js";
import { n as readAcpSessionEntry, t as listAcpSessionEntries } from "./session-meta-o1PpytVN.js";
import { t as deriveSessionChatType } from "./session-chat-type-BrwGrf2m.js";
import { i as isSubagentRecoveryWedgedEntry, r as formatSubagentRecoveryWedgedReason } from "./subagent-recovery-state-ofbsk8ta.js";
import { n as listTaskAuditFindings, r as summarizeTaskAuditFindings, t as configureTaskAuditTaskProvider } from "./task-registry.audit-DYNmo4e0.js";
import { r as isCronJobActive } from "./active-jobs-bDLThwlf.js";
import { a as resolveCronRunLogPath, i as readCronRunLogEntriesSync } from "./run-log-DMk1lvuQ.js";
//#region src/tasks/task-registry.maintenance.ts
const log = createSubsystemLogger("tasks/task-registry-maintenance");
const TASK_RECONCILE_GRACE_MS = 5 * 6e4;
const TASK_RETENTION_MS = 10080 * 6e4;
const TASK_SWEEP_INTERVAL_MS = 6e4;
/**
* Number of tasks to process before yielding to the event loop.
* Keeps the main thread responsive during large sweeps.
*/
const SWEEP_YIELD_BATCH_SIZE = 25;
let sweeper = null;
let deferredSweep = null;
let sweepInProgress = false;
let configuredCronStorePath;
let configuredCronRuntimeAuthoritative = false;
const defaultTaskRegistryMaintenanceRuntime = {
	listAcpSessionEntries,
	readAcpSessionEntry,
	closeAcpSession: async ({ cfg, sessionKey, reason }) => {
		await getAcpSessionManager().closeSession({
			cfg,
			sessionKey,
			reason,
			discardPersistentState: true,
			clearMeta: true,
			allowBackendUnavailable: true,
			requireAcpSession: false
		});
	},
	listSessionBindingsBySession: (sessionKey) => getSessionBindingService().listBySession(sessionKey),
	unbindSessionBindings: (input) => getSessionBindingService().unbind(input),
	loadSessionStore,
	resolveStorePath,
	isCronJobActive,
	getAgentRunContext,
	parseAgentSessionKey,
	deleteTaskRecordById,
	ensureTaskRegistryReady,
	getTaskById,
	listTaskRecords,
	markTaskLostById,
	markTaskTerminalById,
	maybeDeliverTaskTerminalUpdate,
	resolveTaskForLookupToken,
	setTaskCleanupAfterById,
	isCronRuntimeAuthoritative: () => configuredCronRuntimeAuthoritative,
	resolveCronStorePath: () => configuredCronStorePath ?? resolveCronStorePath(),
	loadCronStoreSync,
	resolveCronRunLogPath,
	readCronRunLogEntriesSync
};
let taskRegistryMaintenanceRuntime = defaultTaskRegistryMaintenanceRuntime;
function createCronRecoveryContext() {
	return {
		storePath: taskRegistryMaintenanceRuntime.resolveCronStorePath(),
		runLogsByJobId: /* @__PURE__ */ new Map()
	};
}
function findSessionEntryByKey(store, sessionKey) {
	const direct = store[sessionKey];
	if (direct) return direct;
	const normalized = normalizeLowercaseStringOrEmpty(sessionKey);
	for (const [key, entry] of Object.entries(store)) if (normalizeLowercaseStringOrEmpty(key) === normalized) return entry;
}
function findTaskSessionEntry(task) {
	const childSessionKey = task.childSessionKey?.trim();
	if (!childSessionKey) return;
	const agentId = taskRegistryMaintenanceRuntime.parseAgentSessionKey(childSessionKey)?.agentId;
	const storePath = taskRegistryMaintenanceRuntime.resolveStorePath(void 0, { agentId });
	const entry = findSessionEntryByKey(taskRegistryMaintenanceRuntime.loadSessionStore(storePath), childSessionKey);
	return entry && typeof entry === "object" ? entry : void 0;
}
function isActiveTask(task) {
	return task.status === "queued" || task.status === "running";
}
function isTerminalTask(task) {
	return !isActiveTask(task);
}
function hasLostGraceExpired(task, now) {
	return now - (task.lastEventAt ?? task.startedAt ?? task.createdAt) >= TASK_RECONCILE_GRACE_MS;
}
function parseCronExecutionId(task) {
	const runId = task.runId?.trim();
	if (!runId?.startsWith("cron:")) return;
	const separator = runId.lastIndexOf(":");
	if (separator <= 5) return;
	const startedAt = Number(runId.slice(separator + 1));
	if (!Number.isFinite(startedAt)) return;
	const jobId = runId.slice(5, separator).trim();
	if (!jobId || task.sourceId?.trim() && task.sourceId.trim() !== jobId) return;
	return {
		jobId,
		startedAt
	};
}
function isTimeoutCronError(error) {
	return error === "cron: job execution timed out";
}
function mapCronTerminalStatus(status, error) {
	if (status === "ok" || status === "skipped") return "succeeded";
	return isTimeoutCronError(error) ? "timed_out" : "failed";
}
function getCronRunLogEntries(context, jobId) {
	const cached = context.runLogsByJobId.get(jobId);
	if (cached) return cached;
	let entries = [];
	try {
		const logPath = taskRegistryMaintenanceRuntime.resolveCronRunLogPath({
			storePath: context.storePath,
			jobId
		});
		entries = taskRegistryMaintenanceRuntime.readCronRunLogEntriesSync(logPath, {
			jobId,
			limit: 5e3
		});
	} catch {
		entries = [];
	}
	context.runLogsByJobId.set(jobId, entries);
	return entries;
}
function getCronStore(context) {
	if (context.store !== void 0) return context.store;
	try {
		context.store = taskRegistryMaintenanceRuntime.loadCronStoreSync(context.storePath);
	} catch {
		context.store = null;
	}
	return context.store;
}
function resolveCronRunLogRecovery(execution, context) {
	const entry = getCronRunLogEntries(context, execution.jobId).findLast((candidate) => candidate.jobId === execution.jobId && candidate.action === "finished" && candidate.runAtMs === execution.startedAt && (candidate.status === "ok" || candidate.status === "skipped" || candidate.status === "error"));
	if (!entry) return;
	const durationMs = typeof entry.durationMs === "number" && Number.isFinite(entry.durationMs) ? Math.max(0, entry.durationMs) : void 0;
	const endedAt = durationMs === void 0 ? entry.ts : execution.startedAt + durationMs;
	return {
		status: mapCronTerminalStatus(entry.status, entry.error),
		endedAt,
		lastEventAt: endedAt,
		...entry.error !== void 0 ? { error: entry.error } : {},
		...entry.summary !== void 0 ? { terminalSummary: entry.summary } : {}
	};
}
function resolveCronJobStateRecovery(execution, context) {
	const job = getCronStore(context)?.jobs.find((entry) => entry.id === execution.jobId);
	if (!job || job.state.lastRunAtMs !== execution.startedAt) return;
	const status = job.state.lastRunStatus ?? job.state.lastStatus;
	if (status !== "ok" && status !== "skipped" && status !== "error") return;
	const durationMs = typeof job.state.lastDurationMs === "number" && Number.isFinite(job.state.lastDurationMs) ? Math.max(0, job.state.lastDurationMs) : 0;
	const endedAt = execution.startedAt + durationMs;
	return {
		status: mapCronTerminalStatus(status, job.state.lastError),
		endedAt,
		lastEventAt: endedAt,
		...job.state.lastError !== void 0 ? { error: job.state.lastError } : {}
	};
}
function resolveDurableCronTaskRecovery(task, context) {
	if (task.runtime !== "cron" || !isActiveTask(task)) return;
	const execution = parseCronExecutionId(task);
	if (!execution) return;
	return resolveCronRunLogRecovery(execution, context) ?? resolveCronJobStateRecovery(execution, context);
}
function hasActiveCliRun(task) {
	const candidateRunIds = [task.sourceId, task.runId];
	for (const candidate of candidateRunIds) {
		const runId = candidate?.trim();
		if (runId && taskRegistryMaintenanceRuntime.getAgentRunContext(runId)) return true;
	}
	return false;
}
function hasBackingSession(task) {
	if (task.runtime === "cron") {
		if (!taskRegistryMaintenanceRuntime.isCronRuntimeAuthoritative()) return true;
		const jobId = task.sourceId?.trim();
		return jobId ? taskRegistryMaintenanceRuntime.isCronJobActive(jobId) : false;
	}
	if (task.runtime === "cli" && hasActiveCliRun(task)) return true;
	const childSessionKey = task.childSessionKey?.trim();
	if (!childSessionKey) return true;
	if (task.runtime === "acp") {
		const acpEntry = taskRegistryMaintenanceRuntime.readAcpSessionEntry({ sessionKey: childSessionKey });
		if (!acpEntry || acpEntry.storeReadFailed) return true;
		return Boolean(acpEntry.entry);
	}
	if (task.runtime === "subagent" || task.runtime === "cli") {
		if (task.runtime === "cli") {
			const chatType = deriveSessionChatType(childSessionKey);
			if (chatType === "channel" || chatType === "group" || chatType === "direct") return false;
		}
		const entry = findTaskSessionEntry(task);
		if (task.runtime === "subagent" && isSubagentRecoveryWedgedEntry(entry)) return false;
		return Boolean(entry);
	}
	return true;
}
function resolveTaskLostError(task) {
	if (task.runtime === "subagent") {
		const entry = findTaskSessionEntry(task);
		if (entry && isSubagentRecoveryWedgedEntry(entry)) return formatSubagentRecoveryWedgedReason(entry);
	}
	return "backing session missing";
}
function shouldMarkLost(task, now) {
	if (!isActiveTask(task)) return false;
	if (!hasLostGraceExpired(task, now)) return false;
	return !hasBackingSession(task);
}
function shouldPruneTerminalTask(task, now) {
	if (!isTerminalTask(task)) return false;
	if (typeof task.cleanupAfter === "number") return now >= task.cleanupAfter;
	return now - (task.endedAt ?? task.lastEventAt ?? task.createdAt) >= TASK_RETENTION_MS;
}
function shouldStampCleanupAfter(task) {
	return isTerminalTask(task) && typeof task.cleanupAfter !== "number";
}
function resolveCleanupAfter(task) {
	return (task.endedAt ?? task.lastEventAt ?? task.createdAt) + TASK_RETENTION_MS;
}
function getNormalizedTaskChildSessionKey(task) {
	return normalizeOptionalString(task.childSessionKey);
}
function isSameTaskChildSession(a, b) {
	const left = getNormalizedTaskChildSessionKey(a);
	return Boolean(left && left === getNormalizedTaskChildSessionKey(b));
}
function hasActiveTaskForChildSession(task, tasks) {
	return tasks.some((candidate) => candidate.taskId !== task.taskId && isActiveTask(candidate) && isSameTaskChildSession(task, candidate));
}
function hasActiveTaskForChildSessionKey(sessionKey, tasks) {
	const normalized = normalizeOptionalString(sessionKey);
	if (!normalized) return false;
	return tasks.some((candidate) => isActiveTask(candidate) && getNormalizedTaskChildSessionKey(candidate) === normalized);
}
function getAcpSessionParentKeys(acpEntry) {
	return [normalizeOptionalString(acpEntry.entry?.spawnedBy), normalizeOptionalString(acpEntry.entry?.parentSessionKey)].filter((value) => Boolean(value));
}
function isParentOwnedAcpSessionTask(task, acpEntry) {
	const entry = acpEntry?.entry;
	if (!entry) return false;
	const ownerKey = normalizeOptionalString(task.ownerKey);
	const requesterKey = normalizeOptionalString(task.requesterSessionKey);
	return getAcpSessionParentKeys({ entry }).some((parentKey) => parentKey === ownerKey || parentKey === requesterKey);
}
function isParentOwnedAcpSessionEntry(acpEntry) {
	return getAcpSessionParentKeys(acpEntry).length > 0;
}
function hasActiveSessionBinding(sessionKey) {
	const listBindings = taskRegistryMaintenanceRuntime.listSessionBindingsBySession;
	if (!listBindings) return true;
	try {
		return listBindings(sessionKey).some((binding) => binding.status !== "ended");
	} catch {
		return true;
	}
}
function shouldCloseTerminalAcpSession(task, tasks) {
	if (task.runtime !== "acp" || isActiveTask(task)) return false;
	const sessionKey = getNormalizedTaskChildSessionKey(task);
	if (!sessionKey || hasActiveTaskForChildSession(task, tasks)) return false;
	const acpEntry = taskRegistryMaintenanceRuntime.readAcpSessionEntry({ sessionKey });
	if (!acpEntry || acpEntry.storeReadFailed || !acpEntry.acp) return false;
	if (!isParentOwnedAcpSessionTask(task, acpEntry)) return false;
	if (acpEntry.acp.mode === "oneshot") return true;
	return !hasActiveSessionBinding(sessionKey);
}
function shouldCloseOrphanedParentOwnedAcpSession(acpEntry, tasks) {
	if (!acpEntry.entry || !acpEntry.acp || !isParentOwnedAcpSessionEntry(acpEntry)) return false;
	const sessionKey = normalizeOptionalString(acpEntry.sessionKey);
	if (!sessionKey || hasActiveTaskForChildSessionKey(sessionKey, tasks)) return false;
	if (acpEntry.acp.mode === "oneshot") return true;
	return !hasActiveSessionBinding(sessionKey);
}
async function cleanupTerminalAcpSession(task, tasks) {
	if (!shouldCloseTerminalAcpSession(task, tasks)) return;
	const sessionKey = getNormalizedTaskChildSessionKey(task);
	if (!sessionKey) return;
	const acpEntry = taskRegistryMaintenanceRuntime.readAcpSessionEntry({ sessionKey });
	const closeAcpSession = taskRegistryMaintenanceRuntime.closeAcpSession;
	if (!acpEntry || !closeAcpSession) return;
	try {
		await closeAcpSession({
			cfg: acpEntry.cfg,
			sessionKey,
			reason: "terminal-task-cleanup"
		});
	} catch (error) {
		log.warn("Failed to close terminal ACP session during task maintenance", {
			sessionKey,
			taskId: task.taskId,
			error
		});
		return;
	}
	try {
		await taskRegistryMaintenanceRuntime.unbindSessionBindings?.({
			targetSessionKey: sessionKey,
			reason: "terminal-task-cleanup"
		});
	} catch (error) {
		log.warn("Failed to unbind terminal ACP session during task maintenance", {
			sessionKey,
			taskId: task.taskId,
			error
		});
	}
}
async function cleanupOrphanedParentOwnedAcpSessions(tasks) {
	let acpSessions;
	try {
		acpSessions = await taskRegistryMaintenanceRuntime.listAcpSessionEntries({});
	} catch (error) {
		log.warn("Failed to list ACP sessions during task maintenance", { error });
		return;
	}
	const seenSessionKeys = /* @__PURE__ */ new Set();
	for (const acpEntry of acpSessions) {
		const sessionKey = normalizeOptionalString(acpEntry.sessionKey);
		if (!sessionKey || seenSessionKeys.has(sessionKey)) continue;
		seenSessionKeys.add(sessionKey);
		if (!shouldCloseOrphanedParentOwnedAcpSession(acpEntry, tasks)) continue;
		const closeAcpSession = taskRegistryMaintenanceRuntime.closeAcpSession;
		if (!closeAcpSession) continue;
		try {
			await closeAcpSession({
				cfg: acpEntry.cfg,
				sessionKey,
				reason: "orphaned-parent-task-cleanup"
			});
		} catch (error) {
			log.warn("Failed to close orphaned parent-owned ACP session during task maintenance", {
				sessionKey,
				error
			});
			continue;
		}
		try {
			await taskRegistryMaintenanceRuntime.unbindSessionBindings?.({
				targetSessionKey: sessionKey,
				reason: "orphaned-parent-task-cleanup"
			});
		} catch (error) {
			log.warn("Failed to unbind orphaned parent-owned ACP session during task maintenance", {
				sessionKey,
				error
			});
		}
	}
}
function markTaskLost(task, now) {
	const cleanupAfter = task.cleanupAfter ?? projectTaskLost(task, now).cleanupAfter;
	const updated = taskRegistryMaintenanceRuntime.markTaskLostById({
		taskId: task.taskId,
		endedAt: task.endedAt ?? now,
		lastEventAt: now,
		error: task.error ?? resolveTaskLostError(task),
		cleanupAfter
	}) ?? task;
	taskRegistryMaintenanceRuntime.maybeDeliverTaskTerminalUpdate(updated.taskId);
	return updated;
}
function markTaskRecovered(task, recovery) {
	const updated = taskRegistryMaintenanceRuntime.markTaskTerminalById({
		taskId: task.taskId,
		status: recovery.status,
		endedAt: recovery.endedAt,
		lastEventAt: recovery.lastEventAt,
		...recovery.error !== void 0 ? { error: recovery.error } : {},
		...recovery.terminalSummary !== void 0 ? { terminalSummary: recovery.terminalSummary } : {}
	}) ?? projectTaskRecovered(task, recovery);
	taskRegistryMaintenanceRuntime.maybeDeliverTaskTerminalUpdate(updated.taskId);
	return updated;
}
function projectTaskRecovered(task, recovery) {
	const projected = {
		...task,
		status: recovery.status,
		endedAt: recovery.endedAt,
		lastEventAt: recovery.lastEventAt,
		...recovery.error !== void 0 ? { error: recovery.error } : {},
		...recovery.terminalSummary !== void 0 ? { terminalSummary: recovery.terminalSummary } : {}
	};
	return {
		...projected,
		...typeof projected.cleanupAfter === "number" ? {} : { cleanupAfter: resolveCleanupAfter(projected) }
	};
}
function projectTaskLost(task, now) {
	const projected = {
		...task,
		status: "lost",
		endedAt: task.endedAt ?? now,
		lastEventAt: now,
		error: task.error ?? resolveTaskLostError(task)
	};
	return {
		...projected,
		...typeof projected.cleanupAfter === "number" ? {} : { cleanupAfter: resolveCleanupAfter(projected) }
	};
}
function reconcileTaskRecordForOperatorInspection(task, context = createCronRecoveryContext()) {
	const cronRecovery = resolveDurableCronTaskRecovery(task, context);
	if (cronRecovery) return projectTaskRecovered(task, cronRecovery);
	const now = Date.now();
	if (!shouldMarkLost(task, now)) return task;
	return projectTaskLost(task, now);
}
function reconcileInspectableTasks() {
	taskRegistryMaintenanceRuntime.ensureTaskRegistryReady();
	const cronRecoveryContext = createCronRecoveryContext();
	return taskRegistryMaintenanceRuntime.listTaskRecords().map((task) => reconcileTaskRecordForOperatorInspection(task, cronRecoveryContext));
}
configureTaskAuditTaskProvider(reconcileInspectableTasks);
function getInspectableTaskRegistrySummary() {
	return summarizeTaskRecords(reconcileInspectableTasks());
}
function getInspectableTaskAuditSummary() {
	return summarizeTaskAuditFindings(listTaskAuditFindings({ tasks: reconcileInspectableTasks() }));
}
function reconcileTaskLookupToken(token) {
	taskRegistryMaintenanceRuntime.ensureTaskRegistryReady();
	const task = taskRegistryMaintenanceRuntime.resolveTaskForLookupToken(token);
	return task ? reconcileTaskRecordForOperatorInspection(task) : void 0;
}
function previewTaskRegistryMaintenance() {
	taskRegistryMaintenanceRuntime.ensureTaskRegistryReady();
	const now = Date.now();
	let reconciled = 0;
	let recovered = 0;
	let cleanupStamped = 0;
	let pruned = 0;
	const cronRecoveryContext = createCronRecoveryContext();
	for (const task of taskRegistryMaintenanceRuntime.listTaskRecords()) {
		if (resolveDurableCronTaskRecovery(task, cronRecoveryContext)) {
			recovered += 1;
			continue;
		}
		if (shouldMarkLost(task, now)) {
			reconciled += 1;
			continue;
		}
		if (shouldPruneTerminalTask(task, now)) {
			pruned += 1;
			continue;
		}
		if (shouldStampCleanupAfter(task)) cleanupStamped += 1;
	}
	return {
		reconciled,
		recovered,
		cleanupStamped,
		pruned
	};
}
/**
* Yield control back to the event loop so that pending I/O callbacks,
* timers, and incoming requests can be processed between batches of
* synchronous task-registry maintenance work.
*/
function yieldToEventLoop() {
	return new Promise((resolve) => setImmediate(resolve));
}
function startScheduledSweep() {
	if (sweepInProgress) return;
	sweepInProgress = true;
	const clearSweepInProgress = () => {
		sweepInProgress = false;
	};
	sweepTaskRegistry().then(clearSweepInProgress, clearSweepInProgress);
}
async function runTaskRegistryMaintenance() {
	taskRegistryMaintenanceRuntime.ensureTaskRegistryReady();
	const now = Date.now();
	let reconciled = 0;
	let recovered = 0;
	let cleanupStamped = 0;
	let pruned = 0;
	const tasks = taskRegistryMaintenanceRuntime.listTaskRecords();
	const cronRecoveryContext = createCronRecoveryContext();
	let processed = 0;
	for (const task of tasks) {
		const current = taskRegistryMaintenanceRuntime.getTaskById(task.taskId);
		if (!current) continue;
		const cronRecovery = resolveDurableCronTaskRecovery(current, cronRecoveryContext);
		if (cronRecovery) {
			if (markTaskRecovered(current, cronRecovery).status !== current.status) recovered += 1;
			processed += 1;
			if (processed % SWEEP_YIELD_BATCH_SIZE === 0) await yieldToEventLoop();
			continue;
		}
		if (shouldMarkLost(current, now)) {
			const recovery = await tryRecoverTaskBeforeMarkLost({
				taskId: current.taskId,
				runtime: current.runtime,
				task: current,
				now
			});
			const freshAfterHook = taskRegistryMaintenanceRuntime.getTaskById(current.taskId);
			if (!freshAfterHook || !shouldMarkLost(freshAfterHook, now)) {
				processed += 1;
				if (processed % SWEEP_YIELD_BATCH_SIZE === 0) await yieldToEventLoop();
				continue;
			}
			if (recovery.recovered) {
				recovered += 1;
				processed += 1;
				if (processed % SWEEP_YIELD_BATCH_SIZE === 0) await yieldToEventLoop();
				continue;
			}
			if (markTaskLost(freshAfterHook, now).status === "lost") reconciled += 1;
			processed += 1;
			if (processed % SWEEP_YIELD_BATCH_SIZE === 0) await yieldToEventLoop();
			continue;
		}
		await cleanupTerminalAcpSession(current, taskRegistryMaintenanceRuntime.listTaskRecords());
		if (shouldPruneTerminalTask(current, now) && taskRegistryMaintenanceRuntime.deleteTaskRecordById(current.taskId)) {
			pruned += 1;
			processed += 1;
			if (processed % SWEEP_YIELD_BATCH_SIZE === 0) await yieldToEventLoop();
			continue;
		}
		if (shouldStampCleanupAfter(current) && taskRegistryMaintenanceRuntime.setTaskCleanupAfterById({
			taskId: current.taskId,
			cleanupAfter: resolveCleanupAfter(current)
		})) cleanupStamped += 1;
		processed += 1;
		if (processed % SWEEP_YIELD_BATCH_SIZE === 0) await yieldToEventLoop();
	}
	await cleanupOrphanedParentOwnedAcpSessions(taskRegistryMaintenanceRuntime.listTaskRecords());
	if (isPluginStateDatabaseOpen()) try {
		sweepExpiredPluginStateEntries();
	} catch (error) {
		log.warn("Failed to sweep expired plugin state entries", { error });
	}
	return {
		reconciled,
		recovered,
		cleanupStamped,
		pruned
	};
}
async function sweepTaskRegistry() {
	return runTaskRegistryMaintenance();
}
function startTaskRegistryMaintenance() {
	taskRegistryMaintenanceRuntime.ensureTaskRegistryReady();
	deferredSweep = setTimeout(() => {
		deferredSweep = null;
		startScheduledSweep();
	}, 5e3);
	deferredSweep.unref?.();
	if (sweeper) return;
	sweeper = setInterval(startScheduledSweep, TASK_SWEEP_INTERVAL_MS);
	sweeper.unref?.();
}
function stopTaskRegistryMaintenance() {
	if (deferredSweep) {
		clearTimeout(deferredSweep);
		deferredSweep = null;
	}
	if (sweeper) {
		clearInterval(sweeper);
		sweeper = null;
	}
	sweepInProgress = false;
}
const stopTaskRegistryMaintenanceForTests = stopTaskRegistryMaintenance;
function setTaskRegistryMaintenanceRuntimeForTests(runtime) {
	taskRegistryMaintenanceRuntime = runtime;
}
function resetTaskRegistryMaintenanceRuntimeForTests() {
	taskRegistryMaintenanceRuntime = defaultTaskRegistryMaintenanceRuntime;
	configuredCronStorePath = void 0;
	configuredCronRuntimeAuthoritative = false;
}
function configureTaskRegistryMaintenance(options) {
	configuredCronStorePath = options.cronStorePath?.trim() || void 0;
	if (options.cronRuntimeAuthoritative !== void 0) configuredCronRuntimeAuthoritative = options.cronRuntimeAuthoritative;
}
function getReconciledTaskById(taskId) {
	const task = getTaskById(taskId);
	return task ? reconcileTaskRecordForOperatorInspection(task) : void 0;
}
//#endregion
export { previewTaskRegistryMaintenance as a, reconcileTaskRecordForOperatorInspection as c, setTaskRegistryMaintenanceRuntimeForTests as d, startTaskRegistryMaintenance as f, sweepTaskRegistry as h, getReconciledTaskById as i, resetTaskRegistryMaintenanceRuntimeForTests as l, stopTaskRegistryMaintenanceForTests as m, getInspectableTaskAuditSummary as n, reconcileInspectableTasks as o, stopTaskRegistryMaintenance as p, getInspectableTaskRegistrySummary as r, reconcileTaskLookupToken as s, configureTaskRegistryMaintenance as t, runTaskRegistryMaintenance as u };
