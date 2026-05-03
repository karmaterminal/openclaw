import { a as getLogger } from "./logger-DTX5koY3.js";
import { c as normalizeAgentId } from "./session-key-Cn2QoOyX.js";
import { x as resolveDefaultAgentId } from "./agent-scope-D-T17Rdc.js";
import { o as updateSessionStore } from "./store-COeaE7A7.js";
import "./sessions-THKm0e_w.js";
import { u as resolveStorePath } from "./paths-D6msg0S1.js";
import { a as resolveStoredSessionOwnerAgentId } from "./session-store-key-BvvxupEc.js";
import { n as requireValidConfigSnapshot, t as requireValidConfigFileSnapshot$1 } from "./config-validation-DORorlvk.js";
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
