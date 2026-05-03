import { t as createSubsystemLogger } from "./subsystem-CJBoMDt5.js";
import { a as loadConfig } from "./io-CBRjt33P.js";
import { b as resolveAgentWorkspaceDir, x as resolveDefaultAgentId } from "./agent-scope-D-T17Rdc.js";
import "./config-BjiV0z87.js";
import { t as applyPluginAutoEnable } from "./plugin-auto-enable-DdH3n9V8.js";
import { l as resolvePluginActivationSourceConfig } from "./loader-708jrx4Y.js";
import "./logging-CsdNOkNt.js";
//#region src/plugins/runtime/load-context.ts
const log = createSubsystemLogger("plugins");
function createPluginRuntimeLoaderLogger() {
	return {
		info: (message) => log.info(message),
		warn: (message) => log.warn(message),
		error: (message) => log.error(message),
		debug: (message) => log.debug(message)
	};
}
function resolvePluginRuntimeLoadContext(options) {
	const env = options?.env ?? process.env;
	const rawConfig = options?.config ?? loadConfig();
	const activationSourceConfig = resolvePluginActivationSourceConfig({
		config: rawConfig,
		activationSourceConfig: options?.activationSourceConfig
	});
	const autoEnabled = applyPluginAutoEnable({
		config: rawConfig,
		env
	});
	const config = autoEnabled.config;
	const workspaceDir = options?.workspaceDir ?? resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
	return {
		rawConfig,
		config,
		activationSourceConfig,
		autoEnabledReasons: autoEnabled.autoEnabledReasons,
		workspaceDir,
		env,
		logger: options?.logger ?? createPluginRuntimeLoaderLogger()
	};
}
function buildPluginRuntimeLoadOptions(context, overrides) {
	return buildPluginRuntimeLoadOptionsFromValues(context, overrides);
}
function buildPluginRuntimeLoadOptionsFromValues(values, overrides) {
	return {
		config: values.config,
		activationSourceConfig: values.activationSourceConfig,
		autoEnabledReasons: values.autoEnabledReasons,
		workspaceDir: values.workspaceDir,
		env: values.env,
		logger: values.logger,
		...overrides
	};
}
//#endregion
export { resolvePluginRuntimeLoadContext as i, buildPluginRuntimeLoadOptionsFromValues as n, createPluginRuntimeLoaderLogger as r, buildPluginRuntimeLoadOptions as t };
