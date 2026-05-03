import { t as formatDocsLink } from "../../links-BszRQhGa.js";
import { t as formatCliCommand } from "../../command-format-BORwwHyH.js";
import { l as normalizeE164 } from "../../utils-DvkbxKCZ.js";
import { r as buildChannelConfigSchema } from "../../config-schema-TgszMKRa.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../../account-id-N6BXsI_x.js";
import { o as SignalConfigSchema } from "../../zod-schema.providers-whatsapp-BW6mH-E6.js";
import { a as chunkText } from "../../chunk-CeexuxRc.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../../config-helpers-DNpVxJ3q.js";
import { n as formatPairingApproveHint } from "../../helpers-DVrEb58F.js";
import "../../text-runtime-D2WyrYir.js";
import { n as emptyPluginConfigSchema } from "../../config-schema-CxwO2vIO.js";
import { s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../../setup-helpers-DB1Y49FN.js";
import { c as getChatChannelMeta } from "../../core-ClQKvXnF.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-CY3SIBqj.js";
import { n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy } from "../../runtime-group-policy-DVRVP6RC.js";
import { t as resolveChannelMediaMaxBytes } from "../../media-limits-CAqTdxOW.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-BuezzYde.js";
import { c as collectStatusIssuesFromLastError, d as createDefaultChannelRuntimeState, n as buildBaseChannelStatusSummary, t as buildBaseAccountStatusSnapshot } from "../../status-helpers-xy7hioei.js";
import { t as detectBinary } from "../../detect-binary-Bk25oYyD.js";
import "../../setup-tools-BwIjJzdN.js";
import "../../reply-runtime-BDIoUX1R.js";
import "../../media-runtime-DPlXhl1Q.js";
import "../../channel-status-DkZozdKg.js";
import { i as resolveSignalAccount, n as listSignalAccountIds, r as resolveDefaultSignalAccountId, t as listEnabledSignalAccounts } from "../../accounts-JDAzJAxF.js";
import { d as looksLikeSignalTargetId, f as normalizeSignalMessagingTarget } from "../../identity-BG1AvHCL.js";
import { n as sendReactionSignal, t as removeReactionSignal } from "../../reaction-runtime-api-WFtsY3xY.js";
import { n as resolveSignalReactionLevel, t as signalMessageActions } from "../../message-actions-D96XE2_s.js";
import "../../config-api-C-PIUzKo.js";
import { r as installSignalCli } from "../../install-signal-cli-CSl9ECgE.js";
import { t as monitorSignalProvider } from "../../monitor-D0evRsnt.js";
import { t as sendMessageSignal } from "../../send-CrlemL_j.js";
import { t as probeSignal } from "../../probe-B1wNoOzS.js";
//#region extensions/signal/src/runtime.ts
const { setRuntime: setSignalRuntime, clearRuntime: clearSignalRuntime, getRuntime: getSignalRuntime } = createPluginRuntimeStore({
	pluginId: "signal",
	errorMessage: "Signal runtime not initialized"
});
//#endregion
export { DEFAULT_ACCOUNT_ID, PAIRING_APPROVED_MESSAGE, SignalConfigSchema, applyAccountNameToChannelSection, buildBaseAccountStatusSnapshot, buildBaseChannelStatusSummary, buildChannelConfigSchema, chunkText, collectStatusIssuesFromLastError, createDefaultChannelRuntimeState, deleteAccountFromConfigSection, detectBinary, emptyPluginConfigSchema, formatCliCommand, formatDocsLink, formatPairingApproveHint, getChatChannelMeta, installSignalCli, listEnabledSignalAccounts, listSignalAccountIds, looksLikeSignalTargetId, migrateBaseNameToDefaultAccount, monitorSignalProvider, normalizeAccountId, normalizeE164, normalizeSignalMessagingTarget, probeSignal, removeReactionSignal, resolveAllowlistProviderRuntimeGroupPolicy, resolveChannelMediaMaxBytes, resolveDefaultGroupPolicy, resolveDefaultSignalAccountId, resolveSignalAccount, resolveSignalReactionLevel, sendMessageSignal, sendReactionSignal, setAccountEnabledInConfigSection, setSignalRuntime, signalMessageActions };
