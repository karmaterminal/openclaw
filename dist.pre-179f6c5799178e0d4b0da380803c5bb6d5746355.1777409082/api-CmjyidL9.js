import { n as resolveAgentModelPrimaryValue } from "./model-input-nfgC47df.js";
import { n as applyAgentDefaultModelPrimary } from "./provider-onboard-DvinB2Zy.js";
import { t as OPENCODE_GO_DEFAULT_MODEL_REF } from "./onboard-DHOAU055.js";
//#region extensions/opencode-go/api.ts
function applyOpencodeGoModelDefault(cfg) {
	if (resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model) === "opencode-go/kimi-k2.5") return {
		next: cfg,
		changed: false
	};
	return {
		next: applyAgentDefaultModelPrimary(cfg, OPENCODE_GO_DEFAULT_MODEL_REF),
		changed: true
	};
}
//#endregion
export { applyOpencodeGoModelDefault as t };
