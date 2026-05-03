import { i as formatErrorMessage } from "./errors-Jbvi20TW.js";
import { t as createSubsystemLogger } from "./subsystem-DRUx3zf3.js";
import { i as normalizeChannelId, t as getChannelPlugin } from "./registry-BL4cljde.js";
import { p as resolveSessionAgentId } from "./agent-scope-Cmx30dd2.js";
import "./plugins-BXj_dAAn.js";
import { n as resolveMainSessionKeyFromConfig } from "./sessions-CD6GeuLj.js";
import { r as mergeDeliveryContext, t as deliveryContextFromSession } from "./delivery-context.shared-Cjcgi24o.js";
import { t as parseSessionThreadInfo } from "./thread-info-C8F9QXHt.js";
import { o as loadSessionEntry } from "./session-utils-CnlJcBzh.js";
import { a as formatRestartSentinelMessage, r as consumeRestartSentinel, u as summarizeRestartSentinel } from "./restart-sentinel-D08So3wr.js";
import { t as deliverOutboundPayloads } from "./deliver-BM2htO6C.js";
import { c as enqueueDelivery, s as ackDelivery, u as failDelivery } from "./delivery-queue-C3xV9Y1O.js";
import { t as buildOutboundSessionContext } from "./session-context-CbzVoOos.js";
import { r as resolveOutboundTarget } from "./targets-BGrclpaA.js";
import { n as requestHeartbeatNow } from "./heartbeat-wake-CVc6aaHq.js";
import { i as enqueueSystemEvent } from "./system-events-zzYXvZSs.js";
import { t as finalizeInboundContext } from "./inbound-context-CY3JICXN.js";
import { t as dispatchReplyWithBufferedBlockDispatcher } from "./provider-dispatcher-MyozV7zu.js";
import { t as recordInboundSession } from "./session-Bp9EYMJk.js";
import { i as recordInboundSessionAndDispatchReply } from "./inbound-reply-dispatch-CpxBxfEs.js";
import { t as runStartupTasks } from "./startup-tasks-B4XYPCKa.js";
import { n as timestampOptsFromConfig, t as injectTimestamp } from "./agent-timestamp-BljveFp0.js";
//#region src/gateway/server-restart-sentinel.ts
const log = createSubsystemLogger("gateway/restart-sentinel");
const OUTBOUND_RETRY_DELAY_MS = 1e3;
const OUTBOUND_MAX_ATTEMPTS = 45;
function hasRoutableDeliveryContext(context) {
	return Boolean(context?.channel && context?.to);
}
function enqueueRestartSentinelWake(message, sessionKey, deliveryContext) {
	enqueueSystemEvent(message, {
		sessionKey,
		...deliveryContext ? { deliveryContext } : {}
	});
	requestHeartbeatNow({
		reason: "wake",
		sessionKey
	});
}
async function waitForOutboundRetry(delayMs) {
	await new Promise((resolve) => {
		setTimeout(resolve, delayMs).unref?.();
	});
}
async function deliverRestartSentinelNotice(params) {
	const payloads = [{ text: params.message }];
	const queueId = await enqueueDelivery({
		channel: params.channel,
		to: params.to,
		accountId: params.accountId,
		replyToId: params.replyToId,
		threadId: params.threadId,
		payloads,
		bestEffort: false
	}).catch(() => null);
	for (let attempt = 1; attempt <= OUTBOUND_MAX_ATTEMPTS; attempt += 1) try {
		if ((await deliverOutboundPayloads({
			cfg: params.cfg,
			channel: params.channel,
			to: params.to,
			accountId: params.accountId,
			replyToId: params.replyToId,
			threadId: params.threadId,
			payloads,
			session: params.session,
			deps: params.deps,
			bestEffort: false,
			skipQueue: true
		})).length > 0) {
			if (queueId) await ackDelivery(queueId).catch(() => {});
			return;
		}
		throw new Error("outbound delivery returned no results");
	} catch (err) {
		const retrying = attempt < OUTBOUND_MAX_ATTEMPTS;
		const suffix = retrying ? `; retrying in ${OUTBOUND_RETRY_DELAY_MS}ms` : "";
		log.warn(`${params.summary}: outbound delivery failed${suffix}: ${String(err)}`, {
			channel: params.channel,
			to: params.to,
			sessionKey: params.sessionKey,
			attempt,
			maxAttempts: OUTBOUND_MAX_ATTEMPTS
		});
		if (!retrying) {
			if (queueId) await failDelivery(queueId, formatErrorMessage(err)).catch(() => {});
			return;
		}
		await waitForOutboundRetry(OUTBOUND_RETRY_DELAY_MS);
	}
}
function buildRestartContinuationMessageId(params) {
	return `restart-sentinel:${params.sessionKey}:${params.kind}:${params.ts}`;
}
function resolveRestartContinuationRoute(params) {
	if (!params.channel || !params.to) return;
	return {
		channel: params.channel,
		to: params.to,
		...params.accountId ? { accountId: params.accountId } : {},
		...params.replyToId ? { replyToId: params.replyToId } : {},
		...params.threadId ? { threadId: params.threadId } : {},
		chatType: params.chatType
	};
}
function resolveRestartContinuationOutboundPayload(params) {
	if (params.payload.replyToId !== params.messageId) return params.payload;
	const payload = { ...params.payload };
	delete payload.replyToId;
	return params.replyToId ? {
		...payload,
		replyToId: params.replyToId
	} : payload;
}
async function dispatchRestartSentinelContinuation(params) {
	if (params.continuation.kind === "systemEvent") {
		enqueueSystemEvent(params.continuation.text, {
			sessionKey: params.sessionKey,
			...params.route ? { deliveryContext: {
				channel: params.route.channel,
				to: params.route.to,
				...params.route.accountId ? { accountId: params.route.accountId } : {},
				...params.route.threadId ? { threadId: params.route.threadId } : {}
			} } : {}
		});
		requestHeartbeatNow({
			reason: "wake",
			sessionKey: params.sessionKey
		});
		return;
	}
	if (!params.route) throw new Error("restart continuation route unavailable");
	const route = params.route;
	const messageId = buildRestartContinuationMessageId({
		sessionKey: params.sessionKey,
		kind: params.continuation.kind,
		ts: params.ts
	});
	const userMessage = params.continuation.message.trim();
	const agentId = resolveSessionAgentId({
		sessionKey: params.sessionKey,
		config: params.cfg
	});
	let dispatchError;
	await recordInboundSessionAndDispatchReply({
		cfg: params.cfg,
		channel: route.channel,
		accountId: route.accountId,
		agentId,
		routeSessionKey: params.sessionKey,
		storePath: params.storePath,
		ctxPayload: finalizeInboundContext({
			Body: userMessage,
			BodyForAgent: injectTimestamp(userMessage, timestampOptsFromConfig(params.cfg)),
			BodyForCommands: "",
			RawBody: userMessage,
			CommandBody: "",
			SessionKey: params.sessionKey,
			AccountId: route.accountId,
			MessageSid: messageId,
			Timestamp: Date.now(),
			Provider: route.channel,
			Surface: route.channel,
			ChatType: route.chatType,
			CommandAuthorized: false,
			ReplyToId: route.replyToId,
			OriginatingChannel: route.channel,
			OriginatingTo: route.to,
			ExplicitDeliverRoute: true,
			MessageThreadId: route.threadId
		}, {
			forceBodyForCommands: true,
			forceChatType: true
		}),
		recordInboundSession,
		dispatchReplyWithBufferedBlockDispatcher,
		deliver: async (payload) => {
			const outboundPayload = resolveRestartContinuationOutboundPayload({
				payload,
				messageId,
				replyToId: route.replyToId
			});
			if ((await deliverOutboundPayloads({
				cfg: params.cfg,
				channel: route.channel,
				to: route.to,
				accountId: route.accountId,
				replyToId: route.replyToId,
				threadId: route.threadId,
				payloads: [outboundPayload],
				session: buildOutboundSessionContext({
					cfg: params.cfg,
					sessionKey: params.sessionKey
				}),
				deps: params.deps,
				bestEffort: false
			})).length === 0) throw new Error("restart continuation delivery returned no results");
		},
		onRecordError: (err) => {
			log.warn(`restart continuation failed to record inbound session metadata: ${String(err)}`, { sessionKey: params.sessionKey });
		},
		onDispatchError: (err) => {
			dispatchError ??= err;
		}
	});
	if (dispatchError) throw dispatchError;
}
async function loadRestartSentinelStartupTask(params) {
	const sentinel = await consumeRestartSentinel();
	if (!sentinel) return null;
	const payload = sentinel.payload;
	const sessionKey = payload.sessionKey?.trim();
	const message = formatRestartSentinelMessage(payload);
	const summary = summarizeRestartSentinel(payload);
	const wakeDeliveryContext = mergeDeliveryContext(payload.threadId != null ? {
		...payload.deliveryContext,
		threadId: payload.threadId
	} : payload.deliveryContext, void 0);
	const run = async () => {
		if (!sessionKey) {
			const mainSessionKey = resolveMainSessionKeyFromConfig();
			enqueueSystemEvent(message, { sessionKey: mainSessionKey });
			if (payload.continuation) log.warn(`${summary}: continuation skipped: restart sentinel sessionKey unavailable`, {
				sessionKey: mainSessionKey,
				continuationKind: payload.continuation.kind
			});
			return { status: "ran" };
		}
		const { baseSessionKey, threadId: sessionThreadId } = parseSessionThreadInfo(sessionKey);
		const { cfg, entry, canonicalKey, storePath } = loadSessionEntry(sessionKey);
		const sentinelContext = payload.deliveryContext;
		let sessionDeliveryContext = deliveryContextFromSession(entry);
		let chatType = entry?.origin?.chatType ?? "direct";
		if (!hasRoutableDeliveryContext(sessionDeliveryContext) && baseSessionKey && baseSessionKey !== sessionKey) {
			const { entry: baseEntry } = loadSessionEntry(baseSessionKey);
			chatType = entry?.origin?.chatType ?? baseEntry?.origin?.chatType ?? "direct";
			sessionDeliveryContext = mergeDeliveryContext(sessionDeliveryContext, deliveryContextFromSession(baseEntry));
		}
		const origin = mergeDeliveryContext(sentinelContext, sessionDeliveryContext);
		enqueueRestartSentinelWake(message, sessionKey, wakeDeliveryContext);
		const channelRaw = origin?.channel;
		const channel = channelRaw ? normalizeChannelId(channelRaw) : null;
		const to = origin?.to;
		const threadId = payload.threadId ?? sessionThreadId ?? (origin?.threadId != null ? String(origin.threadId) : void 0);
		let resolvedTo;
		let replyToId;
		let resolvedThreadId = threadId;
		if (channel && to) {
			const resolved = resolveOutboundTarget({
				channel,
				to,
				cfg,
				accountId: origin?.accountId,
				mode: "implicit"
			});
			if (resolved.ok) {
				resolvedTo = resolved.to;
				const replyTransport = getChannelPlugin(channel)?.threading?.resolveReplyTransport?.({
					cfg,
					accountId: origin?.accountId,
					threadId
				}) ?? null;
				replyToId = replyTransport?.replyToId ?? void 0;
				resolvedThreadId = replyTransport && Object.hasOwn(replyTransport, "threadId") ? replyTransport.threadId != null ? String(replyTransport.threadId) : void 0 : threadId;
				const outboundSession = buildOutboundSessionContext({
					cfg,
					sessionKey: canonicalKey
				});
				await deliverRestartSentinelNotice({
					deps: params.deps,
					cfg,
					sessionKey: canonicalKey,
					summary,
					message,
					channel,
					to: resolvedTo,
					accountId: origin?.accountId,
					replyToId,
					threadId: resolvedThreadId,
					session: outboundSession
				});
			}
		}
		if (!payload.continuation) return { status: "ran" };
		try {
			await dispatchRestartSentinelContinuation({
				deps: params.deps,
				cfg,
				storePath,
				sessionKey: canonicalKey,
				continuation: payload.continuation,
				ts: payload.ts,
				route: resolveRestartContinuationRoute({
					channel: channel ?? void 0,
					to: resolvedTo,
					accountId: origin?.accountId,
					replyToId,
					threadId: resolvedThreadId,
					chatType
				})
			});
		} catch (err) {
			log.warn(`${summary}: continuation delivery failed: ${String(err)}`, {
				sessionKey: canonicalKey,
				continuationKind: payload.continuation.kind
			});
		}
		return { status: "ran" };
	};
	return {
		source: "restart-sentinel",
		...sessionKey ? { sessionKey } : {},
		run
	};
}
async function scheduleRestartSentinelWake(params) {
	const task = await loadRestartSentinelStartupTask(params);
	if (!task) return;
	await runStartupTasks({
		tasks: [task],
		log
	});
}
//#endregion
export { scheduleRestartSentinelWake };
