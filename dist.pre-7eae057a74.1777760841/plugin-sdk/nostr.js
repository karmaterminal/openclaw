import { h as MarkdownConfigSchema } from "../zod-schema.core-CJHlBmEK.js";
import { r as buildChannelConfigSchema } from "../config-schema-DiJ8qU0S.js";
import { t as DEFAULT_ACCOUNT_ID } from "../account-id-BgECLQdh.js";
import { t as getPluginRuntimeGatewayRequestScope } from "../gateway-request-scope-B9VRBd7O.js";
import { c as isBlockedHostnameOrIp } from "../ssrf-BidpExjG.js";
import { m as mapAllowFromEntries } from "../channel-config-helpers-DphJPnKQ.js";
import { n as formatPairingApproveHint } from "../helpers-C_fY8blz.js";
import { n as emptyPluginConfigSchema } from "../config-schema-BXlA9hLi.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-CR0pMzMv.js";
import { c as collectStatusIssuesFromLastError, d as createDefaultChannelRuntimeState, r as buildComputedAccountStatusSnapshot } from "../status-helpers-BMV2LHcC.js";
import { a as createFixedWindowRateLimiter } from "../webhook-memory-guards-BZNBTI_m.js";
import { c as requestBodyErrorToText, o as readJsonBodyWithLimit } from "../http-body-Dhs0DUZa.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-B-EEngUV.js";
import { n as resolveInboundDirectDmAccessWithRuntime, t as createPreCryptoDirectDmAuthorizer } from "../direct-dm-access-4Lr1wsro.js";
import { t as createDirectDmPreCryptoGuardPolicy } from "../direct-dm-guard-policy-BhjDTF-C.js";
import { t as dispatchInboundDirectDmWithRuntime } from "../direct-dm-CQgr9-pF.js";
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
