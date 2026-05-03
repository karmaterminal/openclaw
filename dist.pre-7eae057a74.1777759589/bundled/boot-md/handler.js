import { c as resolveAgentWorkspaceDir, r as listAgentIds } from "../../run-with-concurrency-kEFC1Fle.js";
import "../../paths-C6TxBCvO.js";
import { i as defaultRuntime, t as createSubsystemLogger } from "../../subsystem-W834z9Wa.js";
import { B as resolveAgentIdFromSessionKey } from "../../workspace-CPNwHoy5.js";
import "../../logger-D4RcXHR-.js";
import "../../model-selection-BNmx-5dK.js";
import "../../github-copilot-token-D13V9YBz.js";
import { a as isGatewayStartupEvent } from "../../legacy-names-Bkl4tjN-.js";
import "../../thinking-BSI0A_UU.js";
import { n as SILENT_REPLY_TOKEN } from "../../tokens-Cyi-NbsV.js";
import { a as agentCommand, o as createDefaultDeps } from "../../pi-embedded-CWtZqfu_.js";
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
import { Dt as resolveMainSessionKey, J as updateSessionStore, Tt as resolveAgentMainSessionKey, W as loadSessionStore } from "../../pi-embedded-helpers-DfOkrX6e.js";
import "../../chrome-D77jXkUt.js";
import "../../frontmatter-BFHzrAY7.js";
import "../../skills-Cz8U8OxJ.js";
import "../../path-alias-guards-DBVdJRcc.js";
import "../../redact-DGz6yigq.js";
import "../../errors-DDrhcWHi.js";
import "../../fs-safe-CeZ_BXcn.js";
import "../../proxy-env-D9IYwjc-.js";
import "../../store-CK_KPHGA.js";
import "../../accounts-BKj4i_FA.js";
import { s as resolveStorePath } from "../../paths-Cgd1FfOW.js";
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
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

//#region src/gateway/boot.ts
function generateBootSessionId() {
	return `boot-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "")}-${crypto.randomUUID().slice(0, 8)}`;
}
const log$1 = createSubsystemLogger("gateway/boot");
const BOOT_FILENAME = "BOOT.md";
function buildBootPrompt(content) {
	return [
		"You are running a boot check. Follow BOOT.md instructions exactly.",
		"",
		"BOOT.md:",
		content,
		"",
		"If BOOT.md asks you to send a message, use the message tool (action=send with channel + target).",
		"Use the `target` field (not `to`) for message tool destinations.",
		`After sending with the message tool, reply with ONLY: ${SILENT_REPLY_TOKEN}.`,
		`If nothing needs attention, reply with ONLY: ${SILENT_REPLY_TOKEN}.`
	].join("\n");
}
async function loadBootFile(workspaceDir) {
	const bootPath = path.join(workspaceDir, BOOT_FILENAME);
	try {
		const trimmed = (await fs.readFile(bootPath, "utf-8")).trim();
		if (!trimmed) return { status: "empty" };
		return {
			status: "ok",
			content: trimmed
		};
	} catch (err) {
		if (err.code === "ENOENT") return { status: "missing" };
		throw err;
	}
}
function snapshotMainSessionMapping(params) {
	const agentId = resolveAgentIdFromSessionKey(params.sessionKey);
	const storePath = resolveStorePath(params.cfg.session?.store, { agentId });
	try {
		const entry = loadSessionStore(storePath, { skipCache: true })[params.sessionKey];
		if (!entry) return {
			storePath,
			sessionKey: params.sessionKey,
			canRestore: true,
			hadEntry: false
		};
		return {
			storePath,
			sessionKey: params.sessionKey,
			canRestore: true,
			hadEntry: true,
			entry: structuredClone(entry)
		};
	} catch (err) {
		log$1.debug("boot: could not snapshot main session mapping", {
			sessionKey: params.sessionKey,
			error: String(err)
		});
		return {
			storePath,
			sessionKey: params.sessionKey,
			canRestore: false,
			hadEntry: false
		};
	}
}
async function restoreMainSessionMapping(snapshot) {
	if (!snapshot.canRestore) return;
	try {
		await updateSessionStore(snapshot.storePath, (store) => {
			if (snapshot.hadEntry && snapshot.entry) {
				store[snapshot.sessionKey] = snapshot.entry;
				return;
			}
			delete store[snapshot.sessionKey];
		}, { activeSessionKey: snapshot.sessionKey });
		return;
	} catch (err) {
		return err instanceof Error ? err.message : String(err);
	}
}
async function runBootOnce(params) {
	const bootRuntime = {
		log: () => {},
		error: (message) => log$1.error(String(message)),
		exit: defaultRuntime.exit
	};
	let result;
	try {
		result = await loadBootFile(params.workspaceDir);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log$1.error(`boot: failed to read ${BOOT_FILENAME}: ${message}`);
		return {
			status: "failed",
			reason: message
		};
	}
	if (result.status === "missing" || result.status === "empty") return {
		status: "skipped",
		reason: result.status
	};
	const sessionKey = params.agentId ? resolveAgentMainSessionKey({
		cfg: params.cfg,
		agentId: params.agentId
	}) : resolveMainSessionKey(params.cfg);
	const message = buildBootPrompt(result.content ?? "");
	const sessionId = generateBootSessionId();
	const mappingSnapshot = snapshotMainSessionMapping({
		cfg: params.cfg,
		sessionKey
	});
	let agentFailure;
	try {
		await agentCommand({
			message,
			sessionKey,
			sessionId,
			deliver: false,
			senderIsOwner: true
		}, bootRuntime, params.deps);
	} catch (err) {
		agentFailure = err instanceof Error ? err.message : String(err);
		log$1.error(`boot: agent run failed: ${agentFailure}`);
	}
	const mappingRestoreFailure = await restoreMainSessionMapping(mappingSnapshot);
	if (mappingRestoreFailure) log$1.error(`boot: failed to restore main session mapping: ${mappingRestoreFailure}`);
	if (!agentFailure && !mappingRestoreFailure) return { status: "ran" };
	return {
		status: "failed",
		reason: [agentFailure ? `agent run failed: ${agentFailure}` : void 0, mappingRestoreFailure ? `mapping restore failed: ${mappingRestoreFailure}` : void 0].filter((part) => Boolean(part)).join("; ")
	};
}

//#endregion
//#region src/hooks/bundled/boot-md/handler.ts
const log = createSubsystemLogger("hooks/boot-md");
const runBootChecklist = async (event) => {
	if (!isGatewayStartupEvent(event)) return;
	if (!event.context.cfg) return;
	const cfg = event.context.cfg;
	const deps = event.context.deps ?? createDefaultDeps();
	const agentIds = listAgentIds(cfg);
	for (const agentId of agentIds) {
		const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
		const result = await runBootOnce({
			cfg,
			deps,
			workspaceDir,
			agentId
		});
		if (result.status === "failed") {
			log.warn("boot-md failed for agent startup run", {
				agentId,
				workspaceDir,
				reason: result.reason
			});
			continue;
		}
		if (result.status === "skipped") log.debug("boot-md skipped for agent startup run", {
			agentId,
			workspaceDir,
			reason: result.reason
		});
	}
};

//#endregion
export { runBootChecklist as default };