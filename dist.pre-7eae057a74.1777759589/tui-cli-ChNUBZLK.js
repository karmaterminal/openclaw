import { p as theme } from "./globals-d3aR1MYC.js";
import "./paths-BMo6kTge.js";
import { d as defaultRuntime } from "./subsystem-Cfn2Pryx.js";
import "./boolean-DtWR5bt3.js";
import "./auth-profiles-g_IwaokD.js";
import "./agent-scope-C5bklqr1.js";
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
import "./paths-DvFmz0MB.js";
import "./chat-envelope-D3RSz140.js";
import "./client-M2XEtYEF.js";
import "./call-BPb_1Wbv.js";
import "./pairing-token-BXrId5bQ.js";
import "./net-DULSGgS2.js";
import "./tailnet-D3gLcYwp.js";
import "./image-ops-WJSAG5_7.js";
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
import "./tool-display-DJA6wQza.js";
import "./commands-CP-eujrx.js";
import "./commands-registry-Dv9wtUA6.js";
import { t as parseTimeoutMs } from "./parse-timeout-DUdeaMqF.js";
import { t as formatDocsLink } from "./links-BVDZVrXu.js";
import { t as runTui } from "./tui-wSgeEpkA.js";

//#region src/cli/tui-cli.ts
function registerTuiCli(program) {
	program.command("tui").description("Open a terminal UI connected to the Gateway").option("--url <url>", "Gateway WebSocket URL (defaults to gateway.remote.url when configured)").option("--token <token>", "Gateway token (if required)").option("--password <password>", "Gateway password (if required)").option("--session <key>", "Session key (default: \"main\", or \"global\" when scope is global)").option("--deliver", "Deliver assistant replies", false).option("--thinking <level>", "Thinking level override").option("--message <text>", "Send an initial message after connecting").option("--timeout-ms <ms>", "Agent timeout in ms (defaults to agents.defaults.timeoutSeconds)").option("--history-limit <n>", "History entries to load", "200").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/tui", "docs.openclaw.ai/cli/tui")}\n`).action(async (opts) => {
		try {
			const timeoutMs = parseTimeoutMs(opts.timeoutMs);
			if (opts.timeoutMs !== void 0 && timeoutMs === void 0) defaultRuntime.error(`warning: invalid --timeout-ms "${String(opts.timeoutMs)}"; ignoring`);
			const historyLimit = Number.parseInt(String(opts.historyLimit ?? "200"), 10);
			await runTui({
				url: opts.url,
				token: opts.token,
				password: opts.password,
				session: opts.session,
				deliver: Boolean(opts.deliver),
				thinking: opts.thinking,
				message: opts.message,
				timeoutMs,
				historyLimit: Number.isNaN(historyLimit) ? void 0 : historyLimit
			});
		} catch (err) {
			defaultRuntime.error(String(err));
			defaultRuntime.exit(1);
		}
	});
}

//#endregion
export { registerTuiCli };