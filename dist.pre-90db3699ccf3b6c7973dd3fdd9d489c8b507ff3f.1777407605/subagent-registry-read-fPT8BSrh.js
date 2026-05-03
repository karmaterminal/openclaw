import { c as getSubagentRunByChildSessionKeyFromRuns, d as listRunsForControllerFromRuns, h as subagentRuns, i as countActiveDescendantRunsFromRuns, t as getSubagentRunsSnapshotForRead, u as listDescendantRunsForRequesterFromRuns } from "./subagent-registry-state-DhHAB2Py.js";
//#region src/agents/subagent-registry-read.ts
function listSubagentRunsForController(controllerSessionKey) {
	return listRunsForControllerFromRuns(getSubagentRunsSnapshotForRead(subagentRuns), controllerSessionKey);
}
function countActiveDescendantRuns(rootSessionKey) {
	return countActiveDescendantRunsFromRuns(getSubagentRunsSnapshotForRead(subagentRuns), rootSessionKey);
}
function listDescendantRunsForRequester(rootSessionKey) {
	return listDescendantRunsForRequesterFromRuns(getSubagentRunsSnapshotForRead(subagentRuns), rootSessionKey);
}
function getSubagentRunByChildSessionKey(childSessionKey) {
	return getSubagentRunByChildSessionKeyFromRuns(getSubagentRunsSnapshotForRead(subagentRuns), childSessionKey);
}
function getSessionDisplaySubagentRunByChildSessionKey(childSessionKey) {
	const key = childSessionKey.trim();
	if (!key) return null;
	let latestInMemoryActive = null;
	let latestInMemoryEnded = null;
	for (const entry of subagentRuns.values()) {
		if (entry.childSessionKey !== key) continue;
		if (typeof entry.endedAt === "number") {
			if (!latestInMemoryEnded || entry.createdAt > latestInMemoryEnded.createdAt) latestInMemoryEnded = entry;
			continue;
		}
		if (!latestInMemoryActive || entry.createdAt > latestInMemoryActive.createdAt) latestInMemoryActive = entry;
	}
	if (latestInMemoryEnded || latestInMemoryActive) {
		if (latestInMemoryEnded && (!latestInMemoryActive || latestInMemoryEnded.createdAt > latestInMemoryActive.createdAt)) return latestInMemoryEnded;
		return latestInMemoryActive ?? latestInMemoryEnded;
	}
	return getSubagentRunByChildSessionKey(key);
}
function getLatestSubagentRunByChildSessionKey(childSessionKey) {
	const key = childSessionKey.trim();
	if (!key) return null;
	let latest = null;
	for (const entry of getSubagentRunsSnapshotForRead(subagentRuns).values()) {
		if (entry.childSessionKey !== key) continue;
		if (!latest || entry.createdAt > latest.createdAt) latest = entry;
	}
	return latest;
}
//#endregion
export { listSubagentRunsForController as a, listDescendantRunsForRequester as i, getLatestSubagentRunByChildSessionKey as n, getSessionDisplaySubagentRunByChildSessionKey as r, countActiveDescendantRuns as t };
