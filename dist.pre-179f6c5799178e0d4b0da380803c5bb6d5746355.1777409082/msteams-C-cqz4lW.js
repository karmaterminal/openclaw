import "./utils-BMRcljdi.js";
import "./types.secrets-v6szeegc.js";
import "./config-schema-CNOE4EfY.js";
import "./zod-schema.providers-core-I4XTf8vQ.js";
import "./file-lock-OriHUjLv.js";
import "./tokens-Bnib3S4J.js";
import "./mime-DFfgvUW_.js";
import "./ssrf-vXCRW9rS.js";
import "./fetch-guard-LAmyTYUM.js";
import "./store-a6nK9wuy.js";
import "./json-store-Bv5f7usa.js";
import "./dm-policy-shared-C4gD5QZm.js";
import "./history-Da8yvSVB.js";
import "./setup-wizard-helpers-hupe-kT7.js";
import "./channel-reply-pipeline-BS4-Z0kM.js";
import "./channel-pairing-J21HARkM.js";
import "./status-helpers-BJQYcoys.js";
import "./http-body-B24Yv8Dz.js";
import { t as createOptionalChannelSetupSurface } from "./channel-setup-CiBZcClL.js";
import "./inbound-reply-dispatch-CpxBxfEs.js";
import "./web-media-C7qZPF01.js";
import "./outbound-media-fw18dk38.js";
import "./ssrf-policy-CYGp1dOP.js";
import "./session-envelope-C7Z_7mWs.js";
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
