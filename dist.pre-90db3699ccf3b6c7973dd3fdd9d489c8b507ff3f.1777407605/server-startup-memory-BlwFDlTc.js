import { g as listAgentIds } from "./agent-scope-D-T17Rdc.js";
import { n as getActiveMemorySearchManager, r as resolveActiveMemoryBackendConfig } from "./memory-runtime-gqmPdRd6.js";
import { t as resolveMemorySearchConfig } from "./memory-search-DLD3zBhp.js";
//#region src/gateway/server-startup-memory.ts
async function startGatewayMemoryBackend(params) {
	const agentIds = listAgentIds(params.cfg);
	for (const agentId of agentIds) {
		if (!resolveMemorySearchConfig(params.cfg, agentId)) continue;
		const resolved = resolveActiveMemoryBackendConfig({
			cfg: params.cfg,
			agentId
		});
		if (!resolved) continue;
		if (resolved.backend !== "qmd" || !resolved.qmd) continue;
		const { manager, error } = await getActiveMemorySearchManager({
			cfg: params.cfg,
			agentId
		});
		if (!manager) {
			params.log.warn(`qmd memory startup initialization failed for agent "${agentId}": ${error ?? "unknown error"}`);
			continue;
		}
		params.log.info?.(`qmd memory startup initialization armed for agent "${agentId}"`);
	}
}
//#endregion
export { startGatewayMemoryBackend };
