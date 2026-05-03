import { t as buildOutboundMediaLoadOptions } from "./load-options-DNSaiajj.js";
import { v as loadWebMedia } from "./ir-KJsBrGQR.js";
import { a as saveMediaBuffer } from "./store-iFyY2mI0.js";

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