import "./zod-schema.core-FcJGI_qL.js";
import "./config-schema-OPypi1r3.js";
import "./channel-reply-pipeline-D2KHRdRa.js";
import { t as createOptionalChannelSetupSurface } from "./channel-setup-DtlXf9Sc.js";
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
