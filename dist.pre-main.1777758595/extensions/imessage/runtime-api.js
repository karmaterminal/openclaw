import { r as buildChannelConfigSchema } from "../../config-schema-TgszMKRa.js";
import { t as DEFAULT_ACCOUNT_ID } from "../../account-id-N6BXsI_x.js";
import { i as IMessageConfigSchema } from "../../zod-schema.providers-whatsapp-BW6mH-E6.js";
import { p as formatTrimmedAllowFromEntries } from "../../channel-config-helpers-Cc367LxV.js";
import { c as getChatChannelMeta } from "../../core-ClQKvXnF.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-CY3SIBqj.js";
import { t as resolveChannelMediaMaxBytes } from "../../media-limits-CAqTdxOW.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-BuezzYde.js";
import { c as collectStatusIssuesFromLastError, r as buildComputedAccountStatusSnapshot } from "../../status-helpers-xy7hioei.js";
import "../../media-runtime-DPlXhl1Q.js";
import { t as chunkTextForOutbound } from "../../text-chunking-CG5N-QLi.js";
import "../../channel-status-DkZozdKg.js";
import { f as looksLikeIMessageTargetId, h as resolveIMessageConfigDefaultTo, m as resolveIMessageConfigAllowFrom, p as normalizeIMessageMessagingTarget } from "../../conversation-id-DQqFvKbD.js";
import { n as resolveIMessageGroupToolPolicy, t as resolveIMessageGroupRequireMention } from "../../group-policy-DDe5Y2dg.js";
import "../../config-api-D2kQyodm.js";
import { t as probeIMessage } from "../../probe-Bi0jteJa.js";
import { n as sendMessageIMessage, t as monitorIMessageProvider } from "../../monitor-D8JPz8Cn.js";
//#region extensions/imessage/src/runtime.ts
const { setRuntime: setIMessageRuntime, getRuntime: getIMessageRuntime } = createPluginRuntimeStore({
	pluginId: "imessage",
	errorMessage: "iMessage runtime not initialized"
});
//#endregion
export { DEFAULT_ACCOUNT_ID, IMessageConfigSchema, PAIRING_APPROVED_MESSAGE, buildChannelConfigSchema, buildComputedAccountStatusSnapshot, chunkTextForOutbound, collectStatusIssuesFromLastError, formatTrimmedAllowFromEntries, getChatChannelMeta, looksLikeIMessageTargetId, monitorIMessageProvider, normalizeIMessageMessagingTarget, probeIMessage, resolveChannelMediaMaxBytes, resolveIMessageConfigAllowFrom, resolveIMessageConfigDefaultTo, resolveIMessageGroupRequireMention, resolveIMessageGroupToolPolicy, sendMessageIMessage, setIMessageRuntime };
