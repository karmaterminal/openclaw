import "./zod-schema.core-BO_PdpIg.js";
import "./config-schema-Bx16NlRy.js";
import "./channel-reply-pipeline-CHJIyDeO.js";
import { t as createOptionalChannelSetupSurface } from "./channel-setup-CKSW_MiQ.js";
//#region src/plugin-sdk/twitch.ts
const twitchSetup = createOptionalChannelSetupSurface({
	channel: "twitch",
	label: "Twitch",
	npmSpec: "@openclaw/twitch"
});
const twitchSetupAdapter = twitchSetup.setupAdapter;
const twitchSetupWizard = twitchSetup.setupWizard;
//#endregion
export { twitchSetupWizard as n, twitchSetupAdapter as t };
