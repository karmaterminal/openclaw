import { a as getLogger } from "./logger-BnvCi6Wb.js";
import { c as normalizeAgentId } from "./session-key-CWdvMTMr.js";
import { S as resolveDefaultAgentId } from "./agent-scope-DfXPuZUf.js";
import { o as resolveStoredSessionOwnerAgentId } from "./combined-store-gateway-Bud9w99a.js";
import { u as resolveStorePath } from "./paths-BCOWYnec.js";
import { c as updateSessionStore } from "./store-APN60wqF.js";
import "./sessions-DTfZDTku.js";
import { n as requireValidConfigSnapshot, t as requireValidConfigFileSnapshot$1 } from "./config-validation-CoFaIyIP.js";
//#region src/commands/agents.command-shared.ts
function createQuietRuntime(runtime) {
	return {
		...runtime,
		log: () => {}
	};
}
async function requireValidConfigFileSnapshot(runtime) {
	return await requireValidConfigFileSnapshot$1(runtime);
}
async function requireValidConfig(runtime) {
	return await requireValidConfigSnapshot(runtime);
}
/** Purge session store entries for a deleted agent (#65524). Best-effort. */
async function purgeAgentSessionStoreEntries(cfg, agentId) {
	try {
		const normalizedAgentId = normalizeAgentId(agentId);
		const storeConfig = cfg.session?.store;
		const storeAgentId = typeof storeConfig === "string" && storeConfig.includes("{agentId}") ? normalizedAgentId : normalizeAgentId(resolveDefaultAgentId(cfg));
		await updateSessionStore(resolveStorePath(cfg.session?.store, { agentId: normalizedAgentId }), (store) => {
			for (const key of Object.keys(store)) if (resolveStoredSessionOwnerAgentId({
				cfg,
				agentId: storeAgentId,
				sessionKey: key
			}) === normalizedAgentId) delete store[key];
		});
	} catch (err) {
		getLogger().debug("session store purge skipped during agent delete", err);
	}
}
//#endregion
export { requireValidConfigFileSnapshot as i, purgeAgentSessionStoreEntries as n, requireValidConfig as r, createQuietRuntime as t };
