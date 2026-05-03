import "./errors-CS5wW5eD.js";
import "./utils-CB8xp0O4.js";
import { t as createSubsystemLogger } from "./subsystem-CJBoMDt5.js";
import "./version-Bym9kFjy.js";
import "./agent-scope-D-T17Rdc.js";
import { s as listCodexAppServerExtensionFactories } from "./loader-708jrx4Y.js";
import { s as joinPresentTextSegments, t as getGlobalHookRunner } from "./hook-runner-global-DuCZiaZE.js";
import "./agent-paths-yYk0N-bh.js";
import "./session-write-lock-3uPK7XQA.js";
import "./model-auth-CnLreLvU.js";
import "./attempt.thread-helpers-C-SEPR1D.js";
import "./logger-Blw-ywDf.js";
import "./attempt.tool-run-context-Dql1RKPg.js";
import "./gateway-0G0WDa7x.js";
import { n as consumeAdjustedParamsForToolCall } from "./pi-tools.before-tool-call-BRx8QWc6.js";
import "./runs-BbW2coSD.js";
import "./sandbox-CJSotrdf.js";
//#region src/agents/harness/prompt-compaction-hook-helpers.ts
const log$3 = createSubsystemLogger("agents/harness");
function buildAgentHookContext$1(params) {
	return {
		runId: params.runId,
		...params.agentId ? { agentId: params.agentId } : {},
		...params.sessionKey ? { sessionKey: params.sessionKey } : {},
		...params.sessionId ? { sessionId: params.sessionId } : {},
		...params.workspaceDir ? { workspaceDir: params.workspaceDir } : {},
		...params.messageProvider ? { messageProvider: params.messageProvider } : {},
		...params.trigger ? { trigger: params.trigger } : {},
		...params.channelId ? { channelId: params.channelId } : {}
	};
}
async function resolveAgentHarnessBeforePromptBuildResult(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("before_prompt_build") && !hookRunner?.hasHooks("before_agent_start")) return {
		prompt: params.prompt,
		developerInstructions: params.developerInstructions
	};
	const hookCtx = buildAgentHookContext$1(params.ctx);
	const promptEvent = {
		prompt: params.prompt,
		messages: params.messages
	};
	const promptBuildResult = hookRunner.hasHooks("before_prompt_build") ? await hookRunner.runBeforePromptBuild(promptEvent, hookCtx).catch((error) => {
		log$3.warn(`before_prompt_build hook failed: ${String(error)}`);
	}) : void 0;
	const legacyResult = hookRunner.hasHooks("before_agent_start") ? await hookRunner.runBeforeAgentStart(promptEvent, hookCtx).catch((error) => {
		log$3.warn(`before_agent_start hook (legacy prompt build path) failed: ${String(error)}`);
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
		}, buildAgentHookContext$1(params.ctx));
	} catch (error) {
		log$3.warn(`before_compaction hook failed: ${String(error)}`);
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
		}, buildAgentHookContext$1(params.ctx));
	} catch (error) {
		log$3.warn(`after_compaction hook failed: ${String(error)}`);
	}
}
//#endregion
//#region src/agents/harness/codex-app-server-extensions.ts
const log$2 = createSubsystemLogger("agents/harness");
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
			log$2.warn(`[codex] tool_result extension failed for ${event.toolName}: ${detail}`);
		}
		return current;
	} };
}
//#endregion
//#region src/agents/harness/hook-helpers.ts
const log$1 = createSubsystemLogger("agents/harness");
async function runAgentHarnessAfterToolCallHook(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("after_tool_call")) return;
	const adjustedArgs = consumeAdjustedParamsForToolCall(params.toolCallId, params.runId);
	const eventArgs = adjustedArgs && typeof adjustedArgs === "object" ? adjustedArgs : params.startArgs;
	try {
		await hookRunner.runAfterToolCall({
			toolName: params.toolName,
			params: eventArgs,
			...params.runId ? { runId: params.runId } : {},
			toolCallId: params.toolCallId,
			...params.result ? { result: params.result } : {},
			...params.error ? { error: params.error } : {},
			...params.startedAt != null ? { durationMs: Date.now() - params.startedAt } : {}
		}, {
			toolName: params.toolName,
			...params.agentId ? { agentId: params.agentId } : {},
			...params.sessionId ? { sessionId: params.sessionId } : {},
			...params.sessionKey ? { sessionKey: params.sessionKey } : {},
			...params.runId ? { runId: params.runId } : {},
			toolCallId: params.toolCallId
		});
	} catch (error) {
		log$1.warn(`after_tool_call hook failed: tool=${params.toolName} error=${String(error)}`);
	}
}
function runAgentHarnessBeforeMessageWriteHook(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("before_message_write")) return params.message;
	const result = hookRunner.runBeforeMessageWrite({ message: params.message }, {
		...params.agentId ? { agentId: params.agentId } : {},
		...params.sessionKey ? { sessionKey: params.sessionKey } : {}
	});
	if (result?.block) return null;
	return result?.message ?? params.message;
}
//#endregion
//#region src/agents/harness/lifecycle-hook-helpers.ts
const log = createSubsystemLogger("agents/harness");
function buildAgentHookContext(params) {
	return {
		runId: params.runId,
		...params.agentId ? { agentId: params.agentId } : {},
		...params.sessionKey ? { sessionKey: params.sessionKey } : {},
		...params.sessionId ? { sessionId: params.sessionId } : {},
		...params.workspaceDir ? { workspaceDir: params.workspaceDir } : {},
		...params.messageProvider ? { messageProvider: params.messageProvider } : {},
		...params.trigger ? { trigger: params.trigger } : {},
		...params.channelId ? { channelId: params.channelId } : {}
	};
}
function runAgentHarnessLlmInputHook(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("llm_input")) return;
	hookRunner.runLlmInput(params.event, buildAgentHookContext(params.ctx)).catch((error) => {
		log.warn(`llm_input hook failed: ${String(error)}`);
	});
}
function runAgentHarnessLlmOutputHook(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("llm_output")) return;
	hookRunner.runLlmOutput(params.event, buildAgentHookContext(params.ctx)).catch((error) => {
		log.warn(`llm_output hook failed: ${String(error)}`);
	});
}
function runAgentHarnessAgentEndHook(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("agent_end")) return;
	hookRunner.runAgentEnd(params.event, buildAgentHookContext(params.ctx)).catch((error) => {
		log.warn(`agent_end hook failed: ${String(error)}`);
	});
}
//#endregion
export { runAgentHarnessBeforeMessageWriteHook as a, runAgentHarnessAfterCompactionHook as c, runAgentHarnessAfterToolCallHook as i, runAgentHarnessBeforeCompactionHook as l, runAgentHarnessLlmInputHook as n, createCodexAppServerToolResultExtensionRunner as o, runAgentHarnessLlmOutputHook as r, resolveAgentHarnessBeforePromptBuildResult as s, runAgentHarnessAgentEndHook as t };
