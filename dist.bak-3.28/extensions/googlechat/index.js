import { i as defineChannelPluginEntry } from "../../core-Dj4AGPqv.js";
import { n as setGoogleChatRuntime } from "../../runtime-DYswZrWG.js";
import { t as googlechatPlugin } from "../../channel-Ccjb3gt5.js";
//#region extensions/googlechat/index.ts
var googlechat_default = defineChannelPluginEntry({
	id: "googlechat",
	name: "Google Chat",
	description: "OpenClaw Google Chat channel plugin",
	plugin: googlechatPlugin,
	setRuntime: setGoogleChatRuntime
});
//#endregion
export { googlechat_default as default, googlechatPlugin, setGoogleChatRuntime };
