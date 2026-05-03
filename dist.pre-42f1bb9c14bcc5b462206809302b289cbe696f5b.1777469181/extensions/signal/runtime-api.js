import { u as normalizeE164 } from "../../utils-BMRcljdi.js";
import { t as formatDocsLink } from "../../links-rWevNMpC.js";
import { t as formatCliCommand } from "../../command-format-BFuugklF.js";
import { r as buildChannelConfigSchema } from "../../config-schema-BEuj464I.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../../account-id-C3j_3_su.js";
import { a as SignalConfigSchema } from "../../zod-schema.providers-core-Bl_XI-8U.js";
import { a as chunkText } from "../../chunk-Bv_ioeL6.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../../config-helpers-BUwww05E.js";
import { n as formatPairingApproveHint } from "../../helpers-CKc1HMZb.js";
import "../../text-runtime-CuPMqcQ0.js";
import { n as emptyPluginConfigSchema } from "../../config-schema-7b31iocI.js";
import { s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../../setup-helpers-Tkd91h7K.js";
import { c as getChatChannelMeta } from "../../core-DaBYR0Qh.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-C4YWgvvI.js";
import { n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy } from "../../runtime-group-policy-xUD2PMwD.js";
import { t as resolveChannelMediaMaxBytes } from "../../media-limits-q5Hb_t71.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-z4cKRnDu.js";
import { c as collectStatusIssuesFromLastError, d as createDefaultChannelRuntimeState, n as buildBaseChannelStatusSummary, t as buildBaseAccountStatusSnapshot } from "../../status-helpers-Bzp8yHOi.js";
import { t as detectBinary } from "../../detect-binary-Cqp5zk7k.js";
import "../../setup-tools-D9_7D63t.js";
import "../../config-runtime-BBHmw9Vx.js";
import "../../reply-runtime-BzkvBQJk.js";
import "../../media-runtime-2i8WkZhB.js";
import "../../channel-status-BJJZu3TS.js";
import { i as resolveSignalAccount, n as listSignalAccountIds, r as resolveDefaultSignalAccountId, t as listEnabledSignalAccounts } from "../../accounts-BtGW42M1.js";
import { d as looksLikeSignalTargetId, f as normalizeSignalMessagingTarget } from "../../identity-L_pCNe_W.js";
import { n as sendReactionSignal, t as removeReactionSignal } from "../../reaction-runtime-api-DCUr_ij0.js";
import { n as resolveSignalReactionLevel, t as signalMessageActions } from "../../message-actions-CZH5ePbj.js";
import "../../config-api-B0C_fNfm.js";
import { n as installSignalCli } from "../../install-signal-cli-BiCyUtw-.js";
import { t as monitorSignalProvider } from "../../monitor-CA8viBTd.js";
import { t as sendMessageSignal } from "../../send-C9FSfoKl.js";
import { t as probeSignal } from "../../probe-D2EDxoMW.js";
//#region extensions/signal/src/runtime.ts
const { setRuntime: setSignalRuntime, clearRuntime: clearSignalRuntime, getRuntime: getSignalRuntime } = createPluginRuntimeStore({
	pluginId: "signal",
	errorMessage: "Signal runtime not initialized"
});
//#endregion
export { DEFAULT_ACCOUNT_ID, PAIRING_APPROVED_MESSAGE, SignalConfigSchema, applyAccountNameToChannelSection, buildBaseAccountStatusSnapshot, buildBaseChannelStatusSummary, buildChannelConfigSchema, chunkText, collectStatusIssuesFromLastError, createDefaultChannelRuntimeState, deleteAccountFromConfigSection, detectBinary, emptyPluginConfigSchema, formatCliCommand, formatDocsLink, formatPairingApproveHint, getChatChannelMeta, installSignalCli, listEnabledSignalAccounts, listSignalAccountIds, looksLikeSignalTargetId, migrateBaseNameToDefaultAccount, monitorSignalProvider, normalizeAccountId, normalizeE164, normalizeSignalMessagingTarget, probeSignal, removeReactionSignal, resolveAllowlistProviderRuntimeGroupPolicy, resolveChannelMediaMaxBytes, resolveDefaultGroupPolicy, resolveDefaultSignalAccountId, resolveSignalAccount, resolveSignalReactionLevel, sendMessageSignal, sendReactionSignal, setAccountEnabledInConfigSection, setSignalRuntime, signalMessageActions };
