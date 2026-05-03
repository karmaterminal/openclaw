import { t as formatDocsLink } from "../links-BtCHUQX8.js";
import { r as buildChannelConfigSchema } from "../config-schema-OPypi1r3.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-C3j_3_su.js";
import { t as createDedupeCache } from "../dedupe-C8W1hL3A.js";
import { c as isBlockedHostnameOrIp, t as SsrFBlockedError } from "../ssrf-Bg0Ww888.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-5Cmu0jDX.js";
import { n as emptyPluginConfigSchema } from "../config-schema-Db8uIJi-.js";
import { l as patchScopedAccountConfig, t as applyAccountNameToChannelSection } from "../setup-helpers-P3bVHWjM.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-D2KHRdRa.js";
import { r as buildComputedAccountStatusSnapshot } from "../status-helpers-C2uknUoo.js";
import { t as createLoggerBackedRuntime } from "../runtime-logger-BQpdDyJA.js";
import "../runtime-Ueu3oxzo.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-DtlXf9Sc.js";
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
