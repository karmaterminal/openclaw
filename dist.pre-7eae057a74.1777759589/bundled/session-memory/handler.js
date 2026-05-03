import { c as resolveAgentWorkspaceDir } from "../../run-with-concurrency-kEFC1Fle.js";
import { c as resolveStateDir } from "../../paths-C6TxBCvO.js";
import { t as createSubsystemLogger } from "../../subsystem-W834z9Wa.js";
import { B as resolveAgentIdFromSessionKey } from "../../workspace-CPNwHoy5.js";
import "../../logger-D4RcXHR-.js";
import "../../model-selection-BNmx-5dK.js";
import "../../github-copilot-token-D13V9YBz.js";
import "../../legacy-names-Bkl4tjN-.js";
import "../../thinking-BSI0A_UU.js";
import "../../tokens-Cyi-NbsV.js";
import "../../pi-embedded-CWtZqfu_.js";
import "../../plugins-CicF7Sh0.js";
import "../../accounts-DC0-no5N.js";
import "../../send-BncVoacz.js";
import "../../send-B8j0XMrX.js";
import "../../deliver-CwljTGPZ.js";
import "../../diagnostic-C1eWb34F.js";
import "../../accounts-CIZkE0D6.js";
import "../../image-ops-B74f5UcL.js";
import "../../send-CBQSvyUr.js";
import "../../pi-model-discovery-CTmb5aik.js";
import { dt as hasInterSessionUserProvenance } from "../../pi-embedded-helpers-DfOkrX6e.js";
import "../../chrome-D77jXkUt.js";
import "../../frontmatter-BFHzrAY7.js";
import "../../skills-Cz8U8OxJ.js";
import "../../path-alias-guards-DBVdJRcc.js";
import "../../redact-DGz6yigq.js";
import "../../errors-DDrhcWHi.js";
import { c as writeFileWithinRoot } from "../../fs-safe-CeZ_BXcn.js";
import "../../proxy-env-D9IYwjc-.js";
import "../../store-CK_KPHGA.js";
import "../../accounts-BKj4i_FA.js";
import "../../paths-Cgd1FfOW.js";
import "../../tool-images-CVs6nDvi.js";
import "../../image-W9Gb15qU.js";
import "../../audio-transcription-runner-KEFoH8Ss.js";
import "../../fetch-0LnRkPTm.js";
import "../../fetch-guard-DesBvzYZ.js";
import "../../api-key-rotation-B3SB7s0a.js";
import "../../proxy-fetch-ChfJDZwG.js";
import "../../ir-Bnf4tSUT.js";
import "../../render-DW7AcFdD.js";
import "../../target-errors-BigLPEVy.js";
import "../../commands-registry-Dvc97QMQ.js";
import "../../skill-commands-CS5mvtDJ.js";
import "../../fetch-BfuG8uZ8.js";
import "../../channel-activity-C3M0wXiU.js";
import "../../tables-CxCQzXB_.js";
import "../../send-C2Pk4ha1.js";
import "../../outbound-attachment-BVJjuYk8.js";
import "../../send-BW988Zug.js";
import "../../proxy-CecQTx_Z.js";
import "../../manager-y6tyHcUu.js";
import "../../query-expansion-Dv_ykYOe.js";
import { generateSlugViaLLM } from "../../llm-slug-generator.js";
import { t as resolveHookConfig } from "../../config-DWRgGn0l.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

//#region src/hooks/bundled/session-memory/handler.ts
/**
* Session memory hook handler
*
* Saves session context to memory when /new or /reset command is triggered
* Creates a new dated memory file with LLM-generated slug
*/
const log = createSubsystemLogger("hooks/session-memory");
/**
* Read recent messages from session file for slug generation
*/
async function getRecentSessionContent(sessionFilePath, messageCount = 15) {
	try {
		const lines = (await fs.readFile(sessionFilePath, "utf-8")).trim().split("\n");
		const allMessages = [];
		for (const line of lines) try {
			const entry = JSON.parse(line);
			if (entry.type === "message" && entry.message) {
				const msg = entry.message;
				const role = msg.role;
				if ((role === "user" || role === "assistant") && msg.content) {
					if (role === "user" && hasInterSessionUserProvenance(msg)) continue;
					const text = Array.isArray(msg.content) ? msg.content.find((c) => c.type === "text")?.text : msg.content;
					if (text && !text.startsWith("/")) allMessages.push(`${role}: ${text}`);
				}
			}
		} catch {}
		return allMessages.slice(-messageCount).join("\n");
	} catch {
		return null;
	}
}
/**
* Try the active transcript first; if /new already rotated it,
* fallback to the latest .jsonl.reset.* sibling.
*/
async function getRecentSessionContentWithResetFallback(sessionFilePath, messageCount = 15) {
	const primary = await getRecentSessionContent(sessionFilePath, messageCount);
	if (primary) return primary;
	try {
		const dir = path.dirname(sessionFilePath);
		const resetPrefix = `${path.basename(sessionFilePath)}.reset.`;
		const resetCandidates = (await fs.readdir(dir)).filter((name) => name.startsWith(resetPrefix)).toSorted();
		if (resetCandidates.length === 0) return primary;
		const latestResetPath = path.join(dir, resetCandidates[resetCandidates.length - 1]);
		const fallback = await getRecentSessionContent(latestResetPath, messageCount);
		if (fallback) log.debug("Loaded session content from reset fallback", {
			sessionFilePath,
			latestResetPath
		});
		return fallback || primary;
	} catch {
		return primary;
	}
}
function stripResetSuffix(fileName) {
	const resetIndex = fileName.indexOf(".reset.");
	return resetIndex === -1 ? fileName : fileName.slice(0, resetIndex);
}
async function findPreviousSessionFile(params) {
	try {
		const files = await fs.readdir(params.sessionsDir);
		const fileSet = new Set(files);
		const baseFromReset = params.currentSessionFile ? stripResetSuffix(path.basename(params.currentSessionFile)) : void 0;
		if (baseFromReset && fileSet.has(baseFromReset)) return path.join(params.sessionsDir, baseFromReset);
		const trimmedSessionId = params.sessionId?.trim();
		if (trimmedSessionId) {
			const canonicalFile = `${trimmedSessionId}.jsonl`;
			if (fileSet.has(canonicalFile)) return path.join(params.sessionsDir, canonicalFile);
			const topicVariants = files.filter((name) => name.startsWith(`${trimmedSessionId}-topic-`) && name.endsWith(".jsonl") && !name.includes(".reset.")).toSorted().toReversed();
			if (topicVariants.length > 0) return path.join(params.sessionsDir, topicVariants[0]);
		}
		if (!params.currentSessionFile) return;
		const nonResetJsonl = files.filter((name) => name.endsWith(".jsonl") && !name.includes(".reset.")).toSorted().toReversed();
		if (nonResetJsonl.length > 0) return path.join(params.sessionsDir, nonResetJsonl[0]);
	} catch {}
}
/**
* Save session context to memory when /new or /reset command is triggered
*/
const saveSessionToMemory = async (event) => {
	const isResetCommand = event.action === "new" || event.action === "reset";
	if (event.type !== "command" || !isResetCommand) return;
	try {
		log.debug("Hook triggered for reset/new command", { action: event.action });
		const context = event.context || {};
		const cfg = context.cfg;
		const agentId = resolveAgentIdFromSessionKey(event.sessionKey);
		const workspaceDir = cfg ? resolveAgentWorkspaceDir(cfg, agentId) : path.join(resolveStateDir(process.env, os.homedir), "workspace");
		const memoryDir = path.join(workspaceDir, "memory");
		await fs.mkdir(memoryDir, { recursive: true });
		const now = new Date(event.timestamp);
		const dateStr = now.toISOString().split("T")[0];
		const sessionEntry = context.previousSessionEntry || context.sessionEntry || {};
		const currentSessionId = sessionEntry.sessionId;
		let currentSessionFile = sessionEntry.sessionFile || void 0;
		if (!currentSessionFile || currentSessionFile.includes(".reset.")) {
			const sessionsDirs = /* @__PURE__ */ new Set();
			if (currentSessionFile) sessionsDirs.add(path.dirname(currentSessionFile));
			sessionsDirs.add(path.join(workspaceDir, "sessions"));
			for (const sessionsDir of sessionsDirs) {
				const recoveredSessionFile = await findPreviousSessionFile({
					sessionsDir,
					currentSessionFile,
					sessionId: currentSessionId
				});
				if (!recoveredSessionFile) continue;
				currentSessionFile = recoveredSessionFile;
				log.debug("Found previous session file", { file: currentSessionFile });
				break;
			}
		}
		log.debug("Session context resolved", {
			sessionId: currentSessionId,
			sessionFile: currentSessionFile,
			hasCfg: Boolean(cfg)
		});
		const sessionFile = currentSessionFile || void 0;
		const hookConfig = resolveHookConfig(cfg, "session-memory");
		const messageCount = typeof hookConfig?.messages === "number" && hookConfig.messages > 0 ? hookConfig.messages : 15;
		let slug = null;
		let sessionContent = null;
		if (sessionFile) {
			sessionContent = await getRecentSessionContentWithResetFallback(sessionFile, messageCount);
			log.debug("Session content loaded", {
				length: sessionContent?.length ?? 0,
				messageCount
			});
			const allowLlmSlug = !(process.env.OPENCLAW_TEST_FAST === "1" || process.env.VITEST === "true" || process.env.VITEST === "1" || false) && hookConfig?.llmSlug !== false;
			if (sessionContent && cfg && allowLlmSlug) {
				log.debug("Calling generateSlugViaLLM...");
				slug = await generateSlugViaLLM({
					sessionContent,
					cfg
				});
				log.debug("Generated slug", { slug });
			}
		}
		if (!slug) {
			slug = now.toISOString().split("T")[1].split(".")[0].replace(/:/g, "").slice(0, 4);
			log.debug("Using fallback timestamp slug", { slug });
		}
		const filename = `${dateStr}-${slug}.md`;
		const memoryFilePath = path.join(memoryDir, filename);
		log.debug("Memory file path resolved", {
			filename,
			path: memoryFilePath.replace(os.homedir(), "~")
		});
		const timeStr = now.toISOString().split("T")[1].split(".")[0];
		const sessionId = sessionEntry.sessionId || "unknown";
		const source = context.commandSource || "unknown";
		const entryParts = [
			`# Session: ${dateStr} ${timeStr} UTC`,
			"",
			`- **Session Key**: ${event.sessionKey}`,
			`- **Session ID**: ${sessionId}`,
			`- **Source**: ${source}`,
			""
		];
		if (sessionContent) entryParts.push("## Conversation Summary", "", sessionContent, "");
		await writeFileWithinRoot({
			rootDir: memoryDir,
			relativePath: filename,
			data: entryParts.join("\n"),
			encoding: "utf-8"
		});
		log.debug("Memory file written successfully");
		const relPath = memoryFilePath.replace(os.homedir(), "~");
		log.info(`Session context saved to ${relPath}`);
	} catch (err) {
		if (err instanceof Error) log.error("Failed to save session memory", {
			errorName: err.name,
			errorMessage: err.message,
			stack: err.stack
		});
		else log.error("Failed to save session memory", { error: String(err) });
	}
};

//#endregion
export { saveSessionToMemory as default };