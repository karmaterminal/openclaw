import "./utils-BMRcljdi.js";
import "./types.secrets-D9j6Z-gp.js";
import "./config-schema-OPypi1r3.js";
import "./zod-schema.providers-core-pwraLvTt.js";
import "./file-lock-Bq8diIYl.js";
import "./tokens-2Eginc2V.js";
import "./mime-CeX1JZPE.js";
import "./ssrf-Bg0Ww888.js";
import "./fetch-guard-5Cmu0jDX.js";
import "./store-vYYFxkgL.js";
import "./json-store-DWWxbjPN.js";
import "./dm-policy-shared-BJth4iHD.js";
import "./history-qf0oL3B1.js";
import "./setup-wizard-helpers-xYUM67Xd.js";
import "./channel-reply-pipeline-D2KHRdRa.js";
import "./channel-pairing-_Cp-CTX3.js";
import "./status-helpers-C2uknUoo.js";
import "./http-body-DDG39e3E.js";
import { t as createOptionalChannelSetupSurface } from "./channel-setup-DtlXf9Sc.js";
import "./inbound-reply-dispatch-CNBoxzcA.js";
import "./web-media-CSQ8_52c.js";
import "./outbound-media-CYC6XJ8s.js";
import "./ssrf-policy-4hVeW7dY.js";
import "./session-envelope-DEzAABRA.js";
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
