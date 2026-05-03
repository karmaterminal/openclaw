import { a as consumeStagedPostCompactionDelegates$1, d as stagePostCompactionDelegate$1 } from "./delegate-store-BKkoivDc.js";
//#region src/auto-reply/continuation-delegate-store.ts
function stagePostCompactionDelegate(sessionKey, delegate) {
	stagePostCompactionDelegate$1(sessionKey, {
		task: delegate.task,
		stagedAt: delegate.createdAt ?? Date.now()
	});
}
function consumeStagedPostCompactionDelegates(sessionKey) {
	return consumeStagedPostCompactionDelegates$1(sessionKey).map((d) => ({
		task: d.task,
		createdAt: Date.now(),
		silent: true,
		silentWake: true
	}));
}
//#endregion
export { stagePostCompactionDelegate as n, consumeStagedPostCompactionDelegates as t };
