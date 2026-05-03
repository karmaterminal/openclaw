import "./utils-CB8xp0O4.js";
import "./types.secrets-BZ6RGKR0.js";
import "./config-schema-Bx16NlRy.js";
import "./zod-schema.providers-core-CXjNxjCG.js";
import "./file-lock-7-B8nAS7.js";
import "./tokens-CYuOTnyM.js";
import "./mime-Dx8S3QoZ.js";
import "./ssrf-CTA9WgMa.js";
import "./fetch-guard-NDEizKJq.js";
import "./store-BuB7MfIQ.js";
import "./json-store-BYJnVWN1.js";
import "./dm-policy-shared-Bf6mvNz-.js";
import "./history-0EoluzbD.js";
import "./setup-wizard-helpers-D9irczka.js";
import "./channel-reply-pipeline-CHJIyDeO.js";
import "./channel-pairing-Di-QWGuY.js";
import "./status-helpers-BVCd57BM.js";
import "./http-body-CftN9uFX.js";
import { t as createOptionalChannelSetupSurface } from "./channel-setup-CKSW_MiQ.js";
import "./inbound-reply-dispatch-Dqfd9zDA.js";
import "./web-media-BECDdbRC.js";
import "./outbound-media-CfH_b7TM.js";
import "./ssrf-policy-CxFv5uAl.js";
import "./session-envelope-TcviguuT.js";
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
