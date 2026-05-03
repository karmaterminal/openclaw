import { r as discordSetupAdapter, t as createDiscordPluginBase } from "./shared-0TtxEn_Y.js";
import { n as createDiscordSetupWizardProxy } from "./setup-core-DpsOnElS.js";
//#endregion
//#region extensions/discord/src/channel.setup.ts
const discordSetupPlugin = { ...createDiscordPluginBase({
	setupWizard: createDiscordSetupWizardProxy(async () => (await import("./setup-surface-DMLBgH-l.js")).discordSetupWizard),
	setup: discordSetupAdapter
}) };
//#endregion
export { discordSetupPlugin as t };
