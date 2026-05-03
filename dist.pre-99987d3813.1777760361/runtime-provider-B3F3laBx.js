import { t as resolveMemoryBackendConfig } from "./backend-config-qeP5BARJ.js";
import "./memory-core-host-runtime-files-9mbuvd3T.js";
import { n as getMemorySearchManager, t as closeAllMemorySearchManagers } from "./memory-1-w34WPp.js";
//#region extensions/memory-core/src/runtime-provider.ts
const memoryRuntime = {
	async getMemorySearchManager(params) {
		const { manager, error } = await getMemorySearchManager(params);
		return {
			manager,
			error
		};
	},
	resolveMemoryBackendConfig(params) {
		return resolveMemoryBackendConfig(params);
	},
	async closeAllMemorySearchManagers() {
		await closeAllMemorySearchManagers();
	}
};
//#endregion
export { memoryRuntime as t };
