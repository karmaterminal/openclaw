import { p as theme } from "./globals-d3aR1MYC.js";
import "./paths-BMo6kTge.js";
import { d as defaultRuntime } from "./subsystem-Cfn2Pryx.js";
import "./boolean-DtWR5bt3.js";
import { G as writeConfigFile, R as createConfigIO } from "./auth-profiles-g_IwaokD.js";
import { E as ensureAgentWorkspace, _ as DEFAULT_AGENT_WORKSPACE_DIR } from "./agent-scope-C5bklqr1.js";
import { x as shortenHomePath } from "./utils-cwpAMi-t.js";
import "./openclaw-root-BFfBQ6FD.js";
import "./logger-DB-PHqB2.js";
import "./exec-B45rafWZ.js";
import "./registry-BrR1Dq5T.js";
import "./github-copilot-token-Byc_YVYE.js";
import "./host-env-security-lcjXF83D.js";
import "./version-DdJhsIqk.js";
import "./env-vars-mSSOl7Rv.js";
import "./manifest-registry-OQDPluXW.js";
import "./dock-BaM5oTqE.js";
import "./message-channel-CXgeX9no.js";
import "./sessions-hV-TIgW5.js";
import "./plugins-B4AetCpQ.js";
import "./accounts-CucAhPu5.js";
import "./accounts-DarjcXFz.js";
import "./logging-CcxUDNcI.js";
import "./accounts-DjUjM_0M.js";
import { o as resolveSessionTranscriptsDir } from "./paths-DvFmz0MB.js";
import "./chat-envelope-D3RSz140.js";
import "./client-M2XEtYEF.js";
import "./call-BPb_1Wbv.js";
import "./pairing-token-BXrId5bQ.js";
import "./net-DULSGgS2.js";
import "./tailnet-D3gLcYwp.js";
import "./redact-DwuqxSL3.js";
import "./errors-CIvF1JsC.js";
import "./onboard-helpers-DPwYh7mV.js";
import "./prompt-style-BfCTyCoH.js";
import { t as formatDocsLink } from "./links-BVDZVrXu.js";
import { n as runCommandWithRuntime } from "./cli-utils-BKqG4ZT-.js";
import "./progress-BCOseYmX.js";
import { t as hasExplicitOptions } from "./command-options-DVCpMofi.js";
import "./note-nDlrTKjH.js";
import "./clack-prompter-CcxUeG62.js";
import "./runtime-guard-DFO22ThU.js";
import "./onboarding.secret-input-Cfif1VuK.js";
import "./onboarding-DDQmffGE.js";
import { n as logConfigUpdated, t as formatConfigPath } from "./logging-DoGVpb2p.js";
import { t as onboardCommand } from "./onboard-BBM5jSpB.js";
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