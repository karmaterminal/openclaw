import "./utils-DvkbxKCZ.js";
import "./types.secrets-BHp0Y_k0.js";
import "./setup-helpers-DB1Y49FN.js";
import "./setup-wizard-helpers-DqDljZdJ.js";
import "./setup-binary-3MkHLWE0.js";
import "./setup-wizard-proxy-EvhDl6lq.js";
//#region src/plugin-sdk/resolution-notes.ts
/** Format a short note that separates successfully resolved targets from unresolved passthrough values. */
function formatResolvedUnresolvedNote(params) {
	if (params.resolved.length === 0 && params.unresolved.length === 0) return;
	return [params.resolved.length > 0 ? `Resolved: ${params.resolved.join(", ")}` : void 0, params.unresolved.length > 0 ? `Unresolved (kept as typed): ${params.unresolved.join(", ")}` : void 0].filter(Boolean).join("\n");
}
//#endregion
export { formatResolvedUnresolvedNote as t };
