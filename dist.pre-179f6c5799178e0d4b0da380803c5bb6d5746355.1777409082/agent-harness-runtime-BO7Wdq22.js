import { i as redactToolDetail } from "./redact-Bl2deF7j.js";
import "./errors-Jbvi20TW.js";
import { b as truncateUtf16Safe } from "./utils-BMRcljdi.js";
import { t as createSubsystemLogger } from "./subsystem-DRUx3zf3.js";
import "./version-DZq9J0ei.js";
import "./agent-scope-Cmx30dd2.js";
import { o as listCodexAppServerExtensionFactories } from "./loader-DIJaLaot.js";
import { s as joinPresentTextSegments, t as getGlobalHookRunner } from "./hook-runner-global-Yxkhw9TF.js";
import "./agent-paths-DGDPUqkd.js";
import "./session-write-lock-A2xLw4ed.js";
import "./model-auth-CUr5avFe.js";
import "./tool-schema-runtime-CAr7YYe_.js";
import "./logger-aV2efqyD.js";
import { r as resolveToolDisplay, t as formatToolDetail } from "./tool-display-sV7ERp4f.js";
import "./attempt.tool-run-context-DJ6PJE3W.js";
import "./pi-tools.before-tool-call-C1-hxc9k.js";
import "./gateway-C_AHjOfl.js";
import "./runs-CGD-1aD2.js";
import "./sandbox-DMVxFt34.js";
import "./attempt.thread-helpers-Bzr-6VUQ.js";
import { i as buildAgentHookContext } from "./lifecycle-hook-helpers-V_GgRNiZ.js";
import "./native-hook-relay-CPUP3lXB.js";
//#region src/agents/harness/prompt-compaction-hook-helpers.ts
const log$1 = createSubsystemLogger("agents/harness");
async function resolveAgentHarnessBeforePromptBuildResult(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("before_prompt_build") && !hookRunner?.hasHooks("before_agent_start")) return {
		prompt: params.prompt,
		developerInstructions: params.developerInstructions
	};
	const hookCtx = buildAgentHookContext(params.ctx);
	const promptEvent = {
		prompt: params.prompt,
		messages: params.messages
	};
	const promptBuildResult = hookRunner.hasHooks("before_prompt_build") ? await hookRunner.runBeforePromptBuild(promptEvent, hookCtx).catch((error) => {
		log$1.warn(`before_prompt_build hook failed: ${String(error)}`);
	}) : void 0;
	const legacyResult = hookRunner.hasHooks("before_agent_start") ? await hookRunner.runBeforeAgentStart(promptEvent, hookCtx).catch((error) => {
		log$1.warn(`before_agent_start hook (legacy prompt build path) failed: ${String(error)}`);
	}) : void 0;
	const systemPrompt = resolvePromptBuildSystemPrompt({
		developerInstructions: params.developerInstructions,
		promptBuildResult,
		legacyResult
	});
	return {
		prompt: joinPresentTextSegments([
			promptBuildResult?.prependContext,
			legacyResult?.prependContext,
			params.prompt
		]) ?? params.prompt,
		developerInstructions: joinPresentTextSegments([
			promptBuildResult?.prependSystemContext,
			legacyResult?.prependSystemContext,
			systemPrompt,
			promptBuildResult?.appendSystemContext,
			legacyResult?.appendSystemContext
		]) ?? systemPrompt
	};
}
function resolvePromptBuildSystemPrompt(params) {
	if (typeof params.promptBuildResult?.systemPrompt === "string") return params.promptBuildResult.systemPrompt;
	if (typeof params.legacyResult?.systemPrompt === "string") return params.legacyResult.systemPrompt;
	return params.developerInstructions;
}
async function runAgentHarnessBeforeCompactionHook(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("before_compaction")) return;
	try {
		await hookRunner.runBeforeCompaction({
			messageCount: params.messages.length,
			messages: params.messages,
			sessionFile: params.sessionFile
		}, buildAgentHookContext(params.ctx));
	} catch (error) {
		log$1.warn(`before_compaction hook failed: ${String(error)}`);
	}
}
async function runAgentHarnessAfterCompactionHook(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("after_compaction")) return;
	try {
		await hookRunner.runAfterCompaction({
			messageCount: params.messages.length,
			compactedCount: params.compactedCount,
			sessionFile: params.sessionFile
		}, buildAgentHookContext(params.ctx));
	} catch (error) {
		log$1.warn(`after_compaction hook failed: ${String(error)}`);
	}
}
//#endregion
//#region src/agents/harness/codex-app-server-extensions.ts
const log = createSubsystemLogger("agents/harness");
function createCodexAppServerToolResultExtensionRunner(ctx, factories = listCodexAppServerExtensionFactories()) {
	const handlers = [];
	const runtime = { on(event, handler) {
		if (event === "tool_result") handlers.push(handler);
	} };
	const initPromise = (async () => {
		for (const factory of factories) await factory(runtime);
	})();
	return { async applyToolResultExtensions(event) {
		await initPromise;
		let current = event.result;
		for (const handler of handlers) try {
			const next = await handler({
				...event,
				result: current
			}, ctx);
			if (next?.result) current = next.result;
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			log.warn(`[codex] tool_result extension failed for ${event.toolName}: ${detail}`);
		}
		return current;
	} };
}
//#endregion
//#region src/plugin-sdk/agent-harness-runtime.ts
const TOOL_PROGRESS_OUTPUT_MAX_CHARS = 8e3;
/**
* Derive the same compact user-facing tool detail that Pi uses for progress logs.
*/
function inferToolMetaFromArgs(toolName, args) {
	return formatToolDetail(resolveToolDisplay({
		name: toolName,
		args
	}));
}
/**
* Prepare verbose tool output for user-facing progress messages.
*/
function formatToolProgressOutput(output, options) {
	const trimmed = output.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
	if (!trimmed) return;
	const redacted = redactToolDetail(trimmed);
	const maxChars = options?.maxChars ?? 8e3;
	if (redacted.length <= maxChars) return redacted;
	return `${truncateUtf16Safe(redacted, maxChars)}\n...(truncated)...`;
}
//#endregion
export { resolveAgentHarnessBeforePromptBuildResult as a, createCodexAppServerToolResultExtensionRunner as i, formatToolProgressOutput as n, runAgentHarnessAfterCompactionHook as o, inferToolMetaFromArgs as r, runAgentHarnessBeforeCompactionHook as s, TOOL_PROGRESS_OUTPUT_MAX_CHARS as t };
