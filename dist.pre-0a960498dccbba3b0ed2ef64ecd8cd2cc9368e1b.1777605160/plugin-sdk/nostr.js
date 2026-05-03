import { h as MarkdownConfigSchema } from "../zod-schema.core-BR1v7ukx.js";
import { r as buildChannelConfigSchema } from "../config-schema-BEuj464I.js";
import { t as DEFAULT_ACCOUNT_ID } from "../account-id-C3j_3_su.js";
import { t as getPluginRuntimeGatewayRequestScope } from "../gateway-request-scope-D6nplzWA.js";
import { c as isBlockedHostnameOrIp } from "../ssrf-CD_2fLNF.js";
import { m as mapAllowFromEntries } from "../channel-config-helpers-BNx8Xp72.js";
import { n as formatPairingApproveHint } from "../helpers-CKc1HMZb.js";
import { n as emptyPluginConfigSchema } from "../config-schema-7b31iocI.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-C1Sr6WWN.js";
import { c as collectStatusIssuesFromLastError, d as createDefaultChannelRuntimeState, r as buildComputedAccountStatusSnapshot } from "../status-helpers-Bzp8yHOi.js";
import { a as createFixedWindowRateLimiter } from "../webhook-memory-guards-C94unUdy.js";
import { c as requestBodyErrorToText, o as readJsonBodyWithLimit } from "../http-body-q87N2AgC.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-DMV0ajOs.js";
import { n as resolveInboundDirectDmAccessWithRuntime, t as createPreCryptoDirectDmAuthorizer } from "../direct-dm-access-3rDVJ095.js";
import { t as createDirectDmPreCryptoGuardPolicy } from "../direct-dm-guard-policy-krUC9pOl.js";
import { t as dispatchInboundDirectDmWithRuntime } from "../direct-dm-Bq1Z1YWX.js";
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
