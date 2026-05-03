import "./zod-schema.core-Bi0Ke4ns.js";
import "./config-schema-CNOE4EfY.js";
import "./channel-reply-pipeline-BS4-Z0kM.js";
import { t as createOptionalChannelSetupSurface } from "./channel-setup-CiBZcClL.js";
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
