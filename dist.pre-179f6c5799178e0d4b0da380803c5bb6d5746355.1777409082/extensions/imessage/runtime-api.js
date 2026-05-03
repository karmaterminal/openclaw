import { r as buildChannelConfigSchema } from "../../config-schema-CNOE4EfY.js";
import { t as DEFAULT_ACCOUNT_ID } from "../../account-id-DWChvwa8.js";
import { r as IMessageConfigSchema } from "../../zod-schema.providers-core-I4XTf8vQ.js";
import { p as formatTrimmedAllowFromEntries } from "../../channel-config-helpers-BlZJEaPp.js";
import { c as getChatChannelMeta } from "../../core-COMOteeH.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-Cab4vRMl.js";
import { t as resolveChannelMediaMaxBytes } from "../../media-limits-Dc7-ip3g.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-Bv-ba-Xw.js";
import { c as collectStatusIssuesFromLastError, r as buildComputedAccountStatusSnapshot } from "../../status-helpers-BJQYcoys.js";
import "../../media-runtime-BQUvTrv3.js";
import { t as chunkTextForOutbound } from "../../text-chunking-Do7UsKJv.js";
import "../../channel-status-9-kYTv_f.js";
import { f as looksLikeIMessageTargetId, h as resolveIMessageConfigDefaultTo, m as resolveIMessageConfigAllowFrom, p as normalizeIMessageMessagingTarget } from "../../conversation-id-CIDoFOwY.js";
import { n as resolveIMessageGroupToolPolicy, t as resolveIMessageGroupRequireMention } from "../../group-policy-CuA1my8o.js";
import "../../config-api-ai4_sAJJ.js";
import { t as probeIMessage } from "../../probe-Cq1m6Dad.js";
import { n as sendMessageIMessage, t as monitorIMessageProvider } from "../../monitor-G_6zcfL4.js";
//#region extensions/imessage/src/runtime.ts
const { setRuntime: setIMessageRuntime, getRuntime: getIMessageRuntime } = createPluginRuntimeStore({
	pluginId: "imessage",
	errorMessage: "iMessage runtime not initialized"
});
//#endregion
export { DEFAULT_ACCOUNT_ID, IMessageConfigSchema, PAIRING_APPROVED_MESSAGE, buildChannelConfigSchema, buildComputedAccountStatusSnapshot, chunkTextForOutbound, collectStatusIssuesFromLastError, formatTrimmedAllowFromEntries, getChatChannelMeta, looksLikeIMessageTargetId, monitorIMessageProvider, normalizeIMessageMessagingTarget, probeIMessage, resolveChannelMediaMaxBytes, resolveIMessageConfigAllowFrom, resolveIMessageConfigDefaultTo, resolveIMessageGroupRequireMention, resolveIMessageGroupToolPolicy, sendMessageIMessage, setIMessageRuntime };
