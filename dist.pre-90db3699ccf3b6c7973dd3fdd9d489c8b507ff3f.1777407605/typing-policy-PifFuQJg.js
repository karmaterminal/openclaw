import "./message-channel-Bk_YHfQg.js";
import "./message-channel-core-DTA--Gjh.js";
//#region src/auto-reply/reply/typing-policy.ts
function resolveRunTypingPolicy(params) {
	const typingPolicy = params.isHeartbeat ? "heartbeat" : params.originatingChannel === "webchat" ? "internal_webchat" : params.systemEvent ? "system_event" : params.requestedPolicy ?? "auto";
	return {
		typingPolicy,
		suppressTyping: params.suppressTyping === true || typingPolicy === "heartbeat" || typingPolicy === "system_event" || typingPolicy === "internal_webchat"
	};
}
//#endregion
export { resolveRunTypingPolicy as t };
