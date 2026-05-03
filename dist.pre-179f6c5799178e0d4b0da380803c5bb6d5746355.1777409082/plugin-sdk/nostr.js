import { h as MarkdownConfigSchema } from "../zod-schema.core-Bi0Ke4ns.js";
import { r as buildChannelConfigSchema } from "../config-schema-CNOE4EfY.js";
import { t as DEFAULT_ACCOUNT_ID } from "../account-id-DWChvwa8.js";
import { t as getPluginRuntimeGatewayRequestScope } from "../gateway-request-scope-BvqUCFCl.js";
import { c as isBlockedHostnameOrIp } from "../ssrf-vXCRW9rS.js";
import { m as mapAllowFromEntries } from "../channel-config-helpers-BlZJEaPp.js";
import { n as formatPairingApproveHint } from "../helpers-CdDG09w4.js";
import { n as emptyPluginConfigSchema } from "../config-schema-2J3lBwCn.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-BS4-Z0kM.js";
import { c as collectStatusIssuesFromLastError, d as createDefaultChannelRuntimeState, r as buildComputedAccountStatusSnapshot } from "../status-helpers-BJQYcoys.js";
import { a as createFixedWindowRateLimiter } from "../webhook-memory-guards-CUg3C27f.js";
import { c as requestBodyErrorToText, o as readJsonBodyWithLimit } from "../http-body-B24Yv8Dz.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-CiBZcClL.js";
import { n as resolveInboundDirectDmAccessWithRuntime, t as createPreCryptoDirectDmAuthorizer } from "../direct-dm-access-p_4M1NuV.js";
import { t as createDirectDmPreCryptoGuardPolicy } from "../direct-dm-guard-policy-CdoGkUnm.js";
import { t as dispatchInboundDirectDmWithRuntime } from "../direct-dm-NS4KODwW.js";
//#region src/plugin-sdk/nostr.ts
const nostrSetup = createOptionalChannelSetupSurface({
	channel: "nostr",
	label: "Nostr",
	npmSpec: "@openclaw/nostr",
	docsPath: "/channels/nostr"
});
const nostrSetupAdapter = nostrSetup.setupAdapter;
const nostrSetupWizard = nostrSetup.setupWizard;
//#endregion
export { DEFAULT_ACCOUNT_ID, MarkdownConfigSchema, buildChannelConfigSchema, buildComputedAccountStatusSnapshot, collectStatusIssuesFromLastError, createChannelReplyPipeline, createDefaultChannelRuntimeState, createDirectDmPreCryptoGuardPolicy, createFixedWindowRateLimiter, createPreCryptoDirectDmAuthorizer, dispatchInboundDirectDmWithRuntime, emptyPluginConfigSchema, formatPairingApproveHint, getPluginRuntimeGatewayRequestScope, isBlockedHostnameOrIp, mapAllowFromEntries, nostrSetupAdapter, nostrSetupWizard, readJsonBodyWithLimit, requestBodyErrorToText, resolveInboundDirectDmAccessWithRuntime };
