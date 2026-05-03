import { h as MarkdownConfigSchema } from "../zod-schema.core-FcJGI_qL.js";
import { r as buildChannelConfigSchema } from "../config-schema-OPypi1r3.js";
import { t as DEFAULT_ACCOUNT_ID } from "../account-id-C3j_3_su.js";
import { t as getPluginRuntimeGatewayRequestScope } from "../gateway-request-scope-UqpPu6mu.js";
import { c as isBlockedHostnameOrIp } from "../ssrf-Bg0Ww888.js";
import { m as mapAllowFromEntries } from "../channel-config-helpers-YfAsHuaY.js";
import { n as formatPairingApproveHint } from "../helpers-B7mjmIZr.js";
import { n as emptyPluginConfigSchema } from "../config-schema-Db8uIJi-.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-D2KHRdRa.js";
import { c as collectStatusIssuesFromLastError, d as createDefaultChannelRuntimeState, r as buildComputedAccountStatusSnapshot } from "../status-helpers-C2uknUoo.js";
import { a as createFixedWindowRateLimiter } from "../webhook-memory-guards-qGIQwy07.js";
import { c as requestBodyErrorToText, o as readJsonBodyWithLimit } from "../http-body-DDG39e3E.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-DtlXf9Sc.js";
import { n as resolveInboundDirectDmAccessWithRuntime, t as createPreCryptoDirectDmAuthorizer } from "../direct-dm-access-BzgEO_U4.js";
import { t as createDirectDmPreCryptoGuardPolicy } from "../direct-dm-guard-policy-Bdogh3w2.js";
import { t as dispatchInboundDirectDmWithRuntime } from "../direct-dm-CbCX0P49.js";
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
