import "./zod-schema.core-CJHlBmEK.js";
import "./config-schema-DiJ8qU0S.js";
import "./channel-reply-pipeline-DXBaPgkC.js";
import { t as createOptionalChannelSetupSurface } from "./channel-setup-CjfxAeX0.js";
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
