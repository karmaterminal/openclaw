import { r as buildChannelConfigSchema } from "../../config-schema-DiJ8qU0S.js";
import { t as DEFAULT_ACCOUNT_ID } from "../../account-id-BgECLQdh.js";
import { r as IMessageConfigSchema } from "../../zod-schema.providers-core-Bp3vv_ly.js";
import { p as formatTrimmedAllowFromEntries } from "../../channel-config-helpers-B2n48QFs.js";
import { c as getChatChannelMeta } from "../../core-B69NAXxD.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-CcRAl6x8.js";
import { t as resolveChannelMediaMaxBytes } from "../../media-limits-CQ77xKpH.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-BzFRA-MK.js";
import { c as collectStatusIssuesFromLastError, r as buildComputedAccountStatusSnapshot } from "../../status-helpers-Cm_NW4Lp.js";
import "../../media-runtime-D0JNIObU.js";
import { t as chunkTextForOutbound } from "../../text-chunking-4eYeKebf.js";
import "../../channel-status-Ci-oF_HA.js";
import { f as looksLikeIMessageTargetId, h as resolveIMessageConfigDefaultTo, m as resolveIMessageConfigAllowFrom, p as normalizeIMessageMessagingTarget } from "../../conversation-id-B2KC5gsn.js";
import { n as resolveIMessageGroupToolPolicy, t as resolveIMessageGroupRequireMention } from "../../group-policy-D893tYRz.js";
import "../../config-api-Bu8LAzOc.js";
import { t as probeIMessage } from "../../probe-B-RNUm5Z.js";
import { n as sendMessageIMessage, t as monitorIMessageProvider } from "../../monitor-C_9qUek8.js";
//#region extensions/imessage/src/runtime.ts
const { setRuntime: setIMessageRuntime, getRuntime: getIMessageRuntime } = createPluginRuntimeStore({
	pluginId: "imessage",
	errorMessage: "iMessage runtime not initialized"
});
//#endregion
export { DEFAULT_ACCOUNT_ID, IMessageConfigSchema, PAIRING_APPROVED_MESSAGE, buildChannelConfigSchema, buildComputedAccountStatusSnapshot, chunkTextForOutbound, collectStatusIssuesFromLastError, formatTrimmedAllowFromEntries, getChatChannelMeta, looksLikeIMessageTargetId, monitorIMessageProvider, normalizeIMessageMessagingTarget, probeIMessage, resolveChannelMediaMaxBytes, resolveIMessageConfigAllowFrom, resolveIMessageConfigDefaultTo, resolveIMessageGroupRequireMention, resolveIMessageGroupToolPolicy, sendMessageIMessage, setIMessageRuntime };
