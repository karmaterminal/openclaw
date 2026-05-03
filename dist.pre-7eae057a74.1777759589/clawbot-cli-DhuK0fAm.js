import { p as theme } from "./globals-d3aR1MYC.js";
import "./paths-BMo6kTge.js";
import "./subsystem-Cfn2Pryx.js";
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
import "./message-channel-CXgeX9no.js";
import "./client-M2XEtYEF.js";
import "./call-BPb_1Wbv.js";
import "./pairing-token-BXrId5bQ.js";
import "./net-DULSGgS2.js";
import "./tailnet-D3gLcYwp.js";
import "./runtime-config-collectors-BJXOlzeX.js";
import "./command-secret-targets-B61R-FeR.js";
import { t as formatDocsLink } from "./links-BVDZVrXu.js";
import { n as registerQrCli } from "./qr-cli-utRmC2_w.js";

//#region src/cli/clawbot-cli.ts
function registerClawbotCli(program) {
	registerQrCli(program.command("clawbot").description("Legacy clawbot command aliases").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/clawbot", "docs.openclaw.ai/cli/clawbot")}\n`));
}

//#endregion
export { registerClawbotCli };