import { r as buildChannelConfigSchema } from "../../config-schema-BEuj464I.js";
import { t as DEFAULT_ACCOUNT_ID } from "../../account-id-C3j_3_su.js";
import { r as IMessageConfigSchema } from "../../zod-schema.providers-core-Bl_XI-8U.js";
import { p as formatTrimmedAllowFromEntries } from "../../channel-config-helpers-BNx8Xp72.js";
import { c as getChatChannelMeta } from "../../core-DCephzZb.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-C4YWgvvI.js";
import { t as resolveChannelMediaMaxBytes } from "../../media-limits-q5Hb_t71.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-z4cKRnDu.js";
import { c as collectStatusIssuesFromLastError, r as buildComputedAccountStatusSnapshot } from "../../status-helpers-Bzp8yHOi.js";
import "../../media-runtime-BzBEH2_R.js";
import { t as chunkTextForOutbound } from "../../text-chunking-CUdhVfJz.js";
import "../../channel-status-w5w1G2f1.js";
import { f as looksLikeIMessageTargetId, h as resolveIMessageConfigDefaultTo, m as resolveIMessageConfigAllowFrom, p as normalizeIMessageMessagingTarget } from "../../conversation-id-CZ21eDSp.js";
import { n as resolveIMessageGroupToolPolicy, t as resolveIMessageGroupRequireMention } from "../../group-policy-CUJrKuih.js";
import "../../config-api-CPsEEZvF.js";
import { t as probeIMessage } from "../../probe-CZ6Jsp84.js";
import { n as sendMessageIMessage, t as monitorIMessageProvider } from "../../monitor-DUwZbqKV.js";
//#region extensions/imessage/src/runtime.ts
const { setRuntime: setIMessageRuntime, getRuntime: getIMessageRuntime } = createPluginRuntimeStore({
	pluginId: "imessage",
	errorMessage: "iMessage runtime not initialized"
});
//#endregion
export { DEFAULT_ACCOUNT_ID, IMessageConfigSchema, PAIRING_APPROVED_MESSAGE, buildChannelConfigSchema, buildComputedAccountStatusSnapshot, chunkTextForOutbound, collectStatusIssuesFromLastError, formatTrimmedAllowFromEntries, getChatChannelMeta, looksLikeIMessageTargetId, monitorIMessageProvider, normalizeIMessageMessagingTarget, probeIMessage, resolveChannelMediaMaxBytes, resolveIMessageConfigAllowFrom, resolveIMessageConfigDefaultTo, resolveIMessageGroupRequireMention, resolveIMessageGroupToolPolicy, sendMessageIMessage, setIMessageRuntime };
