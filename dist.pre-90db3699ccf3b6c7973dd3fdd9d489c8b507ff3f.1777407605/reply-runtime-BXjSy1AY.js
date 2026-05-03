import { r as logVerbose } from "./globals-Bo8QPRgM.js";
import { o as resolveDefaultModelForAgent } from "./model-selection-B7RNWcLj.js";
import { t as requireApiKey } from "./model-auth-runtime-shared-7xTwSNzs.js";
import "./tokens-CYuOTnyM.js";
import "./heartbeat-DiRG9-0G.js";
import "./model-auth-CnLreLvU.js";
import "./chunk-Lggyx_kW.js";
import { n as resolveModelAsync } from "./model-C2LXeqL4.js";
import "./dispatch-QTzIv_tK.js";
import "./provider-dispatcher-CdztCBvB.js";
import "./get-reply-DX3r3Yfg.js";
import "./abort-Cv6ek-gD.js";
import "./btw-command-DpvrPRhS.js";
import { t as prepareModelForSimpleCompletion } from "./simple-completion-transport-Bf6CBils.js";
import { n as getRuntimeAuthForModel } from "./runtime-model-auth.runtime-b3WM2vXn.js";
import { completeSimple } from "@mariozechner/pi-ai";
//#region src/auto-reply/reply/conversation-label-generator.ts
const DEFAULT_MAX_LABEL_LENGTH = 128;
const TIMEOUT_MS = 15e3;
function isTextContentBlock(block) {
	return block.type === "text";
}
async function generateConversationLabel(params) {
	const { userMessage, prompt, cfg, agentId, agentDir } = params;
	const maxLength = typeof params.maxLength === "number" && Number.isFinite(params.maxLength) && params.maxLength > 0 ? Math.floor(params.maxLength) : DEFAULT_MAX_LABEL_LENGTH;
	const modelRef = resolveDefaultModelForAgent({
		cfg,
		agentId
	});
	const resolved = await resolveModelAsync(modelRef.provider, modelRef.model, agentDir, cfg);
	if (!resolved.model) {
		logVerbose(`conversation-label-generator: failed to resolve model ${modelRef.provider}/${modelRef.model}`);
		return null;
	}
	const completionModel = prepareModelForSimpleCompletion({
		model: resolved.model,
		cfg
	});
	const apiKey = requireApiKey(await getRuntimeAuthForModel({
		model: completionModel,
		cfg,
		workspaceDir: agentDir
	}), modelRef.provider);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const text = (await completeSimple(completionModel, { messages: [{
			role: "user",
			content: `${prompt}\n\n${userMessage}`,
			timestamp: Date.now()
		}] }, {
			apiKey,
			maxTokens: 100,
			temperature: .3,
			signal: controller.signal
		})).content.filter(isTextContentBlock).map((block) => block.text).join("").trim();
		if (!text) return null;
		return text.slice(0, maxLength);
	} finally {
		clearTimeout(timeout);
	}
}
//#endregion
export { generateConversationLabel as t };
