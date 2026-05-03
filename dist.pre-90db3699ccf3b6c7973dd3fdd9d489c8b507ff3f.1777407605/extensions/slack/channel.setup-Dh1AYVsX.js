import { a as createSlackPluginBase, r as slackSetupAdapter } from "./setup-core-CDAEG5TM.js";
import { n as slackSetupWizard } from "./setup-surface-BUEcXP9b.js";
//#region extensions/slack/src/channel.setup.ts
const slackSetupPlugin = { ...createSlackPluginBase({
	setupWizard: slackSetupWizard,
	setup: slackSetupAdapter
}) };
//#endregion
export { slackSetupPlugin as t };
