import { u as normalizeE164 } from "../../utils-BMRcljdi.js";
import { t as formatDocsLink } from "../../links-rWevNMpC.js";
import { t as formatCliCommand } from "../../command-format-BFuugklF.js";
import { r as buildChannelConfigSchema } from "../../config-schema-CNOE4EfY.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../../account-id-DWChvwa8.js";
import { a as SignalConfigSchema } from "../../zod-schema.providers-core-I4XTf8vQ.js";
import { a as chunkText } from "../../chunk-D2taG7SF.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../../config-helpers-C4ORopgz.js";
import { n as formatPairingApproveHint } from "../../helpers-CdDG09w4.js";
import "../../text-runtime-CF6GykCk.js";
import { n as emptyPluginConfigSchema } from "../../config-schema-2J3lBwCn.js";
import { s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../../setup-helpers-D2FCSunP.js";
import { c as getChatChannelMeta } from "../../core-COMOteeH.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-Cab4vRMl.js";
import { n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy } from "../../runtime-group-policy-C6LDEhXP.js";
import { t as resolveChannelMediaMaxBytes } from "../../media-limits-Dc7-ip3g.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-Bv-ba-Xw.js";
import { c as collectStatusIssuesFromLastError, d as createDefaultChannelRuntimeState, n as buildBaseChannelStatusSummary, t as buildBaseAccountStatusSnapshot } from "../../status-helpers-BJQYcoys.js";
import { t as detectBinary } from "../../detect-binary-D-Kli0z-.js";
import "../../setup-tools-BM2XajXY.js";
import "../../config-runtime-Bqe5387K.js";
import "../../reply-runtime-Bsoi_RaH.js";
import "../../media-runtime-BQUvTrv3.js";
import "../../channel-status-9-kYTv_f.js";
import { i as resolveSignalAccount, n as listSignalAccountIds, r as resolveDefaultSignalAccountId, t as listEnabledSignalAccounts } from "../../accounts-CB9DTp6A.js";
import { d as looksLikeSignalTargetId, f as normalizeSignalMessagingTarget } from "../../identity-CP1rnAKf.js";
import { n as sendReactionSignal, t as removeReactionSignal } from "../../reaction-runtime-api-1Uebf-RW.js";
import { n as resolveSignalReactionLevel, t as signalMessageActions } from "../../message-actions-DFZry9IT.js";
import "../../config-api-VIdemebR.js";
import { n as installSignalCli } from "../../install-signal-cli-BhLd4guG.js";
import { t as monitorSignalProvider } from "../../monitor-dleNOZMM.js";
import { t as sendMessageSignal } from "../../send-Ofid0olR.js";
import { t as probeSignal } from "../../probe-Y-H42ADF.js";
//#region extensions/signal/src/runtime.ts
const { setRuntime: setSignalRuntime, clearRuntime: clearSignalRuntime, getRuntime: getSignalRuntime } = createPluginRuntimeStore({
	pluginId: "signal",
	errorMessage: "Signal runtime not initialized"
});
//#endregion
export { DEFAULT_ACCOUNT_ID, PAIRING_APPROVED_MESSAGE, SignalConfigSchema, applyAccountNameToChannelSection, buildBaseAccountStatusSnapshot, buildBaseChannelStatusSummary, buildChannelConfigSchema, chunkText, collectStatusIssuesFromLastError, createDefaultChannelRuntimeState, deleteAccountFromConfigSection, detectBinary, emptyPluginConfigSchema, formatCliCommand, formatDocsLink, formatPairingApproveHint, getChatChannelMeta, installSignalCli, listEnabledSignalAccounts, listSignalAccountIds, looksLikeSignalTargetId, migrateBaseNameToDefaultAccount, monitorSignalProvider, normalizeAccountId, normalizeE164, normalizeSignalMessagingTarget, probeSignal, removeReactionSignal, resolveAllowlistProviderRuntimeGroupPolicy, resolveChannelMediaMaxBytes, resolveDefaultGroupPolicy, resolveDefaultSignalAccountId, resolveSignalAccount, resolveSignalReactionLevel, sendMessageSignal, sendReactionSignal, setAccountEnabledInConfigSection, setSignalRuntime, signalMessageActions };
