import "./paths-BBP4yd-2.js";
import { p as theme } from "./globals-DyWRcjQY.js";
import "./utils-xFiJOAuL.js";
import "./thinking-44rmAw5o.js";
import "./agent-scope-Ckfy1eLE.js";
import { d as defaultRuntime } from "./subsystem-D5pRlZe-.js";
import "./openclaw-root-DeEQQJyX.js";
import "./logger-DHGbafYr.js";
import "./exec-XzljJcHM.js";
import "./model-selection-B7i1xwmj.js";
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
import "./pi-embedded-helpers-B8Soklxw.js";
import "./sandbox-DV5q6tDX.js";
import "./tool-catalog-IBWCA-2a.js";
import "./chrome-kG6SrbKs.js";
import "./tailscale-C5C--kZ7.js";
import "./tailnet-DnnT7RoK.js";
import "./ws-B-4c8QAU.js";
import "./auth-5JNASLRO.js";
import "./server-context-BB0KK6cn.js";
import "./frontmatter-CPpXT7mj.js";
import "./skills-K_AvhMjw.js";
import "./path-alias-guards-BzAaCM2k.js";
import "./paths-DsAAtf_q.js";
import "./redact-BqKx9qRR.js";
import "./errors-Cy92QOI2.js";
import "./fs-safe-CzdOncES.js";
import "./proxy-env-C4oZExsB.js";
import "./image-ops-Ch2CLeu6.js";
import "./store-BlIp3Z05.js";
import "./ports-B0WT9bUh.js";
import "./trash-DAtocVs0.js";
import "./server-middleware-zHKzC2fG.js";
import "./accounts-Bs8C-nBJ.js";
import "./accounts-CE4KB6jl.js";
import "./logging-D3KTM1pH.js";
import "./accounts-BeOiY-ju.js";
import "./paths-D24h0XR4.js";
import "./chat-envelope-DL2R5pK6.js";
import "./tool-images-BEtbcBPl.js";
import "./tool-display-Cut-pYoU.js";
import "./commands-ClLhoTSj.js";
import "./commands-registry-C5fQv0Vq.js";
import "./client-DLH71Ght.js";
import "./call-NJPqft7s.js";
import "./pairing-token-9FncM-ur.js";
import { t as formatDocsLink } from "./links-v5kjbUSu.js";
import { t as parseTimeoutMs } from "./parse-timeout-BwFhOmlt.js";
import { t as runTui } from "./tui-DGQGv66F.js";

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