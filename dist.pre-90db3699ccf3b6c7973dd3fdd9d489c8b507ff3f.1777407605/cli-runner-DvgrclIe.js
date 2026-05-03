import { i as formatErrorMessage } from "./errors-CS5wW5eD.js";
import "./pi-embedded-helpers-BrjvE3y6.js";
import { f as isFailoverErrorMessage, t as classifyFailoverReason } from "./errors-Bd1ET-5C.js";
import { i as isFailoverError, s as resolveFailoverStatus, t as FailoverError } from "./failover-error-Bly4bj4L.js";
//#region src/agents/cli-runner.ts
async function runCliAgent(params) {
	const { prepareCliRunContext } = await import("./prepare.runtime-BaxWxl9R.js");
	return runPreparedCliAgent(await prepareCliRunContext(params));
}
async function runPreparedCliAgent(context) {
	const { executePreparedCliRun } = await import("./execute.runtime-DjiEKtp-.js");
	const { params } = context;
	const buildCliRunResult = (resultParams) => {
		const text = resultParams.output.text?.trim();
		const rawText = resultParams.output.rawText?.trim();
		return {
			payloads: text ? [{ text }] : void 0,
			meta: {
				durationMs: Date.now() - context.started,
				...resultParams.output.finalPromptText ? { finalPromptText: resultParams.output.finalPromptText } : {},
				...text || rawText ? {
					...text ? { finalAssistantVisibleText: text } : {},
					...rawText ? { finalAssistantRawText: rawText } : {}
				} : {},
				systemPromptReport: context.systemPromptReport,
				executionTrace: {
					winnerProvider: params.provider,
					winnerModel: context.modelId,
					attempts: [{
						provider: params.provider,
						model: context.modelId,
						result: "success"
					}],
					fallbackUsed: false,
					runner: "cli"
				},
				requestShaping: {
					...params.thinkLevel ? { thinking: params.thinkLevel } : {},
					...context.effectiveAuthProfileId ? { authMode: "auth-profile" } : {}
				},
				completion: {
					finishReason: "stop",
					stopReason: "completed",
					refusal: false
				},
				agentMeta: {
					sessionId: resultParams.effectiveCliSessionId ?? params.sessionId ?? "",
					provider: params.provider,
					model: context.modelId,
					usage: resultParams.output.usage,
					...resultParams.effectiveCliSessionId ? { cliSessionBinding: {
						sessionId: resultParams.effectiveCliSessionId,
						...context.effectiveAuthProfileId ? { authProfileId: context.effectiveAuthProfileId } : {},
						...context.authEpoch ? { authEpoch: context.authEpoch } : {},
						authEpochVersion: context.authEpochVersion,
						...context.extraSystemPromptHash ? { extraSystemPromptHash: context.extraSystemPromptHash } : {},
						...context.preparedBackend.mcpConfigHash ? { mcpConfigHash: context.preparedBackend.mcpConfigHash } : {},
						...context.preparedBackend.mcpResumeHash ? { mcpResumeHash: context.preparedBackend.mcpResumeHash } : {}
					} } : {}
				}
			}
		};
	};
	try {
		try {
			const output = await executePreparedCliRun(context, context.reusableCliSession.sessionId);
			return buildCliRunResult({
				output,
				effectiveCliSessionId: output.sessionId ?? context.reusableCliSession.sessionId
			});
		} catch (err) {
			if (isFailoverError(err)) {
				const retryableSessionId = context.reusableCliSession.sessionId ?? params.cliSessionId;
				if (err.reason === "session_expired" && retryableSessionId && params.sessionKey) {
					const output = await executePreparedCliRun(context, void 0);
					const effectiveCliSessionId = output.sessionId;
					return buildCliRunResult({
						output,
						effectiveCliSessionId
					});
				}
				throw err;
			}
			const message = formatErrorMessage(err);
			if (isFailoverErrorMessage(message, { provider: params.provider })) {
				const reason = classifyFailoverReason(message, { provider: params.provider }) ?? "unknown";
				const status = resolveFailoverStatus(reason);
				throw new FailoverError(message, {
					reason,
					provider: params.provider,
					model: context.modelId,
					status
				});
			}
			throw err;
		}
	} finally {
		await context.preparedBackend.cleanup?.();
	}
}
//#endregion
export { runCliAgent as t };
