import { m as resolveSessionAgentIds } from "./agent-scope-D-T17Rdc.js";
import { o as resolveDefaultModelForAgent } from "./model-selection-B7RNWcLj.js";
import { n as buildTtsSystemPromptHint } from "./tts-CWnNX49f.js";
import { i as resolveBootstrapContextForRun } from "./bootstrap-files-DpyOQK-6.js";
import { n as resolveSandboxRuntimeStatus } from "./runtime-status-C1n8qP4Z.js";
import { t as createOpenClawCodingTools } from "./pi-tools-C1RI3cQK.js";
import { n as getSkillsSnapshotVersion } from "./refresh-state-C1yA64vg.js";
import { t as buildWorkspaceSkillSnapshot } from "./workspace-DEVw-slo.js";
import { t as getRemoteSkillEligibility } from "./skills-remote-B7rYvoQE.js";
import { t as canExecRequestNode } from "./exec-defaults-sE75_gJ5.js";
import "./skills-C5C1PDgi.js";
import "./sandbox-CJSotrdf.js";
import { t as buildSystemPromptParams } from "./system-prompt-params-BUiXYbio.js";
import { t as buildAgentSystemPrompt } from "./system-prompt-x8IUEag3.js";
import { n as resolveEmbeddedFullAccessState } from "./sandbox-info-CJW1k-8d.js";
import { t as resolveRuntimePolicySessionKey } from "./runtime-policy-session-key-CZGMIpGW.js";
//#region src/auto-reply/reply/commands-system-prompt.ts
async function resolveCommandsSystemPromptBundle(params) {
	const workspaceDir = params.workspaceDir;
	const targetSessionEntry = params.sessionStore?.[params.sessionKey] ?? params.sessionEntry;
	const { sessionAgentId } = resolveSessionAgentIds({
		sessionKey: params.sessionKey,
		config: params.cfg,
		agentId: params.agentId
	});
	const { bootstrapFiles, contextFiles: injectedFiles } = await resolveBootstrapContextForRun({
		workspaceDir,
		config: params.cfg,
		sessionKey: params.sessionKey,
		sessionId: targetSessionEntry?.sessionId
	});
	const sandboxRuntime = resolveSandboxRuntimeStatus({
		cfg: params.cfg,
		sessionKey: resolveRuntimePolicySessionKey({
			cfg: params.cfg,
			ctx: params.ctx,
			sessionKey: params.sessionKey ?? params.ctx.SessionKey
		})
	});
	const toolPolicySessionKey = resolveRuntimePolicySessionKey({
		cfg: params.cfg,
		ctx: params.ctx,
		sessionKey: params.sessionKey
	});
	const skillsPrompt = (() => {
		try {
			return buildWorkspaceSkillSnapshot(workspaceDir, {
				config: params.cfg,
				agentId: sessionAgentId,
				eligibility: { remote: getRemoteSkillEligibility({ advertiseExecNode: canExecRequestNode({
					cfg: params.cfg,
					sessionEntry: targetSessionEntry,
					sessionKey: params.sessionKey,
					agentId: sessionAgentId
				}) }) },
				snapshotVersion: getSkillsSnapshotVersion(workspaceDir)
			});
		} catch {
			return {
				prompt: "",
				skills: [],
				resolvedSkills: []
			};
		}
	})().prompt ?? "";
	const tools = (() => {
		try {
			return createOpenClawCodingTools({
				config: params.cfg,
				agentId: sessionAgentId,
				workspaceDir,
				sessionKey: toolPolicySessionKey,
				allowGatewaySubagentBinding: true,
				messageProvider: params.command.channel,
				groupId: targetSessionEntry?.groupId ?? void 0,
				groupChannel: targetSessionEntry?.groupChannel ?? void 0,
				groupSpace: targetSessionEntry?.space ?? void 0,
				spawnedBy: targetSessionEntry?.spawnedBy ?? void 0,
				senderId: params.command.senderId,
				senderName: params.ctx.SenderName,
				senderUsername: params.ctx.SenderUsername,
				senderE164: params.ctx.SenderE164,
				senderIsOwner: params.command.senderIsOwner,
				modelProvider: params.provider,
				modelId: params.model
			});
		} catch {
			return [];
		}
	})();
	const toolNames = tools.map((t) => t.name);
	const defaultModelRef = resolveDefaultModelForAgent({
		cfg: params.cfg,
		agentId: sessionAgentId
	});
	const defaultModelLabel = `${defaultModelRef.provider}/${defaultModelRef.model}`;
	const { runtimeInfo, userTimezone, userTime, userTimeFormat } = buildSystemPromptParams({
		config: params.cfg,
		agentId: sessionAgentId,
		workspaceDir,
		cwd: process.cwd(),
		runtime: {
			host: "unknown",
			os: "unknown",
			arch: "unknown",
			node: process.version,
			model: `${params.provider}/${params.model}`,
			defaultModel: defaultModelLabel
		}
	});
	const fullAccessState = resolveEmbeddedFullAccessState({ execElevated: {
		enabled: params.elevated.enabled,
		allowed: params.elevated.allowed,
		defaultLevel: params.resolvedElevatedLevel ?? "off"
	} });
	const sandboxInfo = sandboxRuntime.sandboxed ? {
		enabled: true,
		workspaceDir,
		workspaceAccess: "rw",
		elevated: {
			allowed: params.elevated.allowed,
			defaultLevel: params.resolvedElevatedLevel ?? "off",
			fullAccessAvailable: fullAccessState.available,
			...fullAccessState.blockedReason ? { fullAccessBlockedReason: fullAccessState.blockedReason } : {}
		}
	} : { enabled: false };
	const ttsHint = params.cfg ? buildTtsSystemPromptHint(params.cfg) : void 0;
	return {
		systemPrompt: buildAgentSystemPrompt({
			workspaceDir,
			defaultThinkLevel: params.resolvedThinkLevel,
			reasoningLevel: params.resolvedReasoningLevel,
			extraSystemPrompt: void 0,
			ownerNumbers: void 0,
			reasoningTagHint: false,
			toolNames,
			modelAliasLines: [],
			userTimezone,
			userTime,
			userTimeFormat,
			contextFiles: injectedFiles,
			skillsPrompt,
			heartbeatPrompt: void 0,
			ttsHint,
			acpEnabled: params.cfg?.acp?.enabled !== false,
			runtimeInfo,
			sandboxInfo,
			memoryCitationsMode: params.cfg?.memory?.citations,
			continuationEnabled: params.cfg?.agents?.defaults?.continuation?.enabled === true
		}),
		tools,
		skillsPrompt,
		bootstrapFiles,
		injectedFiles,
		sandboxRuntime
	};
}
//#endregion
export { resolveCommandsSystemPromptBundle as t };
