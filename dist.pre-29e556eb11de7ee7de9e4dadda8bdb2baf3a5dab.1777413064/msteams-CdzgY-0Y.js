import "./utils-BMRcljdi.js";
import "./types.secrets-Zn5Zyn7M.js";
import "./config-schema-BEuj464I.js";
import "./zod-schema.providers-core-Bl_XI-8U.js";
import "./file-lock-DUSWWPN-.js";
import "./tokens-CPoUE_99.js";
import "./mime-Zn7U6BSf.js";
import "./ssrf-CD_2fLNF.js";
import "./fetch-guard-CXs9BnMd.js";
import "./store-D9jVYsha.js";
import "./json-store-2Iu09A5k.js";
import "./dm-policy-shared-v2D_A37H.js";
import "./history-Z4nYTT4I.js";
import "./setup-wizard-helpers-SGW0PZbn.js";
import "./channel-reply-pipeline-C1Sr6WWN.js";
import "./channel-pairing-DUoJRg5g.js";
import "./status-helpers-Bzp8yHOi.js";
import "./http-body-q87N2AgC.js";
import { t as createOptionalChannelSetupSurface } from "./channel-setup-DMV0ajOs.js";
import "./inbound-reply-dispatch-CvfK0Zzs.js";
import "./web-media-DXx9hBFH.js";
import "./outbound-media-Cc-64GEa.js";
import "./ssrf-policy-BjvXpuK0.js";
import "./session-envelope-DGAeDCck.js";
//#region src/plugin-sdk/msteams.ts
const msteamsSetup = createOptionalChannelSetupSurface({
	channel: "msteams",
	label: "Microsoft Teams",
	npmSpec: "@openclaw/msteams",
	docsPath: "/channels/msteams"
});
const msteamsSetupWizard = msteamsSetup.setupWizard;
const msteamsSetupAdapter = msteamsSetup.setupAdapter;
//#endregion
export { msteamsSetupWizard as n, msteamsSetupAdapter as t };
