import { a as normalizeLowercaseStringOrEmpty } from "./string-coerce-C1IzJjqi.js";
import "./text-runtime-CF6GykCk.js";
//#region extensions/github-copilot/replay-policy.ts
function buildGithubCopilotReplayPolicy(modelId) {
	return normalizeLowercaseStringOrEmpty(modelId).includes("claude") ? { dropThinkingBlocks: true } : {};
}
//#endregion
export { buildGithubCopilotReplayPolicy as t };
