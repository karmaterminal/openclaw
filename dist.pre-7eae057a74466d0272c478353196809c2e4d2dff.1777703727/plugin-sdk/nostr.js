import { h as MarkdownConfigSchema } from "../zod-schema.core-CJHlBmEK.js";
import { r as buildChannelConfigSchema } from "../config-schema-DiJ8qU0S.js";
import { t as DEFAULT_ACCOUNT_ID } from "../account-id-BgECLQdh.js";
import { t as getPluginRuntimeGatewayRequestScope } from "../gateway-request-scope-B9VRBd7O.js";
import { c as isBlockedHostnameOrIp } from "../ssrf-8eMK8Dvc.js";
import { m as mapAllowFromEntries } from "../channel-config-helpers-B2n48QFs.js";
import { n as formatPairingApproveHint } from "../helpers-nSennZYu.js";
import { n as emptyPluginConfigSchema } from "../config-schema-BkNA2J7m.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-DXBaPgkC.js";
import { c as collectStatusIssuesFromLastError, d as createDefaultChannelRuntimeState, r as buildComputedAccountStatusSnapshot } from "../status-helpers-Cm_NW4Lp.js";
import { a as createFixedWindowRateLimiter } from "../webhook-memory-guards-pnxsDV-7.js";
import { c as requestBodyErrorToText, o as readJsonBodyWithLimit } from "../http-body-BgcenmrU.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-CjfxAeX0.js";
import { n as resolveInboundDirectDmAccessWithRuntime, t as createPreCryptoDirectDmAuthorizer } from "../direct-dm-access-BTnbZZh4.js";
import { t as createDirectDmPreCryptoGuardPolicy } from "../direct-dm-guard-policy-DKWcPLni.js";
import { t as dispatchInboundDirectDmWithRuntime } from "../direct-dm-A5bJTdoP.js";
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
