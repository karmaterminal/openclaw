import "./utils-CB8xp0O4.js";
import "./types.secrets-BZ6RGKR0.js";
import "./setup-helpers-Ch6SdLT5.js";
import "./setup-wizard-helpers-D9irczka.js";
import "./setup-binary-BnrdMKFB.js";
import "./setup-wizard-proxy-DgN_n5OY.js";
//#region src/plugin-sdk/resolution-notes.ts
/** Format a short note that separates successfully resolved targets from unresolved passthrough values. */
function formatResolvedUnresolvedNote(params) {
	if (params.resolved.length === 0 && params.unresolved.length === 0) return;
	return [params.resolved.length > 0 ? `Resolved: ${params.resolved.join(", ")}` : void 0, params.unresolved.length > 0 ? `Unresolved (kept as typed): ${params.unresolved.join(", ")}` : void 0].filter(Boolean).join("\n");
}
//#endregion
export { formatResolvedUnresolvedNote as t };
