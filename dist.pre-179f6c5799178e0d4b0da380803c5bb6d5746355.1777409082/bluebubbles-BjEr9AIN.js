import "./zod-schema.core-Bi0Ke4ns.js";
import "./config-schema-CNOE4EfY.js";
import "./zod-schema.agent-runtime-BDlEXxX3.js";
import "./identity-Dok0oB-y.js";
import { i as loadBundledPluginPublicSurfaceModuleSync } from "./facade-loader-CSyHK1XM.js";
import "./common-CiiKqT5H.js";
import "./text-runtime-CF6GykCk.js";
import "./setup-helpers-D2FCSunP.js";
import "./dm-policy-shared-C4gD5QZm.js";
import "./history-Da8yvSVB.js";
import "./bluebubbles-policy-qyUDA0RK.js";
import "./setup-wizard-helpers-hupe-kT7.js";
import "./channel-reply-pipeline-BS4-Z0kM.js";
import "./channel-targets-C8vGVVJ7.js";
import "./channel-pairing-J21HARkM.js";
import "./status-helpers-BJQYcoys.js";
import "./webhook-ingress-DJHUcvA_.js";
//#region src/channels/plugins/bluebubbles-actions.ts
const BLUEBUBBLES_ACTIONS = {
	react: { gate: "reactions" },
	edit: {
		gate: "edit",
		unsupportedOnMacOS26: true
	},
	unsend: { gate: "unsend" },
	reply: { gate: "reply" },
	sendWithEffect: { gate: "sendWithEffect" },
	renameGroup: {
		gate: "renameGroup",
		groupOnly: true
	},
	setGroupIcon: {
		gate: "setGroupIcon",
		groupOnly: true
	},
	addParticipant: {
		gate: "addParticipant",
		groupOnly: true
	},
	removeParticipant: {
		gate: "removeParticipant",
		groupOnly: true
	},
	leaveGroup: {
		gate: "leaveGroup",
		groupOnly: true
	},
	sendAttachment: { gate: "sendAttachment" }
};
const BLUEBUBBLES_ACTION_SPECS = BLUEBUBBLES_ACTIONS;
const BLUEBUBBLES_ACTION_NAMES = Object.keys(BLUEBUBBLES_ACTIONS);
new Set(BLUEBUBBLES_ACTION_NAMES.filter((action) => BLUEBUBBLES_ACTION_SPECS[action]?.groupOnly));
//#endregion
//#region src/plugin-sdk/bluebubbles.ts
function loadBlueBubblesFacadeModule() {
	return loadBundledPluginPublicSurfaceModuleSync({
		dirName: "bluebubbles",
		artifactBasename: "api.js"
	});
}
function createBlueBubblesConversationBindingManager(params) {
	return loadBlueBubblesFacadeModule().createBlueBubblesConversationBindingManager(params);
}
function normalizeBlueBubblesAcpConversationId(conversationId) {
	return loadBlueBubblesFacadeModule().normalizeBlueBubblesAcpConversationId(conversationId);
}
function matchBlueBubblesAcpConversation(params) {
	return loadBlueBubblesFacadeModule().matchBlueBubblesAcpConversation(params);
}
function resolveBlueBubblesConversationIdFromTarget(target) {
	return loadBlueBubblesFacadeModule().resolveBlueBubblesConversationIdFromTarget(target);
}
function collectBlueBubblesStatusIssues(accounts) {
	return loadBlueBubblesFacadeModule().collectBlueBubblesStatusIssues(accounts);
}
//#endregion
export { resolveBlueBubblesConversationIdFromTarget as a, normalizeBlueBubblesAcpConversationId as i, createBlueBubblesConversationBindingManager as n, BLUEBUBBLES_ACTIONS as o, matchBlueBubblesAcpConversation as r, BLUEBUBBLES_ACTION_NAMES as s, collectBlueBubblesStatusIssues as t };
