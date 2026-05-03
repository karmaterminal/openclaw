import { c as normalizeOptionalString } from "./string-coerce-C1IzJjqi.js";
import { u as sanitizeUserFacingText } from "./sanitize-user-facing-text-wYl4LmAL.js";
import { a as isSilentReplyText, c as stripLeadingSilentToken, l as stripSilentToken, o as startsWithSilentToken, r as isSilentReplyPayloadText } from "./tokens-DXgGSqoY.js";
import { s as stripHeartbeatToken } from "./heartbeat-DI1BMPex.js";
import { a as hasReplyPayloadContent } from "./payload-HliE6NjM.js";
import { n as resolveResponsePrefixTemplate } from "./response-prefix-template-TJq22oHy.js";
//#region src/auto-reply/reply/cot-frame.ts
const COT_FRAME_PREFIX_RE = /^\s*\[(?:the dandelion cult - )?(?:cael|silas|ronan|elliott)(?:\s*(?:🌻|🌫|🩸|🌊)\uFE0F?)?\]/iu;
function hasCotFramePrefix(text) {
	if (!text) return false;
	return COT_FRAME_PREFIX_RE.test(text);
}
//#endregion
//#region src/auto-reply/reply/normalize-reply.ts
function normalizeReplyPayload(payload, opts = {}) {
	const applyChannelTransforms = opts.applyChannelTransforms ?? true;
	const hasContent = (text) => hasReplyPayloadContent({
		...payload,
		text
	}, { trimText: true });
	const trimmed = normalizeOptionalString(payload.text) ?? "";
	if (!hasContent(trimmed)) {
		opts.onSkip?.("empty");
		return null;
	}
	const silentToken = opts.silentToken ?? "NO_REPLY";
	let text = payload.text ?? void 0;
	if (text && isSilentReplyPayloadText(text, silentToken)) {
		if (!hasContent("")) {
			opts.onSkip?.("silent");
			return null;
		}
		text = "";
	}
	if (text && !isSilentReplyText(text, silentToken)) {
		const hasLeadingSilentToken = startsWithSilentToken(text, silentToken);
		if (hasLeadingSilentToken) text = stripLeadingSilentToken(text, silentToken);
		if (hasLeadingSilentToken || text.toLowerCase().includes(silentToken.toLowerCase())) {
			text = stripSilentToken(text, silentToken);
			if (!hasContent(text)) {
				opts.onSkip?.("silent");
				return null;
			}
		}
	}
	if (text && hasCotFramePrefix(text)) {
		if (!hasContent("")) {
			opts.onSkip?.("silent");
			return null;
		}
		text = "";
	}
	if (text && !trimmed) text = "";
	if ((opts.stripHeartbeat ?? true) && text?.includes("HEARTBEAT_OK")) {
		const stripped = stripHeartbeatToken(text, { mode: "message" });
		if (stripped.didStrip) opts.onHeartbeatStrip?.();
		if (stripped.shouldSkip && !hasContent(stripped.text)) {
			opts.onSkip?.("heartbeat");
			return null;
		}
		text = stripped.text;
	}
	if (text) text = sanitizeUserFacingText(text, { errorContext: Boolean(payload.isError) });
	if (!hasContent(text)) {
		opts.onSkip?.("empty");
		return null;
	}
	let enrichedPayload = {
		...payload,
		text
	};
	if (applyChannelTransforms && opts.transformReplyPayload) {
		enrichedPayload = opts.transformReplyPayload(enrichedPayload) ?? enrichedPayload;
		text = enrichedPayload.text;
	}
	const effectivePrefix = opts.responsePrefixContext ? resolveResponsePrefixTemplate(opts.responsePrefix, opts.responsePrefixContext) : opts.responsePrefix;
	if (effectivePrefix && text && text.trim() !== "HEARTBEAT_OK" && !text.startsWith(effectivePrefix)) text = `${effectivePrefix} ${text}`;
	enrichedPayload = {
		...enrichedPayload,
		text
	};
	return enrichedPayload;
}
//#endregion
export { hasCotFramePrefix as n, normalizeReplyPayload as t };
