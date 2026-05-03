//#region src/config/sessions/artifacts.ts
const ARCHIVE_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:\.\d{3})?Z$/;
const LEGACY_STORE_BACKUP_RE = /^sessions\.json\.bak\.\d+$/;
const CHECKPOINT_MARKER_RE = /\.checkpoint\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/;
function hasArchiveSuffix(fileName, reason) {
	const marker = `.${reason}.`;
	const index = fileName.lastIndexOf(marker);
	if (index < 0) return false;
	const raw = fileName.slice(index + marker.length);
	return ARCHIVE_TIMESTAMP_RE.test(raw);
}
function isSessionArchiveArtifactName(fileName) {
	if (LEGACY_STORE_BACKUP_RE.test(fileName)) return true;
	return hasArchiveSuffix(fileName, "deleted") || hasArchiveSuffix(fileName, "reset") || hasArchiveSuffix(fileName, "bak");
}
function isPrimarySessionTranscriptFileName(fileName) {
	if (fileName === "sessions.json") return false;
	if (!fileName.endsWith(".jsonl")) return false;
	if (isCheckpointSessionTranscriptFileName(fileName)) return false;
	return !isSessionArchiveArtifactName(fileName);
}
function isUsageCountedSessionTranscriptFileName(fileName) {
	if (isPrimarySessionTranscriptFileName(fileName)) return true;
	if (isCheckpointSessionTranscriptFileName(fileName)) return true;
	return hasArchiveSuffix(fileName, "reset") || hasArchiveSuffix(fileName, "deleted");
}
/**
* Classify pre-compaction checkpoint-twin transcript files, e.g.
* `<parentId>.checkpoint.<uuid>.jsonl`. Uses an anchored UUID-shape match so
* session IDs that happen to contain the substring "checkpoint" do not
* false-positive.
*/
function isCheckpointSessionTranscriptFileName(fileName) {
	return CHECKPOINT_MARKER_RE.test(fileName);
}
/**
* Extract the parent session id from a checkpoint transcript file name. The
* parent session id is the part BEFORE `.checkpoint.<uuid>.jsonl`; it matches
* what `isPrimarySessionTranscriptFileName` expects when the parent primary
* exists as `<parentId>.jsonl`. Returns `null` if the file is not a checkpoint.
*/
function parseParentSessionIdFromCheckpointFileName(fileName) {
	const match = fileName.match(CHECKPOINT_MARKER_RE);
	if (!match || match.index === void 0) return null;
	return fileName.slice(0, match.index);
}
function parseUsageCountedSessionIdFromFileName(fileName) {
	if (isPrimarySessionTranscriptFileName(fileName)) return fileName.slice(0, -6);
	for (const reason of ["reset", "deleted"]) {
		const marker = `.jsonl.${reason}.`;
		const index = fileName.lastIndexOf(marker);
		if (index > 0 && hasArchiveSuffix(fileName, reason)) return fileName.slice(0, index);
	}
	return null;
}
function formatSessionArchiveTimestamp(nowMs = Date.now()) {
	return new Date(nowMs).toISOString().replaceAll(":", "-");
}
function restoreSessionArchiveTimestamp(raw) {
	const [datePart, timePart] = raw.split("T");
	if (!datePart || !timePart) return raw;
	return `${datePart}T${timePart.replace(/-/g, ":")}`;
}
function parseSessionArchiveTimestamp(fileName, reason) {
	const marker = `.${reason}.`;
	const index = fileName.lastIndexOf(marker);
	if (index < 0) return null;
	const raw = fileName.slice(index + marker.length);
	if (!raw) return null;
	if (!ARCHIVE_TIMESTAMP_RE.test(raw)) return null;
	const timestamp = Date.parse(restoreSessionArchiveTimestamp(raw));
	return Number.isNaN(timestamp) ? null : timestamp;
}
//#endregion
export { isUsageCountedSessionTranscriptFileName as a, parseUsageCountedSessionIdFromFileName as c, isSessionArchiveArtifactName as i, isCheckpointSessionTranscriptFileName as n, parseParentSessionIdFromCheckpointFileName as o, isPrimarySessionTranscriptFileName as r, parseSessionArchiveTimestamp as s, formatSessionArchiveTimestamp as t };
