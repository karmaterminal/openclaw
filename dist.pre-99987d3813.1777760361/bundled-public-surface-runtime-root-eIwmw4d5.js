import { i as prepareBundledPluginRuntimeRoot, n as isBuiltBundledPluginRuntimeRoot } from "./bundled-runtime-root-CCm_zSck.js";
import path from "node:path";
//#region src/plugins/bundled-public-surface-runtime-root.ts
function resolveBuiltBundledPluginRootFromModulePath(params) {
	const resolvedModulePath = path.resolve(params.modulePath);
	let currentDir = path.dirname(resolvedModulePath);
	while (true) {
		if (path.basename(currentDir) === params.pluginId && isBuiltBundledPluginRuntimeRoot(currentDir)) {
			const relativePath = path.relative(currentDir, resolvedModulePath);
			if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) return currentDir;
		}
		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}
function prepareBuiltBundledPluginPublicSurfaceLocation(params) {
	if (params.installRuntimeDeps === false) return params.location;
	const pluginRoot = resolveBuiltBundledPluginRootFromModulePath({
		modulePath: params.location.modulePath,
		pluginId: params.pluginId
	});
	if (!pluginRoot) return params.location;
	const prepared = prepareBundledPluginRuntimeRoot({
		pluginId: params.pluginId,
		pluginRoot,
		modulePath: params.location.modulePath,
		...params.env ? { env: params.env } : {}
	});
	return {
		modulePath: prepared.modulePath,
		boundaryRoot: prepared.pluginRoot
	};
}
//#endregion
export { prepareBuiltBundledPluginPublicSurfaceLocation as t };
