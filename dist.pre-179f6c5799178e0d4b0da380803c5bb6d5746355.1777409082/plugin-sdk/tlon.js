import { t as formatDocsLink } from "../links-rWevNMpC.js";
import { r as buildChannelConfigSchema } from "../config-schema-CNOE4EfY.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-DWChvwa8.js";
import { t as createDedupeCache } from "../dedupe-DVPtAyu5.js";
import { c as isBlockedHostnameOrIp, t as SsrFBlockedError } from "../ssrf-vXCRW9rS.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-LAmyTYUM.js";
import { n as emptyPluginConfigSchema } from "../config-schema-2J3lBwCn.js";
import { l as patchScopedAccountConfig, t as applyAccountNameToChannelSection } from "../setup-helpers-D2FCSunP.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-BS4-Z0kM.js";
import { r as buildComputedAccountStatusSnapshot } from "../status-helpers-BJQYcoys.js";
import { t as createLoggerBackedRuntime } from "../runtime-logger-CS8OcSPR.js";
import "../runtime-HQtVK2Zf.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-CiBZcClL.js";
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
