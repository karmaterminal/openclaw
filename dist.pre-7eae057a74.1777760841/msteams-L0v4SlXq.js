import "./utils-BMRcljdi.js";
import "./types.secrets-D9j6Z-gp.js";
import "./config-schema-DiJ8qU0S.js";
import "./zod-schema.providers-core-Bp3vv_ly.js";
import "./file-lock-Bq8diIYl.js";
import "./json-store-DwYA_55u.js";
import "./tokens-DO03xcy8.js";
import "./ssrf-BidpExjG.js";
import "./mime-D8DgGtqn.js";
import "./store-kajRw-Xe.js";
import "./fetch-guard-CGnRnlqc.js";
import "./dm-policy-shared-Ciwm0oRz.js";
import "./history-Crp6YXHh.js";
import "./setup-wizard-helpers-DRvZV2lB.js";
import "./channel-reply-pipeline-CR0pMzMv.js";
import "./channel-pairing-KFP6Mlrw.js";
import "./status-helpers-BMV2LHcC.js";
import "./http-body-Dhs0DUZa.js";
import { t as createOptionalChannelSetupSurface } from "./channel-setup-B-EEngUV.js";
import "./inbound-reply-dispatch-BjplYw4t.js";
import "./web-media-CxJHnDS2.js";
import "./outbound-media-B5_ejkO_.js";
import "./ssrf-policy-C7B9ULn6.js";
import "./session-envelope-B0b8K_Y5.js";
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
