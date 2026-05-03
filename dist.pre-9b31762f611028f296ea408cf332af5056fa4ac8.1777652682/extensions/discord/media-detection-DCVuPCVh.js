import { normalizeLowercaseStringOrEmpty } from "openclaw/plugin-sdk/text-runtime";
//#region extensions/discord/src/media-detection.ts
const DISCORD_VIDEO_MEDIA_EXTENSIONS = new Set([
	".avi",
	".m4v",
	".mkv",
	".mov",
	".mp4",
	".webm"
]);
function normalizeMediaPathForExtension(mediaUrl) {
	const trimmed = mediaUrl.trim();
	if (!trimmed) return "";
	try {
		return normalizeLowercaseStringOrEmpty(new URL(trimmed).pathname);
	} catch {
		const withoutHash = trimmed.split("#", 1)[0] ?? trimmed;
		return normalizeLowercaseStringOrEmpty(withoutHash.split("?", 1)[0] ?? withoutHash);
	}
}
function isLikelyDiscordVideoMedia(mediaUrl) {
	const normalized = normalizeMediaPathForExtension(mediaUrl);
	for (const ext of DISCORD_VIDEO_MEDIA_EXTENSIONS) if (normalized.endsWith(ext)) return true;
	return false;
}
//#endregion
export { isLikelyDiscordVideoMedia as t };
