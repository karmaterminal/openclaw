import { r as buildChannelConfigSchema } from "../../config-schema-OPypi1r3.js";
import { t as DEFAULT_ACCOUNT_ID } from "../../account-id-C3j_3_su.js";
import { r as IMessageConfigSchema } from "../../zod-schema.providers-core-pwraLvTt.js";
import { p as formatTrimmedAllowFromEntries } from "../../channel-config-helpers-YfAsHuaY.js";
import { c as getChatChannelMeta } from "../../core-C1EU-l7z.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-kW5p4I7P.js";
import { t as resolveChannelMediaMaxBytes } from "../../media-limits-C5cR4ACY.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-BsYveNuW.js";
import { c as collectStatusIssuesFromLastError, r as buildComputedAccountStatusSnapshot } from "../../status-helpers-C2uknUoo.js";
import "../../media-runtime-DaVIzVv7.js";
import { t as chunkTextForOutbound } from "../../text-chunking-D8yliY5A.js";
import "../../channel-status-Df3aTcDN.js";
import { f as looksLikeIMessageTargetId, h as resolveIMessageConfigDefaultTo, m as resolveIMessageConfigAllowFrom, p as normalizeIMessageMessagingTarget } from "../../conversation-id-B1KI2TiI.js";
import { n as resolveIMessageGroupToolPolicy, t as resolveIMessageGroupRequireMention } from "../../group-policy-Cuvk27AN.js";
import "../../config-api-Ds5QQ06E.js";
import { t as probeIMessage } from "../../probe-CzZbnOfW.js";
import { n as sendMessageIMessage, t as monitorIMessageProvider } from "../../monitor-Dkn_TKTN.js";
//#region extensions/imessage/src/runtime.ts
const { setRuntime: setIMessageRuntime, getRuntime: getIMessageRuntime } = createPluginRuntimeStore({
	pluginId: "imessage",
	errorMessage: "iMessage runtime not initialized"
});
//#endregion
export { DEFAULT_ACCOUNT_ID, IMessageConfigSchema, PAIRING_APPROVED_MESSAGE, buildChannelConfigSchema, buildComputedAccountStatusSnapshot, chunkTextForOutbound, collectStatusIssuesFromLastError, formatTrimmedAllowFromEntries, getChatChannelMeta, looksLikeIMessageTargetId, monitorIMessageProvider, normalizeIMessageMessagingTarget, probeIMessage, resolveChannelMediaMaxBytes, resolveIMessageConfigAllowFrom, resolveIMessageConfigDefaultTo, resolveIMessageGroupRequireMention, resolveIMessageGroupToolPolicy, sendMessageIMessage, setIMessageRuntime };
