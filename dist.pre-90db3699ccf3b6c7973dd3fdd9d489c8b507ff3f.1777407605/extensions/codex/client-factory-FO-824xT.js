import { r as getSharedCodexAppServerClient } from "./shared-client-C5M1Nphx.js";
//#region extensions/codex/src/app-server/client-factory.ts
const defaultCodexAppServerClientFactory = (startOptions, authProfileId) => getSharedCodexAppServerClient({
	startOptions,
	authProfileId
});
function createCodexAppServerClientFactoryTestHooks(setFactory) {
	return {
		setCodexAppServerClientFactoryForTests(factory) {
			setFactory(factory);
		},
		resetCodexAppServerClientFactoryForTests() {
			setFactory(defaultCodexAppServerClientFactory);
		}
	};
}
//#endregion
export { defaultCodexAppServerClientFactory as n, createCodexAppServerClientFactoryTestHooks as t };
