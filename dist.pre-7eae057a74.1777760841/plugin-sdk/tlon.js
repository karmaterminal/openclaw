import { t as formatDocsLink } from "../links-BtCHUQX8.js";
import { r as buildChannelConfigSchema } from "../config-schema-DiJ8qU0S.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-BgECLQdh.js";
import { t as createDedupeCache } from "../dedupe-C8W1hL3A.js";
import { c as isBlockedHostnameOrIp, t as SsrFBlockedError } from "../ssrf-BidpExjG.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-CGnRnlqc.js";
import { n as emptyPluginConfigSchema } from "../config-schema-BXlA9hLi.js";
import { l as patchScopedAccountConfig, t as applyAccountNameToChannelSection } from "../setup-helpers-B0_DD2vo.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-CR0pMzMv.js";
import { r as buildComputedAccountStatusSnapshot } from "../status-helpers-BMV2LHcC.js";
import { t as createLoggerBackedRuntime } from "../runtime-logger-Gf_roBPb.js";
import "../runtime-C6XMvKiI.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-B-EEngUV.js";
//#region src/plugin-sdk/tlon.ts
const tlonSetup = createOptionalChannelSetupSurface({
	channel: "tlon",
	label: "Tlon",
	npmSpec: "@openclaw/tlon",
	docsPath: "/channels/tlon"
});
const tlonSetupAdapter = tlonSetup.setupAdapter;
const tlonSetupWizard = tlonSetup.setupWizard;
//#endregion
export { DEFAULT_ACCOUNT_ID, SsrFBlockedError, applyAccountNameToChannelSection, buildChannelConfigSchema, buildComputedAccountStatusSnapshot, createChannelReplyPipeline, createDedupeCache, createLoggerBackedRuntime, emptyPluginConfigSchema, fetchWithSsrFGuard, formatDocsLink, isBlockedHostnameOrIp, normalizeAccountId, patchScopedAccountConfig, tlonSetupAdapter, tlonSetupWizard };
