import "./provider-model-shared-BPfrxqlL.js";
import "./core-DDydeSSz.js";
import "./routing-CZjbUqB7.js";
import { t as createPluginRuntimeStore } from "./runtime-store-Dsba6C6A.js";
import "./channel-policy-2eyveIG3.js";
import "./reply-history-NultQhuT.js";
import "./channel-reply-pipeline-CHJIyDeO.js";
import "./channel-pairing-Di-QWGuY.js";
import "./webhook-targets-C2_Acim_.js";
import "./webhook-ingress-BwLHLxph.js";
import "./setup-BGN2-Hqs.js";
import "./config-runtime-ByTE4rnO.js";
import "./agent-media-payload-WYmo6Cbe.js";
import "./outbound-media-CfH_b7TM.js";
import "./media-runtime-BROQDx_g.js";
import "./browser-node-runtime-CFwMI8MX.js";
import "./command-auth-RVe99jtw.js";
import "./channel-feedback-vVPd4ob-.js";
import "./channel-inbound-0OBSRlEu.js";
import "./channel-lifecycle-PfyBOUVe.js";
import "./channel-status-BjGMHL-z.js";
//#region extensions/mattermost/src/runtime.ts
const { setRuntime: setMattermostRuntime, getRuntime: getMattermostRuntime } = createPluginRuntimeStore({
	pluginId: "mattermost",
	errorMessage: "Mattermost runtime not initialized"
});
//#endregion
export { setMattermostRuntime as n, getMattermostRuntime as t };
