import { r as buildChannelConfigSchema } from "../../config-schema-BEuj464I.js";
import { t as DEFAULT_ACCOUNT_ID } from "../../account-id-C3j_3_su.js";
import { r as IMessageConfigSchema } from "../../zod-schema.providers-core-Bl_XI-8U.js";
import { p as formatTrimmedAllowFromEntries } from "../../channel-config-helpers-BNx8Xp72.js";
import { c as getChatChannelMeta } from "../../core-CdtRXy9i.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-C4YWgvvI.js";
import { t as resolveChannelMediaMaxBytes } from "../../media-limits-q5Hb_t71.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-z4cKRnDu.js";
import { c as collectStatusIssuesFromLastError, r as buildComputedAccountStatusSnapshot } from "../../status-helpers-Bzp8yHOi.js";
import "../../media-runtime-2i8WkZhB.js";
import { t as chunkTextForOutbound } from "../../text-chunking-CVRBM2pd.js";
import "../../channel-status-BJJZu3TS.js";
import { f as looksLikeIMessageTargetId, h as resolveIMessageConfigDefaultTo, m as resolveIMessageConfigAllowFrom, p as normalizeIMessageMessagingTarget } from "../../conversation-id--zASS1Bq.js";
import { n as resolveIMessageGroupToolPolicy, t as resolveIMessageGroupRequireMention } from "../../group-policy-DTVOe8Li.js";
import "../../config-api-BtLo7eFh.js";
import { t as probeIMessage } from "../../probe-DvK976Do.js";
import { n as sendMessageIMessage, t as monitorIMessageProvider } from "../../monitor-Dw6GUlHm.js";
//#region extensions/imessage/src/runtime.ts
const { setRuntime: setIMessageRuntime, getRuntime: getIMessageRuntime } = createPluginRuntimeStore({
	pluginId: "imessage",
	errorMessage: "iMessage runtime not initialized"
});
//#endregion
export { DEFAULT_ACCOUNT_ID, IMessageConfigSchema, PAIRING_APPROVED_MESSAGE, buildChannelConfigSchema, buildComputedAccountStatusSnapshot, chunkTextForOutbound, collectStatusIssuesFromLastError, formatTrimmedAllowFromEntries, getChatChannelMeta, looksLikeIMessageTargetId, monitorIMessageProvider, normalizeIMessageMessagingTarget, probeIMessage, resolveChannelMediaMaxBytes, resolveIMessageConfigAllowFrom, resolveIMessageConfigDefaultTo, resolveIMessageGroupRequireMention, resolveIMessageGroupToolPolicy, sendMessageIMessage, setIMessageRuntime };
