import "./paths-BBP4yd-2.js";
import { p as theme } from "./globals-DyWRcjQY.js";
import { S as shortenHomePath } from "./utils-xFiJOAuL.js";
import { E as ensureAgentWorkspace, _ as DEFAULT_AGENT_WORKSPACE_DIR } from "./agent-scope-Ckfy1eLE.js";
import { d as defaultRuntime } from "./subsystem-D5pRlZe-.js";
import "./openclaw-root-DeEQQJyX.js";
import "./logger-DHGbafYr.js";
import "./exec-XzljJcHM.js";
import { Qt as createConfigIO, an as writeConfigFile } from "./model-selection-B7i1xwmj.js";
import "./registry-XafKMtuN.js";
import "./github-copilot-token-b6kJVrW-.js";
import "./boolean-BsqeuxE6.js";
import "./env-BCNBCy-T.js";
import "./host-env-security-DkAVVuaw.js";
import "./env-vars-ausEv-bN.js";
import "./manifest-registry-DiKIwPkg.js";
import "./dock-izkws-7a.js";
import "./message-channel-Coo3AumC.js";
import "./plugins-C-DJ8VF0.js";
import "./sessions-hH4RZHXu.js";
import "./tailnet-DnnT7RoK.js";
import "./ws-B-4c8QAU.js";
import "./redact-BqKx9qRR.js";
import "./errors-Cy92QOI2.js";
import "./accounts-Bs8C-nBJ.js";
import "./accounts-CE4KB6jl.js";
import "./logging-D3KTM1pH.js";
import "./accounts-BeOiY-ju.js";
import { o as resolveSessionTranscriptsDir } from "./paths-D24h0XR4.js";
import "./chat-envelope-DL2R5pK6.js";
import "./client-DLH71Ght.js";
import "./call-NJPqft7s.js";
import "./pairing-token-9FncM-ur.js";
import "./onboard-helpers-CGbA5tJv.js";
import "./prompt-style-DXYtYlg_.js";
import { t as formatDocsLink } from "./links-v5kjbUSu.js";
import { n as runCommandWithRuntime } from "./cli-utils-Ca0KE-dW.js";
import "./progress-BVvswfoL.js";
import "./runtime-guard-D7dA_iBQ.js";
import { t as hasExplicitOptions } from "./command-options-D0bXi5Pl.js";
import "./note-DvFtKTA_.js";
import "./clack-prompter-Bm5AEAXo.js";
import "./onboarding.secret-input-BXitHX_7.js";
import "./onboarding-Bp1WV1ft.js";
import { n as logConfigUpdated, t as formatConfigPath } from "./logging-44hOrQ79.js";
import { t as onboardCommand } from "./onboard-BYFo93hy.js";
import JSON5 from "json5";
import fs from "node:fs/promises";

//#region src/commands/setup.ts
async function readConfigFileRaw(configPath) {
	try {
		const raw = await fs.readFile(configPath, "utf-8");
		const parsed = JSON5.parse(raw);
		if (parsed && typeof parsed === "object") return {
			exists: true,
			parsed
		};
		return {
			exists: true,
			parsed: {}
		};
	} catch {
		return {
			exists: false,
			parsed: {}
		};
	}
}
async function setupCommand(opts, runtime = defaultRuntime) {
	const desiredWorkspace = typeof opts?.workspace === "string" && opts.workspace.trim() ? opts.workspace.trim() : void 0;
	const configPath = createConfigIO().configPath;
	const existingRaw = await readConfigFileRaw(configPath);
	const cfg = existingRaw.parsed;
	const defaults = cfg.agents?.defaults ?? {};
	const workspace = desiredWorkspace ?? defaults.workspace ?? DEFAULT_AGENT_WORKSPACE_DIR;
	const next = {
		...cfg,
		agents: {
			...cfg.agents,
			defaults: {
				...defaults,
				workspace
			}
		}
	};
	if (!existingRaw.exists || defaults.workspace !== workspace) {
		await writeConfigFile(next);
		if (!existingRaw.exists) runtime.log(`Wrote ${formatConfigPath(configPath)}`);
		else logConfigUpdated(runtime, {
			path: configPath,
			suffix: "(set agents.defaults.workspace)"
		});
	} else runtime.log(`Config OK: ${formatConfigPath(configPath)}`);
	const ws = await ensureAgentWorkspace({
		dir: workspace,
		ensureBootstrapFiles: !next.agents?.defaults?.skipBootstrap
	});
	runtime.log(`Workspace OK: ${shortenHomePath(ws.dir)}`);
	const sessionsDir = resolveSessionTranscriptsDir();
	await fs.mkdir(sessionsDir, { recursive: true });
	runtime.log(`Sessions OK: ${shortenHomePath(sessionsDir)}`);
}

//#endregion
//#region src/cli/program/register.setup.ts
function registerSetupCommand(program) {
	program.command("setup").description("Initialize ~/.openclaw/openclaw.json and the agent workspace").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/setup", "docs.openclaw.ai/cli/setup")}\n`).option("--workspace <dir>", "Agent workspace directory (default: ~/.openclaw/workspace; stored as agents.defaults.workspace)").option("--wizard", "Run the interactive onboarding wizard", false).option("--non-interactive", "Run the wizard without prompts", false).option("--mode <mode>", "Wizard mode: local|remote").option("--remote-url <url>", "Remote Gateway WebSocket URL").option("--remote-token <token>", "Remote Gateway token (optional)").action(async (opts, command) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			const hasWizardFlags = hasExplicitOptions(command, [
				"wizard",
				"nonInteractive",
				"mode",
				"remoteUrl",
				"remoteToken"
			]);
			if (opts.wizard || hasWizardFlags) {
				await onboardCommand({
					workspace: opts.workspace,
					nonInteractive: Boolean(opts.nonInteractive),
					mode: opts.mode,
					remoteUrl: opts.remoteUrl,
					remoteToken: opts.remoteToken
				}, defaultRuntime);
				return;
			}
			await setupCommand({ workspace: opts.workspace }, defaultRuntime);
		});
	});
}

//#endregion
export { registerSetupCommand };