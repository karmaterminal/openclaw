import "./paths-BBP4yd-2.js";
import "./globals-DyWRcjQY.js";
import "./subsystem-D5pRlZe-.js";
import "./logger-DHGbafYr.js";
import "./exec-XzljJcHM.js";
import "./host-env-security-DkAVVuaw.js";
import "./env-vars-ausEv-bN.js";
import "./prompt-style-DXYtYlg_.js";
import "./runtime-guard-D7dA_iBQ.js";
import "./note-DvFtKTA_.js";
import { n as gatewayInstallErrorHint, t as buildGatewayInstallPlan } from "./daemon-install-helpers-D5NMA9o1.js";
import { r as isGatewayDaemonRuntime, t as DEFAULT_GATEWAY_DAEMON_RUNTIME } from "./daemon-runtime-Di8BSZyD.js";
import { r as isSystemdUserServiceAvailable } from "./systemd-cgAk9Bno.js";
import { t as resolveGatewayService } from "./service-D8_YsP_f.js";
import { n as ensureSystemdUserLingerNonInteractive } from "./systemd-linger-CqWzq8hm.js";

//#region src/commands/onboard-non-interactive/local/daemon-install.ts
async function installGatewayDaemonNonInteractive(params) {
	const { opts, runtime, port, gatewayToken } = params;
	if (!opts.installDaemon) return;
	const daemonRuntimeRaw = opts.daemonRuntime ?? DEFAULT_GATEWAY_DAEMON_RUNTIME;
	const systemdAvailable = process.platform === "linux" ? await isSystemdUserServiceAvailable() : true;
	if (process.platform === "linux" && !systemdAvailable) {
		runtime.log("Systemd user services are unavailable; skipping service install.");
		return;
	}
	if (!isGatewayDaemonRuntime(daemonRuntimeRaw)) {
		runtime.error("Invalid --daemon-runtime (use node or bun)");
		runtime.exit(1);
		return;
	}
	const service = resolveGatewayService();
	const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan({
		env: process.env,
		port,
		token: gatewayToken,
		runtime: daemonRuntimeRaw,
		warn: (message) => runtime.log(message),
		config: params.nextConfig
	});
	try {
		await service.install({
			env: process.env,
			stdout: process.stdout,
			programArguments,
			workingDirectory,
			environment
		});
	} catch (err) {
		runtime.error(`Gateway service install failed: ${String(err)}`);
		runtime.log(gatewayInstallErrorHint());
		return;
	}
	await ensureSystemdUserLingerNonInteractive({ runtime });
}

//#endregion
export { installGatewayDaemonNonInteractive };