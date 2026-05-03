import { t as formatDocsLink } from "../links-BtCHUQX8.js";
import { r as buildChannelConfigSchema } from "../config-schema-DiJ8qU0S.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-BgECLQdh.js";
import { t as createDedupeCache } from "../dedupe-C8W1hL3A.js";
import { c as isBlockedHostnameOrIp, t as SsrFBlockedError } from "../ssrf-8eMK8Dvc.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-CyazlQiu.js";
import { n as emptyPluginConfigSchema } from "../config-schema-BkNA2J7m.js";
import { l as patchScopedAccountConfig, t as applyAccountNameToChannelSection } from "../setup-helpers-BccLvWeE.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-DXBaPgkC.js";
import { r as buildComputedAccountStatusSnapshot } from "../status-helpers-Cm_NW4Lp.js";
import { t as createLoggerBackedRuntime } from "../runtime-logger-DLNIg0B9.js";
import "../runtime-CY5yHOVc.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-CjfxAeX0.js";
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
