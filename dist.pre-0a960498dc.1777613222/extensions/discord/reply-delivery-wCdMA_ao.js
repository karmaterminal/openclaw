import { t as __exportAll } from "./rolldown-runtime-DUslC3ob.js";
import { o as resolveDiscordAccount } from "./accounts-zcI4mtzH.js";
import { B as chunkDiscordTextWithMode, F as createDiscordRetryRunner, _ as sendDiscordText, r as buildDiscordSendError } from "./send.shared-CFOP8m1e.js";
import "./send-CTw2NH1Y.js";
import { a as sendWebhookMessageDiscord, i as sendVoiceMessageDiscord, t as sendMessageDiscord } from "./send.outbound-BNBJMkYj.js";
import { t as isLikelyDiscordVideoMedia } from "./media-detection-DCVuPCVh.js";
import { convertMarkdownTables, normalizeOptionalString } from "openclaw/plugin-sdk/text-runtime";
import { resolveSendableOutboundReplyParts, resolveTextChunksWithFallback, sendMediaWithLeadingCaption } from "openclaw/plugin-sdk/reply-payload";
import { resolveRetryConfig, retryAsync } from "openclaw/plugin-sdk/retry-runtime";
import { resolveAgentAvatar } from "openclaw/plugin-sdk/agent-runtime";
import { isSingleUseReplyToMode } from "openclaw/plugin-sdk/reply-reference";
import { getGlobalHookRunner } from "openclaw/plugin-sdk/plugin-runtime";
//#region extensions/discord/src/monitor/reply-delivery.ts
var reply_delivery_exports = /* @__PURE__ */ __exportAll({ deliverDiscordReply: () => deliverDiscordReply });
const DISCORD_DELIVERY_RETRY_DEFAULTS = {
	attempts: 3,
	minDelayMs: 1e3,
	maxDelayMs: 3e4,
	jitter: 0
};
function isRetryableDiscordError(err) {
	const status = err.status ?? err.statusCode;
	return status === 429 || status !== void 0 && status >= 500;
}
function getDiscordRetryAfterMs(err) {
	if (!err || typeof err !== "object") return;
	if ("retryAfter" in err && typeof err.retryAfter === "number" && Number.isFinite(err.retryAfter)) return err.retryAfter * 1e3;
	const retryAfterRaw = err.headers?.["retry-after"];
	if (!retryAfterRaw) return;
	const retryAfterMs = Number(retryAfterRaw) * 1e3;
	return Number.isFinite(retryAfterMs) ? retryAfterMs : void 0;
}
function resolveDeliveryRetryConfig(retry) {
	return resolveRetryConfig(DISCORD_DELIVERY_RETRY_DEFAULTS, retry);
}
async function sendWithRetry(fn, retryConfig) {
	await retryAsync(fn, {
		...retryConfig,
		shouldRetry: (err) => isRetryableDiscordError(err),
		retryAfterMs: getDiscordRetryAfterMs
	});
}
async function sendDiscordMediaOnly(params) {
	await sendWithRetry(() => sendMessageDiscord(params.target, "", {
		cfg: params.cfg,
		token: params.token,
		rest: params.rest,
		mediaUrl: params.mediaUrl,
		accountId: params.accountId,
		mediaLocalRoots: params.mediaLocalRoots,
		replyTo: params.replyTo
	}), params.retryConfig);
}
async function sendDiscordMediaBatch(params) {
	await sendMediaWithLeadingCaption({
		mediaUrls: params.mediaUrls,
		caption: "",
		send: async ({ mediaUrl }) => {
			await sendDiscordMediaOnly({
				target: params.target,
				cfg: params.cfg,
				token: params.token,
				rest: params.rest,
				mediaUrl,
				accountId: params.accountId,
				mediaLocalRoots: params.mediaLocalRoots,
				replyTo: params.replyTo(),
				retryConfig: params.retryConfig
			});
		}
	});
}
async function sendDiscordPayloadText(params) {
	const mode = params.chunkMode ?? "length";
	const chunkLimit = Math.min(params.textLimit ?? 2e3, 2e3);
	const chunks = resolveTextChunksWithFallback(params.text, chunkDiscordTextWithMode(params.text, {
		maxChars: chunkLimit,
		maxLines: params.maxLinesPerMessage,
		chunkMode: mode
	}));
	for (const chunk of chunks) {
		if (!chunk.trim()) continue;
		await sendDiscordChunkWithFallback({
			cfg: params.cfg,
			target: params.target,
			text: chunk,
			token: params.token,
			rest: params.rest,
			accountId: params.accountId,
			maxLinesPerMessage: params.maxLinesPerMessage,
			replyTo: params.resolveReplyTo(),
			binding: params.binding,
			chunkMode: params.chunkMode,
			username: params.username,
			avatarUrl: params.avatarUrl,
			channelId: params.channelId,
			request: params.request,
			retryConfig: params.retryConfig
		});
	}
}
function resolveTargetChannelId(target) {
	if (!target.startsWith("channel:")) return;
	return target.slice(8).trim() || void 0;
}
function resolveBoundThreadBinding(params) {
	const sessionKey = params.sessionKey?.trim();
	if (!params.threadBindings || !sessionKey) return;
	const bindings = params.threadBindings.listBySessionKey(sessionKey);
	if (bindings.length === 0) return;
	const targetChannelId = resolveTargetChannelId(params.target);
	if (!targetChannelId) return;
	return bindings.find((entry) => entry.threadId === targetChannelId);
}
function createPayloadReplyToResolver(params) {
	const payloadReplyTo = normalizeOptionalString(params.payload.replyToId);
	const allowExplicitReplyWhenOff = Boolean(payloadReplyTo && (params.payload.replyToTag || params.payload.replyToCurrent));
	if (!payloadReplyTo || params.replyToMode === "off" && !allowExplicitReplyWhenOff) return params.resolveFallbackReplyTo;
	let payloadReplyUsed = false;
	return () => {
		if (params.replyToMode === "all") return payloadReplyTo;
		if (payloadReplyUsed) return;
		payloadReplyUsed = true;
		return payloadReplyTo;
	};
}
function resolveMessageSendingHookReplyToId(params) {
	const payloadReplyTo = normalizeOptionalString(params.payload.replyToId);
	const allowExplicitReplyWhenOff = Boolean(payloadReplyTo && (params.payload.replyToTag || params.payload.replyToCurrent));
	if (payloadReplyTo && (params.replyToMode !== "off" || allowExplicitReplyWhenOff)) return payloadReplyTo;
	if (!params.fallbackReplyTo) return;
	if (!isSingleUseReplyToMode(params.replyToMode)) return params.fallbackReplyTo;
	return params.fallbackReplyUsed ? void 0 : params.fallbackReplyTo;
}
function resolveBindingPersona(cfg, binding) {
	if (!binding) return {};
	const username = (`🤖 ${binding.label?.trim() || binding.agentId}`.trim() || "🤖 agent").slice(0, 80);
	let avatarUrl;
	try {
		const avatar = resolveAgentAvatar(cfg, binding.agentId);
		if (avatar.kind === "remote") avatarUrl = avatar.url;
	} catch {
		avatarUrl = void 0;
	}
	return {
		username,
		avatarUrl
	};
}
async function sendDiscordChunkWithFallback(params) {
	if (!params.text.trim()) return;
	const text = params.text;
	const binding = params.binding;
	if (binding?.webhookId && binding?.webhookToken) try {
		await sendWebhookMessageDiscord(text, {
			cfg: params.cfg,
			webhookId: binding.webhookId,
			webhookToken: binding.webhookToken,
			accountId: binding.accountId,
			threadId: binding.threadId,
			replyTo: params.replyTo,
			username: params.username,
			avatarUrl: params.avatarUrl
		});
		return;
	} catch {}
	if (params.channelId && params.request && params.rest) {
		const { channelId, request, rest } = params;
		try {
			await sendWithRetry(() => sendDiscordText(rest, channelId, text, params.replyTo, request, params.maxLinesPerMessage, void 0, void 0, params.chunkMode), params.retryConfig);
		} catch (err) {
			throw await buildDiscordSendError(err, {
				channelId,
				cfg: params.cfg,
				rest,
				token: params.token,
				hasMedia: false
			});
		}
		return;
	}
	await sendWithRetry(() => sendMessageDiscord(params.target, text, {
		cfg: params.cfg,
		token: params.token,
		rest: params.rest,
		accountId: params.accountId,
		replyTo: params.replyTo
	}), params.retryConfig);
}
async function deliverDiscordReply(params) {
	const replyTo = normalizeOptionalString(params.replyToId);
	const replyToMode = params.replyToMode ?? "all";
	const replyOnce = isSingleUseReplyToMode(replyToMode);
	let replyUsed = false;
	const resolveReplyTo = () => {
		if (!replyTo) return;
		if (!replyOnce) return replyTo;
		if (replyUsed) return;
		replyUsed = true;
		return replyTo;
	};
	const binding = resolveBoundThreadBinding({
		threadBindings: params.threadBindings,
		sessionKey: params.sessionKey,
		target: params.target
	});
	const persona = resolveBindingPersona(params.cfg, binding);
	const channelId = resolveTargetChannelId(params.target);
	const account = resolveDiscordAccount({
		cfg: params.cfg,
		accountId: params.accountId
	});
	const retryConfig = resolveDeliveryRetryConfig(account.config.retry);
	const request = channelId ? createDiscordRetryRunner({ configRetry: account.config.retry }) : void 0;
	const hookRunner = getGlobalHookRunner();
	const hasMessageSendingHooks = hookRunner?.hasHooks("message_sending") ?? false;
	const hookConversationId = channelId ?? params.target;
	let deliveredAny = false;
	for (const payload of params.replies) {
		const resolvePayloadReplyTo = createPayloadReplyToResolver({
			payload,
			replyToMode,
			resolveFallbackReplyTo: resolveReplyTo
		});
		const tableMode = params.tableMode ?? "code";
		let effectiveText = payload.text ?? "";
		if (hasMessageSendingHooks) try {
			const hookResult = await hookRunner?.runMessageSending({
				to: hookConversationId,
				content: effectiveText,
				replyToId: resolveMessageSendingHookReplyToId({
					payload,
					replyToMode,
					fallbackReplyTo: replyTo,
					fallbackReplyUsed: replyUsed
				}),
				metadata: {
					channel: "discord",
					mediaUrls: payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : void 0)
				}
			}, {
				channelId: "discord",
				accountId: params.accountId,
				conversationId: hookConversationId
			});
			if (hookResult?.cancel) continue;
			if (typeof hookResult?.content === "string") effectiveText = hookResult.content;
		} catch (error) {
			params.runtime.error?.(`discord: message_sending hook failed: ${error instanceof Error ? error.message : String(error)}`);
		}
		const reply = resolveSendableOutboundReplyParts({
			...payload,
			text: effectiveText
		}, { text: convertMarkdownTables(effectiveText, tableMode) });
		if (!reply.hasContent) continue;
		const sendReplyText = async () => sendDiscordPayloadText({
			cfg: params.cfg,
			target: params.target,
			text: reply.text,
			token: params.token,
			rest: params.rest,
			accountId: params.accountId,
			textLimit: params.textLimit,
			maxLinesPerMessage: params.maxLinesPerMessage,
			resolveReplyTo: resolvePayloadReplyTo,
			binding,
			chunkMode: params.chunkMode,
			username: persona.username,
			avatarUrl: persona.avatarUrl,
			channelId,
			request,
			retryConfig
		});
		const sendReplyMediaBatch = async (mediaUrls) => sendDiscordMediaBatch({
			target: params.target,
			cfg: params.cfg,
			token: params.token,
			rest: params.rest,
			mediaUrls,
			accountId: params.accountId,
			mediaLocalRoots: params.mediaLocalRoots,
			replyTo: resolvePayloadReplyTo,
			retryConfig
		});
		if (!reply.hasMedia) {
			await sendReplyText();
			if (reply.text.trim()) deliveredAny = true;
			continue;
		}
		const firstMedia = reply.mediaUrls[0];
		if (!firstMedia) continue;
		if (payload.audioAsVoice) {
			const replyTo = resolvePayloadReplyTo();
			await sendVoiceMessageDiscord(params.target, firstMedia, {
				cfg: params.cfg,
				token: params.token,
				rest: params.rest,
				accountId: params.accountId,
				replyTo
			});
			deliveredAny = true;
			await sendReplyText();
			await sendReplyMediaBatch(reply.mediaUrls.slice(1));
			continue;
		}
		if (reply.text.trim().length > 0 && reply.mediaUrls.some((mediaUrl) => isLikelyDiscordVideoMedia(mediaUrl))) {
			await sendReplyText();
			await sendReplyMediaBatch(reply.mediaUrls);
			deliveredAny = true;
			continue;
		}
		await sendMediaWithLeadingCaption({
			mediaUrls: reply.mediaUrls,
			caption: reply.text,
			send: async ({ mediaUrl, caption }) => {
				const replyTo = resolvePayloadReplyTo();
				await sendWithRetry(() => sendMessageDiscord(params.target, caption ?? "", {
					cfg: params.cfg,
					token: params.token,
					rest: params.rest,
					mediaUrl,
					accountId: params.accountId,
					mediaLocalRoots: params.mediaLocalRoots,
					replyTo
				}), retryConfig);
			}
		});
		deliveredAny = true;
	}
	if (binding && deliveredAny) params.threadBindings?.touchThread?.({ threadId: binding.threadId });
}
//#endregion
export { reply_delivery_exports as n, deliverDiscordReply as t };
