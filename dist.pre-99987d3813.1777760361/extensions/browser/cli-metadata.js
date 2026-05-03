import { t as definePluginEntry } from "../../plugin-entry-DX3V0eaU.js";
//#region extensions/browser/cli-metadata.ts
var cli_metadata_default = definePluginEntry({
	id: "browser",
	name: "Browser",
	description: "Default browser tool plugin",
	register(api) {
		api.registerCli(async ({ program }) => {
			const { registerBrowserCli } = await import("../../browser-cli-DL6pLKQG.js");
			registerBrowserCli(program);
		}, { commands: ["browser"] });
	}
});
//#endregion
export { cli_metadata_default as default };
