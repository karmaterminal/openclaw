//#region extensions/codex/harness.ts
const DEFAULT_CODEX_HARNESS_PROVIDER_IDS = new Set(["codex"]);
function createCodexAppServerAgentHarness(options) {
	const providerIds = new Set([...options?.providerIds ?? DEFAULT_CODEX_HARNESS_PROVIDER_IDS].map((id) => id.trim().toLowerCase()));
	return {
		id: options?.id ?? "codex",
		label: options?.label ?? "Codex agent harness",
		supports: (ctx) => {
			const provider = ctx.provider.trim().toLowerCase();
			if (providerIds.has(provider)) return {
				supported: true,
				priority: 100
			};
			return {
				supported: false,
				reason: `provider is not one of: ${[...providerIds].toSorted().join(", ")}`
			};
		},
		runAttempt: async (params) => {
			const { runCodexAppServerAttempt } = await import("./run-attempt-sbLvYJcF.js");
			return runCodexAppServerAttempt(params, { pluginConfig: options?.pluginConfig });
		},
		compact: async (params) => {
			const { maybeCompactCodexAppServerSession } = await import("./compact-DsRpyrQb.js");
			return maybeCompactCodexAppServerSession(params, { pluginConfig: options?.pluginConfig });
		},
		reset: async (params) => {
			if (params.sessionFile) {
				const { clearCodexAppServerBinding } = await import("./session-binding-B50a7Hp4.js");
				await clearCodexAppServerBinding(params.sessionFile);
			}
		},
		dispose: async () => {
			const { clearSharedCodexAppServerClient } = await import("./shared-client-C5M1Nphx.js").then((n) => n.i);
			clearSharedCodexAppServerClient();
		}
	};
}
//#endregion
export { createCodexAppServerAgentHarness };
