import { a as resolveAgentDir, c as resolveAgentWorkspaceDir, l as resolveDefaultAgentId, o as resolveAgentEffectiveModelPrimary } from "./run-with-concurrency-kEFC1Fle.js";
import "./paths-C6TxBCvO.js";
import { t as createSubsystemLogger } from "./subsystem-W834z9Wa.js";
import "./workspace-CPNwHoy5.js";
import "./logger-D4RcXHR-.js";
import { br as DEFAULT_MODEL, l as parseModelRef, xr as DEFAULT_PROVIDER } from "./model-selection-BNmx-5dK.js";
import "./github-copilot-token-D13V9YBz.js";
import "./legacy-names-Bkl4tjN-.js";
import "./thinking-BSI0A_UU.js";
import "./tokens-Cyi-NbsV.js";
import { t as runEmbeddedPiAgent } from "./pi-embedded-CWtZqfu_.js";
import "./plugins-CicF7Sh0.js";
import "./accounts-DC0-no5N.js";
import "./send-BncVoacz.js";
import "./send-B8j0XMrX.js";
import "./deliver-CwljTGPZ.js";
import "./diagnostic-C1eWb34F.js";
import "./accounts-CIZkE0D6.js";
import "./image-ops-B74f5UcL.js";
import "./send-CBQSvyUr.js";
import "./pi-model-discovery-CTmb5aik.js";
import "./pi-embedded-helpers-DfOkrX6e.js";
import "./chrome-D77jXkUt.js";
import "./frontmatter-BFHzrAY7.js";
import "./skills-Cz8U8OxJ.js";
import "./path-alias-guards-DBVdJRcc.js";
import "./redact-DGz6yigq.js";
import "./errors-DDrhcWHi.js";
import "./fs-safe-CeZ_BXcn.js";
import "./proxy-env-D9IYwjc-.js";
import "./store-CK_KPHGA.js";
import "./accounts-BKj4i_FA.js";
import "./paths-Cgd1FfOW.js";
import "./tool-images-CVs6nDvi.js";
import "./image-W9Gb15qU.js";
import "./audio-transcription-runner-KEFoH8Ss.js";
import "./fetch-0LnRkPTm.js";
import "./fetch-guard-DesBvzYZ.js";
import "./api-key-rotation-B3SB7s0a.js";
import "./proxy-fetch-ChfJDZwG.js";
import "./ir-Bnf4tSUT.js";
import "./render-DW7AcFdD.js";
import "./target-errors-BigLPEVy.js";
import "./commands-registry-Dvc97QMQ.js";
import "./skill-commands-CS5mvtDJ.js";
import "./fetch-BfuG8uZ8.js";
import "./channel-activity-C3M0wXiU.js";
import "./tables-CxCQzXB_.js";
import "./send-C2Pk4ha1.js";
import "./outbound-attachment-BVJjuYk8.js";
import "./send-BW988Zug.js";
import "./proxy-CecQTx_Z.js";
import "./manager-y6tyHcUu.js";
import "./query-expansion-Dv_ykYOe.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

//#region src/hooks/llm-slug-generator.ts
/**
* LLM-based slug generator for session memory filenames
*/
const log = createSubsystemLogger("llm-slug-generator");
/**
* Generate a short 1-2 word filename slug from session content using LLM
*/
async function generateSlugViaLLM(params) {
	let tempSessionFile = null;
	try {
		const agentId = resolveDefaultAgentId(params.cfg);
		const workspaceDir = resolveAgentWorkspaceDir(params.cfg, agentId);
		const agentDir = resolveAgentDir(params.cfg, agentId);
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-slug-"));
		tempSessionFile = path.join(tempDir, "session.jsonl");
		const prompt = `Based on this conversation, generate a short 1-2 word filename slug (lowercase, hyphen-separated, no file extension).

Conversation summary:
${params.sessionContent.slice(0, 2e3)}

Reply with ONLY the slug, nothing else. Examples: "vendor-pitch", "api-design", "bug-fix"`;
		const modelRef = resolveAgentEffectiveModelPrimary(params.cfg, agentId);
		const parsed = modelRef ? parseModelRef(modelRef, DEFAULT_PROVIDER) : null;
		const provider = parsed?.provider ?? DEFAULT_PROVIDER;
		const model = parsed?.model ?? DEFAULT_MODEL;
		const result = await runEmbeddedPiAgent({
			sessionId: `slug-generator-${Date.now()}`,
			sessionKey: "temp:slug-generator",
			agentId,
			sessionFile: tempSessionFile,
			workspaceDir,
			agentDir,
			config: params.cfg,
			prompt,
			provider,
			model,
			timeoutMs: 15e3,
			runId: `slug-gen-${Date.now()}`
		});
		if (result.payloads && result.payloads.length > 0) {
			const text = result.payloads[0]?.text;
			if (text) return text.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || null;
		}
		return null;
	} catch (err) {
		const message = err instanceof Error ? err.stack ?? err.message : String(err);
		log.error(`Failed to generate slug: ${message}`);
		return null;
	} finally {
		if (tempSessionFile) try {
			await fs.rm(path.dirname(tempSessionFile), {
				recursive: true,
				force: true
			});
		} catch {}
	}
}

//#endregion
export { generateSlugViaLLM };