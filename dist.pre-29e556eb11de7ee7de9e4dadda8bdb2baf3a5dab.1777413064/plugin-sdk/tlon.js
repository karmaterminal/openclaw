import { t as formatDocsLink } from "../links-rWevNMpC.js";
import { r as buildChannelConfigSchema } from "../config-schema-BEuj464I.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-C3j_3_su.js";
import { t as createDedupeCache } from "../dedupe-CjwkdrbQ.js";
import { c as isBlockedHostnameOrIp, t as SsrFBlockedError } from "../ssrf-CD_2fLNF.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-CXs9BnMd.js";
import { n as emptyPluginConfigSchema } from "../config-schema-7b31iocI.js";
import { l as patchScopedAccountConfig, t as applyAccountNameToChannelSection } from "../setup-helpers-Tkd91h7K.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-C1Sr6WWN.js";
import { r as buildComputedAccountStatusSnapshot } from "../status-helpers-Bzp8yHOi.js";
import { t as createLoggerBackedRuntime } from "../runtime-logger-CQdLrD-f.js";
import "../runtime-DIqNnahC.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-DMV0ajOs.js";
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
