import { r as discordSetupAdapter, t as createDiscordPluginBase } from "./shared-Hnp1X5Hn.js";
import { n as createDiscordSetupWizardProxy } from "./setup-core-DlJaz-Lj.js";
//#endregion
//#region extensions/discord/src/channel.setup.ts
const discordSetupPlugin = { ...createDiscordPluginBase({
	setupWizard: createDiscordSetupWizardProxy(async () => (await import("./setup-surface-Cnk7pB6x.js")).discordSetupWizard),
	setup: discordSetupAdapter
}) };
//#endregion
export { discordSetupPlugin as t };
