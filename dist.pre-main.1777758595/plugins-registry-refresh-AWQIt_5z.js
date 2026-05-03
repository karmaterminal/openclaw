import { i as formatErrorMessage } from "./errors-RZvg4nzL.js";
import { n as tracePluginLifecyclePhaseAsync } from "./plugin-lifecycle-trace-8GvEu_3k.js";
import { n as loadInstalledPluginIndexInstallRecords } from "./manifest-registry-B4b3w90-.js";
import { y as refreshPluginRegistry } from "./plugin-registry-x83fIWqx.js";
import "./installed-plugin-index-records-BDMzr30g.js";
//#region src/cli/plugins-registry-refresh.ts
async function refreshPluginRegistryAfterConfigMutation(params) {
	try {
		const installRecords = params.installRecords ?? await tracePluginLifecyclePhaseAsync("install records load", () => loadInstalledPluginIndexInstallRecords(params.env ? { env: params.env } : {}), { command: params.traceCommand ?? "registry-refresh" });
		await tracePluginLifecyclePhaseAsync("registry refresh", () => refreshPluginRegistry({
			config: params.config,
			reason: params.reason,
			installRecords,
			...params.workspaceDir ? { workspaceDir: params.workspaceDir } : {},
			...params.env ? { env: params.env } : {}
		}), {
			command: params.traceCommand ?? "registry-refresh",
			reason: params.reason
		});
	} catch (error) {
		params.logger?.warn?.(`Plugin registry refresh failed: ${formatErrorMessage(error)}`);
	}
}
//#endregion
export { refreshPluginRegistryAfterConfigMutation as t };
