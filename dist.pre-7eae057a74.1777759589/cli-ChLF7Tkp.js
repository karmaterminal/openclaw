import "./globals-d3aR1MYC.js";
import "./paths-BMo6kTge.js";
import { t as createSubsystemLogger } from "./subsystem-Cfn2Pryx.js";
import "./boolean-DtWR5bt3.js";
import { z as loadConfig } from "./auth-profiles-g_IwaokD.js";
import { d as resolveDefaultAgentId, u as resolveAgentWorkspaceDir } from "./agent-scope-C5bklqr1.js";
import "./utils-cwpAMi-t.js";
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
import "./model-B-bAhMoU.js";
import "./pi-model-discovery-CvdRmsym.js";
import "./diagnostic-D7pgTCuh.js";
import "./frontmatter-D2o8_Jfu.js";
import "./skills-Ll6WzK-U.js";
import "./path-alias-guards-DbNvNQar.js";
import "./message-channel-CXgeX9no.js";
import "./sessions-hV-TIgW5.js";
import "./plugins-B4AetCpQ.js";
import "./accounts-CucAhPu5.js";
import "./accounts-DarjcXFz.js";
import "./logging-CcxUDNcI.js";
import "./accounts-DjUjM_0M.js";
import "./send-F79b_xgI.js";
import "./send-CmeKgL86.js";
import { b as loadOpenClawPlugins } from "./subagent-registry-CcvVYXEz.js";
import "./paths-DvFmz0MB.js";
import "./chat-envelope-D3RSz140.js";
import "./client-M2XEtYEF.js";
import "./call-BPb_1Wbv.js";
import "./pairing-token-BXrId5bQ.js";
import "./net-DULSGgS2.js";
import "./tailnet-D3gLcYwp.js";
import "./tokens-BaNa8Czl.js";
import "./with-timeout-C7y9rCBU.js";
import "./deliver-BFW4Exv7.js";
import "./image-ops-WJSAG5_7.js";
import "./send-BzxOHG1J.js";
import "./pi-embedded-helpers-RQ0iakKf.js";
import "./sandbox-Cl58Ljp3.js";
import "./tool-catalog-C04U7H3F.js";
import "./chrome-DEp-MaR1.js";
import "./tailscale-D4zNU-0Q.js";
import "./auth-l3KQ3Wf5.js";
import "./server-context-BxBFV2PX.js";
import "./paths-BaZIBy3U.js";
import "./redact-DwuqxSL3.js";
import "./errors-CIvF1JsC.js";
import "./fs-safe-CYrszQI6.js";
import "./proxy-env-BwTY9-9I.js";
import "./store-OqcrqyHY.js";
import "./ports-DA8HamoF.js";
import "./trash-Dq9t9uID.js";
import "./server-middleware-pRerXlG7.js";
import "./tool-images-J7V8AfTu.js";
import "./thinking-CrcT589P.js";
import "./models-config-CqksOjvw.js";
import "./exec-approvals-allowlist-BaxZHE-6.js";
import "./exec-safe-bin-runtime-policy-B1dCn7MT.js";
import "./model-catalog-Dt1OZnEX.js";
import "./fetch-Ccpbk46-.js";
import "./audio-transcription-runner-pmha7xer.js";
import "./fetch-guard-DDRvavBV.js";
import "./image-CDAh06e7.js";
import "./tool-display-DJA6wQza.js";
import "./api-key-rotation-CEy6dwiS.js";
import "./proxy-fetch-BSCpx7Yz.js";
import "./ir-CaWAARGN.js";
import "./render-CCLsW6Lz.js";
import "./target-errors-D0aWoxbs.js";
import "./commands-CP-eujrx.js";
import "./commands-registry-Dv9wtUA6.js";
import "./fetch-Cep8cXb2.js";
import "./pairing-store-snhsgXYd.js";
import "./exec-approvals-BXpO0clf.js";
import "./nodes-screen-DgvKgDxM.js";
import "./system-run-command-Ep2S-Jvt.js";
import "./session-utils-CH9A_lZm.js";
import "./session-cost-usage-TIBv8Nm4.js";
import "./skill-commands-DF2rjLw-.js";
import "./workspace-dirs-BY9k_sye.js";
import "./channel-activity-DU-F71j2.js";
import "./tables-259SY013.js";
import "./server-lifecycle-bTTCfK_J.js";
import "./stagger-C4U8O7GM.js";
import "./channel-selection-D2KncGab.js";
import "./plugin-auto-enable-Df8kLYca.js";
import "./send-DPI52xKL.js";
import "./outbound-attachment-DgffsfgQ.js";
import "./delivery-queue-Bl-IGZt-.js";
import "./send-C7qgI35q.js";
import "./pi-tools.policy-BBwg980o.js";
import "./proxy-Dgwoliym.js";
import "./runtime-config-collectors-BJXOlzeX.js";
import "./command-secret-targets-B61R-FeR.js";
import "./onboard-helpers-DPwYh7mV.js";
import "./prompt-style-BfCTyCoH.js";
import "./pairing-labels-D9QLH8nt.js";
import "./memory-cli-lYg9IWIg.js";
import "./manager-BwiZYB4Q.js";
import "./query-expansion-DfWHFCTw.js";
import "./links-BVDZVrXu.js";
import "./cli-utils-BKqG4ZT-.js";
import "./help-format-CMlnk7BV.js";
import "./progress-BCOseYmX.js";

//#region src/plugins/cli.ts
const log = createSubsystemLogger("plugins");
function registerPluginCliCommands(program, cfg) {
	const config = cfg ?? loadConfig();
	const workspaceDir = resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
	const logger = {
		info: (msg) => log.info(msg),
		warn: (msg) => log.warn(msg),
		error: (msg) => log.error(msg),
		debug: (msg) => log.debug(msg)
	};
	const registry = loadOpenClawPlugins({
		config,
		workspaceDir,
		logger
	});
	const existingCommands = new Set(program.commands.map((cmd) => cmd.name()));
	for (const entry of registry.cliRegistrars) {
		if (entry.commands.length > 0) {
			const overlaps = entry.commands.filter((command) => existingCommands.has(command));
			if (overlaps.length > 0) {
				log.debug(`plugin CLI register skipped (${entry.pluginId}): command already registered (${overlaps.join(", ")})`);
				continue;
			}
		}
		try {
			const result = entry.register({
				program,
				config,
				workspaceDir,
				logger
			});
			if (result && typeof result.then === "function") result.catch((err) => {
				log.warn(`plugin CLI register failed (${entry.pluginId}): ${String(err)}`);
			});
			for (const command of entry.commands) existingCommands.add(command);
		} catch (err) {
			log.warn(`plugin CLI register failed (${entry.pluginId}): ${String(err)}`);
		}
	}
}

//#endregion
export { registerPluginCliCommands };