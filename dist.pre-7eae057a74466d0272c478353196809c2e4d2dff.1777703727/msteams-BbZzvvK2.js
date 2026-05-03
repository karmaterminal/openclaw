import "./utils-BMRcljdi.js";
import "./types.secrets-D9j6Z-gp.js";
import "./config-schema-DiJ8qU0S.js";
import "./zod-schema.providers-core-Bp3vv_ly.js";
import "./file-lock-Bq8diIYl.js";
import "./json-store-DwYA_55u.js";
import "./tokens-DXgGSqoY.js";
import "./ssrf-8eMK8Dvc.js";
import "./mime-i5lfz-pp.js";
import "./store-B7x3wVnO.js";
import "./fetch-guard-CyazlQiu.js";
import "./dm-policy-shared-DYG5WBEw.js";
import "./history-BYuHwMo0.js";
import "./setup-wizard-helpers-BUrFPAqw.js";
import "./channel-reply-pipeline-DXBaPgkC.js";
import "./channel-pairing-CeFF5BgJ.js";
import "./status-helpers-Cm_NW4Lp.js";
import "./http-body-BgcenmrU.js";
import { t as createOptionalChannelSetupSurface } from "./channel-setup-CjfxAeX0.js";
import "./inbound-reply-dispatch-C2MdnHcx.js";
import "./web-media-DpaCXSOO.js";
import "./outbound-media-D0xJ-HSU.js";
import "./ssrf-policy-0KQNa5MO.js";
import "./session-envelope-Z0cVpbJK.js";
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
