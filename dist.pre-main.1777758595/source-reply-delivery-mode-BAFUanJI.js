import { t as createSubsystemLogger } from "./subsystem-W9_E260X.js";
import { t as normalizeChatType } from "./chat-type-O5o90NDg.js";
//#region src/auto-reply/reply/source-reply-delivery-mode.ts
const log = createSubsystemLogger("auto-reply");
let visibleRepliesPrivateDefaultWarned = false;
function resolveSourceReplyDeliveryMode(params) {
	let mode;
	if (params.requested) mode = params.requested;
	else if (params.ctx.CommandSource === "native") mode = "automatic";
	else {
		const chatType = normalizeChatType(params.ctx.ChatType);
		if (chatType === "group" || chatType === "channel") {
			const configuredMode = params.cfg.messages?.groupChat?.visibleReplies ?? params.cfg.messages?.visibleReplies;
			mode = configuredMode === "automatic" ? "automatic" : "message_tool_only";
			if (mode === "message_tool_only" && configuredMode === void 0 && params.messageToolAvailable !== false && !visibleRepliesPrivateDefaultWarned) {
				visibleRepliesPrivateDefaultWarned = true;
				log.warn("Group/channel replies are private by default since 2026.4.27. To restore automatic room posting, set messages.groupChat.visibleReplies to \"automatic\" in openclaw.json and save the config. The gateway hot-reloads messages config; restart only if file watching/reload is disabled. Relates to https://github.com/openclaw/openclaw/issues/74876");
			}
		} else mode = params.cfg.messages?.visibleReplies === "message_tool" ? "message_tool_only" : "automatic";
	}
	if (mode === "message_tool_only" && params.messageToolAvailable === false) return "automatic";
	return mode;
}
function resolveSourceReplyVisibilityPolicy(params) {
	const sourceReplyDeliveryMode = resolveSourceReplyDeliveryMode({
		cfg: params.cfg,
		ctx: params.ctx,
		requested: params.requested,
		messageToolAvailable: params.messageToolAvailable
	});
	const sendPolicyDenied = params.sendPolicy === "deny";
	const suppressAutomaticSourceDelivery = sourceReplyDeliveryMode === "message_tool_only";
	const suppressDelivery = sendPolicyDenied || suppressAutomaticSourceDelivery;
	const deliverySuppressionReason = sendPolicyDenied ? "sendPolicy: deny" : suppressAutomaticSourceDelivery ? "sourceReplyDeliveryMode: message_tool_only" : "";
	return {
		sourceReplyDeliveryMode,
		sendPolicyDenied,
		suppressAutomaticSourceDelivery,
		suppressDelivery,
		suppressHookUserDelivery: params.suppressAcpChildUserDelivery === true || suppressDelivery,
		suppressHookReplyLifecycle: sendPolicyDenied || params.suppressAcpChildUserDelivery === true || params.explicitSuppressTyping === true || params.shouldSuppressTyping === true,
		suppressTyping: sendPolicyDenied || params.explicitSuppressTyping === true || params.shouldSuppressTyping === true,
		deliverySuppressionReason
	};
}
//#endregion
export { resolveSourceReplyVisibilityPolicy as n, resolveSourceReplyDeliveryMode as t };
