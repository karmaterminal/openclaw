import { u as normalizeE164 } from "../../utils-BMRcljdi.js";
import { t as formatDocsLink } from "../../links-BtCHUQX8.js";
import { t as formatCliCommand } from "../../command-format-CUuNRpiL.js";
import { r as buildChannelConfigSchema } from "../../config-schema-DiJ8qU0S.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../../account-id-BgECLQdh.js";
import { a as SignalConfigSchema } from "../../zod-schema.providers-core-Bp3vv_ly.js";
import { a as chunkText } from "../../chunk-DirOpFQW.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../../config-helpers-Bk8RR-p3.js";
import { n as formatPairingApproveHint } from "../../helpers-C_fY8blz.js";
import "../../text-runtime-sCmDmQaj.js";
import { n as emptyPluginConfigSchema } from "../../config-schema-BXlA9hLi.js";
import { s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../../setup-helpers-B0_DD2vo.js";
import { c as getChatChannelMeta } from "../../core-DHwMHnZJ.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-Vbuv0fCI.js";
import { n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy } from "../../runtime-group-policy-DgFYGny5.js";
import { t as resolveChannelMediaMaxBytes } from "../../media-limits-Cjg17HFW.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-CU1aIkxt.js";
import { c as collectStatusIssuesFromLastError, d as createDefaultChannelRuntimeState, n as buildBaseChannelStatusSummary, t as buildBaseAccountStatusSnapshot } from "../../status-helpers-BMV2LHcC.js";
import { t as detectBinary } from "../../detect-binary-TKGhrnmU.js";
import "../../setup-tools-BcDFVGxm.js";
import "../../config-runtime-woal72b3.js";
import "../../reply-runtime-U1bfHc8b.js";
import "../../media-runtime-D-hUdXkU.js";
import "../../channel-status-KelYNkeH.js";
import { i as resolveSignalAccount, n as listSignalAccountIds, r as resolveDefaultSignalAccountId, t as listEnabledSignalAccounts } from "../../accounts-DkJQtaMB.js";
import { d as looksLikeSignalTargetId, f as normalizeSignalMessagingTarget } from "../../identity-BjDcSIg_.js";
import { n as sendReactionSignal, t as removeReactionSignal } from "../../reaction-runtime-api-B1gPa5iJ.js";
import { n as resolveSignalReactionLevel, t as signalMessageActions } from "../../message-actions-CTNegspE.js";
import "../../config-api-CiP5e0j2.js";
import { n as installSignalCli } from "../../install-signal-cli-B6_KSUzN.js";
import { t as monitorSignalProvider } from "../../monitor-4q2T5hEi.js";
import { t as sendMessageSignal } from "../../send-DhKqTX_g.js";
import { t as probeSignal } from "../../probe-CJbxcvLZ.js";
//#region extensions/signal/src/runtime.ts
const { setRuntime: setSignalRuntime, clearRuntime: clearSignalRuntime, getRuntime: getSignalRuntime } = createPluginRuntimeStore({
	pluginId: "signal",
	errorMessage: "Signal runtime not initialized"
});
//#endregion
export { DEFAULT_ACCOUNT_ID, PAIRING_APPROVED_MESSAGE, SignalConfigSchema, applyAccountNameToChannelSection, buildBaseAccountStatusSnapshot, buildBaseChannelStatusSummary, buildChannelConfigSchema, chunkText, collectStatusIssuesFromLastError, createDefaultChannelRuntimeState, deleteAccountFromConfigSection, detectBinary, emptyPluginConfigSchema, formatCliCommand, formatDocsLink, formatPairingApproveHint, getChatChannelMeta, installSignalCli, listEnabledSignalAccounts, listSignalAccountIds, looksLikeSignalTargetId, migrateBaseNameToDefaultAccount, monitorSignalProvider, normalizeAccountId, normalizeE164, normalizeSignalMessagingTarget, probeSignal, removeReactionSignal, resolveAllowlistProviderRuntimeGroupPolicy, resolveChannelMediaMaxBytes, resolveDefaultGroupPolicy, resolveDefaultSignalAccountId, resolveSignalAccount, resolveSignalReactionLevel, sendMessageSignal, sendReactionSignal, setAccountEnabledInConfigSection, setSignalRuntime, signalMessageActions };
