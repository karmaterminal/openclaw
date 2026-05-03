import "./paths-BBP4yd-2.js";
import { p as theme } from "./globals-DyWRcjQY.js";
import "./utils-xFiJOAuL.js";
import "./agent-scope-Ckfy1eLE.js";
import "./subsystem-D5pRlZe-.js";
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
import "./message-channel-Coo3AumC.js";
import "./tailnet-DnnT7RoK.js";
import "./ws-B-4c8QAU.js";
import "./client-DLH71Ght.js";
import "./call-NJPqft7s.js";
import "./pairing-token-9FncM-ur.js";
import "./runtime-config-collectors-FcDxm0lL.js";
import "./command-secret-targets-Cj02j2Fc.js";
import { t as formatDocsLink } from "./links-v5kjbUSu.js";
import { n as registerQrCli } from "./qr-cli-Dwur6dPU.js";

//#region src/cli/clawbot-cli.ts
function registerClawbotCli(program) {
	registerQrCli(program.command("clawbot").description("Legacy clawbot command aliases").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/clawbot", "docs.openclaw.ai/cli/clawbot")}\n`));
}

//#endregion
export { registerClawbotCli };