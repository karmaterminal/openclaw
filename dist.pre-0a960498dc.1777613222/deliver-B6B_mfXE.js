import { i as formatErrorMessage } from "./errors-Jbvi20TW.js";
import { t as createSubsystemLogger } from "./subsystem-DRUx3zf3.js";
import { n as fireAndForgetHook } from "./fire-and-forget-BV1ZgTBG.js";
import { t as getGlobalHookRunner } from "./hook-runner-global-CkwTKwtc.js";
import { m as triggerInternalHook, n as createInternalHookEvent } from "./internal-hooks-DUx3ffaZ.js";
import { i as resolveMirroredTranscriptText } from "./transcript-pszwLYmd.js";
import { a as projectOutboundPayloadPlanForDelivery, l as summarizeOutboundPayloadForTransport, t as createOutboundPayloadPlan } from "./payloads-DEM757dI.js";
import { g as sendMediaWithLeadingCaption } from "./reply-payload-BHlpKYDP.js";
import { t as resolveAgentScopedOutboundMediaAccess } from "./read-capability-B7n1jIO2.js";
import { a as hasReplyPayloadContent, c as normalizeMessagePresentation, u as renderMessagePresentationFallbackText } from "./payload-Ca5uTK9j.js";
import { c as resolveTextChunkLimit, i as chunkMarkdownTextWithMode, n as chunkByParagraph, s as resolveChunkMode } from "./chunk-CORXSw8W.js";
import { t as loadChannelOutboundAdapter } from "./load-Bu9SFlaR.js";
import { a as toInternalMessageSentContext, d as toPluginMessageSentEvent, l as toPluginMessageContext, t as buildCanonicalSentMessageHookContext } from "./message-hook-mappers-BRERP-u8.js";
import { c as enqueueDelivery, o as withActiveDeliveryClaim, s as ackDelivery, u as failDelivery } from "./delivery-queue-B6vQfob4.js";
//#region src/infra/outbound/abort.ts
/**
* Utility for checking AbortSignal state and throwing a standard AbortError.
*/
/**
* Throws an AbortError if the given signal has been aborted.
* Use at async checkpoints to support cancellation.
*/
function throwIfAborted(abortSignal) {
	if (abortSignal?.aborted) {
		const err = /* @__PURE__ */ new Error("Operation aborted");
		err.name = "AbortError";
		throw err;
	}
}
//#endregion
//#region src/infra/outbound/deliver.ts
const log = createSubsystemLogger("outbound/deliver");
let transcriptRuntimePromise;
async function loadTranscriptRuntime() {
	transcriptRuntimePromise ??= import("./transcript.runtime-BPM3DmAw.js");
	return await transcriptRuntimePromise;
}
let channelBootstrapRuntimePromise;
async function loadChannelBootstrapRuntime() {
	channelBootstrapRuntimePromise ??= import("./channel-bootstrap.runtime-D8yHRlfZ.js");
	return await channelBootstrapRuntimePromise;
}
async function createChannelHandler(params) {
	let outbound = await loadChannelOutboundAdapter(params.channel);
	if (!outbound) {
		const { bootstrapOutboundChannelPlugin } = await loadChannelBootstrapRuntime();
		bootstrapOutboundChannelPlugin({
			channel: params.channel,
			cfg: params.cfg
		});
		outbound = await loadChannelOutboundAdapter(params.channel);
	}
	const handler = createPluginHandler({
		...params,
		outbound
	});
	if (!handler) throw new Error(`Outbound not configured for channel: ${params.channel}`);
	return handler;
}
function createPluginHandler(params) {
	const outbound = params.outbound;
	if (!outbound?.sendText) return null;
	const baseCtx = createChannelOutboundContextBase(params);
	const sendText = outbound.sendText;
	const sendMedia = outbound.sendMedia;
	const chunker = outbound.chunker ?? null;
	const chunkerMode = outbound.chunkerMode;
	const resolveCtx = (overrides) => ({
		...baseCtx,
		replyToId: overrides?.replyToId ?? baseCtx.replyToId,
		threadId: overrides?.threadId ?? baseCtx.threadId,
		audioAsVoice: overrides?.audioAsVoice
	});
	const buildTargetRef = (overrides) => ({
		channel: params.channel,
		to: params.to,
		accountId: params.accountId ?? void 0,
		threadId: overrides?.threadId ?? baseCtx.threadId
	});
	return {
		chunker,
		chunkerMode,
		textChunkLimit: outbound.textChunkLimit,
		supportsMedia: Boolean(sendMedia),
		sanitizeText: outbound.sanitizeText ? (payload) => outbound.sanitizeText({
			text: payload.text ?? "",
			payload
		}) : void 0,
		normalizePayload: outbound.normalizePayload ? (payload) => outbound.normalizePayload({ payload }) : void 0,
		renderPresentation: outbound.renderPresentation ? async (payload) => {
			const presentation = normalizeMessagePresentation(payload.presentation);
			if (!presentation) return payload;
			const ctx = {
				...resolveCtx({
					replyToId: payload.replyToId ?? baseCtx.replyToId,
					threadId: baseCtx.threadId,
					audioAsVoice: payload.audioAsVoice
				}),
				text: payload.text ?? "",
				mediaUrl: payload.mediaUrl,
				payload
			};
			return await outbound.renderPresentation({
				payload,
				presentation,
				ctx
			});
		} : void 0,
		pinDeliveredMessage: outbound.pinDeliveredMessage ? async ({ target, messageId, pin }) => outbound.pinDeliveredMessage({
			cfg: params.cfg,
			target,
			messageId,
			pin
		}) : void 0,
		shouldSkipPlainTextSanitization: outbound.shouldSkipPlainTextSanitization ? (payload) => outbound.shouldSkipPlainTextSanitization({ payload }) : void 0,
		resolveEffectiveTextChunkLimit: outbound.resolveEffectiveTextChunkLimit ? (fallbackLimit) => outbound.resolveEffectiveTextChunkLimit({
			cfg: params.cfg,
			accountId: params.accountId ?? void 0,
			fallbackLimit
		}) : void 0,
		sendPayload: outbound.sendPayload ? async (payload, overrides) => outbound.sendPayload({
			...resolveCtx(overrides),
			text: payload.text ?? "",
			mediaUrl: payload.mediaUrl,
			payload
		}) : void 0,
		sendFormattedText: outbound.sendFormattedText ? async (text, overrides) => outbound.sendFormattedText({
			...resolveCtx(overrides),
			text
		}) : void 0,
		sendFormattedMedia: outbound.sendFormattedMedia ? async (caption, mediaUrl, overrides) => outbound.sendFormattedMedia({
			...resolveCtx(overrides),
			text: caption,
			mediaUrl
		}) : void 0,
		sendText: async (text, overrides) => sendText({
			...resolveCtx(overrides),
			text
		}),
		buildTargetRef,
		sendMedia: async (caption, mediaUrl, overrides) => {
			if (sendMedia) return sendMedia({
				...resolveCtx(overrides),
				text: caption,
				mediaUrl
			});
			return sendText({
				...resolveCtx(overrides),
				text: caption
			});
		}
	};
}
function createChannelOutboundContextBase(params) {
	return {
		cfg: params.cfg,
		to: params.to,
		accountId: params.accountId,
		replyToId: params.replyToId,
		threadId: params.threadId,
		identity: params.identity,
		gifPlayback: params.gifPlayback,
		forceDocument: params.forceDocument,
		deps: params.deps,
		silent: params.silent,
		mediaAccess: params.mediaAccess,
		mediaLocalRoots: params.mediaAccess?.localRoots,
		mediaReadFile: params.mediaAccess?.readFile,
		gatewayClientScopes: params.gatewayClientScopes
	};
}
const isAbortError = (err) => err instanceof Error && err.name === "AbortError";
function collectPayloadMediaSources(plan) {
	return plan.flatMap((entry) => entry.parts.mediaUrls);
}
function normalizeEmptyPayloadForDelivery(payload) {
	const text = typeof payload.text === "string" ? payload.text : "";
	if (!text.trim()) {
		if (!hasReplyPayloadContent({
			...payload,
			text
		})) return null;
		if (text) return {
			...payload,
			text: ""
		};
	}
	return payload;
}
function normalizePayloadsForChannelDelivery(plan, handler) {
	const normalizedPayloads = [];
	for (const payload of projectOutboundPayloadPlanForDelivery(plan)) {
		let sanitizedPayload = payload;
		if (handler.sanitizeText && sanitizedPayload.text) {
			if (!handler.shouldSkipPlainTextSanitization?.(sanitizedPayload)) sanitizedPayload = {
				...sanitizedPayload,
				text: handler.sanitizeText(sanitizedPayload)
			};
		}
		const normalizedPayload = handler.normalizePayload ? handler.normalizePayload(sanitizedPayload) : sanitizedPayload;
		const normalized = normalizedPayload ? normalizeEmptyPayloadForDelivery(normalizedPayload) : null;
		if (normalized) normalizedPayloads.push(normalized);
	}
	return normalizedPayloads;
}
function buildPayloadSummary(payload) {
	return summarizeOutboundPayloadForTransport(payload);
}
function normalizeDeliveryPin(payload) {
	const pin = payload.delivery?.pin;
	if (pin === true) return { enabled: true };
	if (!pin || typeof pin !== "object" || Array.isArray(pin)) return;
	if (!pin.enabled) return;
	const normalized = { enabled: true };
	if (pin.notify === true) normalized.notify = true;
	if (pin.required === true) normalized.required = true;
	return normalized;
}
async function maybePinDeliveredMessage(params) {
	const pin = normalizeDeliveryPin(params.payload);
	if (!pin) return;
	if (!params.messageId) {
		if (pin.required) throw new Error("Delivery pin requested, but no delivered message id was returned.");
		log.warn("Delivery pin requested, but no delivered message id was returned.", {
			channel: params.target.channel,
			to: params.target.to
		});
		return;
	}
	if (!params.handler.pinDeliveredMessage) {
		if (pin.required) throw new Error(`Delivery pin is not supported by channel: ${params.target.channel}`);
		log.warn("Delivery pin requested, but channel does not support pinning delivered messages.", {
			channel: params.target.channel,
			to: params.target.to
		});
		return;
	}
	try {
		await params.handler.pinDeliveredMessage({
			target: params.target,
			messageId: params.messageId,
			pin
		});
	} catch (err) {
		if (pin.required) throw err;
		log.warn("Delivery pin requested, but channel failed to pin delivered message.", {
			channel: params.target.channel,
			to: params.target.to,
			messageId: params.messageId,
			error: formatErrorMessage(err)
		});
	}
}
async function renderPresentationForDelivery(handler, payload) {
	const presentation = normalizeMessagePresentation(payload.presentation);
	if (!presentation) return payload;
	const rendered = handler.renderPresentation ? await handler.renderPresentation(payload) : null;
	if (rendered) {
		const { presentation: _presentation, ...withoutPresentation } = rendered;
		return withoutPresentation;
	}
	const { presentation: _presentation, ...withoutPresentation } = payload;
	return {
		...withoutPresentation,
		text: renderMessagePresentationFallbackText({
			text: payload.text,
			presentation
		})
	};
}
function createMessageSentEmitter(params) {
	const hasMessageSentHooks = params.hookRunner?.hasHooks("message_sent") ?? false;
	const canEmitInternalHook = Boolean(params.sessionKeyForInternalHooks);
	const emitMessageSent = (event) => {
		if (!hasMessageSentHooks && !canEmitInternalHook) return;
		const canonical = buildCanonicalSentMessageHookContext({
			to: params.to,
			content: event.content,
			success: event.success,
			error: event.error,
			channelId: params.channel,
			accountId: params.accountId ?? void 0,
			conversationId: params.to,
			messageId: event.messageId,
			isGroup: params.mirrorIsGroup,
			groupId: params.mirrorGroupId
		});
		if (hasMessageSentHooks) fireAndForgetHook(params.hookRunner.runMessageSent(toPluginMessageSentEvent(canonical), toPluginMessageContext(canonical)), "deliverOutboundPayloads: message_sent plugin hook failed", (message) => {
			log.warn(message);
		});
		if (!canEmitInternalHook) return;
		fireAndForgetHook(triggerInternalHook(createInternalHookEvent("message", "sent", params.sessionKeyForInternalHooks, toInternalMessageSentContext(canonical))), "deliverOutboundPayloads: message:sent internal hook failed", (message) => {
			log.warn(message);
		});
	};
	return {
		emitMessageSent,
		hasMessageSentHooks
	};
}
async function applyMessageSendingHook(params) {
	if (!params.enabled) return {
		cancelled: false,
		payload: params.payload,
		payloadSummary: params.payloadSummary
	};
	try {
		const sendingResult = await params.hookRunner.runMessageSending({
			to: params.to,
			content: params.payloadSummary.text,
			replyToId: params.payload.replyToId ?? params.replyToId ?? void 0,
			threadId: params.threadId ?? void 0,
			metadata: {
				channel: params.channel,
				accountId: params.accountId,
				mediaUrls: params.payloadSummary.mediaUrls
			}
		}, {
			channelId: params.channel,
			accountId: params.accountId ?? void 0,
			conversationId: params.to
		});
		if (sendingResult?.cancel) return {
			cancelled: true,
			payload: params.payload,
			payloadSummary: params.payloadSummary
		};
		if (sendingResult?.content == null) return {
			cancelled: false,
			payload: params.payload,
			payloadSummary: params.payloadSummary
		};
		return {
			cancelled: false,
			payload: {
				...params.payload,
				text: sendingResult.content
			},
			payloadSummary: {
				...params.payloadSummary,
				text: sendingResult.content
			}
		};
	} catch {
		return {
			cancelled: false,
			payload: params.payload,
			payloadSummary: params.payloadSummary
		};
	}
}
async function deliverOutboundPayloads(params) {
	const { channel, to, payloads } = params;
	const queueId = params.skipQueue ? null : await enqueueDelivery({
		channel,
		to,
		accountId: params.accountId,
		payloads,
		threadId: params.threadId,
		replyToId: params.replyToId,
		bestEffort: params.bestEffort,
		gifPlayback: params.gifPlayback,
		forceDocument: params.forceDocument,
		silent: params.silent,
		mirror: params.mirror,
		session: params.session,
		gatewayClientScopes: params.gatewayClientScopes
	}).catch(() => null);
	if (!queueId) return await deliverOutboundPayloadsWithQueueCleanup(params, null);
	const claimResult = await withActiveDeliveryClaim(queueId, () => deliverOutboundPayloadsWithQueueCleanup(params, queueId));
	if (claimResult.status === "claimed-by-other-owner") return [];
	return claimResult.value;
}
async function deliverOutboundPayloadsWithQueueCleanup(params, queueId) {
	let hadPartialFailure = false;
	const wrappedParams = params.onError ? {
		...params,
		onError: (err, payload) => {
			hadPartialFailure = true;
			params.onError(err, payload);
		}
	} : params;
	try {
		const results = await deliverOutboundPayloadsCore(wrappedParams);
		if (queueId) if (hadPartialFailure) await failDelivery(queueId, "partial delivery failure (bestEffort)").catch(() => {});
		else await ackDelivery(queueId).catch(() => {});
		return results;
	} catch (err) {
		if (queueId) if (isAbortError(err)) await ackDelivery(queueId).catch(() => {});
		else await failDelivery(queueId, formatErrorMessage(err)).catch(() => {});
		throw err;
	}
}
/** Core delivery logic (extracted for queue wrapper). */
async function deliverOutboundPayloadsCore(params) {
	const { cfg, channel, to, payloads } = params;
	const outboundPayloadPlan = createOutboundPayloadPlan(payloads, {
		cfg,
		sessionKey: params.session?.policyKey ?? params.session?.key,
		surface: channel,
		conversationType: params.session?.conversationType
	});
	const accountId = params.accountId;
	const deps = params.deps;
	const abortSignal = params.abortSignal;
	const mediaSources = collectPayloadMediaSources(outboundPayloadPlan);
	const mediaAccess = mediaSources.length > 0 ? resolveAgentScopedOutboundMediaAccess({
		cfg,
		agentId: params.session?.agentId ?? params.mirror?.agentId,
		mediaSources,
		sessionKey: params.session?.key,
		messageProvider: params.session?.key ? void 0 : channel,
		accountId: params.session?.requesterAccountId ?? accountId,
		requesterSenderId: params.session?.requesterSenderId,
		requesterSenderName: params.session?.requesterSenderName,
		requesterSenderUsername: params.session?.requesterSenderUsername,
		requesterSenderE164: params.session?.requesterSenderE164
	}) : {};
	const results = [];
	const handler = await createChannelHandler({
		cfg,
		channel,
		to,
		deps,
		accountId,
		replyToId: params.replyToId,
		threadId: params.threadId,
		identity: params.identity,
		gifPlayback: params.gifPlayback,
		forceDocument: params.forceDocument,
		silent: params.silent,
		mediaAccess,
		gatewayClientScopes: params.gatewayClientScopes
	});
	const configuredTextLimit = handler.chunker ? resolveTextChunkLimit(cfg, channel, accountId, { fallbackLimit: handler.textChunkLimit }) : void 0;
	const textLimit = handler.resolveEffectiveTextChunkLimit ? handler.resolveEffectiveTextChunkLimit(configuredTextLimit) : configuredTextLimit;
	const chunkMode = handler.chunker ? resolveChunkMode(cfg, channel, accountId) : "length";
	const sendTextChunks = async (text, overrides) => {
		throwIfAborted(abortSignal);
		if (!handler.chunker || textLimit === void 0) {
			results.push(await handler.sendText(text, overrides));
			return;
		}
		if (chunkMode === "newline") {
			const blockChunks = (handler.chunkerMode ?? "text") === "markdown" ? chunkMarkdownTextWithMode(text, textLimit, "newline") : chunkByParagraph(text, textLimit);
			if (!blockChunks.length && text) blockChunks.push(text);
			for (const blockChunk of blockChunks) {
				const chunks = handler.chunker(blockChunk, textLimit);
				if (!chunks.length && blockChunk) chunks.push(blockChunk);
				for (const chunk of chunks) {
					throwIfAborted(abortSignal);
					results.push(await handler.sendText(chunk, overrides));
				}
			}
			return;
		}
		const chunks = handler.chunker(text, textLimit);
		for (const chunk of chunks) {
			throwIfAborted(abortSignal);
			results.push(await handler.sendText(chunk, overrides));
		}
	};
	const normalizedPayloads = normalizePayloadsForChannelDelivery(outboundPayloadPlan, handler);
	const hookRunner = getGlobalHookRunner();
	const sessionKeyForInternalHooks = params.mirror?.sessionKey ?? params.session?.key;
	const mirrorIsGroup = params.mirror?.isGroup;
	const mirrorGroupId = params.mirror?.groupId;
	const { emitMessageSent, hasMessageSentHooks } = createMessageSentEmitter({
		hookRunner,
		channel,
		to,
		accountId,
		sessionKeyForInternalHooks,
		mirrorIsGroup,
		mirrorGroupId
	});
	const hasMessageSendingHooks = hookRunner?.hasHooks("message_sending") ?? false;
	if (hasMessageSentHooks && params.session?.agentId && !sessionKeyForInternalHooks) log.warn("deliverOutboundPayloads: session.agentId present without session key; internal message:sent hook will be skipped", {
		channel,
		to,
		agentId: params.session.agentId
	});
	for (const payload of normalizedPayloads) {
		let payloadSummary = buildPayloadSummary(payload);
		try {
			throwIfAborted(abortSignal);
			const hookResult = await applyMessageSendingHook({
				hookRunner,
				enabled: hasMessageSendingHooks,
				payload,
				payloadSummary,
				to,
				channel,
				accountId,
				replyToId: params.replyToId,
				threadId: params.threadId
			});
			if (hookResult.cancelled) continue;
			const effectivePayload = await renderPresentationForDelivery(handler, hookResult.payload);
			payloadSummary = buildPayloadSummary(effectivePayload);
			params.onPayload?.(payloadSummary);
			const sendOverrides = {
				replyToId: effectivePayload.replyToId ?? params.replyToId ?? void 0,
				threadId: params.threadId ?? void 0,
				audioAsVoice: effectivePayload.audioAsVoice === true ? true : void 0,
				forceDocument: params.forceDocument
			};
			const deliveryTarget = handler.buildTargetRef({ threadId: sendOverrides.threadId });
			if (handler.sendPayload && hasReplyPayloadContent({
				presentation: effectivePayload.presentation,
				interactive: effectivePayload.interactive,
				channelData: effectivePayload.channelData
			})) {
				const delivery = await handler.sendPayload(effectivePayload, sendOverrides);
				results.push(delivery);
				await maybePinDeliveredMessage({
					handler,
					payload: effectivePayload,
					target: deliveryTarget,
					messageId: delivery.messageId
				});
				emitMessageSent({
					success: true,
					content: payloadSummary.text,
					messageId: delivery.messageId
				});
				continue;
			}
			if (payloadSummary.mediaUrls.length === 0) {
				const beforeCount = results.length;
				if (handler.sendFormattedText) results.push(...await handler.sendFormattedText(payloadSummary.text, sendOverrides));
				else await sendTextChunks(payloadSummary.text, sendOverrides);
				const deliveredResults = results.slice(beforeCount);
				const messageId = results.at(-1)?.messageId;
				const pinMessageId = deliveredResults.find((entry) => entry.messageId)?.messageId;
				await maybePinDeliveredMessage({
					handler,
					payload: effectivePayload,
					target: deliveryTarget,
					messageId: pinMessageId
				});
				emitMessageSent({
					success: results.length > beforeCount,
					content: payloadSummary.text,
					messageId
				});
				continue;
			}
			if (!handler.supportsMedia) {
				log.warn("Plugin outbound adapter does not implement sendMedia; media URLs will be dropped and text fallback will be used", {
					channel,
					to,
					mediaCount: payloadSummary.mediaUrls.length
				});
				const fallbackText = payloadSummary.text.trim();
				if (!fallbackText) throw new Error("Plugin outbound adapter does not implement sendMedia and no text fallback is available for media payload");
				const beforeCount = results.length;
				await sendTextChunks(fallbackText, sendOverrides);
				const deliveredResults = results.slice(beforeCount);
				const messageId = results.at(-1)?.messageId;
				const pinMessageId = deliveredResults.find((entry) => entry.messageId)?.messageId;
				await maybePinDeliveredMessage({
					handler,
					payload: effectivePayload,
					target: deliveryTarget,
					messageId: pinMessageId
				});
				emitMessageSent({
					success: results.length > beforeCount,
					content: payloadSummary.text,
					messageId
				});
				continue;
			}
			let firstMessageId;
			let lastMessageId;
			await sendMediaWithLeadingCaption({
				mediaUrls: payloadSummary.mediaUrls,
				caption: payloadSummary.text,
				send: async ({ mediaUrl, caption }) => {
					throwIfAborted(abortSignal);
					if (handler.sendFormattedMedia) {
						const delivery = await handler.sendFormattedMedia(caption ?? "", mediaUrl, sendOverrides);
						results.push(delivery);
						firstMessageId ??= delivery.messageId;
						lastMessageId = delivery.messageId;
						return;
					}
					const delivery = await handler.sendMedia(caption ?? "", mediaUrl, sendOverrides);
					results.push(delivery);
					firstMessageId ??= delivery.messageId;
					lastMessageId = delivery.messageId;
				}
			});
			await maybePinDeliveredMessage({
				handler,
				payload: effectivePayload,
				target: deliveryTarget,
				messageId: firstMessageId
			});
			emitMessageSent({
				success: true,
				content: payloadSummary.text,
				messageId: lastMessageId
			});
		} catch (err) {
			emitMessageSent({
				success: false,
				content: payloadSummary.text,
				error: formatErrorMessage(err)
			});
			if (!params.bestEffort) throw err;
			params.onError?.(err, payloadSummary);
		}
	}
	if (params.mirror && results.length > 0) {
		const mirrorText = resolveMirroredTranscriptText({
			text: params.mirror.text,
			mediaUrls: params.mirror.mediaUrls
		});
		if (mirrorText) {
			const { appendAssistantMessageToSessionTranscript } = await loadTranscriptRuntime();
			await appendAssistantMessageToSessionTranscript({
				agentId: params.mirror.agentId,
				sessionKey: params.mirror.sessionKey,
				text: mirrorText,
				idempotencyKey: params.mirror.idempotencyKey
			});
		}
	}
	return results;
}
//#endregion
export { throwIfAborted as n, deliverOutboundPayloads as t };
