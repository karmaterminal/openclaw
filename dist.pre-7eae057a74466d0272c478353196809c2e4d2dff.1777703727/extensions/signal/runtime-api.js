import { u as normalizeE164 } from "../../utils-BMRcljdi.js";
import { t as formatDocsLink } from "../../links-BtCHUQX8.js";
import { t as formatCliCommand } from "../../command-format-CUuNRpiL.js";
import { r as buildChannelConfigSchema } from "../../config-schema-DiJ8qU0S.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../../account-id-BgECLQdh.js";
import { a as SignalConfigSchema } from "../../zod-schema.providers-core-Bp3vv_ly.js";
import { a as chunkText } from "../../chunk-B0UDAWcD.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../../config-helpers-_JhRSMYy.js";
import { n as formatPairingApproveHint } from "../../helpers-nSennZYu.js";
import "../../text-runtime-CCRXVz_8.js";
import { n as emptyPluginConfigSchema } from "../../config-schema-BkNA2J7m.js";
import { s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../../setup-helpers-BccLvWeE.js";
import { c as getChatChannelMeta } from "../../core-B69NAXxD.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-CcRAl6x8.js";
import { n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy } from "../../runtime-group-policy-CprfbzN5.js";
import { t as resolveChannelMediaMaxBytes } from "../../media-limits-CQ77xKpH.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-BzFRA-MK.js";
import { c as collectStatusIssuesFromLastError, d as createDefaultChannelRuntimeState, n as buildBaseChannelStatusSummary, t as buildBaseAccountStatusSnapshot } from "../../status-helpers-Cm_NW4Lp.js";
import { t as detectBinary } from "../../detect-binary-ClY2Pbct.js";
import "../../setup-tools-p2pyBz-y.js";
import "../../config-runtime-DSiWNnvt.js";
import "../../reply-runtime-Yde81PYv.js";
import "../../media-runtime-D0JNIObU.js";
import "../../channel-status-Ci-oF_HA.js";
import { i as resolveSignalAccount, n as listSignalAccountIds, r as resolveDefaultSignalAccountId, t as listEnabledSignalAccounts } from "../../accounts-CJmfOIlN.js";
import { d as looksLikeSignalTargetId, f as normalizeSignalMessagingTarget } from "../../identity-vJGsjPRB.js";
import { n as sendReactionSignal, t as removeReactionSignal } from "../../reaction-runtime-api-Bu29fq1S.js";
import { n as resolveSignalReactionLevel, t as signalMessageActions } from "../../message-actions-CCZyx9ij.js";
import "../../config-api-BUrpofyp.js";
import { n as installSignalCli } from "../../install-signal-cli-CwJTIyx-.js";
import { t as monitorSignalProvider } from "../../monitor-CbJ1GbNQ.js";
import { t as sendMessageSignal } from "../../send-Ch0PRg_P.js";
import { t as probeSignal } from "../../probe-BF_LDcuN.js";
//#region extensions/signal/src/runtime.ts
const { setRuntime: setSignalRuntime, clearRuntime: clearSignalRuntime, getRuntime: getSignalRuntime } = createPluginRuntimeStore({
	pluginId: "signal",
	errorMessage: "Signal runtime not initialized"
});
//#endregion
export { DEFAULT_ACCOUNT_ID, PAIRING_APPROVED_MESSAGE, SignalConfigSchema, applyAccountNameToChannelSection, buildBaseAccountStatusSnapshot, buildBaseChannelStatusSummary, buildChannelConfigSchema, chunkText, collectStatusIssuesFromLastError, createDefaultChannelRuntimeState, deleteAccountFromConfigSection, detectBinary, emptyPluginConfigSchema, formatCliCommand, formatDocsLink, formatPairingApproveHint, getChatChannelMeta, installSignalCli, listEnabledSignalAccounts, listSignalAccountIds, looksLikeSignalTargetId, migrateBaseNameToDefaultAccount, monitorSignalProvider, normalizeAccountId, normalizeE164, normalizeSignalMessagingTarget, probeSignal, removeReactionSignal, resolveAllowlistProviderRuntimeGroupPolicy, resolveChannelMediaMaxBytes, resolveDefaultGroupPolicy, resolveDefaultSignalAccountId, resolveSignalAccount, resolveSignalReactionLevel, sendMessageSignal, sendReactionSignal, setAccountEnabledInConfigSection, setSignalRuntime, signalMessageActions };
