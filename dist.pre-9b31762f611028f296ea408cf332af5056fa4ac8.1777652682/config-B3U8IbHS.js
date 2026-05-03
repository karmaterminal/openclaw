import "./paths-CrDgDBYA.js";
import "./types.secrets-D9j6Z-gp.js";
import "./io-HGX0xk55.js";
import "./mutate-iJdsrGph.js";
//#region src/config/recovery-policy.ts
const PLUGIN_ENTRY_PATH_PREFIX = "plugins.entries.";
function isPluginEntryIssue(issue) {
	const path = issue.path.trim();
	if (!path.startsWith(PLUGIN_ENTRY_PATH_PREFIX)) return false;
	return path.slice(16).trim().length > 0;
}
/**
* Returns true when an invalid config snapshot is scoped entirely to plugin entries.
*/
function isPluginLocalInvalidConfigSnapshot(snapshot) {
	if (snapshot.valid || snapshot.legacyIssues.length > 0 || snapshot.issues.length === 0) return false;
	return snapshot.issues.every(isPluginEntryIssue);
}
/**
* Decides whether whole-file last-known-good recovery is safe for a snapshot.
*/
function shouldAttemptLastKnownGoodRecovery(snapshot) {
	if (snapshot.valid) return false;
	return !isPluginLocalInvalidConfigSnapshot(snapshot);
}
//#endregion
export { shouldAttemptLastKnownGoodRecovery as n, isPluginLocalInvalidConfigSnapshot as t };
