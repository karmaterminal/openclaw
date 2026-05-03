import { i as isDiagnosticsEnabled, n as emitDiagnosticEvent, t as areDiagnosticsEnabledForProcess } from "./diagnostic-events-BOjU629z.js";
import { i as getRuntimeConfig } from "./io-DTtpq82f.js";
import "./config-DbmohW6s.js";
import { a as markDiagnosticActivity, n as getLastDiagnosticActivityAt, o as resetDiagnosticActivityForTest, t as diagnosticLogger } from "./diagnostic-runtime-CR_pjFfz.js";
import { a as resetDiagnosticSessionStateForTest, i as pruneDiagnosticSessionStates, n as getDiagnosticSessionState, r as getDiagnosticSessionStateCountForTest$1, t as diagnosticSessionStates } from "./diagnostic-session-state-BWJqL3sX.js";
import { i as resetDiagnosticStabilityRecorderForTest, o as startDiagnosticStabilityRecorder, s as stopDiagnosticStabilityRecorder } from "./diagnostic-stability-3pQdx1YD.js";
import { a as installDiagnosticStabilityFatalHook, d as uninstallDiagnosticStabilityFatalHook, l as resetDiagnosticStabilityBundleForTest } from "./diagnostic-stability-bundle-C9etsXDq.js";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
//#region src/logging/diagnostic-memory.ts
const MB = 1024 * 1024;
const DEFAULT_RSS_WARNING_BYTES = 1536 * MB;
const DEFAULT_RSS_CRITICAL_BYTES = 3072 * MB;
const DEFAULT_HEAP_WARNING_BYTES = 1024 * MB;
const DEFAULT_HEAP_CRITICAL_BYTES = 2048 * MB;
const DEFAULT_RSS_GROWTH_WARNING_BYTES = 512 * MB;
const DEFAULT_RSS_GROWTH_CRITICAL_BYTES = 1024 * MB;
const DEFAULT_GROWTH_WINDOW_MS = 600 * 1e3;
const DEFAULT_PRESSURE_REPEAT_MS = 300 * 1e3;
const state = {
	lastSample: null,
	lastPressureAtByKey: /* @__PURE__ */ new Map()
};
function normalizeMemoryUsage(memory) {
	return {
		rssBytes: memory.rss,
		heapTotalBytes: memory.heapTotal,
		heapUsedBytes: memory.heapUsed,
		externalBytes: memory.external,
		arrayBuffersBytes: memory.arrayBuffers
	};
}
function resolveThresholds(thresholds) {
	return {
		rssWarningBytes: thresholds?.rssWarningBytes ?? DEFAULT_RSS_WARNING_BYTES,
		rssCriticalBytes: thresholds?.rssCriticalBytes ?? DEFAULT_RSS_CRITICAL_BYTES,
		heapUsedWarningBytes: thresholds?.heapUsedWarningBytes ?? DEFAULT_HEAP_WARNING_BYTES,
		heapUsedCriticalBytes: thresholds?.heapUsedCriticalBytes ?? DEFAULT_HEAP_CRITICAL_BYTES,
		rssGrowthWarningBytes: thresholds?.rssGrowthWarningBytes ?? DEFAULT_RSS_GROWTH_WARNING_BYTES,
		rssGrowthCriticalBytes: thresholds?.rssGrowthCriticalBytes ?? DEFAULT_RSS_GROWTH_CRITICAL_BYTES,
		growthWindowMs: thresholds?.growthWindowMs ?? DEFAULT_GROWTH_WINDOW_MS,
		pressureRepeatMs: thresholds?.pressureRepeatMs ?? DEFAULT_PRESSURE_REPEAT_MS
	};
}
function pickThresholdPressure(params) {
	const { memory, thresholds } = params;
	if (memory.rssBytes >= thresholds.rssCriticalBytes) return {
		level: "critical",
		reason: "rss_threshold",
		memory,
		thresholdBytes: thresholds.rssCriticalBytes
	};
	if (memory.heapUsedBytes >= thresholds.heapUsedCriticalBytes) return {
		level: "critical",
		reason: "heap_threshold",
		memory,
		thresholdBytes: thresholds.heapUsedCriticalBytes
	};
	if (memory.rssBytes >= thresholds.rssWarningBytes) return {
		level: "warning",
		reason: "rss_threshold",
		memory,
		thresholdBytes: thresholds.rssWarningBytes
	};
	if (memory.heapUsedBytes >= thresholds.heapUsedWarningBytes) return {
		level: "warning",
		reason: "heap_threshold",
		memory,
		thresholdBytes: thresholds.heapUsedWarningBytes
	};
	return null;
}
function pickGrowthPressure(params) {
	const { previous, current, thresholds } = params;
	if (!previous) return null;
	const windowMs = current.ts - previous.ts;
	if (windowMs <= 0 || windowMs > thresholds.growthWindowMs) return null;
	const rssGrowthBytes = current.memory.rssBytes - previous.memory.rssBytes;
	if (rssGrowthBytes >= thresholds.rssGrowthCriticalBytes) return {
		level: "critical",
		reason: "rss_growth",
		memory: current.memory,
		thresholdBytes: thresholds.rssGrowthCriticalBytes,
		rssGrowthBytes,
		windowMs
	};
	if (rssGrowthBytes >= thresholds.rssGrowthWarningBytes) return {
		level: "warning",
		reason: "rss_growth",
		memory: current.memory,
		thresholdBytes: thresholds.rssGrowthWarningBytes,
		rssGrowthBytes,
		windowMs
	};
	return null;
}
function shouldEmitPressure(pressure, now, repeatMs) {
	const key = `${pressure.level}:${pressure.reason}`;
	const lastAt = state.lastPressureAtByKey.get(key);
	if (lastAt !== void 0 && now - lastAt < repeatMs) return false;
	state.lastPressureAtByKey.set(key, now);
	return true;
}
function emitDiagnosticMemorySample(options) {
	const now = options?.now ?? Date.now();
	const memory = normalizeMemoryUsage(options?.memoryUsage ?? process.memoryUsage());
	const current = {
		ts: now,
		memory
	};
	const thresholds = resolveThresholds(options?.thresholds);
	if (options?.emitSample !== false) emitDiagnosticEvent({
		type: "diagnostic.memory.sample",
		memory,
		uptimeMs: options?.uptimeMs ?? Math.round(process.uptime() * 1e3)
	});
	const pressure = pickThresholdPressure({
		memory,
		thresholds
	}) ?? pickGrowthPressure({
		previous: state.lastSample,
		current,
		thresholds
	});
	state.lastSample = current;
	if (pressure && shouldEmitPressure(pressure, now, thresholds.pressureRepeatMs)) emitDiagnosticEvent({
		type: "diagnostic.memory.pressure",
		...pressure
	});
	return memory;
}
function resetDiagnosticMemoryForTest() {
	state.lastSample = null;
	state.lastPressureAtByKey.clear();
}
//#endregion
//#region src/logging/diagnostic.ts
const webhookStats = {
	received: 0,
	processed: 0,
	errors: 0,
	lastReceived: 0
};
const DEFAULT_STUCK_SESSION_WARN_MS = 12e4;
const MIN_STUCK_SESSION_WARN_MS = 1e3;
const MAX_STUCK_SESSION_WARN_MS = 1440 * 60 * 1e3;
const RECENT_DIAGNOSTIC_ACTIVITY_MS = 12e4;
const DEFAULT_LIVENESS_EVENT_LOOP_DELAY_WARN_MS = 1e3;
const DEFAULT_LIVENESS_EVENT_LOOP_UTILIZATION_WARN = .95;
const DEFAULT_LIVENESS_CPU_CORE_RATIO_WARN = .9;
const DEFAULT_LIVENESS_WARN_COOLDOWN_MS = 12e4;
let commandPollBackoffRuntimePromise = null;
let stuckSessionRecoveryRuntimePromise = null;
let diagnosticLivenessMonitor = null;
let lastDiagnosticLivenessWallAt = 0;
let lastDiagnosticLivenessCpuUsage = null;
let lastDiagnosticLivenessEventLoopUtilization = null;
let lastDiagnosticLivenessWarnAt = 0;
function loadCommandPollBackoffRuntime() {
	commandPollBackoffRuntimePromise ??= import("./command-poll-backoff.runtime-DuWSS_hK.js");
	return commandPollBackoffRuntimePromise;
}
function recoverStuckSession(params) {
	stuckSessionRecoveryRuntimePromise ??= import("./diagnostic-stuck-session-recovery.runtime-CBDpiDfe.js");
	stuckSessionRecoveryRuntimePromise.then(({ recoverStuckDiagnosticSession }) => recoverStuckDiagnosticSession(params)).catch((err) => {
		diagnosticLogger.warn(`stuck session recovery unavailable: ${String(err)}`);
	});
}
function getDiagnosticWorkSnapshot() {
	let activeCount = 0;
	let waitingCount = 0;
	let queuedCount = 0;
	for (const state of diagnosticSessionStates.values()) {
		if (state.state === "processing") activeCount += 1;
		else if (state.state === "waiting") waitingCount += 1;
		queuedCount += state.queueDepth;
	}
	return {
		activeCount,
		waitingCount,
		queuedCount
	};
}
function hasOpenDiagnosticWork(snapshot) {
	return snapshot.activeCount > 0 || snapshot.waitingCount > 0 || snapshot.queuedCount > 0;
}
function hasRecentDiagnosticActivity(now) {
	const lastActivityAt = getLastDiagnosticActivityAt();
	return lastActivityAt > 0 && now - lastActivityAt <= RECENT_DIAGNOSTIC_ACTIVITY_MS;
}
function resolveStuckSessionReason(state) {
	if (state.queueDepth > 0) return "processing_with_queued_work";
	if (state.state === "processing") return "processing_without_queue";
	return "stale_session_state";
}
function roundDiagnosticMetric(value, digits = 3) {
	if (!Number.isFinite(value)) return 0;
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}
function nanosecondsToMilliseconds(value) {
	return roundDiagnosticMetric(value / 1e6, 1);
}
function formatOptionalDiagnosticMetric(value) {
	return value === void 0 ? "unknown" : String(value);
}
function startDiagnosticLivenessSampler() {
	lastDiagnosticLivenessWallAt = Date.now();
	lastDiagnosticLivenessCpuUsage = process.cpuUsage();
	lastDiagnosticLivenessEventLoopUtilization = performance.eventLoopUtilization();
	lastDiagnosticLivenessWarnAt = 0;
	if (diagnosticLivenessMonitor) {
		diagnosticLivenessMonitor.reset();
		return;
	}
	try {
		diagnosticLivenessMonitor = monitorEventLoopDelay({ resolution: 20 });
		diagnosticLivenessMonitor.enable();
		diagnosticLivenessMonitor.reset();
	} catch (err) {
		diagnosticLivenessMonitor = null;
		diagnosticLogger.debug(`diagnostic liveness monitor unavailable: ${String(err)}`);
	}
}
function stopDiagnosticLivenessSampler() {
	diagnosticLivenessMonitor?.disable();
	diagnosticLivenessMonitor = null;
	lastDiagnosticLivenessWallAt = 0;
	lastDiagnosticLivenessCpuUsage = null;
	lastDiagnosticLivenessEventLoopUtilization = null;
	lastDiagnosticLivenessWarnAt = 0;
}
function sampleDiagnosticLiveness(now) {
	if (!diagnosticLivenessMonitor || !lastDiagnosticLivenessCpuUsage || !lastDiagnosticLivenessEventLoopUtilization || lastDiagnosticLivenessWallAt <= 0) {
		startDiagnosticLivenessSampler();
		return null;
	}
	const intervalMs = Math.max(1, now - lastDiagnosticLivenessWallAt);
	const cpuUsage = process.cpuUsage(lastDiagnosticLivenessCpuUsage);
	const currentEventLoopUtilization = performance.eventLoopUtilization();
	const eventLoopUtilization = performance.eventLoopUtilization(currentEventLoopUtilization, lastDiagnosticLivenessEventLoopUtilization).utilization;
	const eventLoopDelayP99Ms = nanosecondsToMilliseconds(diagnosticLivenessMonitor.percentile(99));
	const eventLoopDelayMaxMs = nanosecondsToMilliseconds(diagnosticLivenessMonitor.max);
	diagnosticLivenessMonitor.reset();
	lastDiagnosticLivenessWallAt = now;
	lastDiagnosticLivenessCpuUsage = process.cpuUsage();
	lastDiagnosticLivenessEventLoopUtilization = currentEventLoopUtilization;
	const cpuUserMs = roundDiagnosticMetric(cpuUsage.user / 1e3, 1);
	const cpuSystemMs = roundDiagnosticMetric(cpuUsage.system / 1e3, 1);
	const cpuTotalMs = roundDiagnosticMetric(cpuUserMs + cpuSystemMs, 1);
	const cpuCoreRatio = roundDiagnosticMetric(cpuTotalMs / intervalMs, 3);
	const eventLoopUtilizationRatio = roundDiagnosticMetric(eventLoopUtilization, 3);
	const reasons = [];
	if (eventLoopDelayP99Ms >= DEFAULT_LIVENESS_EVENT_LOOP_DELAY_WARN_MS || eventLoopDelayMaxMs >= DEFAULT_LIVENESS_EVENT_LOOP_DELAY_WARN_MS) reasons.push("event_loop_delay");
	if (eventLoopUtilizationRatio >= DEFAULT_LIVENESS_EVENT_LOOP_UTILIZATION_WARN) reasons.push("event_loop_utilization");
	if (cpuCoreRatio >= DEFAULT_LIVENESS_CPU_CORE_RATIO_WARN) reasons.push("cpu");
	if (reasons.length === 0) return null;
	return {
		reasons,
		intervalMs,
		eventLoopDelayP99Ms,
		eventLoopDelayMaxMs,
		eventLoopUtilization: eventLoopUtilizationRatio,
		cpuUserMs,
		cpuSystemMs,
		cpuTotalMs,
		cpuCoreRatio
	};
}
function shouldEmitDiagnosticLivenessWarning(now) {
	if (lastDiagnosticLivenessWarnAt > 0 && now - lastDiagnosticLivenessWarnAt < DEFAULT_LIVENESS_WARN_COOLDOWN_MS) return false;
	lastDiagnosticLivenessWarnAt = now;
	return true;
}
function emitDiagnosticLivenessWarning(sample, work) {
	diagnosticLogger.warn(`liveness warning: reasons=${sample.reasons.join(",")} interval=${Math.round(sample.intervalMs / 1e3)}s eventLoopDelayP99Ms=${formatOptionalDiagnosticMetric(sample.eventLoopDelayP99Ms)} eventLoopDelayMaxMs=${formatOptionalDiagnosticMetric(sample.eventLoopDelayMaxMs)} eventLoopUtilization=${formatOptionalDiagnosticMetric(sample.eventLoopUtilization)} cpuCoreRatio=${formatOptionalDiagnosticMetric(sample.cpuCoreRatio)} active=${work.activeCount} waiting=${work.waitingCount} queued=${work.queuedCount}`);
	emitDiagnosticEvent({
		type: "diagnostic.liveness.warning",
		reasons: sample.reasons,
		intervalMs: sample.intervalMs,
		eventLoopDelayP99Ms: sample.eventLoopDelayP99Ms,
		eventLoopDelayMaxMs: sample.eventLoopDelayMaxMs,
		eventLoopUtilization: sample.eventLoopUtilization,
		cpuUserMs: sample.cpuUserMs,
		cpuSystemMs: sample.cpuSystemMs,
		cpuTotalMs: sample.cpuTotalMs,
		cpuCoreRatio: sample.cpuCoreRatio,
		active: work.activeCount,
		waiting: work.waitingCount,
		queued: work.queuedCount
	});
	markDiagnosticActivity();
}
function resolveStuckSessionWarnMs(config) {
	const raw = config?.diagnostics?.stuckSessionWarnMs;
	if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_STUCK_SESSION_WARN_MS;
	const rounded = Math.floor(raw);
	if (rounded < MIN_STUCK_SESSION_WARN_MS || rounded > MAX_STUCK_SESSION_WARN_MS) return DEFAULT_STUCK_SESSION_WARN_MS;
	return rounded;
}
function logWebhookReceived(params) {
	if (!areDiagnosticsEnabledForProcess()) return;
	webhookStats.received += 1;
	webhookStats.lastReceived = Date.now();
	if (diagnosticLogger.isEnabled("debug")) diagnosticLogger.debug(`webhook received: channel=${params.channel} type=${params.updateType ?? "unknown"} chatId=${params.chatId ?? "unknown"} total=${webhookStats.received}`);
	emitDiagnosticEvent({
		type: "webhook.received",
		channel: params.channel,
		updateType: params.updateType,
		chatId: params.chatId
	});
	markDiagnosticActivity();
}
function logWebhookProcessed(params) {
	if (!areDiagnosticsEnabledForProcess()) return;
	webhookStats.processed += 1;
	if (diagnosticLogger.isEnabled("debug")) diagnosticLogger.debug(`webhook processed: channel=${params.channel} type=${params.updateType ?? "unknown"} chatId=${params.chatId ?? "unknown"} duration=${params.durationMs ?? 0}ms processed=${webhookStats.processed}`);
	emitDiagnosticEvent({
		type: "webhook.processed",
		channel: params.channel,
		updateType: params.updateType,
		chatId: params.chatId,
		durationMs: params.durationMs
	});
	markDiagnosticActivity();
}
function logWebhookError(params) {
	if (!areDiagnosticsEnabledForProcess()) return;
	webhookStats.errors += 1;
	diagnosticLogger.error(`webhook error: channel=${params.channel} type=${params.updateType ?? "unknown"} chatId=${params.chatId ?? "unknown"} error="${params.error}" errors=${webhookStats.errors}`);
	emitDiagnosticEvent({
		type: "webhook.error",
		channel: params.channel,
		updateType: params.updateType,
		chatId: params.chatId,
		error: params.error
	});
	markDiagnosticActivity();
}
function logMessageQueued(params) {
	if (!areDiagnosticsEnabledForProcess()) return;
	const state = getDiagnosticSessionState(params);
	state.queueDepth += 1;
	state.lastActivity = Date.now();
	if (diagnosticLogger.isEnabled("debug")) diagnosticLogger.debug(`message queued: sessionId=${state.sessionId ?? "unknown"} sessionKey=${state.sessionKey ?? "unknown"} source=${params.source} queueDepth=${state.queueDepth} sessionState=${state.state}`);
	emitDiagnosticEvent({
		type: "message.queued",
		sessionId: state.sessionId,
		sessionKey: state.sessionKey,
		channel: params.channel,
		source: params.source,
		queueDepth: state.queueDepth
	});
	markDiagnosticActivity();
}
function logMessageProcessed(params) {
	if (!areDiagnosticsEnabledForProcess()) return;
	if (params.outcome === "error" ? diagnosticLogger.isEnabled("error") : diagnosticLogger.isEnabled("debug")) {
		const payload = `message processed: channel=${params.channel} chatId=${params.chatId ?? "unknown"} messageId=${params.messageId ?? "unknown"} sessionId=${params.sessionId ?? "unknown"} sessionKey=${params.sessionKey ?? "unknown"} outcome=${params.outcome} duration=${params.durationMs ?? 0}ms${params.reason ? ` reason=${params.reason}` : ""}${params.error ? ` error="${params.error}"` : ""}`;
		if (params.outcome === "error") diagnosticLogger.error(payload);
		else diagnosticLogger.debug(payload);
	}
	emitDiagnosticEvent({
		type: "message.processed",
		channel: params.channel,
		chatId: params.chatId,
		messageId: params.messageId,
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		durationMs: params.durationMs,
		outcome: params.outcome,
		reason: params.reason,
		error: params.error
	});
	markDiagnosticActivity();
}
function logSessionStateChange(params) {
	if (!areDiagnosticsEnabledForProcess()) return;
	const state = getDiagnosticSessionState(params);
	const isProbeSession = state.sessionId?.startsWith("probe-") ?? false;
	const prevState = state.state;
	state.state = params.state;
	state.lastActivity = Date.now();
	if (params.state === "idle") state.queueDepth = Math.max(0, state.queueDepth - 1);
	if (!isProbeSession && diagnosticLogger.isEnabled("debug")) diagnosticLogger.debug(`session state: sessionId=${state.sessionId ?? "unknown"} sessionKey=${state.sessionKey ?? "unknown"} prev=${prevState} new=${params.state} reason="${params.reason ?? ""}" queueDepth=${state.queueDepth}`);
	emitDiagnosticEvent({
		type: "session.state",
		sessionId: state.sessionId,
		sessionKey: state.sessionKey,
		prevState,
		state: params.state,
		reason: params.reason,
		queueDepth: state.queueDepth
	});
	markDiagnosticActivity();
}
function logSessionStuck(params) {
	if (!areDiagnosticsEnabledForProcess()) return;
	const state = getDiagnosticSessionState(params);
	const reason = resolveStuckSessionReason(state);
	diagnosticLogger.warn(`stuck session: sessionId=${state.sessionId ?? "unknown"} sessionKey=${state.sessionKey ?? "unknown"} state=${params.state} age=${Math.round(params.ageMs / 1e3)}s queueDepth=${state.queueDepth} reason=${reason} recovery=checking`);
	emitDiagnosticEvent({
		type: "session.stuck",
		sessionId: state.sessionId,
		sessionKey: state.sessionKey,
		state: params.state,
		ageMs: params.ageMs,
		queueDepth: state.queueDepth,
		reason
	});
	markDiagnosticActivity();
}
function logRunAttempt(params) {
	if (!areDiagnosticsEnabledForProcess()) return;
	diagnosticLogger.debug(`run attempt: sessionId=${params.sessionId ?? "unknown"} sessionKey=${params.sessionKey ?? "unknown"} runId=${params.runId} attempt=${params.attempt}`);
	emitDiagnosticEvent({
		type: "run.attempt",
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		runId: params.runId,
		attempt: params.attempt
	});
	markDiagnosticActivity();
}
function logToolLoopAction(params) {
	if (!areDiagnosticsEnabledForProcess()) return;
	const payload = `tool loop: sessionId=${params.sessionId ?? "unknown"} sessionKey=${params.sessionKey ?? "unknown"} tool=${params.toolName} level=${params.level} action=${params.action} detector=${params.detector} count=${params.count}${params.pairedToolName ? ` pairedTool=${params.pairedToolName}` : ""} message="${params.message}"`;
	if (params.level === "critical") diagnosticLogger.error(payload);
	else diagnosticLogger.warn(payload);
	emitDiagnosticEvent({
		type: "tool.loop",
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		toolName: params.toolName,
		level: params.level,
		action: params.action,
		detector: params.detector,
		count: params.count,
		message: params.message,
		pairedToolName: params.pairedToolName
	});
	markDiagnosticActivity();
}
function logActiveRuns() {
	if (!areDiagnosticsEnabledForProcess()) return;
	const now = Date.now();
	const activeSessions = Array.from(diagnosticSessionStates.entries()).filter(([, s]) => s.state === "processing").map(([id, s]) => `${id}(q=${s.queueDepth},age=${Math.round((now - s.lastActivity) / 1e3)}s)`);
	diagnosticLogger.debug(`active runs: count=${activeSessions.length} sessions=[${activeSessions.join(", ")}]`);
	markDiagnosticActivity();
}
let heartbeatInterval = null;
function startDiagnosticHeartbeat(config, opts) {
	if (!areDiagnosticsEnabledForProcess() || !isDiagnosticsEnabled(config)) return;
	startDiagnosticStabilityRecorder();
	installDiagnosticStabilityFatalHook();
	if (heartbeatInterval) return;
	startDiagnosticLivenessSampler();
	heartbeatInterval = setInterval(() => {
		let heartbeatConfig = config;
		if (!heartbeatConfig) try {
			heartbeatConfig = (opts?.getConfig ?? getRuntimeConfig)();
		} catch {
			heartbeatConfig = void 0;
		}
		const stuckSessionWarnMs = resolveStuckSessionWarnMs(heartbeatConfig);
		const now = Date.now();
		pruneDiagnosticSessionStates(now, true);
		const work = getDiagnosticWorkSnapshot();
		const livenessSample = (opts?.sampleLiveness ?? sampleDiagnosticLiveness)(now, work);
		const shouldEmitLivenessWarning = livenessSample !== null && shouldEmitDiagnosticLivenessWarning(now);
		const shouldRecordMemorySample = shouldEmitLivenessWarning || hasRecentDiagnosticActivity(now) || hasOpenDiagnosticWork(work);
		(opts?.emitMemorySample ?? emitDiagnosticMemorySample)({ emitSample: shouldRecordMemorySample });
		if (!shouldRecordMemorySample) return;
		if (shouldEmitLivenessWarning && livenessSample) emitDiagnosticLivenessWarning(livenessSample, work);
		diagnosticLogger.debug(`heartbeat: webhooks=${webhookStats.received}/${webhookStats.processed}/${webhookStats.errors} active=${work.activeCount} waiting=${work.waitingCount} queued=${work.queuedCount}`);
		emitDiagnosticEvent({
			type: "diagnostic.heartbeat",
			webhooks: {
				received: webhookStats.received,
				processed: webhookStats.processed,
				errors: webhookStats.errors
			},
			active: work.activeCount,
			waiting: work.waitingCount,
			queued: work.queuedCount
		});
		loadCommandPollBackoffRuntime().then(({ pruneStaleCommandPolls }) => {
			for (const [, state] of diagnosticSessionStates) pruneStaleCommandPolls(state);
		}).catch((err) => {
			diagnosticLogger.debug(`command-poll-backoff prune failed: ${String(err)}`);
		});
		for (const [, state] of diagnosticSessionStates) {
			const ageMs = now - state.lastActivity;
			if (state.state === "processing" && ageMs > stuckSessionWarnMs) {
				logSessionStuck({
					sessionId: state.sessionId,
					sessionKey: state.sessionKey,
					state: state.state,
					ageMs
				});
				(opts?.recoverStuckSession ?? recoverStuckSession)({
					sessionId: state.sessionId,
					sessionKey: state.sessionKey,
					ageMs,
					queueDepth: state.queueDepth
				});
			}
		}
	}, 3e4);
	heartbeatInterval.unref?.();
}
function stopDiagnosticHeartbeat() {
	if (heartbeatInterval) {
		clearInterval(heartbeatInterval);
		heartbeatInterval = null;
	}
	stopDiagnosticLivenessSampler();
	stopDiagnosticStabilityRecorder();
	uninstallDiagnosticStabilityFatalHook();
}
function getDiagnosticSessionStateCountForTest() {
	return getDiagnosticSessionStateCountForTest$1();
}
function resetDiagnosticStateForTest() {
	resetDiagnosticSessionStateForTest();
	resetDiagnosticActivityForTest();
	webhookStats.received = 0;
	webhookStats.processed = 0;
	webhookStats.errors = 0;
	webhookStats.lastReceived = 0;
	stopDiagnosticHeartbeat();
	resetDiagnosticMemoryForTest();
	resetDiagnosticStabilityRecorderForTest();
	resetDiagnosticStabilityBundleForTest();
}
//#endregion
export { logRunAttempt as a, logToolLoopAction as c, logWebhookReceived as d, resetDiagnosticStateForTest as f, stopDiagnosticHeartbeat as h, logMessageQueued as i, logWebhookError as l, startDiagnosticHeartbeat as m, logActiveRuns as n, logSessionStateChange as o, resolveStuckSessionWarnMs as p, logMessageProcessed as r, logSessionStuck as s, getDiagnosticSessionStateCountForTest as t, logWebhookProcessed as u };
