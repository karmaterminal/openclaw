import { u as normalizeE164 } from "../../utils-BMRcljdi.js";
import { t as formatDocsLink } from "../../links-BtCHUQX8.js";
import { t as formatCliCommand } from "../../command-format-CUuNRpiL.js";
import { r as buildChannelConfigSchema } from "../../config-schema-OPypi1r3.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../../account-id-C3j_3_su.js";
import { a as SignalConfigSchema } from "../../zod-schema.providers-core-pwraLvTt.js";
import { a as chunkText } from "../../chunk-CORXSw8W.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../../config-helpers-xGgW25ph.js";
import { n as formatPairingApproveHint } from "../../helpers-B7mjmIZr.js";
import "../../text-runtime-BK-9rIrb.js";
import { n as emptyPluginConfigSchema } from "../../config-schema-Db8uIJi-.js";
import { s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../../setup-helpers-P3bVHWjM.js";
import { c as getChatChannelMeta } from "../../core-C1EU-l7z.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-kW5p4I7P.js";
import { n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy } from "../../runtime-group-policy-CX-BIMex.js";
import { t as resolveChannelMediaMaxBytes } from "../../media-limits-C5cR4ACY.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-BsYveNuW.js";
import { c as collectStatusIssuesFromLastError, d as createDefaultChannelRuntimeState, n as buildBaseChannelStatusSummary, t as buildBaseAccountStatusSnapshot } from "../../status-helpers-C2uknUoo.js";
import { t as detectBinary } from "../../detect-binary-B2ZZiHfQ.js";
import "../../setup-tools-BUcPJIQE.js";
import "../../config-runtime-B11iimxT.js";
import "../../reply-runtime-B5w3PKwX.js";
import "../../media-runtime-DaVIzVv7.js";
import "../../channel-status-Df3aTcDN.js";
import { i as resolveSignalAccount, n as listSignalAccountIds, r as resolveDefaultSignalAccountId, t as listEnabledSignalAccounts } from "../../accounts-D5bFhFbX.js";
import { d as looksLikeSignalTargetId, f as normalizeSignalMessagingTarget } from "../../identity-DzBLE6D0.js";
import { n as sendReactionSignal, t as removeReactionSignal } from "../../reaction-runtime-api-Bik3AYaq.js";
import { n as resolveSignalReactionLevel, t as signalMessageActions } from "../../message-actions-fkzaRaFC.js";
import "../../config-api-Cs3VZaXL.js";
import { n as installSignalCli } from "../../install-signal-cli-CnAKsDOo.js";
import { t as monitorSignalProvider } from "../../monitor-BLexaNJv.js";
import { t as sendMessageSignal } from "../../send-CI2Xp6NC.js";
import { t as probeSignal } from "../../probe-a7Mz6u6N.js";
//#region extensions/signal/src/runtime.ts
const { setRuntime: setSignalRuntime, clearRuntime: clearSignalRuntime, getRuntime: getSignalRuntime } = createPluginRuntimeStore({
	pluginId: "signal",
	errorMessage: "Signal runtime not initialized"
});
//#endregion
export { DEFAULT_ACCOUNT_ID, PAIRING_APPROVED_MESSAGE, SignalConfigSchema, applyAccountNameToChannelSection, buildBaseAccountStatusSnapshot, buildBaseChannelStatusSummary, buildChannelConfigSchema, chunkText, collectStatusIssuesFromLastError, createDefaultChannelRuntimeState, deleteAccountFromConfigSection, detectBinary, emptyPluginConfigSchema, formatCliCommand, formatDocsLink, formatPairingApproveHint, getChatChannelMeta, installSignalCli, listEnabledSignalAccounts, listSignalAccountIds, looksLikeSignalTargetId, migrateBaseNameToDefaultAccount, monitorSignalProvider, normalizeAccountId, normalizeE164, normalizeSignalMessagingTarget, probeSignal, removeReactionSignal, resolveAllowlistProviderRuntimeGroupPolicy, resolveChannelMediaMaxBytes, resolveDefaultGroupPolicy, resolveDefaultSignalAccountId, resolveSignalAccount, resolveSignalReactionLevel, sendMessageSignal, sendReactionSignal, setAccountEnabledInConfigSection, setSignalRuntime, signalMessageActions };
