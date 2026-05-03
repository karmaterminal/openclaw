import { i as loadBundledPluginPublicSurfaceModuleSync } from "../facade-loader-CoH-C6gj.js";
//#region src/plugin-sdk/mattermost-policy.ts
function loadFacadeModule() {
	return loadBundledPluginPublicSurfaceModuleSync({
		dirName: "mattermost",
		artifactBasename: "policy-api.js"
	});
}
const isMattermostSenderAllowed = ((...args) => loadFacadeModule()["isMattermostSenderAllowed"](...args));
//#endregion
export { isMattermostSenderAllowed };
