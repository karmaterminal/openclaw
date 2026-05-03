import { i as saveMediaBuffer } from "./store-BlIp3Z05.js";
import { a as loadWebMedia } from "./ir-BwV8kUdE.js";
import { t as buildOutboundMediaLoadOptions } from "./load-options-CQcHt2f2.js";

//#region src/media/outbound-attachment.ts
async function resolveOutboundAttachmentFromUrl(mediaUrl, maxBytes, options) {
	const media = await loadWebMedia(mediaUrl, buildOutboundMediaLoadOptions({
		maxBytes,
		mediaLocalRoots: options?.localRoots
	}));
	const saved = await saveMediaBuffer(media.buffer, media.contentType ?? void 0, "outbound", maxBytes);
	return {
		path: saved.path,
		contentType: saved.contentType
	};
}

//#endregion
export { resolveOutboundAttachmentFromUrl as t };