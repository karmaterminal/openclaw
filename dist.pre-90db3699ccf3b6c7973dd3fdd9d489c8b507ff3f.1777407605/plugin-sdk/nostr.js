import { h as MarkdownConfigSchema } from "../zod-schema.core-BO_PdpIg.js";
import { r as buildChannelConfigSchema } from "../config-schema-Bx16NlRy.js";
import { t as DEFAULT_ACCOUNT_ID } from "../account-id-BM1T6029.js";
import { t as getPluginRuntimeGatewayRequestScope } from "../gateway-request-scope-Cc9jmc-3.js";
import { c as isBlockedHostnameOrIp } from "../ssrf-CTA9WgMa.js";
import { n as formatPairingApproveHint } from "../helpers-DIuSKnxZ.js";
import { m as mapAllowFromEntries } from "../channel-config-helpers-DxAmmyE5.js";
import { n as emptyPluginConfigSchema } from "../config-schema-TbKbeW26.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-CHJIyDeO.js";
import { c as collectStatusIssuesFromLastError, d as createDefaultChannelRuntimeState, r as buildComputedAccountStatusSnapshot } from "../status-helpers-BVCd57BM.js";
import { a as createFixedWindowRateLimiter } from "../webhook-memory-guards-DYnKgc_p.js";
import { c as requestBodyErrorToText, o as readJsonBodyWithLimit } from "../http-body-CftN9uFX.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-CKSW_MiQ.js";
import { n as resolveInboundDirectDmAccessWithRuntime, t as createPreCryptoDirectDmAuthorizer } from "../direct-dm-access-Dh47ja3g.js";
import { t as createDirectDmPreCryptoGuardPolicy } from "../direct-dm-guard-policy-Rgf8kOck.js";
import { t as dispatchInboundDirectDmWithRuntime } from "../direct-dm-Dk5TRXZO.js";
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
