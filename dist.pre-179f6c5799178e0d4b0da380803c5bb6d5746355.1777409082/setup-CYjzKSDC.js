import "./utils-BMRcljdi.js";
import "./types.secrets-v6szeegc.js";
import "./setup-helpers-D2FCSunP.js";
import "./setup-wizard-helpers-hupe-kT7.js";
import "./setup-binary-BQNz2_oh.js";
import "./setup-wizard-proxy-DonuZBjE.js";
//#region src/plugin-sdk/resolution-notes.ts
/** Format a short note that separates successfully resolved targets from unresolved passthrough values. */
function formatResolvedUnresolvedNote(params) {
	if (params.resolved.length === 0 && params.unresolved.length === 0) return;
	return [params.resolved.length > 0 ? `Resolved: ${params.resolved.join(", ")}` : void 0, params.unresolved.length > 0 ? `Unresolved (kept as typed): ${params.unresolved.join(", ")}` : void 0].filter(Boolean).join("\n");
}
//#endregion
export { formatResolvedUnresolvedNote as t };
