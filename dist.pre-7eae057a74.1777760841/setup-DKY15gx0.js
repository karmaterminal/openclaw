import "./utils-BMRcljdi.js";
import "./types.secrets-D9j6Z-gp.js";
import "./setup-helpers-B0_DD2vo.js";
import "./setup-wizard-helpers-DRvZV2lB.js";
import "./setup-binary-Dm4MkHx5.js";
import "./setup-wizard-proxy--3xUVHLE.js";
//#region src/plugin-sdk/resolution-notes.ts
/** Format a short note that separates successfully resolved targets from unresolved passthrough values. */
function formatResolvedUnresolvedNote(params) {
	if (params.resolved.length === 0 && params.unresolved.length === 0) return;
	return [params.resolved.length > 0 ? `Resolved: ${params.resolved.join(", ")}` : void 0, params.unresolved.length > 0 ? `Unresolved (kept as typed): ${params.unresolved.join(", ")}` : void 0].filter(Boolean).join("\n");
}
//#endregion
export { formatResolvedUnresolvedNote as t };
