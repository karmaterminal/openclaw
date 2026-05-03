import { r as buildChannelConfigSchema } from "../../config-schema-Bx16NlRy.js";
import { t as DEFAULT_ACCOUNT_ID } from "../../account-id-BM1T6029.js";
import { r as IMessageConfigSchema } from "../../zod-schema.providers-core-CXjNxjCG.js";
import { p as formatTrimmedAllowFromEntries } from "../../channel-config-helpers-DxAmmyE5.js";
import { c as getChatChannelMeta } from "../../core-DDydeSSz.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-Dsba6C6A.js";
import { t as resolveChannelMediaMaxBytes } from "../../media-limits-Bs05bl9A.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-Cr9eSf6F.js";
import { c as collectStatusIssuesFromLastError, r as buildComputedAccountStatusSnapshot } from "../../status-helpers-BVCd57BM.js";
import "../../media-runtime-BROQDx_g.js";
import { t as chunkTextForOutbound } from "../../text-chunking-NSR9jiEh.js";
import "../../channel-status-BjGMHL-z.js";
import { f as looksLikeIMessageTargetId, h as resolveIMessageConfigDefaultTo, m as resolveIMessageConfigAllowFrom, p as normalizeIMessageMessagingTarget } from "../../conversation-id-DKHOiOgc.js";
import { n as resolveIMessageGroupToolPolicy, t as resolveIMessageGroupRequireMention } from "../../group-policy-ClwKKlqn.js";
import "../../config-api-CFVKoxG7.js";
import { t as probeIMessage } from "../../probe-Dl3CWeIH.js";
import { n as sendMessageIMessage, t as monitorIMessageProvider } from "../../monitor-Di4iuP-j.js";
//#region extensions/imessage/src/runtime.ts
const { setRuntime: setIMessageRuntime, getRuntime: getIMessageRuntime } = createPluginRuntimeStore({
	pluginId: "imessage",
	errorMessage: "iMessage runtime not initialized"
});
//#endregion
export { DEFAULT_ACCOUNT_ID, IMessageConfigSchema, PAIRING_APPROVED_MESSAGE, buildChannelConfigSchema, buildComputedAccountStatusSnapshot, chunkTextForOutbound, collectStatusIssuesFromLastError, formatTrimmedAllowFromEntries, getChatChannelMeta, looksLikeIMessageTargetId, monitorIMessageProvider, normalizeIMessageMessagingTarget, probeIMessage, resolveChannelMediaMaxBytes, resolveIMessageConfigAllowFrom, resolveIMessageConfigDefaultTo, resolveIMessageGroupRequireMention, resolveIMessageGroupToolPolicy, sendMessageIMessage, setIMessageRuntime };
