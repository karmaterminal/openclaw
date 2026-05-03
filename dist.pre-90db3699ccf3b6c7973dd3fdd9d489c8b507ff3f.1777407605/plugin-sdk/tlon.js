import { t as formatDocsLink } from "../links-rWevNMpC.js";
import { r as buildChannelConfigSchema } from "../config-schema-Bx16NlRy.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-BM1T6029.js";
import { t as createDedupeCache } from "../dedupe-JnXqffpw.js";
import { c as isBlockedHostnameOrIp, t as SsrFBlockedError } from "../ssrf-CTA9WgMa.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-NDEizKJq.js";
import { n as emptyPluginConfigSchema } from "../config-schema-TbKbeW26.js";
import { l as patchScopedAccountConfig, t as applyAccountNameToChannelSection } from "../setup-helpers-Ch6SdLT5.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-CHJIyDeO.js";
import { r as buildComputedAccountStatusSnapshot } from "../status-helpers-BVCd57BM.js";
import { t as createLoggerBackedRuntime } from "../runtime-logger-CS8OcSPR.js";
import "../runtime-DvXM2Nfv.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-CKSW_MiQ.js";
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
