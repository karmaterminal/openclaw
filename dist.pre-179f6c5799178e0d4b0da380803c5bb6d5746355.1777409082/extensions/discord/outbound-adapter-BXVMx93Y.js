import { c as readDiscordComponentSpec } from "./components-AfY8KcWW.js";
import { r as normalizeDiscordOutboundTarget } from "./normalize-BQWlVVjB.js";
import { normalizeOptionalString, normalizeOptionalStringifiedId } from "openclaw/plugin-sdk/text-runtime";
import { resolvePayloadMediaUrls, sendPayloadMediaSequenceOrFallback, sendTextMediaPayload } from "openclaw/plugin-sdk/reply-payload";
import { resolveOutboundSendDep } from "openclaw/plugin-sdk/outbound-runtime";
import { attachChannelToResult, createAttachedChannelResultAdapter } from "openclaw/plugin-sdk/channel-send-result";
//#region extensions/discord/src/outbound-adapter.ts
const DISCORD_TEXT_CHUNK_LIMIT = 2e3;
let discordSendRuntimePromise;
let discordComponentSendPromise;
let discordSharedInteractivePromise;
let discordThreadBindingsPromise;
async function loadDiscordSendRuntime() {
	discordSendRuntimePromise ??= import("./send-CTw2NH1Y.js").then((n) => n.t);
	return await discordSendRuntimePromise;
}
async function sendDiscordComponentMessageLazy(...args) {
	discordComponentSendPromise ??= import("./send.components-Bkin0cOr.js").then((n) => n.i).then((module) => module.sendDiscordComponentMessage);
	return await (await discordComponentSendPromise)(...args);
}
function loadDiscordSharedInteractive() {
	discordSharedInteractivePromise ??= import("./shared-interactive-pfg65cbH.js").then((n) => n.r);
	return discordSharedInteractivePromise;
}
function loadDiscordThreadBindings() {
	discordThreadBindingsPromise ??= import("./thread-bindings-BzAlWNf8.js").then((n) => n.t);
	return discordThreadBindingsPromise;
}
function hasApprovalChannelData(payload) {
	const channelData = payload.channelData;
	if (!channelData || typeof channelData !== "object" || Array.isArray(channelData)) return false;
	return Boolean(channelData.execApproval);
}
function neutralizeDiscordApprovalMentions(value) {
	return value.replace(/@everyone/gi, "@​everyone").replace(/@here/gi, "@​here").replace(/<@/g, "<@​").replace(/<#/g, "<#​");
}
function normalizeDiscordApprovalPayload(payload) {
	return hasApprovalChannelData(payload) && payload.text ? {
		...payload,
		text: neutralizeDiscordApprovalMentions(payload.text)
	} : payload;
}
function resolveDiscordOutboundTarget(params) {
	if (params.threadId == null) return params.to;
	const threadId = normalizeOptionalStringifiedId(params.threadId) ?? "";
	if (!threadId) return params.to;
	return `channel:${threadId}`;
}
function resolveDiscordWebhookIdentity(params) {
	const usernameRaw = normalizeOptionalString(params.identity?.name);
	const fallbackUsername = normalizeOptionalString(params.binding.label) ?? params.binding.agentId;
	return {
		username: (usernameRaw || fallbackUsername || "").slice(0, 80) || void 0,
		avatarUrl: normalizeOptionalString(params.identity?.avatarUrl)
	};
}
async function maybeSendDiscordWebhookText(params) {
	if (params.threadId == null) return null;
	const threadId = normalizeOptionalStringifiedId(params.threadId) ?? "";
	if (!threadId) return null;
	const { getThreadBindingManager } = await loadDiscordThreadBindings();
	const manager = getThreadBindingManager(params.accountId ?? void 0);
	if (!manager) return null;
	const binding = manager.getByThreadId(threadId);
	if (!binding?.webhookId || !binding?.webhookToken) return null;
	const persona = resolveDiscordWebhookIdentity({
		identity: params.identity,
		binding
	});
	const { sendWebhookMessageDiscord } = await loadDiscordSendRuntime();
	return await sendWebhookMessageDiscord(params.text, {
		webhookId: binding.webhookId,
		webhookToken: binding.webhookToken,
		accountId: binding.accountId,
		threadId: binding.threadId,
		cfg: params.cfg,
		replyTo: params.replyToId ?? void 0,
		username: persona.username,
		avatarUrl: persona.avatarUrl
	});
}
const discordOutbound = {
	deliveryMode: "direct",
	chunker: null,
	textChunkLimit: DISCORD_TEXT_CHUNK_LIMIT,
	pollMaxOptions: 10,
	normalizePayload: ({ payload }) => normalizeDiscordApprovalPayload(payload),
	presentationCapabilities: {
		supported: true,
		buttons: true,
		selects: true,
		context: true,
		divider: true
	},
	renderPresentation: async ({ payload, presentation }) => {
		const componentSpec = (await loadDiscordSharedInteractive()).buildDiscordPresentationComponents(presentation);
		if (!componentSpec) return null;
		return {
			...payload,
			channelData: {
				...payload.channelData,
				discord: {
					...payload.channelData?.discord,
					presentationComponents: componentSpec
				}
			}
		};
	},
	resolveTarget: ({ to }) => normalizeDiscordOutboundTarget(to),
	sendPayload: async (ctx) => {
		const payload = normalizeDiscordApprovalPayload({
			...ctx.payload,
			text: ctx.payload.text ?? ""
		});
		const discordData = payload.channelData?.discord;
		const rawComponentSpec = discordData?.presentationComponents ?? readDiscordComponentSpec(discordData?.components) ?? (payload.interactive ? (await loadDiscordSharedInteractive()).buildDiscordInteractiveComponents(payload.interactive) : void 0);
		const componentSpec = rawComponentSpec ? rawComponentSpec.text ? rawComponentSpec : {
			...rawComponentSpec,
			text: payload.text?.trim() ? payload.text : void 0
		} : void 0;
		if (!componentSpec) return await sendTextMediaPayload({
			channel: "discord",
			ctx: {
				...ctx,
				payload
			},
			adapter: discordOutbound
		});
		const send = resolveOutboundSendDep(ctx.deps, "discord") ?? (await loadDiscordSendRuntime()).sendMessageDiscord;
		const target = resolveDiscordOutboundTarget({
			to: ctx.to,
			threadId: ctx.threadId
		});
		const mediaUrls = resolvePayloadMediaUrls(payload);
		return attachChannelToResult("discord", await sendPayloadMediaSequenceOrFallback({
			text: payload.text ?? "",
			mediaUrls,
			fallbackResult: {
				messageId: "",
				channelId: target
			},
			sendNoMedia: async () => await sendDiscordComponentMessageLazy(target, componentSpec, {
				replyTo: ctx.replyToId ?? void 0,
				accountId: ctx.accountId ?? void 0,
				silent: ctx.silent ?? void 0,
				cfg: ctx.cfg
			}),
			send: async ({ text, mediaUrl, isFirst }) => {
				if (isFirst) return await sendDiscordComponentMessageLazy(target, componentSpec, {
					mediaUrl,
					mediaAccess: ctx.mediaAccess,
					mediaLocalRoots: ctx.mediaLocalRoots,
					mediaReadFile: ctx.mediaReadFile,
					replyTo: ctx.replyToId ?? void 0,
					accountId: ctx.accountId ?? void 0,
					silent: ctx.silent ?? void 0,
					cfg: ctx.cfg
				});
				return await send(target, text, {
					verbose: false,
					mediaUrl,
					mediaAccess: ctx.mediaAccess,
					mediaLocalRoots: ctx.mediaLocalRoots,
					mediaReadFile: ctx.mediaReadFile,
					replyTo: ctx.replyToId ?? void 0,
					accountId: ctx.accountId ?? void 0,
					silent: ctx.silent ?? void 0,
					cfg: ctx.cfg
				});
			}
		}));
	},
	...createAttachedChannelResultAdapter({
		channel: "discord",
		sendText: async ({ cfg, to, text, accountId, deps, replyToId, threadId, identity, silent }) => {
			if (!silent) {
				const webhookResult = await maybeSendDiscordWebhookText({
					cfg,
					text,
					threadId,
					accountId,
					identity,
					replyToId
				}).catch(() => null);
				if (webhookResult) return webhookResult;
			}
			return await (resolveOutboundSendDep(deps, "discord") ?? (await loadDiscordSendRuntime()).sendMessageDiscord)(resolveDiscordOutboundTarget({
				to,
				threadId
			}), text, {
				verbose: false,
				replyTo: replyToId ?? void 0,
				accountId: accountId ?? void 0,
				silent: silent ?? void 0,
				cfg
			});
		},
		sendMedia: async ({ cfg, to, text, mediaUrl, mediaLocalRoots, mediaReadFile, accountId, deps, replyToId, threadId, silent }) => {
			return await (resolveOutboundSendDep(deps, "discord") ?? (await loadDiscordSendRuntime()).sendMessageDiscord)(resolveDiscordOutboundTarget({
				to,
				threadId
			}), text, {
				verbose: false,
				mediaUrl,
				mediaLocalRoots,
				mediaReadFile,
				replyTo: replyToId ?? void 0,
				accountId: accountId ?? void 0,
				silent: silent ?? void 0,
				cfg
			});
		},
		sendPoll: async ({ cfg, to, poll, accountId, threadId, silent }) => await (await loadDiscordSendRuntime()).sendPollDiscord(resolveDiscordOutboundTarget({
			to,
			threadId
		}), poll, {
			accountId: accountId ?? void 0,
			silent: silent ?? void 0,
			cfg
		})
	})
};
//#endregion
export { discordOutbound as n, DISCORD_TEXT_CHUNK_LIMIT as t };
