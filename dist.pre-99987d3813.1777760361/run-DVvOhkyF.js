import { c as normalizeOptionalString, s as normalizeOptionalLowercaseString } from "./string-coerce-Bje8XVt9.js";
import { _ as resolveStateDir, t as CONFIG_PATH, u as resolveGatewayPort } from "./paths-B2cMK-wd.js";
import { i as formatErrorMessage } from "./errors-RZvg4nzL.js";
import { t as isTruthyEnvValue } from "./env-CqfGXlE5.js";
import { n as inheritOptionFromParent } from "./command-options-DR-PifHH.js";
import { t as formatCliCommand } from "./command-format-BORwwHyH.js";
import { o as hasConfiguredSecretInput } from "./types.secrets-BHp0Y_k0.js";
import { n as defaultRuntime } from "./runtime-CChwgwyg.js";
import { S as setVerbose } from "./logger-BnvCi6Wb.js";
import { c as setConsoleTimestampPrefix, s as setConsoleSubsystemFilter } from "./console-BOHAQfjM.js";
import { t as createSubsystemLogger } from "./subsystem-W9_E260X.js";
import "./globals-DMzUDF8N.js";
import { t as isContainerEnvironment } from "./container-environment-DAGbmAa8.js";
import { p as resolveGatewayBindHost, t as defaultGatewayBindMode } from "./net-D2ag99RA.js";
import { t as parsePort } from "./parse-port-C3gT_WRx.js";
import { r as withProgress } from "./progress-BsBRBwPE.js";
import { n as setGatewayWsLogStyle } from "./ws-logging-BTe2fyYj.js";
import { n as acquireGatewayLock, t as GatewayLockError } from "./gateway-lock-DZpZgvXd.js";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { request } from "node:http";
//#region src/cli/gateway-cli/run-loop.ts
const gatewayLog$1 = createSubsystemLogger("gateway");
const LAUNCHD_SUPERVISED_RESTART_EXIT_DELAY_MS = 1500;
const DEFAULT_RESTART_DRAIN_TIMEOUT_MS = 3e5;
const RESTART_DRAIN_STILL_PENDING_WARN_MS = 3e4;
const UPDATE_RESPAWN_HEALTH_TIMEOUT_MS = 1e4;
const UPDATE_RESPAWN_HEALTH_POLL_MS = 200;
let gatewayLifecycleRuntimeModule;
const loadGatewayLifecycleRuntimeModule = () => gatewayLifecycleRuntimeModule ??= import("./cli/gateway-lifecycle.runtime.js");
function createRestartIterationHook(onRestart) {
	let isFirstIteration = true;
	return async () => {
		if (isFirstIteration) {
			isFirstIteration = false;
			return false;
		}
		await onRestart();
		return true;
	};
}
async function waitForGatewayPortReady(host, port) {
	return await new Promise((resolve) => {
		const socket = net.createConnection({
			host,
			port
		});
		let settled = false;
		const finish = (value) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket.removeAllListeners();
			socket.destroy();
			resolve(value);
		};
		const timer = setTimeout(() => {
			finish(false);
		}, UPDATE_RESPAWN_HEALTH_POLL_MS);
		socket.once("connect", () => finish(true));
		socket.once("error", () => finish(false));
	});
}
async function waitForHealthyGatewayChild(port, _pid, host = "127.0.0.1", timeoutMs = UPDATE_RESPAWN_HEALTH_TIMEOUT_MS) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await waitForGatewayPortReady(host, port)) return true;
		await new Promise((resolve) => {
			setTimeout(resolve, UPDATE_RESPAWN_HEALTH_POLL_MS);
		});
	}
	return false;
}
async function runGatewayLoop(params) {
	let startupStartedAt = Date.now();
	let lock = await acquireGatewayLock({ port: params.lockPort });
	let server = null;
	let shuttingDown = false;
	let restartResolver = null;
	const waitForHealthyChild = params.waitForHealthyChild ?? waitForHealthyGatewayChild;
	const cleanupSignals = () => {
		process.removeListener("SIGTERM", onSigterm);
		process.removeListener("SIGINT", onSigint);
		process.removeListener("SIGUSR1", onSigusr1);
	};
	const exitProcess = (code) => {
		cleanupSignals();
		params.runtime.exit(code);
	};
	const writeStabilityBundle = async (reason, error) => {
		const { writeDiagnosticStabilityBundleForFailureSync } = await loadGatewayLifecycleRuntimeModule();
		const result = writeDiagnosticStabilityBundleForFailureSync(reason, error);
		if ("message" in result) gatewayLog$1.warn(result.message);
	};
	const releaseLockIfHeld = async () => {
		if (!lock) return false;
		await lock.release();
		lock = null;
		return true;
	};
	const reacquireLockForInProcessRestart = async () => {
		try {
			startupStartedAt = Date.now();
			lock = await acquireGatewayLock({ port: params.lockPort });
			return true;
		} catch (err) {
			gatewayLog$1.error(`failed to reacquire gateway lock for in-process restart: ${String(err)}`);
			exitProcess(1);
			return false;
		}
	};
	const handleRestartAfterServerClose = async (restartReason) => {
		const hadLock = await releaseLockIfHeld();
		const isUpdateRestart = restartReason === "update.run";
		const { detectRespawnSupervisor, markUpdateRestartSentinelFailure, respawnGatewayProcessForUpdate, restartGatewayProcessWithFreshPid } = await loadGatewayLifecycleRuntimeModule();
		if (isUpdateRestart) {
			const respawn = respawnGatewayProcessForUpdate();
			if (respawn.mode === "spawned") {
				const port = params.lockPort;
				if (typeof port === "number" ? await waitForHealthyChild(port, respawn.pid, params.healthHost ?? "127.0.0.1") : false) {
					gatewayLog$1.info(`restart mode: update process respawn (spawned pid ${respawn.pid ?? "unknown"})`);
					exitProcess(0);
					return;
				}
				gatewayLog$1.warn(`update respawn child did not become healthy (${respawn.pid ?? "unknown"}); falling back to in-process restart`);
				try {
					respawn.child?.kill();
				} catch {}
				await markUpdateRestartSentinelFailure("restart-unhealthy").catch((err) => {
					gatewayLog$1.warn(`failed to mark update restart sentinel unhealthy: ${String(err)}`);
				});
				if (hadLock && !await reacquireLockForInProcessRestart()) return;
				shuttingDown = false;
				restartResolver?.();
				return;
			}
			if (respawn.mode === "supervised") {
				gatewayLog$1.info("restart mode: update process respawn (supervisor restart)");
				if (detectRespawnSupervisor(process.env, process.platform) === "launchd") await new Promise((resolve) => {
					setTimeout(resolve, LAUNCHD_SUPERVISED_RESTART_EXIT_DELAY_MS);
				});
				exitProcess(0);
				return;
			}
			if (respawn.mode === "failed") {
				gatewayLog$1.warn(`update respawn failed (${respawn.detail ?? "unknown error"}); falling back to in-process restart`);
				await markUpdateRestartSentinelFailure("restart-unhealthy").catch((err) => {
					gatewayLog$1.warn(`failed to mark update restart sentinel unhealthy: ${String(err)}`);
				});
			} else gatewayLog$1.info(`restart mode: in-process restart (${respawn.detail ?? "OPENCLAW_NO_RESPAWN"})`);
			if (hadLock && !await reacquireLockForInProcessRestart()) return;
			shuttingDown = false;
			restartResolver?.();
			return;
		}
		const respawn = restartGatewayProcessWithFreshPid();
		if (respawn.mode === "spawned" || respawn.mode === "supervised") {
			const modeLabel = respawn.mode === "spawned" ? `spawned pid ${respawn.pid ?? "unknown"}` : "supervisor restart";
			gatewayLog$1.info(`restart mode: full process restart (${modeLabel})`);
			if (respawn.mode === "supervised" && detectRespawnSupervisor(process.env, process.platform) === "launchd") await new Promise((resolve) => {
				setTimeout(resolve, LAUNCHD_SUPERVISED_RESTART_EXIT_DELAY_MS);
			});
			exitProcess(0);
			return;
		}
		if (respawn.mode === "failed") {
			await writeStabilityBundle("gateway.restart_respawn_failed");
			gatewayLog$1.warn(`full process restart failed (${respawn.detail ?? "unknown error"}); falling back to in-process restart`);
		} else gatewayLog$1.info(`restart mode: in-process restart (${respawn.detail ?? "OPENCLAW_NO_RESPAWN"})`);
		if (hadLock && !await reacquireLockForInProcessRestart()) return;
		shuttingDown = false;
		restartResolver?.();
	};
	const handleStopAfterServerClose = async () => {
		await releaseLockIfHeld();
		exitProcess(0);
	};
	const SHUTDOWN_TIMEOUT_MS = 25e3;
	const resolveRestartDrainTimeoutMs = async () => {
		try {
			const { getRuntimeConfig, resolveGatewayRestartDeferralTimeoutMs } = await loadGatewayLifecycleRuntimeModule();
			const timeoutMs = getRuntimeConfig().gateway?.reload?.deferralTimeoutMs;
			return resolveGatewayRestartDeferralTimeoutMs(timeoutMs);
		} catch {
			return DEFAULT_RESTART_DRAIN_TIMEOUT_MS;
		}
	};
	const request = (action, signal, restartReason) => {
		if (shuttingDown) {
			gatewayLog$1.info(`received ${signal} during shutdown; ignoring`);
			return;
		}
		shuttingDown = true;
		const isRestart = action === "restart";
		gatewayLog$1.info(`received ${signal}; ${isRestart ? "restarting" : "shutting down"}`);
		let forceExitTimer = null;
		const armForceExitTimer = (forceExitMs) => {
			if (forceExitTimer) return;
			forceExitTimer = setTimeout(() => {
				gatewayLog$1.error("shutdown timed out; exiting without full cleanup");
				(async () => {
					try {
						await writeStabilityBundle(isRestart ? "gateway.restart_shutdown_timeout" : "gateway.stop_shutdown_timeout");
					} finally {
						exitProcess(1);
					}
				})();
			}, forceExitMs);
		};
		const clearForceExitTimer = () => {
			if (!forceExitTimer) return;
			clearTimeout(forceExitTimer);
			forceExitTimer = null;
		};
		(async () => {
			const restartDrainTimeoutMs = isRestart ? await resolveRestartDrainTimeoutMs() : 0;
			if (!isRestart) armForceExitTimer(SHUTDOWN_TIMEOUT_MS);
			else if (restartDrainTimeoutMs !== void 0) armForceExitTimer(restartDrainTimeoutMs + SHUTDOWN_TIMEOUT_MS);
			const formatRestartDrainBudget = () => restartDrainTimeoutMs === void 0 ? "without a timeout" : `with timeout ${restartDrainTimeoutMs}ms`;
			const armCloseForceExitTimerForIndefiniteRestart = () => {
				if (isRestart && restartDrainTimeoutMs === void 0) armForceExitTimer(SHUTDOWN_TIMEOUT_MS);
			};
			try {
				if (isRestart) {
					const { abortEmbeddedPiRun, getActiveBundledRuntimeDepsInstallCount, getActiveEmbeddedRunCount, getActiveTaskCount, markGatewayDraining, waitForActiveEmbeddedRuns, waitForActiveTasks, waitForBundledRuntimeDepsInstallIdle } = await loadGatewayLifecycleRuntimeModule();
					const createStillPendingDrainLogger = () => setInterval(() => {
						gatewayLog$1.warn(`still draining ${getActiveTaskCount()} active task(s), ${getActiveEmbeddedRunCount()} active embedded run(s), and ${getActiveBundledRuntimeDepsInstallCount()} runtime deps install(s) before restart`);
					}, RESTART_DRAIN_STILL_PENDING_WARN_MS);
					markGatewayDraining();
					const activeTasks = getActiveTaskCount();
					const activeRuns = getActiveEmbeddedRunCount();
					const activeRuntimeDepsInstalls = getActiveBundledRuntimeDepsInstallCount();
					if (activeRuns > 0) abortEmbeddedPiRun(void 0, { mode: "compacting" });
					if (activeTasks > 0 || activeRuns > 0 || activeRuntimeDepsInstalls > 0) {
						gatewayLog$1.info(`draining ${activeTasks} active task(s), ${activeRuns} active embedded run(s), and ${activeRuntimeDepsInstalls} runtime deps install(s) before restart ${formatRestartDrainBudget()}`);
						const stillPendingDrainLogger = createStillPendingDrainLogger();
						const [tasksDrain, runsDrain, runtimeDepsDrain] = await Promise.all([
							activeTasks > 0 ? waitForActiveTasks(restartDrainTimeoutMs) : Promise.resolve({ drained: true }),
							activeRuns > 0 ? waitForActiveEmbeddedRuns(restartDrainTimeoutMs) : Promise.resolve({ drained: true }),
							activeRuntimeDepsInstalls > 0 ? waitForBundledRuntimeDepsInstallIdle(restartDrainTimeoutMs) : Promise.resolve({ drained: true })
						]).finally(() => clearInterval(stillPendingDrainLogger));
						if (tasksDrain.drained && runsDrain.drained && runtimeDepsDrain.drained) gatewayLog$1.info("all active work drained");
						else {
							gatewayLog$1.warn("drain timeout reached; proceeding with restart");
							abortEmbeddedPiRun(void 0, { mode: "all" });
						}
					}
				}
				armCloseForceExitTimerForIndefiniteRestart();
				await server?.close({
					reason: isRestart ? "gateway restarting" : "gateway stopping",
					restartExpectedMs: isRestart ? 1500 : null
				});
			} catch (err) {
				gatewayLog$1.error(`shutdown error: ${String(err)}`);
			} finally {
				clearForceExitTimer();
				server = null;
				if (isRestart) await handleRestartAfterServerClose(restartReason);
				else await handleStopAfterServerClose();
			}
		})();
	};
	const onSigterm = () => {
		gatewayLog$1.info("signal SIGTERM received");
		(async () => {
			const { consumeGatewayRestartIntentSync } = await loadGatewayLifecycleRuntimeModule();
			request(consumeGatewayRestartIntentSync() ? "restart" : "stop", "SIGTERM");
		})();
	};
	const onSigint = () => {
		gatewayLog$1.info("signal SIGINT received");
		request("stop", "SIGINT");
	};
	const onSigusr1 = () => {
		gatewayLog$1.info("signal SIGUSR1 received");
		(async () => {
			const { consumeGatewaySigusr1RestartAuthorization, isGatewaySigusr1RestartExternallyAllowed, markGatewaySigusr1RestartHandled, peekGatewaySigusr1RestartReason, scheduleGatewaySigusr1Restart } = await loadGatewayLifecycleRuntimeModule();
			if (!consumeGatewaySigusr1RestartAuthorization()) {
				if (!isGatewaySigusr1RestartExternallyAllowed()) {
					gatewayLog$1.warn("SIGUSR1 restart ignored (not authorized; commands.restart=false or use gateway tool).");
					return;
				}
				if (shuttingDown) {
					gatewayLog$1.info("received SIGUSR1 during shutdown; ignoring");
					return;
				}
				scheduleGatewaySigusr1Restart({
					delayMs: 0,
					reason: "SIGUSR1"
				});
				return;
			}
			const restartReason = peekGatewaySigusr1RestartReason();
			markGatewaySigusr1RestartHandled();
			request("restart", "SIGUSR1", restartReason);
		})();
	};
	process.on("SIGTERM", onSigterm);
	process.on("SIGINT", onSigint);
	process.on("SIGUSR1", onSigusr1);
	try {
		const onIteration = createRestartIterationHook(async () => {
			const { reloadTaskRegistryFromStore, resetAllLanes, resetGatewayRestartStateForInProcessRestart } = await loadGatewayLifecycleRuntimeModule();
			resetAllLanes();
			resetGatewayRestartStateForInProcessRestart();
			reloadTaskRegistryFromStore();
		});
		let isFirstStart = true;
		for (;;) {
			await onIteration();
			try {
				server = await params.start({ startupStartedAt });
				isFirstStart = false;
			} catch (err) {
				if (isFirstStart) throw err;
				server = null;
				await releaseLockIfHeld();
				const errMsg = formatErrorMessage(err);
				const errStack = err instanceof Error && err.stack ? `\n${err.stack}` : "";
				await writeStabilityBundle("gateway.restart_startup_failed", err);
				gatewayLog$1.error(`gateway startup failed: ${errMsg}. Process will stay alive; fix the issue and restart.${errStack}`);
			}
			await new Promise((resolve) => {
				restartResolver = resolve;
			});
		}
	} finally {
		await releaseLockIfHeld();
		cleanupSignals();
	}
}
//#endregion
//#region src/cli/gateway-cli/run.ts
const gatewayLog = createSubsystemLogger("gateway");
const GATEWAY_RUN_VALUE_KEYS = [
	"port",
	"bind",
	"token",
	"auth",
	"password",
	"passwordFile",
	"tailscale",
	"wsLog",
	"rawStreamPath"
];
const GATEWAY_RUN_BOOLEAN_KEYS = [
	"tailscaleResetOnExit",
	"allowUnconfigured",
	"dev",
	"reset",
	"force",
	"verbose",
	"cliBackendLogs",
	"claudeCliLogs",
	"compact",
	"rawStream"
];
const SUPERVISED_GATEWAY_LOCK_RETRY_MS = 5e3;
const SUPERVISED_GATEWAY_LOCK_RETRY_TIMEOUT_MS = 3e4;
const SUPERVISED_GATEWAY_HEALTH_PROBE_TIMEOUT_MS = 1e3;
/**
* EX_CONFIG (78) from sysexits.h — used for configuration errors so systemd
* (via RestartPreventExitStatus=78) stops restarting instead of entering a
* restart storm that can render low-resource hosts unresponsive.
*/
const EXIT_CONFIG_ERROR = 78;
const CONFIG_AUTO_RECOVERY_MESSAGE = "Gateway recovered automatically after a failed config change and restored the last known good configuration.";
const GATEWAY_AUTH_MODES = [
	"none",
	"token",
	"password",
	"trusted-proxy"
];
const GATEWAY_TAILSCALE_MODES = [
	"off",
	"serve",
	"funnel"
];
const toOptionString = (value) => {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "bigint") return value.toString();
};
function extractGatewayMiskeys(parsed) {
	if (!parsed || typeof parsed !== "object") return {
		hasGatewayToken: false,
		hasRemoteToken: false
	};
	const gateway = parsed.gateway;
	if (!gateway || typeof gateway !== "object") return {
		hasGatewayToken: false,
		hasRemoteToken: false
	};
	const hasGatewayToken = "token" in gateway;
	const remote = gateway.remote;
	return {
		hasGatewayToken,
		hasRemoteToken: remote && typeof remote === "object" ? "token" in remote : false
	};
}
function createGatewayCliStartupTrace() {
	const enabled = isTruthyEnvValue(process.env.OPENCLAW_GATEWAY_STARTUP_TRACE);
	const started = performance.now();
	let last = started;
	const emit = (name, durationMs, totalMs) => {
		if (enabled) gatewayLog.info(`startup trace: ${name} ${durationMs.toFixed(1)}ms total=${totalMs.toFixed(1)}ms`);
	};
	return {
		mark(name) {
			const now = performance.now();
			emit(name, now - last, now - started);
			last = now;
		},
		async measure(name, run) {
			const before = performance.now();
			try {
				return await run();
			} finally {
				const now = performance.now();
				emit(name, now - before, now - started);
				last = now;
			}
		}
	};
}
function warnInlinePasswordFlag() {
	defaultRuntime.error("Warning: --password can be exposed via process listings. Prefer --password-file or OPENCLAW_GATEWAY_PASSWORD.");
}
async function resolveGatewayPasswordOption(opts) {
	const direct = toOptionString(opts.password);
	const file = toOptionString(opts.passwordFile);
	if (direct && file) throw new Error("Use either --password or --password-file.");
	if (file) {
		const { readSecretFromFile } = await import("./secret-file-Cod6VZhZ.js");
		return readSecretFromFile(file, "Gateway password");
	}
	return direct;
}
function parseEnumOption(raw, allowed) {
	if (!raw) return null;
	return allowed.includes(raw) ? raw : null;
}
function formatModeChoices(modes) {
	return modes.map((mode) => `"${mode}"`).join("|");
}
function formatModeErrorList(modes) {
	const quoted = modes.map((mode) => `"${mode}"`);
	if (quoted.length === 0) return "";
	if (quoted.length === 1) return quoted[0];
	if (quoted.length === 2) return `${quoted[0]} or ${quoted[1]}`;
	return `${quoted.slice(0, -1).join(", ")}, or ${quoted[quoted.length - 1]}`;
}
async function maybeLogPendingControlUiBuild(cfg) {
	if (cfg.gateway?.controlUi?.enabled === false) return;
	if (toOptionString(cfg.gateway?.controlUi?.root)) return;
	const { resolveControlUiRootSync } = await import("./control-ui-assets-Cfr4VBxy.js");
	if (resolveControlUiRootSync({
		moduleUrl: import.meta.url,
		argv1: process.argv[1],
		cwd: process.cwd()
	})) return;
	gatewayLog.info("Control UI assets are missing; first startup may spend a few seconds building them before the gateway binds. `pnpm gateway:watch` does not rebuild Control UI assets, so rerun `pnpm ui:build` after UI changes or use `pnpm ui:dev` while developing the Control UI. For a full local dist, run `pnpm build && pnpm ui:build`.");
}
function getGatewayStartGuardErrors(params) {
	if (params.allowUnconfigured || params.mode === "local") return [];
	if (!params.configExists) return [`Missing config. Run \`${formatCliCommand("openclaw setup")}\` or set gateway.mode=local (or pass --allow-unconfigured).`];
	if (params.mode === void 0) return [[
		"Gateway start blocked: existing config is missing gateway.mode.",
		"Treat this as suspicious or clobbered config.",
		`Re-run \`${formatCliCommand("openclaw onboard --mode local")}\` or \`${formatCliCommand("openclaw setup")}\`, set gateway.mode=local manually, or pass --allow-unconfigured.`
	].join(" "), `Config write audit: ${params.configAuditPath}`];
	return [`Gateway start blocked: set gateway.mode=local (current: ${params.mode}) or pass --allow-unconfigured.`, `Config write audit: ${params.configAuditPath}`];
}
async function readGatewayStartupConfig(params) {
	const { readBestEffortConfig, readConfigFileSnapshot, recoverConfigFromLastKnownGood, recoverConfigFromJsonRootSuffix } = await import("./config/config.js");
	let cfg = await params.startupTrace.measure("cli.config-load", () => readBestEffortConfig());
	let snapshot = await params.startupTrace.measure("cli.config-snapshot", () => readConfigFileSnapshot().catch(() => null));
	if (snapshot?.exists && !snapshot.valid) {
		const invalidSnapshot = snapshot;
		if (await params.startupTrace.measure("cli.config-recovery", () => recoverConfigFromLastKnownGood({
			snapshot: invalidSnapshot,
			reason: "gateway-run-invalid-config"
		}))) {
			gatewayLog.warn(`gateway: restored invalid effective config from last-known-good backup: ${invalidSnapshot.path}`);
			try {
				const { writeRestartSentinel } = await import("./restart-sentinel-DI8alDNy.js");
				await writeRestartSentinel({
					kind: "config-auto-recovery",
					status: "ok",
					ts: Date.now(),
					message: CONFIG_AUTO_RECOVERY_MESSAGE,
					stats: {
						mode: "config-auto-recovery",
						reason: "gateway-run-invalid-config",
						after: { restoredFrom: "last-known-good" }
					}
				});
			} catch (err) {
				gatewayLog.warn(`gateway: failed to persist config auto-recovery notice: ${formatErrorMessage(err)}`);
			}
			snapshot = await params.startupTrace.measure("cli.config-snapshot-reload", () => readConfigFileSnapshot().catch(() => null));
		} else if (await params.startupTrace.measure("cli.config-prefix-recovery", () => recoverConfigFromJsonRootSuffix(invalidSnapshot))) {
			gatewayLog.warn(`gateway: repaired invalid effective config by stripping a non-JSON prefix: ${invalidSnapshot.path}`);
			snapshot = await params.startupTrace.measure("cli.config-snapshot-reload", () => readConfigFileSnapshot().catch(() => null));
		}
	}
	if (snapshot?.valid) cfg = snapshot.config;
	return {
		cfg,
		snapshot
	};
}
function resolveGatewayRunOptions(opts, command) {
	const resolved = { ...opts };
	for (const key of GATEWAY_RUN_VALUE_KEYS) {
		const inherited = inheritOptionFromParent(command, key);
		if (key === "wsLog") {
			resolved[key] = inherited ?? resolved[key];
			continue;
		}
		resolved[key] = resolved[key] ?? inherited;
	}
	for (const key of GATEWAY_RUN_BOOLEAN_KEYS) {
		const inherited = inheritOptionFromParent(command, key);
		resolved[key] = Boolean(resolved[key] || inherited);
	}
	return resolved;
}
function isGatewayLockError(err) {
	return err instanceof GatewayLockError || !!err && typeof err === "object" && err.name === "GatewayLockError";
}
function isGatewayAlreadyRunningLockError(err) {
	if (!isGatewayLockError(err) || typeof err.message !== "string") return false;
	return err.message.includes("gateway already running") || err.message.includes("another gateway instance is already listening");
}
function isHealthyGatewayLockError(err) {
	return isGatewayAlreadyRunningLockError(err);
}
function resolveGatewayLockErrorExitCode(err, supervisor) {
	if (supervisor === "systemd" && isGatewayAlreadyRunningLockError(err)) return EXIT_CONFIG_ERROR;
	return isHealthyGatewayLockError(err) ? 0 : 1;
}
function normalizeGatewayHealthProbeHost(host) {
	if (host === "0.0.0.0" || host === "::") return "127.0.0.1";
	return host;
}
async function probeGatewayHealthz(params) {
	const timeoutMs = params.timeoutMs ?? SUPERVISED_GATEWAY_HEALTH_PROBE_TIMEOUT_MS;
	return await new Promise((resolve) => {
		const req = request({
			hostname: normalizeGatewayHealthProbeHost(params.host),
			port: params.port,
			path: "/healthz",
			method: "GET",
			timeout: timeoutMs
		}, (res) => {
			res.resume();
			resolve(typeof res.statusCode === "number" && res.statusCode < 500);
		});
		req.once("timeout", () => {
			req.destroy();
			resolve(false);
		});
		req.once("error", () => {
			resolve(false);
		});
		req.end();
	});
}
async function runGatewayLoopWithSupervisedLockRecovery(params) {
	const supervisor = params.supervisor;
	if (!supervisor) {
		await params.startLoop();
		return;
	}
	const now = params.now ?? Date.now;
	const sleep = params.sleep ?? (async (ms) => await new Promise((resolve) => setTimeout(resolve, ms)));
	const probeHealth = params.probeHealth ?? ((probeParams) => probeGatewayHealthz(probeParams));
	const retryMs = params.retryMs ?? SUPERVISED_GATEWAY_LOCK_RETRY_MS;
	const timeoutMs = params.timeoutMs ?? SUPERVISED_GATEWAY_LOCK_RETRY_TIMEOUT_MS;
	const startedAt = now();
	for (;;) try {
		await params.startLoop();
		return;
	} catch (err) {
		if (!isGatewayAlreadyRunningLockError(err)) throw err;
		if (await probeHealth({
			host: params.healthHost,
			port: params.port
		})) {
			if (supervisor === "systemd") throw new GatewayLockError("gateway already running under systemd; existing gateway is healthy, exiting with code 78 to prevent a systemd Restart=always loop", err);
			params.log.info(`gateway already running under ${supervisor}; existing gateway is healthy, leaving it in control`);
			return;
		}
		const elapsedMs = now() - startedAt;
		if (elapsedMs >= timeoutMs) throw new GatewayLockError(`gateway already running under ${supervisor}; existing gateway did not become healthy after ${timeoutMs}ms`, err);
		const waitMs = Math.min(retryMs, Math.max(0, timeoutMs - elapsedMs));
		params.log.warn(`gateway already running under ${supervisor}; waiting ${waitMs}ms before retrying startup`);
		await sleep(waitMs);
	}
}
async function maybeWriteGatewayStartupFailureBundle(err) {
	const { writeDiagnosticStabilityBundleForFailureSync } = await import("./diagnostic-stability-bundle-95hqKdAH.js");
	const result = writeDiagnosticStabilityBundleForFailureSync("gateway.startup_failed", err);
	if ("message" in result) gatewayLog.warn(result.message);
}
async function runGatewayCommand(opts) {
	const isDevProfile = normalizeOptionalLowercaseString(process.env.OPENCLAW_PROFILE) === "dev";
	const devMode = Boolean(opts.dev) || isDevProfile;
	if (opts.reset && !devMode) {
		defaultRuntime.error("Use --reset with --dev.");
		defaultRuntime.exit(1);
		return;
	}
	setVerbose(Boolean(opts.verbose));
	if (opts.cliBackendLogs || opts.claudeCliLogs) {
		setConsoleSubsystemFilter(["agent/cli-backend"]);
		process.env.OPENCLAW_CLI_BACKEND_LOG_OUTPUT = "1";
	}
	const wsLogRaw = opts.compact ? "compact" : opts.wsLog;
	const wsLogStyle = wsLogRaw === "compact" ? "compact" : wsLogRaw === "full" ? "full" : "auto";
	if (wsLogRaw !== void 0 && wsLogRaw !== "auto" && wsLogRaw !== "compact" && wsLogRaw !== "full") {
		defaultRuntime.error("Invalid --ws-log (use \"auto\", \"full\", \"compact\")");
		defaultRuntime.exit(1);
	}
	setGatewayWsLogStyle(wsLogStyle);
	if (opts.rawStream) process.env.OPENCLAW_RAW_STREAM = "1";
	const rawStreamPath = toOptionString(opts.rawStreamPath);
	if (rawStreamPath) process.env.OPENCLAW_RAW_STREAM_PATH = rawStreamPath;
	const startupTrace = createGatewayCliStartupTrace();
	const { startGatewayServer } = await startupTrace.measure("cli.server-import", () => withProgress({
		label: "Loading gateway modules…",
		indeterminate: true
	}, async () => import("./server-DX8M1kkB.js")));
	setConsoleTimestampPrefix(true);
	if (devMode) {
		const { ensureDevGatewayConfig } = await import("./dev-4z7_UNes.js");
		await startupTrace.measure("cli.dev-config", () => ensureDevGatewayConfig({ reset: Boolean(opts.reset) }));
	}
	gatewayLog.info("loading configuration…");
	const { cfg, snapshot } = await readGatewayStartupConfig({ startupTrace });
	maybeLogPendingControlUiBuild(cfg).catch((err) => {
		gatewayLog.warn(`Control UI asset check failed: ${String(err)}`);
	});
	const portOverride = parsePort(opts.port);
	if (opts.port !== void 0 && portOverride === null) {
		defaultRuntime.error("Invalid port");
		defaultRuntime.exit(1);
	}
	const port = portOverride ?? resolveGatewayPort(cfg);
	if (!Number.isFinite(port) || port <= 0) {
		defaultRuntime.error("Invalid port");
		defaultRuntime.exit(1);
	}
	const { formatFutureConfigActionBlock, resolveFutureConfigActionBlock } = await import("./future-version-guard-Bk9JDGJV.js");
	const futureStartupBlock = resolveFutureConfigActionBlock({
		action: "start the gateway service",
		snapshot
	});
	if (futureStartupBlock && process.env.OPENCLAW_SERVICE_MARKER?.trim()) {
		defaultRuntime.error(formatFutureConfigActionBlock(futureStartupBlock));
		defaultRuntime.exit(78);
		return;
	}
	const futureForceBlock = opts.force ? resolveFutureConfigActionBlock({
		action: "force-kill gateway port listeners",
		snapshot
	}) : null;
	if (futureForceBlock) {
		defaultRuntime.error(formatFutureConfigActionBlock(futureForceBlock));
		defaultRuntime.exit(1);
		return;
	}
	const VALID_BIND_MODES = new Set([
		"loopback",
		"lan",
		"auto",
		"custom",
		"tailnet"
	]);
	const bindExplicitRawStr = normalizeOptionalString(toOptionString(opts.bind) ?? cfg.gateway?.bind);
	if (bindExplicitRawStr !== void 0 && !VALID_BIND_MODES.has(bindExplicitRawStr)) {
		defaultRuntime.error("Invalid --bind (use \"loopback\", \"lan\", \"tailnet\", \"auto\", or \"custom\")");
		defaultRuntime.exit(1);
		return;
	}
	const bindExplicitRaw = bindExplicitRawStr;
	if (process.env.OPENCLAW_SERVICE_MARKER?.trim()) {
		const { cleanStaleGatewayProcessesSync } = await import("./restart-stale-pids-DwNe5Zc0.js");
		const stale = cleanStaleGatewayProcessesSync(port);
		if (stale.length > 0) gatewayLog.info(`service-mode: cleared ${stale.length} stale gateway pid(s) before bind on port ${port}`);
	}
	if (opts.force) try {
		const { forceFreePortAndWait, waitForPortBindable } = await import("./ports-BsiQ8_Y3.js");
		const { killed, waitedMs, escalatedToSigkill } = await forceFreePortAndWait(port, {
			timeoutMs: 2e3,
			intervalMs: 100,
			sigtermTimeoutMs: 700
		});
		if (killed.length === 0) gatewayLog.info(`force: no listeners on port ${port}`);
		else {
			for (const proc of killed) gatewayLog.info(`force: killed pid ${proc.pid}${proc.command ? ` (${proc.command})` : ""} on port ${port}`);
			if (escalatedToSigkill) gatewayLog.info(`force: escalated to SIGKILL while freeing port ${port}`);
			if (waitedMs > 0) gatewayLog.info(`force: waited ${waitedMs}ms for port ${port} to free`);
		}
		const bindWaitMs = await waitForPortBindable(port, {
			timeoutMs: 3e3,
			intervalMs: 150,
			host: bindExplicitRaw === "loopback" ? "127.0.0.1" : bindExplicitRaw === "lan" ? "0.0.0.0" : bindExplicitRaw === "custom" ? toOptionString(cfg.gateway?.customBindHost) : void 0
		});
		if (bindWaitMs > 0) gatewayLog.info(`force: waited ${bindWaitMs}ms for port ${port} to become bindable`);
	} catch (err) {
		defaultRuntime.error(`Force: ${String(err)}`);
		defaultRuntime.exit(1);
		return;
	}
	if (opts.token) {
		const token = toOptionString(opts.token);
		if (token) process.env.OPENCLAW_GATEWAY_TOKEN = token;
	}
	const authModeRaw = toOptionString(opts.auth);
	const authMode = parseEnumOption(authModeRaw, GATEWAY_AUTH_MODES);
	if (authModeRaw && !authMode) {
		defaultRuntime.error(`Invalid --auth (use ${formatModeErrorList(GATEWAY_AUTH_MODES)})`);
		defaultRuntime.exit(1);
		return;
	}
	const tailscaleRaw = toOptionString(opts.tailscale);
	const tailscaleMode = parseEnumOption(tailscaleRaw, GATEWAY_TAILSCALE_MODES);
	if (tailscaleRaw && !tailscaleMode) {
		defaultRuntime.error(`Invalid --tailscale (use ${formatModeErrorList(GATEWAY_TAILSCALE_MODES)})`);
		defaultRuntime.exit(1);
		return;
	}
	const effectiveTailscaleMode = tailscaleMode ?? cfg.gateway?.tailscale?.mode ?? "off";
	const bind = bindExplicitRaw ?? defaultGatewayBindMode(effectiveTailscaleMode);
	let passwordRaw;
	try {
		passwordRaw = await resolveGatewayPasswordOption(opts);
	} catch (err) {
		defaultRuntime.error(formatErrorMessage(err));
		defaultRuntime.exit(1);
		return;
	}
	if (toOptionString(opts.password)) warnInlinePasswordFlag();
	const tokenRaw = toOptionString(opts.token);
	gatewayLog.info("resolving authentication…");
	const configExists = snapshot?.exists ?? fs.existsSync(CONFIG_PATH);
	const configAuditPath = path.join(resolveStateDir(process.env), "logs", "config-audit.jsonl");
	const mode = (snapshot?.valid ? snapshot.config : cfg).gateway?.mode;
	const guardErrors = getGatewayStartGuardErrors({
		allowUnconfigured: opts.allowUnconfigured,
		configExists,
		configAuditPath,
		mode
	});
	if (guardErrors.length > 0) {
		for (const error of guardErrors) defaultRuntime.error(error);
		defaultRuntime.exit(EXIT_CONFIG_ERROR);
		return;
	}
	const miskeys = extractGatewayMiskeys(snapshot?.parsed);
	const authOverride = authMode || passwordRaw || tokenRaw || authModeRaw ? {
		...authMode ? { mode: authMode } : {},
		...tokenRaw ? { token: tokenRaw } : {},
		...passwordRaw ? { password: passwordRaw } : {}
	} : void 0;
	const { resolveGatewayAuth } = await import("./auth-BiNi5dPj.js");
	const resolvedAuth = await startupTrace.measure("cli.auth-resolve", () => resolveGatewayAuth({
		authConfig: cfg.gateway?.auth,
		authOverride,
		env: process.env,
		tailscaleMode: tailscaleMode ?? cfg.gateway?.tailscale?.mode ?? "off"
	}));
	const resolvedAuthMode = resolvedAuth.mode;
	const tokenValue = resolvedAuth.token;
	const passwordValue = resolvedAuth.password;
	const hasToken = typeof tokenValue === "string" && tokenValue.trim().length > 0;
	const hasPassword = typeof passwordValue === "string" && passwordValue.trim().length > 0;
	const tokenConfigured = hasToken || hasConfiguredSecretInput(authOverride?.token ?? cfg.gateway?.auth?.token, cfg.secrets?.defaults);
	const passwordConfigured = hasPassword || hasConfiguredSecretInput(authOverride?.password ?? cfg.gateway?.auth?.password, cfg.secrets?.defaults);
	const hasSharedSecret = resolvedAuthMode === "token" && tokenConfigured || resolvedAuthMode === "password" && passwordConfigured;
	const canBootstrapToken = resolvedAuthMode === "token" && !tokenConfigured;
	const authHints = [];
	if (miskeys.hasGatewayToken) authHints.push("Found \"gateway.token\" in config. Use \"gateway.auth.token\" instead.");
	if (miskeys.hasRemoteToken) authHints.push("\"gateway.remote.token\" is for remote CLI calls; it does not enable local gateway auth.");
	if (resolvedAuthMode === "password" && !passwordConfigured) {
		defaultRuntime.error([
			"Gateway auth is set to password, but no password is configured.",
			"Set gateway.auth.password (or OPENCLAW_GATEWAY_PASSWORD), or pass --password.",
			...authHints
		].filter(Boolean).join("\n"));
		defaultRuntime.exit(EXIT_CONFIG_ERROR);
		return;
	}
	if (resolvedAuthMode === "none") gatewayLog.warn("Gateway auth mode=none explicitly configured; all gateway connections are unauthenticated.");
	if (bind !== "loopback" && !hasSharedSecret && !canBootstrapToken && resolvedAuthMode !== "trusted-proxy") {
		defaultRuntime.error([
			`Refusing to bind gateway to ${bind} without auth.`,
			...isContainerEnvironment() ? ["Container environment detected — the gateway defaults to bind=auto (0.0.0.0) for port-forwarding compatibility.", "Set OPENCLAW_GATEWAY_TOKEN or OPENCLAW_GATEWAY_PASSWORD, or pass --token/--password to start with auth."] : ["Set gateway.auth.token/password (or OPENCLAW_GATEWAY_TOKEN/OPENCLAW_GATEWAY_PASSWORD) or pass --token/--password."],
			...authHints
		].filter(Boolean).join("\n"));
		defaultRuntime.exit(EXIT_CONFIG_ERROR);
		return;
	}
	const tailscaleOverride = tailscaleMode || opts.tailscaleResetOnExit ? {
		...tailscaleMode ? { mode: tailscaleMode } : {},
		...opts.tailscaleResetOnExit ? { resetOnExit: true } : {}
	} : void 0;
	gatewayLog.info("starting...");
	startupTrace.mark("cli.gateway-loop");
	const healthHost = await resolveGatewayBindHost(bind, cfg.gateway?.customBindHost);
	const startLoop = async () => await runGatewayLoop({
		runtime: defaultRuntime,
		lockPort: port,
		healthHost,
		start: async ({ startupStartedAt } = {}) => await startGatewayServer(port, {
			bind,
			auth: authOverride,
			tailscale: tailscaleOverride,
			startupStartedAt
		})
	});
	const { detectRespawnSupervisor } = await import("./supervisor-markers-ZIHBPBsP.js");
	const supervisor = detectRespawnSupervisor(process.env);
	try {
		await runGatewayLoopWithSupervisedLockRecovery({
			startLoop,
			supervisor,
			port,
			healthHost,
			log: gatewayLog
		});
	} catch (err) {
		if (isGatewayLockError(err)) {
			const errMessage = formatErrorMessage(err);
			defaultRuntime.error(`Gateway failed to start: ${errMessage}\nIf the gateway is supervised, stop it with: ${formatCliCommand("openclaw gateway stop")}`);
			try {
				const { formatPortDiagnostics, inspectPortUsage } = await import("./ports-DqSSLx5G.js");
				const diagnostics = await inspectPortUsage(port);
				if (diagnostics.status === "busy") for (const line of formatPortDiagnostics(diagnostics)) defaultRuntime.error(line);
			} catch {}
			const { maybeExplainGatewayServiceStop } = await import("./shared-CWFreuOu.js");
			await maybeExplainGatewayServiceStop();
			defaultRuntime.exit(resolveGatewayLockErrorExitCode(err, supervisor));
			return;
		}
		await maybeWriteGatewayStartupFailureBundle(err);
		defaultRuntime.error(`Gateway failed to start: ${String(err)}`);
		defaultRuntime.exit(1);
	}
}
const __testing = {
	normalizeGatewayHealthProbeHost,
	resolveGatewayLockErrorExitCode,
	runGatewayLoopWithSupervisedLockRecovery
};
function addGatewayRunCommand(cmd) {
	return cmd.option("--port <port>", "Port for the gateway WebSocket").option("--bind <mode>", "Bind mode (\"loopback\"|\"lan\"|\"tailnet\"|\"auto\"|\"custom\"). Defaults to config gateway.bind (or loopback).").option("--token <token>", "Shared token required in connect.params.auth.token (default: OPENCLAW_GATEWAY_TOKEN env if set)").option("--auth <mode>", `Gateway auth mode (${formatModeChoices(GATEWAY_AUTH_MODES)})`).option("--password <password>", "Password for auth mode=password").option("--password-file <path>", "Read gateway password from file").option("--tailscale <mode>", `Tailscale exposure mode (${formatModeChoices(GATEWAY_TAILSCALE_MODES)})`).option("--tailscale-reset-on-exit", "Reset Tailscale serve/funnel configuration on shutdown", false).option("--allow-unconfigured", "Allow gateway start without enforcing gateway.mode=local in config (does not repair config)", false).option("--dev", "Create a dev config + workspace if missing (no BOOTSTRAP.md)", false).option("--reset", "Reset dev config + credentials + sessions + workspace (requires --dev)", false).option("--force", "Kill any existing listener on the target port before starting", false).option("--verbose", "Verbose logging to stdout/stderr", false).option("--cli-backend-logs", "Only show CLI backend logs in the console (includes stdout/stderr)", false).option("--claude-cli-logs", "Deprecated alias for --cli-backend-logs", false).option("--ws-log <style>", "WebSocket log style (\"auto\"|\"full\"|\"compact\")", "auto").option("--compact", "Alias for \"--ws-log compact\"", false).option("--raw-stream", "Log raw model stream events to jsonl", false).option("--raw-stream-path <path>", "Raw stream jsonl path").action(async (opts, command) => {
		await runGatewayCommand(resolveGatewayRunOptions(opts, command));
	});
}
//#endregion
export { addGatewayRunCommand as n, __testing as t };
