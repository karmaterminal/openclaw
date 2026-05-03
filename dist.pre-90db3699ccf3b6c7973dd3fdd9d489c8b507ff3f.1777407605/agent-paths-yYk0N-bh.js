import { m as resolveUserPath } from "./utils-CB8xp0O4.js";
import { _ as resolveStateDir } from "./paths-D92DjaZ-.js";
import { t as DEFAULT_AGENT_ID } from "./session-key-Cn2QoOyX.js";
import path from "node:path";
//#region src/agents/agent-paths.ts
function resolveOpenClawAgentDir(env = process.env) {
	const override = env.OPENCLAW_AGENT_DIR?.trim() || env.PI_CODING_AGENT_DIR?.trim();
	if (override) return resolveUserPath(override, env);
	return resolveUserPath(path.join(resolveStateDir(env), "agents", DEFAULT_AGENT_ID, "agent"), env);
}
//#endregion
export { resolveOpenClawAgentDir as t };
