import { i as defineChannelPluginEntry } from "../../core-Dj4AGPqv.js";
import { b as setMSTeamsRuntime } from "../../graph-users-xiTzgdZR.js";
import { t as msteamsPlugin } from "../../channel-BYEDQGbq.js";
//#region extensions/msteams/index.ts
var msteams_default = defineChannelPluginEntry({
	id: "msteams",
	name: "Microsoft Teams",
	description: "Microsoft Teams channel plugin (Bot Framework)",
	plugin: msteamsPlugin,
	setRuntime: setMSTeamsRuntime
});
//#endregion
export { msteams_default as default, msteamsPlugin, setMSTeamsRuntime };
