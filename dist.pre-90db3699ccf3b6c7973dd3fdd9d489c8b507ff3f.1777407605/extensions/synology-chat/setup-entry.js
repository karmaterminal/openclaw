import { n as defineBundledChannelSetupEntry } from "../../channel-entry-contract-1SvUcAEJ.js";
//#region extensions/synology-chat/setup-entry.ts
var setup_entry_default = defineBundledChannelSetupEntry({
	importMetaUrl: import.meta.url,
	plugin: {
		specifier: "./api.js",
		exportName: "synologyChatPlugin"
	}
});
//#endregion
export { setup_entry_default as default };
