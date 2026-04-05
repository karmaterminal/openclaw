import { HS as listTelegramAccountIds, KS as resolveTelegramAccount, Vb as handleTelegramAction, gx as sendPollTelegram, hx as sendMessageTelegram, kS as resolveTelegramFetch, nt as telegramPlugin, ox as telegramOutbound, rt as setTelegramRuntime, zb as telegramMessageActionRuntime } from "../../auth-profiles-D5vQ2NEm.js";
import { r as makeProxyFetch } from "../../proxy-fetch-Bp45Pwna.js";
import { n as vi } from "../../test.p_J6dB8a-By80XNEz.js";
//#region extensions/telegram/src/bot-message-context.test-harness.ts
const baseTelegramMessageContextConfig = {
	agents: { defaults: {
		model: "anthropic/claude-opus-4-5",
		workspace: "/tmp/openclaw"
	} },
	channels: { telegram: {} },
	messages: { groupChat: { mentionPatterns: [] } }
};
async function buildTelegramMessageContextForTest(params) {
	const { buildTelegramMessageContext } = await import("../../bot-message-context-BbxC-DbM.js");
	return await buildTelegramMessageContext({
		primaryCtx: {
			message: {
				message_id: 1,
				date: 17e8,
				text: "hello",
				from: {
					id: 42,
					first_name: "Alice"
				},
				...params.message
			},
			me: {
				id: 7,
				username: "bot"
			}
		},
		allMedia: params.allMedia ?? [],
		storeAllowFrom: [],
		options: params.options ?? {},
		bot: { api: {
			sendChatAction: vi.fn(),
			setMessageReaction: vi.fn()
		} },
		cfg: params.cfg ?? baseTelegramMessageContextConfig,
		account: { accountId: params.accountId ?? "default" },
		historyLimit: 0,
		groupHistories: /* @__PURE__ */ new Map(),
		dmPolicy: "open",
		allowFrom: [],
		groupAllowFrom: [],
		ackReactionScope: "off",
		logger: { info: vi.fn() },
		resolveGroupActivation: params.resolveGroupActivation ?? (() => void 0),
		resolveGroupRequireMention: params.resolveGroupRequireMention ?? (() => false),
		resolveTelegramGroupConfig: params.resolveTelegramGroupConfig ?? (() => ({
			groupConfig: { requireMention: false },
			topicConfig: void 0
		})),
		sendChatActionHandler: { sendChatAction: vi.fn() }
	});
}
//#endregion
export { buildTelegramMessageContextForTest, handleTelegramAction, listTelegramAccountIds, makeProxyFetch, resolveTelegramAccount, resolveTelegramFetch, sendMessageTelegram, sendPollTelegram, setTelegramRuntime, telegramMessageActionRuntime, telegramOutbound, telegramPlugin };
