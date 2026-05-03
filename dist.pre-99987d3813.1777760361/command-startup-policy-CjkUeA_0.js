import { t as isTruthyEnvValue } from "./env-CqfGXlE5.js";
import { t as resolveCliCommandPathPolicy } from "./command-path-policy-Cvup1Nuu.js";
//#region src/cli/command-startup-policy.ts
function shouldBypassConfigGuardForCommandPath(commandPath) {
	return resolveCliCommandPathPolicy(commandPath).bypassConfigGuard;
}
function shouldSkipRouteConfigGuardForCommandPath(params) {
	const routeConfigGuard = resolveCliCommandPathPolicy(params.commandPath).routeConfigGuard;
	return routeConfigGuard === "always" || routeConfigGuard === "when-suppressed" && params.suppressDoctorStdout;
}
function shouldLoadPluginsForCommandPath(params) {
	const loadPlugins = resolveCliCommandPathPolicy(params.commandPath).loadPlugins;
	if (typeof loadPlugins === "function") return loadPlugins({
		argv: params.argv ?? [],
		commandPath: params.commandPath,
		jsonOutputMode: params.jsonOutputMode
	});
	return loadPlugins === "always" || loadPlugins === "text-only" && !params.jsonOutputMode;
}
function shouldHideCliBannerForCommandPath(commandPath, env = process.env) {
	return isTruthyEnvValue(env.OPENCLAW_HIDE_BANNER) || resolveCliCommandPathPolicy(commandPath).hideBanner;
}
function shouldEnsureCliPathForCommandPath(commandPath) {
	return commandPath.length === 0 || resolveCliCommandPathPolicy(commandPath).ensureCliPath;
}
function resolveCliStartupPolicy(params) {
	const suppressDoctorStdout = params.jsonOutputMode;
	return {
		suppressDoctorStdout,
		hideBanner: shouldHideCliBannerForCommandPath(params.commandPath, params.env),
		skipConfigGuard: params.routeMode ? shouldSkipRouteConfigGuardForCommandPath({
			commandPath: params.commandPath,
			suppressDoctorStdout
		}) : false,
		loadPlugins: shouldLoadPluginsForCommandPath({
			argv: params.argv,
			commandPath: params.commandPath,
			jsonOutputMode: params.jsonOutputMode
		})
	};
}
//#endregion
export { shouldLoadPluginsForCommandPath as a, shouldHideCliBannerForCommandPath as i, shouldBypassConfigGuardForCommandPath as n, shouldSkipRouteConfigGuardForCommandPath as o, shouldEnsureCliPathForCommandPath as r, resolveCliStartupPolicy as t };
