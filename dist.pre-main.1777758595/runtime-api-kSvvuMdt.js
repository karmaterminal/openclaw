import { t as createPluginRuntimeStore } from "./runtime-store-CY3SIBqj.js";
import "./channel-policy-D7z0rLhB.js";
import "./channel-pairing-BzjX0Owm.js";
import "./inbound-reply-dispatch-_4eeQQlF.js";
import "./ssrf-runtime-Bl9JVaAD.js";
//#region extensions/nextcloud-talk/src/runtime.ts
const { setRuntime: setNextcloudTalkRuntime, getRuntime: getNextcloudTalkRuntime } = createPluginRuntimeStore({
	pluginId: "nextcloud-talk",
	errorMessage: "Nextcloud Talk runtime not initialized"
});
//#endregion
export { setNextcloudTalkRuntime as n, getNextcloudTalkRuntime as t };
