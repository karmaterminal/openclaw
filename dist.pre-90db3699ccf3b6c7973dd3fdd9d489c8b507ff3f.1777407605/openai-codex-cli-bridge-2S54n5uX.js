import { s as prepareCodexAuthBridge } from "./provider-auth-runtime-PHht0fxa.js";
//#region extensions/openai/openai-codex-cli-bridge.ts
async function prepareOpenAICodexCliExecution(ctx) {
	if (!ctx.agentDir || !ctx.authProfileId) return null;
	const bridge = await prepareCodexAuthBridge({
		agentDir: ctx.agentDir,
		bridgeDir: "cli-auth",
		profileId: ctx.authProfileId
	});
	if (!bridge) return null;
	return {
		env: { CODEX_HOME: bridge.codexHome },
		clearEnv: bridge.clearEnv
	};
}
//#endregion
export { prepareOpenAICodexCliExecution as t };
