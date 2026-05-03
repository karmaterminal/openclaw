import { t as createPluginRuntimeStore } from "./runtime-store-kW5p4I7P.js";
import "./nextcloud-talk-Bm8lJVeQ.js";
//#region extensions/nextcloud-talk/src/runtime.ts
const { setRuntime: setNextcloudTalkRuntime, getRuntime: getNextcloudTalkRuntime } = createPluginRuntimeStore({
	pluginId: "nextcloud-talk",
	errorMessage: "Nextcloud Talk runtime not initialized"
});
//#endregion
export { setNextcloudTalkRuntime as n, getNextcloudTalkRuntime as t };
