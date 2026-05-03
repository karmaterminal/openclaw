import { r as buildChannelConfigSchema } from "../../config-schema-DiJ8qU0S.js";
import { t as DEFAULT_ACCOUNT_ID } from "../../account-id-BgECLQdh.js";
import { r as IMessageConfigSchema } from "../../zod-schema.providers-core-Bp3vv_ly.js";
import { p as formatTrimmedAllowFromEntries } from "../../channel-config-helpers-DphJPnKQ.js";
import { c as getChatChannelMeta } from "../../core-DHwMHnZJ.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-Vbuv0fCI.js";
import { t as resolveChannelMediaMaxBytes } from "../../media-limits-Cjg17HFW.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-CU1aIkxt.js";
import { c as collectStatusIssuesFromLastError, r as buildComputedAccountStatusSnapshot } from "../../status-helpers-BMV2LHcC.js";
import "../../media-runtime-D-hUdXkU.js";
import { t as chunkTextForOutbound } from "../../text-chunking-DYoPYUFQ.js";
import "../../channel-status-KelYNkeH.js";
import { f as looksLikeIMessageTargetId, h as resolveIMessageConfigDefaultTo, m as resolveIMessageConfigAllowFrom, p as normalizeIMessageMessagingTarget } from "../../conversation-id-BIfphyVd.js";
import { n as resolveIMessageGroupToolPolicy, t as resolveIMessageGroupRequireMention } from "../../group-policy-CNmHObDu.js";
import "../../config-api-BmhmVum6.js";
import { t as probeIMessage } from "../../probe-D2oEvB5U.js";
import { n as sendMessageIMessage, t as monitorIMessageProvider } from "../../monitor-B3ELdfHL.js";
//#region extensions/imessage/src/runtime.ts
const { setRuntime: setIMessageRuntime, getRuntime: getIMessageRuntime } = createPluginRuntimeStore({
	pluginId: "imessage",
	errorMessage: "iMessage runtime not initialized"
});
//#endregion
export { DEFAULT_ACCOUNT_ID, IMessageConfigSchema, PAIRING_APPROVED_MESSAGE, buildChannelConfigSchema, buildComputedAccountStatusSnapshot, chunkTextForOutbound, collectStatusIssuesFromLastError, formatTrimmedAllowFromEntries, getChatChannelMeta, looksLikeIMessageTargetId, monitorIMessageProvider, normalizeIMessageMessagingTarget, probeIMessage, resolveChannelMediaMaxBytes, resolveIMessageConfigAllowFrom, resolveIMessageConfigDefaultTo, resolveIMessageGroupRequireMention, resolveIMessageGroupToolPolicy, sendMessageIMessage, setIMessageRuntime };
