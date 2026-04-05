import { cx as deleteMessageTelegram, dx as editMessageTelegram, fx as pinMessageTelegram, gx as sendPollTelegram, hx as sendMessageTelegram, mx as renameForumTopicTelegram, nx as probeTelegram, ux as editMessageReplyMarkupTelegram, vx as sendTypingTelegram, wb as monitorTelegramProvider, yx as unpinMessageTelegram } from "./auth-profiles-D5vQ2NEm.js";
import { t as auditTelegramGroupMembership } from "./audit-CshMOFnq.js";
//#region src/plugins/runtime/runtime-telegram-ops.runtime.ts
const runtimeTelegramOps = {
	auditGroupMembership: auditTelegramGroupMembership,
	probeTelegram,
	sendMessageTelegram,
	sendPollTelegram,
	monitorTelegramProvider,
	typing: { pulse: sendTypingTelegram },
	conversationActions: {
		editMessage: editMessageTelegram,
		editReplyMarkup: editMessageReplyMarkupTelegram,
		deleteMessage: deleteMessageTelegram,
		renameTopic: renameForumTopicTelegram,
		pinMessage: pinMessageTelegram,
		unpinMessage: unpinMessageTelegram
	}
};
//#endregion
export { runtimeTelegramOps };
