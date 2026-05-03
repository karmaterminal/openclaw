import "./zod-schema.core-FcJGI_qL.js";
import "./config-schema-OPypi1r3.js";
import "./zod-schema.agent-runtime-Da3-jd-w.js";
import "./identity-3awe6JYT.js";
import { i as loadBundledPluginPublicSurfaceModuleSync } from "./facade-loader-CoH-C6gj.js";
import "./common-B-ADznUd.js";
import "./text-runtime-BK-9rIrb.js";
import "./setup-helpers-P3bVHWjM.js";
import "./dm-policy-shared-BJth4iHD.js";
import "./history-qf0oL3B1.js";
import "./bluebubbles-policy-Ch2URz2U.js";
import "./setup-wizard-helpers-xYUM67Xd.js";
import "./channel-reply-pipeline-D2KHRdRa.js";
import "./channel-targets-Bhq22x_u.js";
import "./channel-pairing-_Cp-CTX3.js";
import "./status-helpers-C2uknUoo.js";
import "./webhook-ingress-OluK3LE3.js";
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
