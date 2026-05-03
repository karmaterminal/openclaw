import { a as normalizeLowercaseStringOrEmpty } from "./string-coerce-CjxCKZ6B.js";
import "./text-runtime-ITCc6m8o.js";
//#region extensions/github-copilot/replay-policy.ts
function buildGithubCopilotReplayPolicy(modelId) {
	return normalizeLowercaseStringOrEmpty(modelId).includes("claude") ? { dropThinkingBlocks: true } : {};
}
//#endregion
export { buildGithubCopilotReplayPolicy as t };
