import { i as resolveAnthropicVertexConfigApiKey, t as hasAnthropicVertexAvailableAuth } from "../../region-DKsz_PYv.js";
import { n as buildAnthropicVertexProvider } from "../../provider-catalog-A0x8KDe1.js";
//#region extensions/anthropic-vertex/provider-discovery.ts
const PROVIDER_ID = "anthropic-vertex";
function mergeImplicitAnthropicVertexProvider(params) {
	const { existing, implicit } = params;
	if (!existing) return implicit;
	return {
		...implicit,
		...existing,
		models: Array.isArray(existing.models) && existing.models.length > 0 ? existing.models : implicit.models
	};
}
function resolveImplicitAnthropicVertexProvider(params) {
	const env = params?.env ?? process.env;
	if (!hasAnthropicVertexAvailableAuth(env)) return null;
	return buildAnthropicVertexProvider({ env });
}
async function runAnthropicVertexCatalog(ctx) {
	const implicit = resolveImplicitAnthropicVertexProvider({ env: ctx.env });
	if (!implicit) return null;
	return { provider: mergeImplicitAnthropicVertexProvider({
		existing: ctx.config.models?.providers?.[PROVIDER_ID],
		implicit
	}) };
}
const anthropicVertexProviderDiscovery = {
	id: PROVIDER_ID,
	label: "Anthropic Vertex",
	docsPath: "/providers/models",
	auth: [],
	catalog: {
		order: "simple",
		run: runAnthropicVertexCatalog
	},
	resolveConfigApiKey: ({ env }) => resolveAnthropicVertexConfigApiKey(env)
};
//#endregion
export { anthropicVertexProviderDiscovery, anthropicVertexProviderDiscovery as default };
