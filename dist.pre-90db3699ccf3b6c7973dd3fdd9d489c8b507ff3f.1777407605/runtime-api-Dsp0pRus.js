import "./core-DDydeSSz.js";
import "./secret-input-JwBw_WR_.js";
import { t as createPluginRuntimeStore } from "./runtime-store-Dsba6C6A.js";
import "./channel-reply-pipeline-CHJIyDeO.js";
import "./channel-pairing-Di-QWGuY.js";
import "./status-helpers-BVCd57BM.js";
import "./webhook-ingress-BwLHLxph.js";
import "./runtime-DvXM2Nfv.js";
import "./setup-BGN2-Hqs.js";
import "./config-runtime-ByTE4rnO.js";
import "./command-auth-RVe99jtw.js";
import "./channel-feedback-vVPd4ob-.js";
import "./channel-status-BjGMHL-z.js";
//#region extensions/zalo/src/runtime.ts
const { setRuntime: setZaloRuntime, getRuntime: getZaloRuntime } = createPluginRuntimeStore({
	pluginId: "zalo",
	errorMessage: "Zalo runtime not initialized"
});
//#endregion
export { setZaloRuntime as n, getZaloRuntime as t };
