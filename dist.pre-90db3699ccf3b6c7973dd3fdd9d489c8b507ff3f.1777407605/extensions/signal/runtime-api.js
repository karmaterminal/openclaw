import { u as normalizeE164 } from "../../utils-CB8xp0O4.js";
import { t as formatDocsLink } from "../../links-rWevNMpC.js";
import { t as formatCliCommand } from "../../command-format-LSnUCVVF.js";
import { r as buildChannelConfigSchema } from "../../config-schema-Bx16NlRy.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../../account-id-BM1T6029.js";
import { a as SignalConfigSchema } from "../../zod-schema.providers-core-CXjNxjCG.js";
import { a as chunkText } from "../../chunk-Lggyx_kW.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../../config-helpers-BzagItDT.js";
import { n as formatPairingApproveHint } from "../../helpers-DIuSKnxZ.js";
import "../../text-runtime-ITCc6m8o.js";
import { n as emptyPluginConfigSchema } from "../../config-schema-TbKbeW26.js";
import { s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../../setup-helpers-Ch6SdLT5.js";
import { c as getChatChannelMeta } from "../../core-DDydeSSz.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-Dsba6C6A.js";
import { n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy } from "../../runtime-group-policy-D59aD4e1.js";
import { t as resolveChannelMediaMaxBytes } from "../../media-limits-Bs05bl9A.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-Cr9eSf6F.js";
import { c as collectStatusIssuesFromLastError, d as createDefaultChannelRuntimeState, n as buildBaseChannelStatusSummary, t as buildBaseAccountStatusSnapshot } from "../../status-helpers-BVCd57BM.js";
import { t as detectBinary } from "../../detect-binary-DOJsopf7.js";
import "../../setup-tools-qaenEUud.js";
import "../../config-runtime-ByTE4rnO.js";
import "../../reply-runtime-BXjSy1AY.js";
import "../../media-runtime-BROQDx_g.js";
import "../../channel-status-BjGMHL-z.js";
import { i as resolveSignalAccount, n as listSignalAccountIds, r as resolveDefaultSignalAccountId, t as listEnabledSignalAccounts } from "../../accounts-B34fyc6N.js";
import { d as looksLikeSignalTargetId, f as normalizeSignalMessagingTarget } from "../../identity-zSin1HgO.js";
import { n as sendReactionSignal, t as removeReactionSignal } from "../../reaction-runtime-api-DksOss_2.js";
import { n as resolveSignalReactionLevel, t as signalMessageActions } from "../../message-actions-DbZZAXoC.js";
import "../../config-api-DsXiIion.js";
import { n as installSignalCli } from "../../install-signal-cli-a2n9qMHL.js";
import { t as monitorSignalProvider } from "../../monitor-BvN-R_ni.js";
import { t as sendMessageSignal } from "../../send-jApDD3AW.js";
import { t as probeSignal } from "../../probe-DBAg_8bd.js";
//#region extensions/signal/src/runtime.ts
const { setRuntime: setSignalRuntime, clearRuntime: clearSignalRuntime, getRuntime: getSignalRuntime } = createPluginRuntimeStore({
	pluginId: "signal",
	errorMessage: "Signal runtime not initialized"
});
//#endregion
export { DEFAULT_ACCOUNT_ID, PAIRING_APPROVED_MESSAGE, SignalConfigSchema, applyAccountNameToChannelSection, buildBaseAccountStatusSnapshot, buildBaseChannelStatusSummary, buildChannelConfigSchema, chunkText, collectStatusIssuesFromLastError, createDefaultChannelRuntimeState, deleteAccountFromConfigSection, detectBinary, emptyPluginConfigSchema, formatCliCommand, formatDocsLink, formatPairingApproveHint, getChatChannelMeta, installSignalCli, listEnabledSignalAccounts, listSignalAccountIds, looksLikeSignalTargetId, migrateBaseNameToDefaultAccount, monitorSignalProvider, normalizeAccountId, normalizeE164, normalizeSignalMessagingTarget, probeSignal, removeReactionSignal, resolveAllowlistProviderRuntimeGroupPolicy, resolveChannelMediaMaxBytes, resolveDefaultGroupPolicy, resolveDefaultSignalAccountId, resolveSignalAccount, resolveSignalReactionLevel, sendMessageSignal, sendReactionSignal, setAccountEnabledInConfigSection, setSignalRuntime, signalMessageActions };
