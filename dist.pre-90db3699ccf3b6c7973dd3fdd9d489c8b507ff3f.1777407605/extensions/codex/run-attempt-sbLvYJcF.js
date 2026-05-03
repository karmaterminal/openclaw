import { c as isJsonObject, s as isCodexAppServerApprovalRequest, t as clearSharedCodexAppServerClient } from "./shared-client-C5M1Nphx.js";
import { renderCodexPromptOverlay } from "./prompt-overlay.js";
import { r as resolveCodexAppServerRuntimeOptions } from "./config-C9_NiPaE.js";
import { n as defaultCodexAppServerClientFactory, t as createCodexAppServerClientFactoryTestHooks } from "./client-factory-FO-824xT.js";
import { clearCodexAppServerBinding, readCodexAppServerBinding, writeCodexAppServerBinding } from "./session-binding-B50a7Hp4.js";
import { acquireSessionWriteLock, buildEmbeddedAttemptToolRunContext, callGatewayTool, clearActiveEmbeddedRun, createCodexAppServerToolResultExtensionRunner, embeddedAgentLog, emitSessionTranscriptUpdate, extractToolResultMediaArtifact, filterToolResultMediaUrls, formatErrorMessage, isMessagingTool, isMessagingToolSendAction, isSubagentSessionKey, normalizeProviderToolSchemas, normalizeUsage, resolveAgentHarnessBeforePromptBuildResult, resolveAttemptSpawnWorkspaceDir, resolveModelAuthMode, resolveOpenClawAgentDir, resolveSandboxContext, resolveSessionAgentIds, resolveUserPath, runAgentHarnessAfterCompactionHook, runAgentHarnessAfterToolCallHook, runAgentHarnessAgentEndHook, runAgentHarnessBeforeCompactionHook, runAgentHarnessBeforeMessageWriteHook, runAgentHarnessLlmInputHook, runAgentHarnessLlmOutputHook, setActiveEmbeddedRun, supportsModelTools } from "openclaw/plugin-sdk/agent-harness-runtime";
import fs from "node:fs/promises";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import nodeFs from "node:fs";
import path from "node:path";
import { resolveUserPath as resolveUserPath$1 } from "openclaw/plugin-sdk/agent-harness";
//#region extensions/codex/src/app-server/plugin-approval-roundtrip.ts
const DEFAULT_CODEX_APPROVAL_TIMEOUT_MS = 12e4;
const MAX_PLUGIN_APPROVAL_TITLE_LENGTH = 80;
const MAX_PLUGIN_APPROVAL_DESCRIPTION_LENGTH = 256;
async function requestPluginApproval(params) {
	const timeoutMs = DEFAULT_CODEX_APPROVAL_TIMEOUT_MS;
	return callGatewayTool("plugin.approval.request", { timeoutMs: timeoutMs + 1e4 }, {
		pluginId: "openclaw-codex-app-server",
		title: truncateForGateway(params.title, MAX_PLUGIN_APPROVAL_TITLE_LENGTH),
		description: truncateForGateway(params.description, MAX_PLUGIN_APPROVAL_DESCRIPTION_LENGTH),
		severity: params.severity,
		toolName: params.toolName,
		toolCallId: params.toolCallId,
		agentId: params.paramsForRun.agentId,
		sessionKey: params.paramsForRun.sessionKey,
		turnSourceChannel: params.paramsForRun.messageChannel ?? params.paramsForRun.messageProvider,
		turnSourceTo: params.paramsForRun.currentChannelId,
		turnSourceAccountId: params.paramsForRun.agentAccountId,
		turnSourceThreadId: params.paramsForRun.currentThreadTs,
		timeoutMs,
		twoPhase: true
	}, { expectFinal: false });
}
async function waitForPluginApprovalDecision(params) {
	const waitPromise = callGatewayTool("plugin.approval.waitDecision", { timeoutMs: DEFAULT_CODEX_APPROVAL_TIMEOUT_MS + 1e4 }, { id: params.approvalId });
	if (!params.signal) return (await waitPromise)?.decision;
	let onAbort;
	const abortPromise = new Promise((_, reject) => {
		if (params.signal.aborted) {
			reject(params.signal.reason);
			return;
		}
		onAbort = () => reject(params.signal.reason);
		params.signal.addEventListener("abort", onAbort, { once: true });
	});
	try {
		return (await Promise.race([waitPromise, abortPromise]))?.decision;
	} finally {
		if (onAbort) params.signal.removeEventListener("abort", onAbort);
	}
}
function mapExecDecisionToOutcome(decision) {
	if (decision === "allow-once") return "approved-once";
	if (decision === "allow-always") return "approved-session";
	if (decision === null || decision === void 0) return "unavailable";
	return "denied";
}
function truncateForGateway(value, maxLength) {
	return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}
//#endregion
//#region extensions/codex/src/app-server/approval-bridge.ts
const PERMISSION_DESCRIPTION_MAX_LENGTH = 700;
const PERMISSION_SAMPLE_LIMIT = 2;
const PERMISSION_VALUE_MAX_LENGTH = 48;
async function handleCodexAppServerApprovalRequest(params) {
	const requestParams = isJsonObject(params.requestParams) ? params.requestParams : void 0;
	if (!matchesCurrentTurn$1(requestParams, params.threadId, params.turnId)) return;
	if (!isSupportedAppServerApprovalMethod(params.method)) return unsupportedApprovalResponse();
	const context = buildApprovalContext({
		method: params.method,
		requestParams,
		paramsForRun: params.paramsForRun
	});
	try {
		const requestResult = await requestPluginApproval({
			paramsForRun: params.paramsForRun,
			title: context.title,
			description: context.description,
			severity: context.severity,
			toolName: context.toolName,
			toolCallId: context.itemId
		});
		const approvalId = requestResult?.id;
		if (!approvalId) {
			emitApprovalEvent(params.paramsForRun, {
				phase: "resolved",
				kind: context.kind,
				status: "unavailable",
				title: context.title,
				...context.eventDetails,
				...approvalEventScope(params.method, "denied"),
				message: "Codex app-server approval route unavailable."
			});
			return buildApprovalResponse(params.method, context.requestParams, "denied");
		}
		emitApprovalEvent(params.paramsForRun, {
			phase: "requested",
			kind: context.kind,
			status: "pending",
			title: context.title,
			approvalId,
			approvalSlug: approvalId,
			...context.eventDetails,
			message: "Codex app-server approval requested."
		});
		const outcome = mapExecDecisionToOutcome(Object.prototype.hasOwnProperty.call(requestResult, "decision") ? requestResult.decision : await waitForPluginApprovalDecision({
			approvalId,
			signal: params.signal
		}));
		emitApprovalEvent(params.paramsForRun, {
			phase: "resolved",
			kind: context.kind,
			status: outcome === "denied" ? "denied" : outcome === "unavailable" ? "unavailable" : outcome === "cancelled" ? "failed" : "approved",
			title: context.title,
			approvalId,
			approvalSlug: approvalId,
			...context.eventDetails,
			...approvalEventScope(params.method, outcome),
			message: approvalResolutionMessage(outcome)
		});
		return buildApprovalResponse(params.method, context.requestParams, outcome);
	} catch (error) {
		const cancelled = params.signal?.aborted === true;
		emitApprovalEvent(params.paramsForRun, {
			phase: "resolved",
			kind: context.kind,
			status: cancelled ? "failed" : "unavailable",
			title: context.title,
			...context.eventDetails,
			...approvalEventScope(params.method, cancelled ? "cancelled" : "denied"),
			message: cancelled ? "Codex app-server approval cancelled because the run stopped." : `Codex app-server approval route failed: ${formatErrorMessage$1(error)}`
		});
		return buildApprovalResponse(params.method, context.requestParams, cancelled ? "cancelled" : "denied");
	}
}
function buildApprovalResponse(method, requestParams, outcome) {
	if (method === "item/commandExecution/requestApproval") return { decision: commandApprovalDecision(requestParams, outcome) };
	if (method === "item/fileChange/requestApproval") return { decision: fileChangeApprovalDecision(outcome) };
	if (method === "item/permissions/requestApproval") {
		if (outcome === "approved-session" || outcome === "approved-once") return {
			permissions: requestedPermissions(requestParams),
			scope: outcome === "approved-session" ? "session" : "turn"
		};
		return {
			permissions: {},
			scope: "turn"
		};
	}
	return unsupportedApprovalResponse();
}
function matchesCurrentTurn$1(requestParams, threadId, turnId) {
	if (!requestParams) return false;
	const requestThreadId = readString$3(requestParams, "threadId") ?? readString$3(requestParams, "conversationId");
	const requestTurnId = readString$3(requestParams, "turnId");
	return requestThreadId === threadId && requestTurnId === turnId;
}
function buildApprovalContext(params) {
	const itemId = readString$3(params.requestParams, "itemId") ?? readString$3(params.requestParams, "callId") ?? readString$3(params.requestParams, "approvalId");
	const command = readCommand(params.requestParams);
	const reason = readString$3(params.requestParams, "reason");
	const kind = approvalKindForMethod(params.method);
	const permissionLines = params.method === "item/permissions/requestApproval" ? describeRequestedPermissions(params.requestParams) : [];
	const title = kind === "exec" ? "Codex app-server command approval" : params.method === "item/permissions/requestApproval" ? "Codex app-server permission approval" : kind === "plugin" ? "Codex app-server file approval" : "Codex app-server approval";
	const subject = permissionLines[0] ?? (command ? `Command: ${truncate(command, 180)}` : reason ? `Reason: ${truncate(reason, 180)}` : `Request method: ${params.method}`);
	return {
		kind,
		title,
		description: permissionLines.length > 0 ? joinDescriptionLinesWithinLimit(permissionLines, PERMISSION_DESCRIPTION_MAX_LENGTH) : [subject, params.paramsForRun.sessionKey && `Session: ${params.paramsForRun.sessionKey}`].filter(Boolean).join("\n"),
		severity: kind === "exec" ? "warning" : "info",
		toolName: kind === "exec" ? "codex_command_approval" : params.method === "item/permissions/requestApproval" ? "codex_permission_approval" : "codex_file_approval",
		itemId,
		requestParams: params.requestParams,
		eventDetails: {
			...itemId ? { itemId } : {},
			...command ? { command } : {},
			...reason ? { reason } : {}
		}
	};
}
function commandApprovalDecision(requestParams, outcome) {
	if (outcome === "cancelled") return "cancel";
	if (outcome === "denied" || outcome === "unavailable") return "decline";
	if (outcome === "approved-session" && hasAvailableDecision(requestParams, "acceptForSession")) return "acceptForSession";
	return "accept";
}
function fileChangeApprovalDecision(outcome) {
	if (outcome === "cancelled") return "cancel";
	if (outcome === "denied" || outcome === "unavailable") return "decline";
	return outcome === "approved-session" ? "acceptForSession" : "accept";
}
function requestedPermissions(requestParams) {
	const permissions = isJsonObject(requestParams?.permissions) ? requestParams.permissions : {};
	const granted = {};
	if (isJsonObject(permissions.network)) granted.network = permissions.network;
	if (isJsonObject(permissions.fileSystem)) granted.fileSystem = permissions.fileSystem;
	return granted;
}
function unsupportedApprovalResponse() {
	return {
		decision: "decline",
		reason: "OpenClaw codex app-server bridge does not grant native approvals yet."
	};
}
function describeRequestedPermissions(requestParams) {
	const permissions = requestedPermissions(requestParams);
	const lines = [];
	const kinds = [];
	const risks = /* @__PURE__ */ new Set();
	if (isJsonObject(permissions.network)) kinds.push("network");
	if (isJsonObject(permissions.fileSystem)) kinds.push("fileSystem");
	if (kinds.length > 0) lines.push(`Permissions: ${kinds.join(", ")}`);
	if (isJsonObject(permissions.network)) {
		const networkSummary = summarizePermissionRecord(permissions.network, risks, [{
			key: "allowHosts",
			label: "allowHosts",
			sanitize: sanitizePermissionHostValue,
			risksFor: permissionHostRisks
		}]);
		if (networkSummary) lines.push(`Network ${networkSummary}`);
	}
	if (isJsonObject(permissions.fileSystem)) {
		const fileSystemSummary = summarizePermissionRecord(permissions.fileSystem, risks, [
			{
				key: "roots",
				label: "roots",
				sanitize: sanitizePermissionPathValue,
				risksFor: permissionPathRisks
			},
			{
				key: "readPaths",
				label: "readPaths",
				sanitize: sanitizePermissionPathValue,
				risksFor: permissionPathRisks
			},
			{
				key: "writePaths",
				label: "writePaths",
				sanitize: sanitizePermissionPathValue,
				risksFor: permissionPathRisks
			}
		]);
		if (fileSystemSummary) lines.push(`File system ${fileSystemSummary}`);
	}
	if (risks.size > 0) lines.push(`High-risk targets: ${[...risks].join(", ")}`);
	return lines;
}
function summarizePermissionRecord(permission, risks, descriptors) {
	const details = [];
	for (const descriptor of descriptors) {
		const summary = summarizePermissionArray(permission, descriptor, risks);
		if (summary) details.push(summary);
	}
	return details.length > 0 ? details.join("; ") : void 0;
}
function summarizePermissionArray(record, descriptor, risks) {
	const values = readStringArray(record, descriptor.key);
	if (values.length === 0) return;
	for (const value of values) for (const risk of descriptor.risksFor(value)) risks.add(risk);
	const sampleValues = values.slice(0, PERMISSION_SAMPLE_LIMIT).map(descriptor.sanitize).filter(Boolean);
	if (sampleValues.length === 0) return `${descriptor.label}: ${values.length}`;
	const remaining = values.length - sampleValues.length;
	const remainderSuffix = remaining > 0 ? ` (+${remaining} more)` : "";
	return `${descriptor.label}: ${sampleValues.join(", ")}${remainderSuffix}`;
}
function readStringArray(record, key) {
	const value = record[key];
	return Array.isArray(value) ? value.map((entry) => typeof entry === "string" ? entry.trim() : "").filter(Boolean) : [];
}
function sanitizePermissionHostValue(value) {
	const withoutScheme = sanitizePermissionScalar(value).toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
	const authority = withoutScheme.split(/[/?#]/, 1)[0] ?? withoutScheme;
	return truncate(authority.includes("@") ? authority.slice(authority.lastIndexOf("@") + 1) : authority, PERMISSION_VALUE_MAX_LENGTH);
}
function sanitizePermissionPathValue(value) {
	return truncate(sanitizePermissionScalar(value).replace(/^\/home\/[^/]+(?=\/|$)/, "~").replace(/^\/Users\/[^/]+(?=\/|$)/, "~").replace(/^[A-Za-z]:\\Users\\[^\\]+(?=\\|$)/, "~"), PERMISSION_VALUE_MAX_LENGTH);
}
function sanitizePermissionScalar(value) {
	let sanitized = "";
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		sanitized += code < 32 || code === 127 ? " " : value[index];
	}
	return sanitized.replace(/\s+/g, " ").trim();
}
function permissionHostRisks(value) {
	const normalized = value.trim().toLowerCase();
	const risks = [];
	if (normalized.includes("*")) {
		risks.push("wildcard hosts");
		if (isPrivateNetworkHostPattern(normalized)) risks.push("private-network wildcards");
	}
	return risks;
}
function permissionPathRisks(value) {
	const normalized = sanitizePermissionPathValue(value);
	const risks = [];
	if (normalized === "/" || normalized === "\\" || /^[A-Za-z]:[\\/]*$/.test(normalized)) risks.push("filesystem root");
	if (normalized === "~" || normalized === "~/" || normalized === "~\\") risks.push("home directory");
	return risks;
}
function isPrivateNetworkHostPattern(value) {
	const wildcardStripped = value.toLowerCase().replace(/^\*\./, "");
	if (wildcardStripped === "localhost" || wildcardStripped === "local" || wildcardStripped === "internal" || wildcardStripped === "lan" || wildcardStripped === "home" || wildcardStripped === "corp" || wildcardStripped === "private" || wildcardStripped.endsWith(".local") || wildcardStripped.endsWith(".internal") || wildcardStripped.endsWith(".lan") || wildcardStripped.endsWith(".home") || wildcardStripped.endsWith(".corp") || wildcardStripped.endsWith(".private")) return true;
	if (wildcardStripped.startsWith("10.") || wildcardStripped.startsWith("127.") || wildcardStripped.startsWith("192.168.") || wildcardStripped.startsWith("169.254.")) return true;
	return /^172\.(1[6-9]|2\d|3[0-1])\./.test(wildcardStripped);
}
function hasAvailableDecision(requestParams, decision) {
	const available = requestParams?.availableDecisions;
	if (!Array.isArray(available)) return true;
	return available.includes(decision);
}
function approvalResolutionMessage(outcome) {
	if (outcome === "approved-session") return "Codex app-server approval granted for the session.";
	if (outcome === "approved-once") return "Codex app-server approval granted for this turn.";
	if (outcome === "cancelled") return "Codex app-server approval cancelled.";
	if (outcome === "unavailable") return "Codex app-server approval unavailable.";
	return "Codex app-server approval denied.";
}
function approvalScopeForOutcome(outcome) {
	return outcome === "approved-session" ? "session" : "turn";
}
function approvalEventScope(method, outcome) {
	return method === "item/permissions/requestApproval" ? { scope: approvalScopeForOutcome(outcome) } : {};
}
function approvalKindForMethod(method) {
	if (method.includes("commandExecution") || method.includes("execCommand")) return "exec";
	if (method.includes("fileChange") || method.includes("Patch") || method.includes("permissions")) return "plugin";
	return "unknown";
}
function isSupportedAppServerApprovalMethod(method) {
	return method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval" || method === "item/permissions/requestApproval";
}
function emitApprovalEvent(params, data) {
	params.onAgentEvent?.({
		stream: "approval",
		data
	});
}
function readCommand(record) {
	const command = record?.command;
	if (typeof command === "string") return command;
	if (Array.isArray(command) && command.every((part) => typeof part === "string")) return command.join(" ");
}
function readString$3(record, key) {
	const value = record?.[key];
	return typeof value === "string" ? value : void 0;
}
function truncate(value, maxLength) {
	return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}
function joinDescriptionLinesWithinLimit(lines, maxLength) {
	let description = "";
	for (const line of lines) {
		const prefix = description ? "\n" : "";
		const next = `${description}${prefix}${line}`;
		if (next.length <= maxLength) {
			description = next;
			continue;
		}
		const remaining = maxLength - description.length - prefix.length;
		if (remaining < 3) break;
		description += `${prefix}${truncate(line, remaining)}`;
		break;
	}
	return description;
}
function formatErrorMessage$1(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
//#region extensions/codex/src/app-server/dynamic-tools.ts
function createCodexDynamicToolBridge(params) {
	const toolMap = new Map(params.tools.map((tool) => [tool.name, tool]));
	const telemetry = {
		didSendViaMessagingTool: false,
		messagingToolSentTexts: [],
		messagingToolSentMediaUrls: [],
		messagingToolSentTargets: [],
		toolMediaUrls: [],
		toolAudioAsVoice: false
	};
	const extensionRunner = createCodexAppServerToolResultExtensionRunner(params.hookContext ?? {});
	return {
		specs: params.tools.map((tool) => ({
			name: tool.name,
			description: tool.description,
			inputSchema: toJsonValue(tool.parameters)
		})),
		telemetry,
		handleToolCall: async (call) => {
			const tool = toolMap.get(call.tool);
			if (!tool) return {
				contentItems: [{
					type: "inputText",
					text: `Unknown OpenClaw tool: ${call.tool}`
				}],
				success: false
			};
			const args = jsonObjectToRecord(call.arguments);
			const startedAt = Date.now();
			try {
				const preparedArgs = tool.prepareArguments ? tool.prepareArguments(args) : args;
				const rawResult = await tool.execute(call.callId, preparedArgs, params.signal);
				const result = await extensionRunner.applyToolResultExtensions({
					threadId: call.threadId,
					turnId: call.turnId,
					toolCallId: call.callId,
					toolName: tool.name,
					args,
					result: rawResult
				});
				collectToolTelemetry({
					toolName: tool.name,
					args,
					result,
					telemetry,
					isError: false
				});
				runAgentHarnessAfterToolCallHook({
					toolName: tool.name,
					toolCallId: call.callId,
					runId: params.hookContext?.runId,
					agentId: params.hookContext?.agentId,
					sessionId: params.hookContext?.sessionId,
					sessionKey: params.hookContext?.sessionKey,
					startArgs: args,
					result,
					startedAt
				});
				return {
					contentItems: result.content.flatMap(convertToolContent),
					success: true
				};
			} catch (error) {
				collectToolTelemetry({
					toolName: tool.name,
					args,
					result: void 0,
					telemetry,
					isError: true
				});
				runAgentHarnessAfterToolCallHook({
					toolName: tool.name,
					toolCallId: call.callId,
					runId: params.hookContext?.runId,
					agentId: params.hookContext?.agentId,
					sessionId: params.hookContext?.sessionId,
					sessionKey: params.hookContext?.sessionKey,
					startArgs: args,
					error: error instanceof Error ? error.message : String(error),
					startedAt
				});
				return {
					contentItems: [{
						type: "inputText",
						text: error instanceof Error ? error.message : String(error)
					}],
					success: false
				};
			}
		}
	};
}
function collectToolTelemetry(params) {
	if (params.isError) return;
	if (!params.isError && params.toolName === "cron" && isCronAddAction(params.args)) params.telemetry.successfulCronAdds = (params.telemetry.successfulCronAdds ?? 0) + 1;
	if (!params.isError && params.result) {
		const media = extractToolResultMediaArtifact(params.result);
		if (media) {
			const mediaUrls = filterToolResultMediaUrls(params.toolName, media.mediaUrls, params.result);
			const seen = new Set(params.telemetry.toolMediaUrls);
			for (const mediaUrl of mediaUrls) if (!seen.has(mediaUrl)) {
				seen.add(mediaUrl);
				params.telemetry.toolMediaUrls.push(mediaUrl);
			}
			if (media.audioAsVoice) params.telemetry.toolAudioAsVoice = true;
		}
	}
	if (!isMessagingTool(params.toolName) || !isMessagingToolSendAction(params.toolName, params.args)) return;
	params.telemetry.didSendViaMessagingTool = true;
	const text = readFirstString(params.args, [
		"text",
		"message",
		"body",
		"content"
	]);
	if (text) params.telemetry.messagingToolSentTexts.push(text);
	params.telemetry.messagingToolSentMediaUrls.push(...collectMediaUrls(params.args));
	params.telemetry.messagingToolSentTargets.push({
		tool: params.toolName,
		provider: readFirstString(params.args, ["provider", "channel"]) ?? params.toolName,
		accountId: readFirstString(params.args, ["accountId", "account_id"]),
		to: readFirstString(params.args, [
			"to",
			"target",
			"recipient"
		]),
		threadId: readFirstString(params.args, [
			"threadId",
			"thread_id",
			"messageThreadId"
		])
	});
}
function convertToolContent(content) {
	if (content.type === "text") return [{
		type: "inputText",
		text: content.text
	}];
	return [{
		type: "inputImage",
		imageUrl: `data:${content.mimeType};base64,${content.data}`
	}];
}
function toJsonValue(value) {
	try {
		const text = JSON.stringify(value);
		if (!text) return {};
		return JSON.parse(text);
	} catch {
		return {};
	}
}
function jsonObjectToRecord(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value;
}
function readFirstString(record, keys) {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value.trim();
		if (typeof value === "number" && Number.isFinite(value)) return String(value);
	}
}
function collectMediaUrls(record) {
	const urls = [];
	for (const key of [
		"mediaUrl",
		"media_url",
		"imageUrl",
		"image_url"
	]) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) urls.push(value.trim());
	}
	for (const key of [
		"mediaUrls",
		"media_urls",
		"imageUrls",
		"image_urls"
	]) {
		const value = record[key];
		if (!Array.isArray(value)) continue;
		for (const entry of value) if (typeof entry === "string" && entry.trim()) urls.push(entry.trim());
	}
	return urls;
}
function isCronAddAction(args) {
	const action = args.action;
	return typeof action === "string" && action.trim().toLowerCase() === "add";
}
//#endregion
//#region extensions/codex/src/app-server/elicitation-bridge.ts
const MCP_TOOL_APPROVAL_KIND = "mcp_tool_call";
const MCP_TOOL_APPROVAL_KIND_KEY = "codex_approval_kind";
const MCP_TOOL_APPROVAL_CONNECTOR_NAME_KEY = "connector_name";
const MCP_TOOL_APPROVAL_TOOL_TITLE_KEY = "tool_title";
const MCP_TOOL_APPROVAL_TOOL_DESCRIPTION_KEY = "tool_description";
const MCP_TOOL_APPROVAL_TOOL_PARAMS_DISPLAY_KEY = "tool_params_display";
const MAX_DISPLAY_PARAM_VALUE_LENGTH = 120;
async function handleCodexAppServerElicitationRequest(params) {
	const requestParams = isJsonObject(params.requestParams) ? params.requestParams : void 0;
	if (!matchesCurrentTurn(requestParams, params.threadId, params.turnId)) return;
	const approvalPrompt = readBridgeableApprovalElicitation(requestParams);
	if (!approvalPrompt) return;
	const outcome = await requestPluginApprovalOutcome({
		paramsForRun: params.paramsForRun,
		title: approvalPrompt.title,
		description: approvalPrompt.description,
		signal: params.signal
	});
	return buildElicitationResponse(approvalPrompt.requestedSchema, approvalPrompt.meta, outcome);
}
function matchesCurrentTurn(requestParams, threadId, turnId) {
	if (!requestParams) return false;
	if (readString$2(requestParams, "threadId") !== threadId) return false;
	const rawTurnId = requestParams.turnId;
	if (rawTurnId !== null && rawTurnId !== void 0 && rawTurnId !== turnId) return false;
	return true;
}
function readBridgeableApprovalElicitation(requestParams) {
	if (!requestParams || readString$2(requestParams, "mode") !== "form" || !isJsonObject(requestParams._meta) || requestParams._meta[MCP_TOOL_APPROVAL_KIND_KEY] !== MCP_TOOL_APPROVAL_KIND || !isJsonObject(requestParams.requestedSchema)) return;
	const requestedSchema = requestParams.requestedSchema;
	if (readString$2(requestedSchema, "type") !== "object" || !isJsonObject(requestedSchema.properties)) return;
	const title = readString$2(requestParams, "message") ?? "Codex MCP tool approval";
	return {
		title,
		description: buildApprovalDescription({
			title,
			meta: requestParams._meta,
			requestedSchema,
			serverName: readString$2(requestParams, "serverName")
		}),
		requestedSchema,
		meta: requestParams._meta
	};
}
function buildApprovalDescription(params) {
	const summaryLines = [
		readString$2(params.meta, MCP_TOOL_APPROVAL_CONNECTOR_NAME_KEY) && `App: ${readString$2(params.meta, MCP_TOOL_APPROVAL_CONNECTOR_NAME_KEY)}`,
		readString$2(params.meta, MCP_TOOL_APPROVAL_TOOL_TITLE_KEY) && `Tool: ${readString$2(params.meta, MCP_TOOL_APPROVAL_TOOL_TITLE_KEY)}`,
		params.serverName && `MCP server: ${params.serverName}`,
		readString$2(params.meta, MCP_TOOL_APPROVAL_TOOL_DESCRIPTION_KEY)
	].filter((line) => Boolean(line));
	const paramLines = readDisplayParamLines(params.meta);
	const propertyLines = readPropertyDescriptionLines(params.requestedSchema);
	return [
		params.title,
		summaryLines.join("\n"),
		paramLines.length > 0 ? ["Parameters:", ...paramLines].join("\n") : "",
		propertyLines.length > 0 ? ["Fields:", ...propertyLines].join("\n") : ""
	].filter(Boolean).join("\n\n");
}
function readPropertyDescriptionLines(requestedSchema) {
	const properties = isJsonObject(requestedSchema.properties) ? requestedSchema.properties : {};
	return Object.entries(properties).map(([name, value]) => {
		const schema = isJsonObject(value) ? value : void 0;
		if (!schema) return;
		const propTitle = readString$2(schema, "title") ?? name;
		const description = readString$2(schema, "description");
		return description ? `- ${propTitle}: ${description}` : `- ${propTitle}`;
	}).filter((line) => Boolean(line));
}
function readDisplayParamLines(meta) {
	const displayParams = meta[MCP_TOOL_APPROVAL_TOOL_PARAMS_DISPLAY_KEY];
	if (!Array.isArray(displayParams)) return [];
	return displayParams.map((entry) => {
		const param = isJsonObject(entry) ? entry : void 0;
		if (!param) return;
		const name = readString$2(param, "display_name") ?? readString$2(param, "name");
		if (!name) return;
		return `- ${name}: ${formatDisplayParamValue(param.value)}`;
	}).filter((line) => Boolean(line));
}
function formatDisplayParamValue(value) {
	const formatted = typeof value === "string" ? value : JSON.stringify(value ?? null);
	return formatted.length <= MAX_DISPLAY_PARAM_VALUE_LENGTH ? formatted : `${formatted.slice(0, MAX_DISPLAY_PARAM_VALUE_LENGTH - 3)}...`;
}
async function requestPluginApprovalOutcome(params) {
	try {
		const requestResult = await requestPluginApproval({
			paramsForRun: params.paramsForRun,
			title: params.title,
			description: params.description,
			severity: "warning",
			toolName: "codex_mcp_tool_approval"
		});
		const approvalId = requestResult?.id;
		if (!approvalId) return "unavailable";
		return mapExecDecisionToOutcome(Object.prototype.hasOwnProperty.call(requestResult, "decision") ? requestResult.decision : await waitForPluginApprovalDecision({
			approvalId,
			signal: params.signal
		}));
	} catch {
		return params.signal?.aborted ? "cancelled" : "denied";
	}
}
function buildElicitationResponse(requestedSchema, meta, outcome) {
	if (outcome === "cancelled") return {
		action: "cancel",
		content: null,
		_meta: null
	};
	if (outcome === "denied" || outcome === "unavailable") return {
		action: "decline",
		content: null,
		_meta: null
	};
	const content = buildAcceptedContent(requestedSchema, meta, outcome);
	if (!content) {
		if (hasNoSchemaProperties(requestedSchema)) return {
			action: "accept",
			content: null,
			_meta: buildAcceptedMeta(meta, outcome)
		};
		embeddedAgentLog.warn("codex MCP approval elicitation approved without a mappable response", {
			approvalKind: meta[MCP_TOOL_APPROVAL_KIND_KEY],
			fields: Object.keys(requestedSchema.properties ?? {}),
			outcome
		});
		return {
			action: "decline",
			content: null,
			_meta: null
		};
	}
	return {
		action: "accept",
		content,
		_meta: buildAcceptedMeta(meta, outcome)
	};
}
function buildAcceptedContent(requestedSchema, meta, outcome) {
	const properties = isJsonObject(requestedSchema.properties) ? requestedSchema.properties : void 0;
	if (!properties) return;
	const required = Array.isArray(requestedSchema.required) ? new Set(requestedSchema.required.filter((entry) => typeof entry === "string")) : /* @__PURE__ */ new Set();
	const content = {};
	let sawApprovalField = false;
	for (const [name, value] of Object.entries(properties)) {
		const schema = isJsonObject(value) ? value : void 0;
		if (!schema) continue;
		const property = {
			name,
			schema,
			required: required.has(name)
		};
		const next = readApprovalFieldValue(property, outcome) ?? readPersistFieldValue(property, meta, outcome) ?? readFallbackFieldValue(property, outcome);
		if (next === void 0) {
			if (isApprovalField(property)) sawApprovalField = true;
			if (property.required) return;
			continue;
		}
		if (isApprovalField(property)) sawApprovalField = true;
		content[name] = next;
	}
	return sawApprovalField ? content : void 0;
}
function readApprovalFieldValue(property, outcome) {
	if (!isApprovalField(property)) return;
	if (readString$2(property.schema, "type") === "boolean") return true;
	const options = readEnumOptions(property.schema);
	if (options.length === 0) return;
	const sessionChoice = options.find((option) => isSessionApprovalOption(option));
	const acceptChoice = options.find((option) => isPositiveApprovalOption(option));
	if (outcome === "approved-session") return sessionChoice?.value ?? acceptChoice?.value;
	return acceptChoice?.value ?? sessionChoice?.value;
}
function readPersistFieldValue(property, meta, outcome) {
	if (!isPersistField(property) || outcome !== "approved-session") return;
	const persistHints = readPersistHints(meta);
	const options = readEnumOptions(property.schema);
	if (options.length === 0) return;
	const preferred = choosePersistHint(persistHints);
	if (preferred) return options.find((option) => option.value === preferred || option.label === preferred)?.value;
}
function readDefaultValue(schema) {
	return schema.default;
}
function readFallbackFieldValue(property, outcome) {
	if (outcome === "approved-once" && isPersistField(property)) return;
	return readDefaultValue(property.schema);
}
function isApprovalField(property) {
	const haystack = propertyText(property).toLowerCase();
	return /\b(approve|approval|allow|accept|decision)\b/.test(haystack);
}
function isPersistField(property) {
	const haystack = propertyText(property).toLowerCase();
	return /\b(persist|session|always|scope)\b/.test(haystack);
}
function propertyText(property) {
	return [
		property.name,
		readString$2(property.schema, "title"),
		readString$2(property.schema, "description")
	].filter(Boolean).join(" ");
}
function readPersistHints(meta) {
	const raw = meta.persist;
	if (typeof raw === "string") return [raw];
	if (Array.isArray(raw)) return raw.filter((entry) => typeof entry === "string");
	return ["session", "always"];
}
function buildAcceptedMeta(meta, outcome) {
	if (outcome !== "approved-session") return null;
	const persist = choosePersistHint(readPersistHints(meta));
	return persist ? { persist } : null;
}
function choosePersistHint(persistHints) {
	if (persistHints.includes("always")) return "always";
	if (persistHints.includes("session")) return "session";
}
function hasNoSchemaProperties(requestedSchema) {
	const properties = isJsonObject(requestedSchema.properties) ? requestedSchema.properties : {};
	return Object.keys(properties).length === 0;
}
function readEnumOptions(schema) {
	if (Array.isArray(schema.enum)) {
		const values = schema.enum.filter((entry) => typeof entry === "string");
		const labels = Array.isArray(schema.enumNames) ? schema.enumNames.filter((entry) => typeof entry === "string") : [];
		return values.map((value, index) => ({
			value,
			label: labels[index] ?? value
		}));
	}
	if (Array.isArray(schema.oneOf)) return schema.oneOf.map((entry) => {
		const option = isJsonObject(entry) ? entry : void 0;
		const value = readString$2(option, "const");
		if (!value) return;
		return {
			value,
			label: readString$2(option, "title") ?? value
		};
	}).filter((entry) => Boolean(entry));
	return [];
}
function isPositiveApprovalOption(option) {
	const haystack = `${option.value} ${option.label}`.toLowerCase();
	return /\b(allow|approve|accept|yes|continue|proceed|true)\b/.test(haystack);
}
function isSessionApprovalOption(option) {
	const haystack = `${option.value} ${option.label}`.toLowerCase();
	return /\b(session|always|persistent)\b/.test(haystack) && /\b(allow|approve|accept)\b/.test(haystack);
}
function readString$2(record, key) {
	const value = record?.[key];
	return typeof value === "string" && value.trim() ? value : void 0;
}
//#endregion
//#region extensions/codex/src/app-server/event-projector.ts
const ZERO_USAGE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		total: 0
	}
};
const CURRENT_TOKEN_USAGE_KEYS = [
	"last",
	"current",
	"lastCall",
	"lastCallUsage",
	"lastTokenUsage",
	"last_token_usage"
];
var CodexAppServerEventProjector = class {
	constructor(params, threadId, turnId) {
		this.params = params;
		this.threadId = threadId;
		this.turnId = turnId;
		this.assistantTextByItem = /* @__PURE__ */ new Map();
		this.assistantItemOrder = [];
		this.reasoningTextByItem = /* @__PURE__ */ new Map();
		this.planTextByItem = /* @__PURE__ */ new Map();
		this.activeItemIds = /* @__PURE__ */ new Set();
		this.completedItemIds = /* @__PURE__ */ new Set();
		this.activeCompactionItemIds = /* @__PURE__ */ new Set();
		this.toolMetas = /* @__PURE__ */ new Map();
		this.assistantStarted = false;
		this.reasoningStarted = false;
		this.reasoningEnded = false;
		this.promptErrorSource = null;
		this.aborted = false;
		this.guardianReviewCount = 0;
		this.completedCompactionCount = 0;
	}
	async handleNotification(notification) {
		const params = isJsonObject(notification.params) ? notification.params : void 0;
		if (!params || !this.isNotificationForTurn(params)) return;
		switch (notification.method) {
			case "item/agentMessage/delta":
				await this.handleAssistantDelta(params);
				break;
			case "item/reasoning/summaryTextDelta":
			case "item/reasoning/textDelta":
				await this.handleReasoningDelta(params);
				break;
			case "item/plan/delta":
				this.handlePlanDelta(params);
				break;
			case "turn/plan/updated":
				this.handleTurnPlanUpdated(params);
				break;
			case "item/started":
				await this.handleItemStarted(params);
				break;
			case "item/completed":
				await this.handleItemCompleted(params);
				break;
			case "item/autoApprovalReview/started":
			case "item/autoApprovalReview/completed":
				this.handleGuardianReviewNotification(notification.method, params);
				break;
			case "thread/tokenUsage/updated":
				this.handleTokenUsage(params);
				break;
			case "turn/completed":
				await this.handleTurnCompleted(params);
				break;
			case "error":
				this.promptError = readString$1(params, "message") ?? "codex app-server error";
				this.promptErrorSource = "prompt";
				break;
			default: break;
		}
	}
	buildResult(toolTelemetry, options) {
		const assistantTexts = this.collectAssistantTexts();
		const reasoningText = collectTextValues(this.reasoningTextByItem).join("\n\n");
		const planText = collectTextValues(this.planTextByItem).join("\n\n");
		const lastAssistant = assistantTexts.length > 0 ? this.createAssistantMessage(assistantTexts.join("\n\n")) : void 0;
		const messagesSnapshot = [{
			role: "user",
			content: this.params.prompt,
			timestamp: Date.now()
		}];
		if (reasoningText) messagesSnapshot.push(this.createAssistantMirrorMessage("Codex reasoning", reasoningText));
		if (planText) messagesSnapshot.push(this.createAssistantMirrorMessage("Codex plan", planText));
		if (lastAssistant) messagesSnapshot.push(lastAssistant);
		const turnFailed = this.completedTurn?.status === "failed";
		const turnInterrupted = this.completedTurn?.status === "interrupted";
		const promptError = this.promptError ?? (turnFailed ? this.completedTurn?.error?.message ?? "codex app-server turn failed" : null);
		return {
			aborted: this.aborted || turnInterrupted,
			externalAbort: false,
			timedOut: false,
			idleTimedOut: false,
			timedOutDuringCompaction: false,
			promptError,
			promptErrorSource: promptError ? this.promptErrorSource || "prompt" : null,
			sessionIdUsed: this.params.sessionId,
			bootstrapPromptWarningSignaturesSeen: this.params.bootstrapPromptWarningSignaturesSeen,
			bootstrapPromptWarningSignature: this.params.bootstrapPromptWarningSignature,
			messagesSnapshot,
			assistantTexts,
			toolMetas: [...this.toolMetas.values()],
			lastAssistant,
			didSendViaMessagingTool: toolTelemetry.didSendViaMessagingTool,
			messagingToolSentTexts: toolTelemetry.messagingToolSentTexts,
			messagingToolSentMediaUrls: toolTelemetry.messagingToolSentMediaUrls,
			messagingToolSentTargets: toolTelemetry.messagingToolSentTargets,
			toolMediaUrls: toolTelemetry.toolMediaUrls,
			toolAudioAsVoice: toolTelemetry.toolAudioAsVoice,
			successfulCronAdds: toolTelemetry.successfulCronAdds,
			cloudCodeAssistFormatError: false,
			attemptUsage: this.tokenUsage,
			replayMetadata: {
				hadPotentialSideEffects: toolTelemetry.didSendViaMessagingTool,
				replaySafe: !toolTelemetry.didSendViaMessagingTool
			},
			itemLifecycle: {
				startedCount: this.activeItemIds.size + this.completedItemIds.size,
				completedCount: this.completedItemIds.size,
				activeCount: this.activeItemIds.size,
				...this.completedCompactionCount > 0 ? { compactionCount: this.completedCompactionCount } : {}
			},
			yieldDetected: options?.yieldDetected || false,
			didSendDeterministicApprovalPrompt: this.guardianReviewCount > 0 ? false : void 0
		};
	}
	markTimedOut() {
		this.aborted = true;
		this.promptError = "codex app-server attempt timed out";
		this.promptErrorSource = "prompt";
	}
	isCompacting() {
		return this.activeCompactionItemIds.size > 0;
	}
	async handleAssistantDelta(params) {
		const itemId = readString$1(params, "itemId") ?? readString$1(params, "id") ?? "assistant";
		const delta = readString$1(params, "delta") ?? "";
		if (!delta) return;
		if (!this.assistantStarted) {
			this.assistantStarted = true;
			await this.params.onAssistantMessageStart?.();
		}
		this.rememberAssistantItem(itemId);
		const text = `${this.assistantTextByItem.get(itemId) ?? ""}${delta}`;
		this.assistantTextByItem.set(itemId, text);
	}
	async handleReasoningDelta(params) {
		const itemId = readString$1(params, "itemId") ?? readString$1(params, "id") ?? "reasoning";
		const delta = readString$1(params, "delta") ?? "";
		if (!delta) return;
		this.reasoningStarted = true;
		this.reasoningTextByItem.set(itemId, `${this.reasoningTextByItem.get(itemId) ?? ""}${delta}`);
		await this.params.onReasoningStream?.({ text: delta });
	}
	handlePlanDelta(params) {
		const itemId = readString$1(params, "itemId") ?? readString$1(params, "id") ?? "plan";
		const delta = readString$1(params, "delta") ?? "";
		if (!delta) return;
		const text = `${this.planTextByItem.get(itemId) ?? ""}${delta}`;
		this.planTextByItem.set(itemId, text);
		this.emitPlanUpdate({
			explanation: void 0,
			steps: splitPlanText(text)
		});
	}
	handleTurnPlanUpdated(params) {
		const plan = Array.isArray(params.plan) ? params.plan.flatMap((entry) => {
			if (!isJsonObject(entry)) return [];
			const step = readString$1(entry, "step");
			const status = readString$1(entry, "status");
			if (!step) return [];
			return status ? [`${step} (${status})`] : [step];
		}) : void 0;
		this.emitPlanUpdate({
			explanation: readNullableString(params, "explanation"),
			steps: plan
		});
	}
	async handleItemStarted(params) {
		const item = readItem(params.item);
		const itemId = item?.id ?? readString$1(params, "itemId") ?? readString$1(params, "id");
		if (itemId) this.activeItemIds.add(itemId);
		if (item?.type === "contextCompaction" && itemId) {
			this.activeCompactionItemIds.add(itemId);
			await runAgentHarnessBeforeCompactionHook({
				sessionFile: this.params.sessionFile,
				messages: this.readMirroredSessionMessages(),
				ctx: {
					runId: this.params.runId,
					agentId: this.params.agentId,
					sessionKey: this.params.sessionKey,
					sessionId: this.params.sessionId,
					workspaceDir: this.params.workspaceDir,
					messageProvider: this.params.messageProvider ?? void 0,
					trigger: this.params.trigger,
					channelId: this.params.messageChannel ?? this.params.messageProvider ?? void 0
				}
			});
			this.emitAgentEvent({
				stream: "compaction",
				data: {
					phase: "start",
					backend: "codex-app-server",
					threadId: this.threadId,
					turnId: this.turnId,
					itemId
				}
			});
		}
		this.emitStandardItemEvent({
			phase: "start",
			item
		});
		this.emitAgentEvent({
			stream: "codex_app_server.item",
			data: {
				phase: "started",
				itemId,
				type: item?.type
			}
		});
	}
	async handleItemCompleted(params) {
		const item = readItem(params.item);
		const itemId = item?.id ?? readString$1(params, "itemId") ?? readString$1(params, "id");
		if (itemId) {
			this.activeItemIds.delete(itemId);
			this.completedItemIds.add(itemId);
		}
		if (item?.type === "agentMessage" && typeof item.text === "string" && item.text) {
			this.rememberAssistantItem(item.id);
			this.assistantTextByItem.set(item.id, item.text);
		}
		if (item?.type === "plan" && typeof item.text === "string" && item.text) {
			this.planTextByItem.set(item.id, item.text);
			this.emitPlanUpdate({
				explanation: void 0,
				steps: splitPlanText(item.text)
			});
		}
		if (item?.type === "contextCompaction" && itemId) {
			this.activeCompactionItemIds.delete(itemId);
			this.completedCompactionCount += 1;
			await runAgentHarnessAfterCompactionHook({
				sessionFile: this.params.sessionFile,
				messages: this.readMirroredSessionMessages(),
				compactedCount: -1,
				ctx: {
					runId: this.params.runId,
					agentId: this.params.agentId,
					sessionKey: this.params.sessionKey,
					sessionId: this.params.sessionId,
					workspaceDir: this.params.workspaceDir,
					messageProvider: this.params.messageProvider ?? void 0,
					trigger: this.params.trigger,
					channelId: this.params.messageChannel ?? this.params.messageProvider ?? void 0
				}
			});
			this.emitAgentEvent({
				stream: "compaction",
				data: {
					phase: "end",
					backend: "codex-app-server",
					threadId: this.threadId,
					turnId: this.turnId,
					itemId
				}
			});
		}
		this.recordToolMeta(item);
		this.emitStandardItemEvent({
			phase: "end",
			item
		});
		this.emitAgentEvent({
			stream: "codex_app_server.item",
			data: {
				phase: "completed",
				itemId,
				type: item?.type
			}
		});
	}
	handleTokenUsage(params) {
		const tokenUsage = isJsonObject(params.tokenUsage) ? params.tokenUsage : void 0;
		const current = (tokenUsage ? readFirstJsonObject(tokenUsage, CURRENT_TOKEN_USAGE_KEYS) : void 0) ?? readFirstJsonObject(params, CURRENT_TOKEN_USAGE_KEYS);
		if (!current) return;
		const usage = normalizeCodexTokenUsage(current);
		if (usage) this.tokenUsage = usage;
	}
	handleGuardianReviewNotification(method, params) {
		this.guardianReviewCount += 1;
		const review = isJsonObject(params.review) ? params.review : void 0;
		const action = isJsonObject(params.action) ? params.action : void 0;
		this.emitAgentEvent({
			stream: "codex_app_server.guardian",
			data: {
				method,
				phase: method.endsWith("/started") ? "started" : "completed",
				reviewId: readString$1(params, "reviewId"),
				targetItemId: readNullableString(params, "targetItemId"),
				decisionSource: readString$1(params, "decisionSource"),
				status: review ? readString$1(review, "status") : void 0,
				riskLevel: review ? readString$1(review, "riskLevel") : void 0,
				userAuthorization: review ? readString$1(review, "userAuthorization") : void 0,
				rationale: review ? readNullableString(review, "rationale") : void 0,
				actionType: action ? readString$1(action, "type") : void 0
			}
		});
	}
	async handleTurnCompleted(params) {
		const turn = readTurn(params.turn);
		if (!turn || turn.id !== this.turnId) return;
		this.completedTurn = turn;
		if (turn.status === "interrupted") this.aborted = true;
		if (turn.status === "failed") {
			this.promptError = turn.error?.message ?? "codex app-server turn failed";
			this.promptErrorSource = "prompt";
		}
		for (const item of turn.items ?? []) {
			if (item.type === "agentMessage" && typeof item.text === "string" && item.text) {
				this.rememberAssistantItem(item.id);
				this.assistantTextByItem.set(item.id, item.text);
			}
			if (item.type === "plan" && typeof item.text === "string" && item.text) {
				this.planTextByItem.set(item.id, item.text);
				this.emitPlanUpdate({
					explanation: void 0,
					steps: splitPlanText(item.text)
				});
			}
			this.recordToolMeta(item);
		}
		this.activeCompactionItemIds.clear();
		await this.maybeEndReasoning();
	}
	async maybeEndReasoning() {
		if (!this.reasoningStarted || this.reasoningEnded) return;
		this.reasoningEnded = true;
		await this.params.onReasoningEnd?.();
	}
	emitPlanUpdate(params) {
		if (!params.explanation && (!params.steps || params.steps.length === 0)) return;
		this.emitAgentEvent({
			stream: "plan",
			data: {
				phase: "update",
				title: "Plan updated",
				source: "codex-app-server",
				...params.explanation ? { explanation: params.explanation } : {},
				...params.steps && params.steps.length > 0 ? { steps: params.steps } : {}
			}
		});
	}
	emitStandardItemEvent(params) {
		const { item } = params;
		if (!item) return;
		const kind = itemKind(item);
		if (!kind) return;
		this.emitAgentEvent({
			stream: "item",
			data: {
				itemId: item.id,
				phase: params.phase,
				kind,
				title: itemTitle(item),
				status: params.phase === "start" ? "running" : itemStatus(item),
				...itemName(item) ? { name: itemName(item) } : {},
				...itemMeta(item) ? { meta: itemMeta(item) } : {}
			}
		});
	}
	recordToolMeta(item) {
		if (!item) return;
		const toolName = itemName(item);
		if (!toolName) return;
		this.toolMetas.set(item.id, {
			toolName,
			...itemMeta(item) ? { meta: itemMeta(item) } : {}
		});
	}
	emitAgentEvent(event) {
		try {
			this.params.onAgentEvent?.(event);
		} catch {}
	}
	collectAssistantTexts() {
		const finalText = this.resolveFinalAssistantText();
		return finalText ? [finalText] : [];
	}
	resolveFinalAssistantText() {
		for (let i = this.assistantItemOrder.length - 1; i >= 0; i -= 1) {
			const itemId = this.assistantItemOrder[i];
			if (!itemId) continue;
			const text = this.assistantTextByItem.get(itemId)?.trim();
			if (text) return text;
		}
	}
	rememberAssistantItem(itemId) {
		if (!itemId || this.assistantItemOrder.includes(itemId)) return;
		this.assistantItemOrder.push(itemId);
	}
	readMirroredSessionMessages() {
		try {
			return SessionManager.open(this.params.sessionFile).buildSessionContext().messages;
		} catch {
			return [];
		}
	}
	createAssistantMessage(text) {
		const usage = this.tokenUsage ? {
			input: this.tokenUsage.input ?? 0,
			output: this.tokenUsage.output ?? 0,
			cacheRead: this.tokenUsage.cacheRead ?? 0,
			cacheWrite: this.tokenUsage.cacheWrite ?? 0,
			totalTokens: this.tokenUsage.total ?? (this.tokenUsage.input ?? 0) + (this.tokenUsage.output ?? 0) + (this.tokenUsage.cacheRead ?? 0) + (this.tokenUsage.cacheWrite ?? 0),
			cost: ZERO_USAGE.cost
		} : ZERO_USAGE;
		return {
			role: "assistant",
			content: [{
				type: "text",
				text
			}],
			api: this.params.model.api ?? "openai-codex-responses",
			provider: this.params.provider,
			model: this.params.modelId,
			usage,
			stopReason: this.aborted ? "aborted" : this.promptError ? "error" : "stop",
			errorMessage: this.promptError ? formatErrorMessage(this.promptError) : void 0,
			timestamp: Date.now()
		};
	}
	createAssistantMirrorMessage(title, text) {
		return {
			role: "assistant",
			content: [{
				type: "text",
				text: `${title}:\n${text}`
			}],
			api: this.params.model.api ?? "openai-codex-responses",
			provider: this.params.provider,
			model: this.params.modelId,
			usage: ZERO_USAGE,
			stopReason: "stop",
			timestamp: Date.now()
		};
	}
	isNotificationForTurn(params) {
		const threadId = readString$1(params, "threadId");
		const turnId = readNotificationTurnId$1(params);
		return threadId === this.threadId && turnId === this.turnId;
	}
};
function readNotificationTurnId$1(record) {
	return readString$1(record, "turnId") ?? readNestedTurnId$1(record);
}
function readNestedTurnId$1(record) {
	const turn = record.turn;
	return isJsonObject(turn) ? readString$1(turn, "id") : void 0;
}
function readString$1(record, key) {
	const value = record[key];
	return typeof value === "string" ? value : void 0;
}
function readNullableString(record, key) {
	const value = record[key];
	if (value === null) return null;
	return typeof value === "string" ? value : void 0;
}
function readNumber(record, key) {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function readFirstJsonObject(record, keys) {
	for (const key of keys) {
		const value = record[key];
		if (isJsonObject(value)) return value;
	}
}
function readNumberAlias(record, keys) {
	for (const key of keys) {
		const value = readNumber(record, key);
		if (value !== void 0) return value;
	}
}
function normalizeCodexTokenUsage(record) {
	return normalizeUsage({
		input: readNumberAlias(record, [
			"inputTokens",
			"input_tokens",
			"input",
			"promptTokens"
		]),
		output: readNumberAlias(record, [
			"outputTokens",
			"output_tokens",
			"output"
		]),
		cacheRead: readNumberAlias(record, [
			"cachedInputTokens",
			"cached_input_tokens",
			"cacheRead",
			"cache_read",
			"cache_read_input_tokens",
			"cached_tokens"
		]),
		cacheWrite: readNumberAlias(record, [
			"cacheWrite",
			"cache_write",
			"cacheCreationInputTokens",
			"cache_creation_input_tokens"
		]),
		total: readNumberAlias(record, [
			"totalTokens",
			"total_tokens",
			"total"
		])
	});
}
function splitPlanText(text) {
	return text.split(/\r?\n/).map((line) => line.trim().replace(/^[-*]\s+/, "")).filter((line) => line.length > 0);
}
function collectTextValues(map) {
	return [...map.values()].filter((text) => text.trim().length > 0);
}
function itemKind(item) {
	switch (item.type) {
		case "dynamicToolCall":
		case "mcpToolCall": return "tool";
		case "commandExecution": return "command";
		case "fileChange": return "patch";
		case "webSearch": return "search";
		case "reasoning":
		case "contextCompaction": return "analysis";
		default: return;
	}
}
function itemTitle(item) {
	switch (item.type) {
		case "commandExecution": return "Command";
		case "fileChange": return "File change";
		case "mcpToolCall": return "MCP tool";
		case "dynamicToolCall": return "Tool";
		case "webSearch": return "Web search";
		case "contextCompaction": return "Context compaction";
		case "reasoning": return "Reasoning";
		default: return item.type;
	}
}
function itemStatus(item) {
	const status = readItemString(item, "status");
	if (status === "failed") return "failed";
	if (status === "inProgress" || status === "running") return "running";
	return "completed";
}
function itemName(item) {
	if (item.type === "dynamicToolCall" && typeof item.tool === "string") return item.tool;
	if (item.type === "mcpToolCall" && typeof item.tool === "string") {
		const server = typeof item.server === "string" ? item.server : void 0;
		return server ? `${server}.${item.tool}` : item.tool;
	}
	if (item.type === "commandExecution") return "bash";
	if (item.type === "fileChange") return "apply_patch";
	if (item.type === "webSearch") return "web_search";
}
function itemMeta(item) {
	if (item.type === "commandExecution" && typeof item.command === "string") return item.command;
	if (item.type === "webSearch" && typeof item.query === "string") return item.query;
	return readItemString(item, "status");
}
function readItemString(item, key) {
	const value = item[key];
	return typeof value === "string" ? value : void 0;
}
function readItem(value) {
	if (!isJsonObject(value)) return;
	const type = typeof value.type === "string" ? value.type : void 0;
	const id = typeof value.id === "string" ? value.id : void 0;
	if (!type || !id) return;
	return value;
}
function readTurn(value) {
	if (!isJsonObject(value)) return;
	const id = typeof value.id === "string" ? value.id : void 0;
	const status = typeof value.status === "string" ? value.status : void 0;
	if (!id || !status) return;
	const items = Array.isArray(value.items) ? value.items.flatMap((item) => {
		const parsed = readItem(item);
		return parsed ? [parsed] : [];
	}) : void 0;
	return {
		id,
		status,
		error: isJsonObject(value.error) ? { message: typeof value.error.message === "string" ? value.error.message : void 0 } : null,
		items
	};
}
//#endregion
//#region extensions/codex/src/app-server/thread-lifecycle.ts
async function startOrResumeThread(params) {
	const dynamicToolsFingerprint = fingerprintDynamicTools(params.dynamicTools);
	const binding = await readCodexAppServerBinding(params.params.sessionFile);
	if (binding?.threadId) if (binding.dynamicToolsFingerprint && binding.dynamicToolsFingerprint !== dynamicToolsFingerprint) {
		embeddedAgentLog.debug("codex app-server dynamic tool catalog changed; starting a new thread", { threadId: binding.threadId });
		await clearCodexAppServerBinding(params.params.sessionFile);
	} else try {
		const response = await params.client.request("thread/resume", buildThreadResumeParams(params.params, {
			threadId: binding.threadId,
			appServer: params.appServer,
			developerInstructions: params.developerInstructions
		}));
		const boundAuthProfileId = params.params.authProfileId ?? binding.authProfileId;
		await writeCodexAppServerBinding(params.params.sessionFile, {
			threadId: response.thread.id,
			cwd: params.cwd,
			authProfileId: boundAuthProfileId,
			model: params.params.modelId,
			modelProvider: response.modelProvider ?? normalizeModelProvider(params.params.provider),
			dynamicToolsFingerprint,
			createdAt: binding.createdAt
		});
		return {
			...binding,
			threadId: response.thread.id,
			cwd: params.cwd,
			authProfileId: boundAuthProfileId,
			model: params.params.modelId,
			modelProvider: response.modelProvider ?? normalizeModelProvider(params.params.provider),
			dynamicToolsFingerprint
		};
	} catch (error) {
		embeddedAgentLog.warn("codex app-server thread resume failed; starting a new thread", { error });
		await clearCodexAppServerBinding(params.params.sessionFile);
	}
	const response = await params.client.request("thread/start", {
		model: params.params.modelId,
		modelProvider: normalizeModelProvider(params.params.provider),
		cwd: params.cwd,
		approvalPolicy: params.appServer.approvalPolicy,
		approvalsReviewer: params.appServer.approvalsReviewer,
		sandbox: params.appServer.sandbox,
		...params.appServer.serviceTier ? { serviceTier: params.appServer.serviceTier } : {},
		serviceName: "OpenClaw",
		developerInstructions: params.developerInstructions ?? buildDeveloperInstructions(params.params),
		dynamicTools: params.dynamicTools,
		experimentalRawEvents: true,
		persistExtendedHistory: true
	});
	const createdAt = (/* @__PURE__ */ new Date()).toISOString();
	await writeCodexAppServerBinding(params.params.sessionFile, {
		threadId: response.thread.id,
		cwd: params.cwd,
		authProfileId: params.params.authProfileId,
		model: response.model ?? params.params.modelId,
		modelProvider: response.modelProvider ?? normalizeModelProvider(params.params.provider),
		dynamicToolsFingerprint,
		createdAt
	});
	return {
		schemaVersion: 1,
		threadId: response.thread.id,
		sessionFile: params.params.sessionFile,
		cwd: params.cwd,
		authProfileId: params.params.authProfileId,
		model: response.model ?? params.params.modelId,
		modelProvider: response.modelProvider ?? normalizeModelProvider(params.params.provider),
		dynamicToolsFingerprint,
		createdAt,
		updatedAt: createdAt
	};
}
function buildThreadResumeParams(params, options) {
	return {
		threadId: options.threadId,
		model: params.modelId,
		modelProvider: normalizeModelProvider(params.provider),
		approvalPolicy: options.appServer.approvalPolicy,
		approvalsReviewer: options.appServer.approvalsReviewer,
		sandbox: options.appServer.sandbox,
		...options.appServer.serviceTier ? { serviceTier: options.appServer.serviceTier } : {},
		developerInstructions: options.developerInstructions ?? buildDeveloperInstructions(params),
		persistExtendedHistory: true
	};
}
function buildTurnStartParams(params, options) {
	return {
		threadId: options.threadId,
		input: buildUserInput(params, options.promptText),
		cwd: options.cwd,
		approvalPolicy: options.appServer.approvalPolicy,
		approvalsReviewer: options.appServer.approvalsReviewer,
		model: params.modelId,
		...options.appServer.serviceTier ? { serviceTier: options.appServer.serviceTier } : {},
		effort: resolveReasoningEffort(params.thinkLevel)
	};
}
function fingerprintDynamicTools(dynamicTools) {
	return JSON.stringify(dynamicTools.map(fingerprintDynamicToolSpec));
}
function fingerprintDynamicToolSpec(tool) {
	if (!isJsonObject(tool)) return stabilizeJsonValue(tool);
	const stable = {};
	for (const [key, child] of Object.entries(tool).toSorted(([left], [right]) => left.localeCompare(right))) {
		if (key === "description") continue;
		stable[key] = stabilizeJsonValue(child);
	}
	return stable;
}
function stabilizeJsonValue(value) {
	if (Array.isArray(value)) return value.map(stabilizeJsonValue);
	if (!isJsonObject(value)) return value;
	const stable = {};
	for (const [key, child] of Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right))) stable[key] = stabilizeJsonValue(child);
	return stable;
}
function buildDeveloperInstructions(params) {
	return [
		"You are running inside OpenClaw. Use OpenClaw dynamic tools for messaging, cron, sessions, and host actions when available.",
		"Preserve the user's existing channel/session context. If sending a channel reply, use the OpenClaw messaging tool instead of describing that you would reply.",
		renderCodexPromptOverlay({ modelId: params.modelId }),
		params.extraSystemPrompt,
		params.skillsSnapshot?.prompt
	].filter((section) => typeof section === "string" && section.trim()).join("\n\n");
}
function buildUserInput(params, promptText = params.prompt) {
	return [{
		type: "text",
		text: promptText
	}, ...(params.images ?? []).map((image) => ({
		type: "image",
		url: `data:${image.mimeType};base64,${image.data}`
	}))];
}
function normalizeModelProvider(provider) {
	return provider === "codex" || provider === "openai-codex" ? "openai" : provider;
}
function resolveReasoningEffort(thinkLevel) {
	if (thinkLevel === "minimal" || thinkLevel === "low" || thinkLevel === "medium" || thinkLevel === "high" || thinkLevel === "xhigh") return thinkLevel;
	return null;
}
//#endregion
//#region extensions/codex/src/app-server/trajectory.ts
const SENSITIVE_FIELD_RE = /(?:authorization|cookie|credential|key|password|passwd|secret|token)/iu;
const PRIVATE_PAYLOAD_FIELD_RE = /(?:image|screenshot|attachment|fileData|dataUri)/iu;
const AUTHORIZATION_VALUE_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9+/._~=-]{8,}/giu;
const JWT_VALUE_RE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gu;
const COOKIE_PAIR_RE = /\b([A-Za-z][A-Za-z0-9_.-]{1,64})=([A-Za-z0-9+/._~%=-]{16,})(?=;|\s|$)/gu;
const TRAJECTORY_RUNTIME_FILE_MAX_BYTES = 50 * 1024 * 1024;
const TRAJECTORY_RUNTIME_EVENT_MAX_BYTES = 256 * 1024;
function resolveCodexTrajectoryAppendFlags(constants = nodeFs.constants) {
	const noFollow = constants.O_NOFOLLOW;
	return constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY | (typeof noFollow === "number" ? noFollow : 0);
}
function resolveCodexTrajectoryPointerFlags(constants = nodeFs.constants) {
	const noFollow = constants.O_NOFOLLOW;
	return constants.O_CREAT | constants.O_TRUNC | constants.O_WRONLY | (typeof noFollow === "number" ? noFollow : 0);
}
async function assertNoSymlinkParents(filePath) {
	const resolvedDir = path.resolve(path.dirname(filePath));
	const parsed = path.parse(resolvedDir);
	const relativeParts = path.relative(parsed.root, resolvedDir).split(path.sep).filter(Boolean);
	let current = parsed.root;
	for (const part of relativeParts) {
		current = path.join(current, part);
		const stat = await fs.lstat(current);
		if (stat.isSymbolicLink()) {
			if (path.dirname(current) === parsed.root) continue;
			throw new Error(`Refusing to write trajectory under symlinked directory: ${current}`);
		}
		if (!stat.isDirectory()) throw new Error(`Refusing to write trajectory under non-directory: ${current}`);
	}
}
function verifyStableOpenedTrajectoryFile(params) {
	if (!params.postOpenStat.isFile()) throw new Error(`Refusing to write trajectory to non-file: ${params.filePath}`);
	if (params.postOpenStat.nlink > 1) throw new Error(`Refusing to write trajectory to hardlinked file: ${params.filePath}`);
	const pre = params.preOpenStat;
	if (pre && (pre.dev !== params.postOpenStat.dev || pre.ino !== params.postOpenStat.ino)) throw new Error(`Refusing to write trajectory after file changed: ${params.filePath}`);
}
async function safeAppendTrajectoryFile(filePath, line) {
	await assertNoSymlinkParents(filePath);
	let preOpenStat;
	try {
		const stat = await fs.lstat(filePath);
		if (stat.isSymbolicLink()) throw new Error(`Refusing to write trajectory through symlink: ${filePath}`);
		if (!stat.isFile()) throw new Error(`Refusing to write trajectory to non-file: ${filePath}`);
		preOpenStat = stat;
	} catch (err) {
		if (err.code !== "ENOENT") throw err;
	}
	const lineBytes = Buffer.byteLength(line, "utf8");
	if ((preOpenStat?.size ?? 0) + lineBytes > TRAJECTORY_RUNTIME_FILE_MAX_BYTES) return;
	const handle = await fs.open(filePath, resolveCodexTrajectoryAppendFlags(), 384);
	try {
		const stat = await handle.stat();
		verifyStableOpenedTrajectoryFile({
			preOpenStat,
			postOpenStat: stat,
			filePath
		});
		if (stat.size + lineBytes > TRAJECTORY_RUNTIME_FILE_MAX_BYTES) return;
		await handle.chmod(384);
		await handle.appendFile(line, "utf8");
	} finally {
		await handle.close();
	}
}
function boundedTrajectoryLine(event) {
	const line = JSON.stringify(event);
	const bytes = Buffer.byteLength(line, "utf8");
	if (bytes <= TRAJECTORY_RUNTIME_EVENT_MAX_BYTES) return `${line}\n`;
	const truncated = JSON.stringify({
		...event,
		data: {
			truncated: true,
			originalBytes: bytes,
			limitBytes: TRAJECTORY_RUNTIME_EVENT_MAX_BYTES,
			reason: "trajectory-event-size-limit"
		}
	});
	if (Buffer.byteLength(truncated, "utf8") <= TRAJECTORY_RUNTIME_EVENT_MAX_BYTES) return `${truncated}\n`;
}
function resolveTrajectoryPointerFilePath(sessionFile) {
	return sessionFile.endsWith(".jsonl") ? `${sessionFile.slice(0, -6)}.trajectory-path.json` : `${sessionFile}.trajectory-path.json`;
}
function writeTrajectoryPointerBestEffort(params) {
	const pointerPath = resolveTrajectoryPointerFilePath(params.sessionFile);
	try {
		const pointerDir = path.resolve(path.dirname(pointerPath));
		if (nodeFs.lstatSync(pointerDir).isSymbolicLink()) return;
		try {
			if (nodeFs.lstatSync(pointerPath).isSymbolicLink()) return;
		} catch (error) {
			if (error.code !== "ENOENT") return;
		}
		const fd = nodeFs.openSync(pointerPath, resolveCodexTrajectoryPointerFlags(), 384);
		try {
			nodeFs.writeFileSync(fd, `${JSON.stringify({
				traceSchema: "openclaw-trajectory-pointer",
				schemaVersion: 1,
				sessionId: params.sessionId,
				runtimeFile: params.filePath
			}, null, 2)}\n`, "utf8");
			nodeFs.fchmodSync(fd, 384);
		} finally {
			nodeFs.closeSync(fd);
		}
	} catch {}
}
function createCodexTrajectoryRecorder(params) {
	const env = params.env ?? process.env;
	if (!parseTrajectoryEnabled(env)) return null;
	const filePath = resolveTrajectoryFilePath({
		env,
		sessionFile: params.attempt.sessionFile,
		sessionId: params.attempt.sessionId
	});
	const ready = fs.mkdir(path.dirname(filePath), {
		recursive: true,
		mode: 448
	}).catch(() => void 0);
	writeTrajectoryPointerBestEffort({
		filePath,
		sessionFile: params.attempt.sessionFile,
		sessionId: params.attempt.sessionId
	});
	let queue = Promise.resolve();
	let seq = 0;
	return {
		filePath,
		recordEvent: (type, data) => {
			const line = boundedTrajectoryLine({
				traceSchema: "openclaw-trajectory",
				schemaVersion: 1,
				traceId: params.attempt.sessionId,
				source: "runtime",
				type,
				ts: (/* @__PURE__ */ new Date()).toISOString(),
				seq: seq += 1,
				sourceSeq: seq,
				sessionId: params.attempt.sessionId,
				sessionKey: params.attempt.sessionKey,
				runId: params.attempt.runId,
				workspaceDir: params.cwd,
				provider: params.attempt.provider,
				modelId: params.attempt.modelId,
				modelApi: params.attempt.model.api,
				data: data ? sanitizeValue(data) : void 0
			});
			if (!line) return;
			queue = queue.then(() => ready).then(() => safeAppendTrajectoryFile(filePath, line)).catch(() => void 0);
		},
		flush: async () => {
			await queue;
		}
	};
}
function recordCodexTrajectoryContext(recorder, params) {
	if (!recorder) return;
	recorder.recordEvent("context.compiled", {
		systemPrompt: params.developerInstructions,
		prompt: params.prompt ?? params.attempt.prompt,
		imagesCount: params.attempt.images?.length ?? 0,
		tools: toTrajectoryToolDefinitions(params.tools)
	});
}
function recordCodexTrajectoryCompletion(recorder, params) {
	if (!recorder) return;
	recorder.recordEvent("model.completed", {
		threadId: params.threadId,
		turnId: params.turnId,
		timedOut: params.timedOut,
		yieldDetected: params.yieldDetected ?? false,
		aborted: params.result.aborted,
		promptError: normalizeCodexTrajectoryError(params.result.promptError),
		usage: params.result.attemptUsage,
		assistantTexts: params.result.assistantTexts,
		messagesSnapshot: params.result.messagesSnapshot
	});
}
function parseTrajectoryEnabled(env) {
	const value = env.OPENCLAW_TRAJECTORY?.trim().toLowerCase();
	if (value === "1" || value === "true" || value === "yes" || value === "on") return true;
	if (value === "0" || value === "false" || value === "no" || value === "off") return false;
	return true;
}
function resolveTrajectoryFilePath(params) {
	const dirOverride = params.env.OPENCLAW_TRAJECTORY_DIR?.trim();
	if (dirOverride) return resolveContainedPath(resolveUserPath$1(dirOverride), `${safeTrajectorySessionFileName(params.sessionId)}.jsonl`);
	return params.sessionFile.endsWith(".jsonl") ? `${params.sessionFile.slice(0, -6)}.trajectory.jsonl` : `${params.sessionFile}.trajectory.jsonl`;
}
function safeTrajectorySessionFileName(sessionId) {
	const safe = sessionId.replaceAll(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
	return /[A-Za-z0-9]/u.test(safe) ? safe : "session";
}
function resolveContainedPath(baseDir, fileName) {
	const resolvedBase = path.resolve(baseDir);
	const resolvedFile = path.resolve(resolvedBase, fileName);
	const relative = path.relative(resolvedBase, resolvedFile);
	if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Trajectory file path escaped its configured directory");
	return resolvedFile;
}
function toTrajectoryToolDefinitions(tools) {
	if (!tools || tools.length === 0) return;
	return tools.flatMap((tool) => {
		const name = tool.name?.trim();
		if (!name) return [];
		return [{
			name,
			description: tool.description,
			parameters: sanitizeValue(tool.inputSchema)
		}];
	}).toSorted((left, right) => left.name.localeCompare(right.name));
}
function sanitizeValue(value, depth = 0, key = "") {
	if (value == null || typeof value === "boolean" || typeof value === "number") return value;
	if (typeof value === "string") {
		if (SENSITIVE_FIELD_RE.test(key)) return "<redacted>";
		if (value.startsWith("data:") && value.length > 256) return `<redacted data-uri ${value.slice(0, value.indexOf(",")).length} chars>`;
		if (PRIVATE_PAYLOAD_FIELD_RE.test(key) && value.length > 256) return "<redacted payload>";
		const redacted = redactSensitiveString(value);
		return redacted.length > 2e4 ? `${redacted.slice(0, 2e4)}…` : redacted;
	}
	if (depth >= 6) return "<truncated>";
	if (Array.isArray(value)) return value.slice(0, 100).map((entry) => sanitizeValue(entry, depth + 1, key));
	if (typeof value === "object") {
		const next = {};
		for (const [key, child] of Object.entries(value).slice(0, 100)) next[key] = sanitizeValue(child, depth + 1, key);
		return next;
	}
	return JSON.stringify(value);
}
function redactSensitiveString(value) {
	return value.replace(AUTHORIZATION_VALUE_RE, "$1 <redacted>").replace(JWT_VALUE_RE, "<redacted-jwt>").replace(COOKIE_PAIR_RE, "$1=<redacted>");
}
function normalizeCodexTrajectoryError(value) {
	if (!value) return null;
	if (value instanceof Error) return value.message;
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value);
	} catch {
		return "Unknown error";
	}
}
//#endregion
//#region extensions/codex/src/app-server/transcript-mirror.ts
async function mirrorCodexAppServerTranscript(params) {
	const messages = params.messages.filter((message) => message.role === "user" || message.role === "assistant");
	if (messages.length === 0) return;
	await fs.mkdir(path.dirname(params.sessionFile), { recursive: true });
	const lock = await acquireSessionWriteLock({
		sessionFile: params.sessionFile,
		timeoutMs: 1e4
	});
	try {
		const existingIdempotencyKeys = await readTranscriptIdempotencyKeys(params.sessionFile);
		const sessionManager = SessionManager.open(params.sessionFile);
		for (const [index, message] of messages.entries()) {
			const idempotencyKey = params.idempotencyScope ? `${params.idempotencyScope}:${message.role}:${index}` : void 0;
			if (idempotencyKey && existingIdempotencyKeys.has(idempotencyKey)) continue;
			const nextMessage = runAgentHarnessBeforeMessageWriteHook({
				message: {
					...message,
					...idempotencyKey ? { idempotencyKey } : {}
				},
				agentId: params.agentId,
				sessionKey: params.sessionKey
			});
			if (!nextMessage) continue;
			const messageToAppend = idempotencyKey ? {
				...nextMessage,
				idempotencyKey
			} : nextMessage;
			sessionManager.appendMessage(messageToAppend);
			if (idempotencyKey) existingIdempotencyKeys.add(idempotencyKey);
		}
	} finally {
		await lock.release();
	}
	if (params.sessionKey) emitSessionTranscriptUpdate({
		sessionFile: params.sessionFile,
		sessionKey: params.sessionKey
	});
	else emitSessionTranscriptUpdate(params.sessionFile);
}
async function readTranscriptIdempotencyKeys(sessionFile) {
	const keys = /* @__PURE__ */ new Set();
	let raw;
	try {
		raw = await fs.readFile(sessionFile, "utf8");
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
		return keys;
	}
	for (const line of raw.split(/\r?\n/)) {
		if (!line.trim()) continue;
		try {
			const parsed = JSON.parse(line);
			if (typeof parsed.message?.idempotencyKey === "string") keys.add(parsed.message.idempotencyKey);
		} catch {
			continue;
		}
	}
	return keys;
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt.ts
let clientFactory = defaultCodexAppServerClientFactory;
async function runCodexAppServerAttempt(params, options = {}) {
	const attemptStartedAt = Date.now();
	const appServer = resolveCodexAppServerRuntimeOptions({ pluginConfig: options.pluginConfig });
	const resolvedWorkspace = resolveUserPath(params.workspaceDir);
	await fs.mkdir(resolvedWorkspace, { recursive: true });
	const sandboxSessionKey = params.sessionKey?.trim() || params.sessionId;
	const sandbox = await resolveSandboxContext({
		config: params.config,
		sessionKey: sandboxSessionKey,
		workspaceDir: resolvedWorkspace
	});
	const effectiveWorkspace = sandbox?.enabled ? sandbox.workspaceAccess === "rw" ? resolvedWorkspace : sandbox.workspaceDir : resolvedWorkspace;
	await fs.mkdir(effectiveWorkspace, { recursive: true });
	const runAbortController = new AbortController();
	const abortFromUpstream = () => {
		runAbortController.abort(params.abortSignal?.reason ?? "upstream_abort");
	};
	if (params.abortSignal?.aborted) abortFromUpstream();
	else params.abortSignal?.addEventListener("abort", abortFromUpstream, { once: true });
	const { sessionAgentId } = resolveSessionAgentIds({
		sessionKey: params.sessionKey,
		config: params.config,
		agentId: params.agentId
	});
	let yieldDetected = false;
	const startupBinding = await readCodexAppServerBinding(params.sessionFile);
	const startupAuthProfileId = params.authProfileId ?? startupBinding?.authProfileId;
	const toolBridge = createCodexDynamicToolBridge({
		tools: await buildDynamicTools({
			params,
			resolvedWorkspace,
			effectiveWorkspace,
			sandboxSessionKey,
			sandbox,
			runAbortController,
			sessionAgentId,
			onYieldDetected: () => {
				yieldDetected = true;
			}
		}),
		signal: runAbortController.signal,
		hookContext: {
			agentId: sessionAgentId,
			sessionId: params.sessionId,
			sessionKey: sandboxSessionKey,
			runId: params.runId
		}
	});
	const historyMessages = readMirroredSessionHistoryMessages(params.sessionFile);
	const hookContext = {
		runId: params.runId,
		agentId: sessionAgentId,
		sessionKey: sandboxSessionKey,
		sessionId: params.sessionId,
		workspaceDir: params.workspaceDir,
		messageProvider: params.messageProvider ?? void 0,
		trigger: params.trigger,
		channelId: params.messageChannel ?? params.messageProvider ?? void 0
	};
	const promptBuild = await resolveAgentHarnessBeforePromptBuildResult({
		prompt: params.prompt,
		developerInstructions: buildDeveloperInstructions(params),
		messages: historyMessages,
		ctx: hookContext
	});
	const trajectoryRecorder = createCodexTrajectoryRecorder({
		attempt: params,
		cwd: effectiveWorkspace,
		developerInstructions: promptBuild.developerInstructions,
		prompt: promptBuild.prompt,
		tools: toolBridge.specs
	});
	let client;
	let thread;
	let trajectoryEndRecorded = false;
	try {
		({client, thread} = await withCodexStartupTimeout({
			timeoutMs: params.timeoutMs,
			timeoutFloorMs: options.startupTimeoutFloorMs,
			signal: runAbortController.signal,
			operation: async () => {
				const startupClient = await clientFactory(appServer.start, startupAuthProfileId);
				return {
					client: startupClient,
					thread: await startOrResumeThread({
						client: startupClient,
						params,
						cwd: effectiveWorkspace,
						dynamicTools: toolBridge.specs,
						appServer,
						developerInstructions: promptBuild.developerInstructions
					})
				};
			}
		}));
	} catch (error) {
		clearSharedCodexAppServerClient();
		params.abortSignal?.removeEventListener("abort", abortFromUpstream);
		throw error;
	}
	trajectoryRecorder?.recordEvent("session.started", {
		sessionFile: params.sessionFile,
		threadId: thread.threadId,
		authProfileId: startupAuthProfileId,
		workspaceDir: effectiveWorkspace,
		toolCount: toolBridge.specs.length
	});
	recordCodexTrajectoryContext(trajectoryRecorder, {
		attempt: params,
		cwd: effectiveWorkspace,
		developerInstructions: promptBuild.developerInstructions,
		prompt: promptBuild.prompt,
		tools: toolBridge.specs
	});
	let projector;
	let turnId;
	const pendingNotifications = [];
	let completed = false;
	let timedOut = false;
	let resolveCompletion;
	const completion = new Promise((resolve) => {
		resolveCompletion = resolve;
	});
	let notificationQueue = Promise.resolve();
	const handleNotification = async (notification) => {
		if (!projector || !turnId) {
			pendingNotifications.push(notification);
			return;
		}
		const isTurnCompletion = notification.method === "turn/completed" && isTurnNotification(notification.params, thread.threadId, turnId);
		try {
			await projector.handleNotification(notification);
		} catch (error) {
			embeddedAgentLog.debug("codex app-server projector notification threw", {
				method: notification.method,
				error
			});
		} finally {
			if (isTurnCompletion) {
				completed = true;
				resolveCompletion?.();
			}
		}
	};
	const enqueueNotification = (notification) => {
		notificationQueue = notificationQueue.then(() => handleNotification(notification), () => handleNotification(notification));
		return notificationQueue;
	};
	const notificationCleanup = client.addNotificationHandler(enqueueNotification);
	const requestCleanup = client.addRequestHandler(async (request) => {
		if (!turnId) return;
		if (request.method === "mcpServer/elicitation/request") return handleCodexAppServerElicitationRequest({
			requestParams: request.params,
			paramsForRun: params,
			threadId: thread.threadId,
			turnId,
			signal: runAbortController.signal
		});
		if (request.method !== "item/tool/call") {
			if (isCodexAppServerApprovalRequest(request.method)) return handleApprovalRequest({
				method: request.method,
				params: request.params,
				paramsForRun: params,
				threadId: thread.threadId,
				turnId,
				signal: runAbortController.signal
			});
			return;
		}
		const call = readDynamicToolCallParams(request.params);
		if (!call || call.threadId !== thread.threadId || call.turnId !== turnId) return;
		trajectoryRecorder?.recordEvent("tool.call", {
			threadId: call.threadId,
			turnId: call.turnId,
			toolCallId: call.callId,
			name: call.tool,
			arguments: call.arguments
		});
		const response = await toolBridge.handleToolCall(call);
		trajectoryRecorder?.recordEvent("tool.result", {
			threadId: call.threadId,
			turnId: call.turnId,
			toolCallId: call.callId,
			name: call.tool,
			success: response.success,
			contentItems: response.contentItems
		});
		return response;
	});
	const llmInputEvent = {
		runId: params.runId,
		sessionId: params.sessionId,
		provider: params.provider,
		model: params.modelId,
		systemPrompt: promptBuild.developerInstructions,
		prompt: promptBuild.prompt,
		historyMessages,
		imagesCount: params.images?.length ?? 0
	};
	const turnStartFailureMessages = [...historyMessages, {
		role: "user",
		content: [{
			type: "text",
			text: promptBuild.prompt
		}]
	}];
	let turn;
	try {
		runAgentHarnessLlmInputHook({
			event: llmInputEvent,
			ctx: hookContext
		});
		turn = await client.request("turn/start", buildTurnStartParams(params, {
			threadId: thread.threadId,
			cwd: effectiveWorkspace,
			appServer,
			promptText: promptBuild.prompt
		}), {
			timeoutMs: params.timeoutMs,
			signal: runAbortController.signal
		});
	} catch (error) {
		trajectoryRecorder?.recordEvent("session.ended", {
			status: "error",
			threadId: thread.threadId,
			timedOut,
			aborted: runAbortController.signal.aborted,
			promptError: normalizeCodexTrajectoryError(error)
		});
		trajectoryEndRecorded = true;
		runAgentHarnessLlmOutputHook({
			event: {
				runId: params.runId,
				sessionId: params.sessionId,
				provider: params.provider,
				model: params.modelId,
				assistantTexts: []
			},
			ctx: hookContext
		});
		runAgentHarnessAgentEndHook({
			event: {
				messages: turnStartFailureMessages,
				success: false,
				error: formatErrorMessage(error),
				durationMs: Date.now() - attemptStartedAt
			},
			ctx: hookContext
		});
		notificationCleanup();
		requestCleanup();
		await trajectoryRecorder?.flush();
		params.abortSignal?.removeEventListener("abort", abortFromUpstream);
		throw error;
	}
	turnId = turn.turn.id;
	trajectoryRecorder?.recordEvent("prompt.submitted", {
		threadId: thread.threadId,
		turnId,
		prompt: promptBuild.prompt,
		imagesCount: params.images?.length ?? 0
	});
	projector = new CodexAppServerEventProjector(params, thread.threadId, turnId);
	const activeTurnId = turnId;
	const activeProjector = projector;
	for (const notification of pendingNotifications.splice(0)) await enqueueNotification(notification);
	if (!completed && isTerminalTurnStatus(turn.turn.status)) await enqueueNotification({
		method: "turn/completed",
		params: {
			threadId: thread.threadId,
			turnId: activeTurnId,
			turn: turn.turn
		}
	});
	const handle = {
		kind: "embedded",
		queueMessage: async (text) => {
			await client.request("turn/steer", {
				threadId: thread.threadId,
				expectedTurnId: activeTurnId,
				input: [{
					type: "text",
					text
				}]
			});
		},
		isStreaming: () => !completed,
		isCompacting: () => projector?.isCompacting() ?? false,
		cancel: () => runAbortController.abort("cancelled"),
		abort: () => runAbortController.abort("aborted")
	};
	setActiveEmbeddedRun(params.sessionId, handle, params.sessionKey);
	const timeout = setTimeout(() => {
		timedOut = true;
		projector?.markTimedOut();
		runAbortController.abort("timeout");
	}, Math.max(100, params.timeoutMs));
	const abortListener = () => {
		interruptCodexTurnBestEffort(client, {
			threadId: thread.threadId,
			turnId: activeTurnId
		});
		resolveCompletion?.();
	};
	runAbortController.signal.addEventListener("abort", abortListener, { once: true });
	if (runAbortController.signal.aborted) abortListener();
	try {
		await completion;
		const result = activeProjector.buildResult(toolBridge.telemetry, { yieldDetected });
		const finalAborted = result.aborted || runAbortController.signal.aborted;
		const finalPromptError = timedOut ? "codex app-server attempt timed out" : result.promptError;
		const finalPromptErrorSource = timedOut ? "prompt" : result.promptErrorSource;
		recordCodexTrajectoryCompletion(trajectoryRecorder, {
			attempt: params,
			result,
			threadId: thread.threadId,
			turnId: activeTurnId,
			timedOut,
			yieldDetected
		});
		trajectoryRecorder?.recordEvent("session.ended", {
			status: finalPromptError ? "error" : finalAborted || timedOut ? "interrupted" : "success",
			threadId: thread.threadId,
			turnId: activeTurnId,
			timedOut,
			yieldDetected,
			promptError: normalizeCodexTrajectoryError(finalPromptError)
		});
		trajectoryEndRecorded = true;
		await mirrorTranscriptBestEffort({
			params,
			agentId: sessionAgentId,
			result,
			sessionKey: sandboxSessionKey,
			threadId: thread.threadId,
			turnId: activeTurnId
		});
		runAgentHarnessLlmOutputHook({
			event: {
				runId: params.runId,
				sessionId: params.sessionId,
				provider: params.provider,
				model: params.modelId,
				assistantTexts: result.assistantTexts,
				...result.lastAssistant ? { lastAssistant: result.lastAssistant } : {},
				...result.attemptUsage ? { usage: result.attemptUsage } : {}
			},
			ctx: hookContext
		});
		runAgentHarnessAgentEndHook({
			event: {
				messages: result.messagesSnapshot,
				success: !finalAborted && !finalPromptError,
				...finalPromptError ? { error: formatErrorMessage(finalPromptError) } : {},
				durationMs: Date.now() - attemptStartedAt
			},
			ctx: hookContext
		});
		return {
			...result,
			timedOut,
			aborted: finalAborted,
			promptError: finalPromptError,
			promptErrorSource: finalPromptErrorSource
		};
	} finally {
		if (trajectoryRecorder && !trajectoryEndRecorded) trajectoryRecorder.recordEvent("session.ended", {
			status: timedOut || runAbortController.signal.aborted ? "interrupted" : "cleanup",
			threadId: thread.threadId,
			turnId: activeTurnId,
			timedOut,
			aborted: runAbortController.signal.aborted
		});
		await trajectoryRecorder?.flush();
		clearTimeout(timeout);
		notificationCleanup();
		requestCleanup();
		runAbortController.signal.removeEventListener("abort", abortListener);
		params.abortSignal?.removeEventListener("abort", abortFromUpstream);
		clearActiveEmbeddedRun(params.sessionId, handle, params.sessionKey);
	}
}
function interruptCodexTurnBestEffort(client, params) {
	Promise.resolve().then(() => client.request("turn/interrupt", params)).catch((error) => {
		embeddedAgentLog.debug("codex app-server turn interrupt failed during abort", { error });
	});
}
async function buildDynamicTools(input) {
	const { params } = input;
	if (params.disableTools || !supportsModelTools(params.model)) return [];
	const modelHasVision = params.model.input?.includes("image") ?? false;
	const agentDir = params.agentDir ?? resolveOpenClawAgentDir();
	const { createOpenClawCodingTools } = await import("openclaw/plugin-sdk/agent-harness");
	const visionFilteredTools = filterToolsForVisionInputs(createOpenClawCodingTools({
		agentId: input.sessionAgentId,
		...buildEmbeddedAttemptToolRunContext(params),
		exec: {
			...params.execOverrides,
			elevated: params.bashElevated
		},
		sandbox: input.sandbox,
		messageProvider: params.messageChannel ?? params.messageProvider,
		agentAccountId: params.agentAccountId,
		messageTo: params.messageTo,
		messageThreadId: params.messageThreadId,
		groupId: params.groupId,
		groupChannel: params.groupChannel,
		groupSpace: params.groupSpace,
		spawnedBy: params.spawnedBy,
		senderId: params.senderId,
		senderName: params.senderName,
		senderUsername: params.senderUsername,
		senderE164: params.senderE164,
		senderIsOwner: params.senderIsOwner,
		allowGatewaySubagentBinding: params.allowGatewaySubagentBinding,
		sessionKey: input.sandboxSessionKey,
		sessionId: params.sessionId,
		runId: params.runId,
		agentDir,
		workspaceDir: input.effectiveWorkspace,
		spawnWorkspaceDir: resolveAttemptSpawnWorkspaceDir({
			sandbox: input.sandbox,
			resolvedWorkspace: input.resolvedWorkspace
		}),
		config: params.config,
		abortSignal: input.runAbortController.signal,
		modelProvider: params.model.provider,
		modelId: params.modelId,
		modelCompat: params.model.compat,
		modelApi: params.model.api,
		modelContextWindowTokens: params.model.contextWindow,
		modelAuthMode: resolveModelAuthMode(params.model.provider, params.config),
		currentChannelId: params.currentChannelId,
		currentThreadTs: params.currentThreadTs,
		currentMessageId: params.currentMessageId,
		replyToMode: params.replyToMode,
		hasRepliedRef: params.hasRepliedRef,
		modelHasVision,
		requireExplicitMessageTarget: params.requireExplicitMessageTarget ?? isSubagentSessionKey(params.sessionKey),
		disableMessageTool: params.disableMessageTool,
		onYield: (message) => {
			input.onYieldDetected();
			params.onAgentEvent?.({
				stream: "codex_app_server.tool",
				data: {
					name: "sessions_yield",
					message
				}
			});
			input.runAbortController.abort("sessions_yield");
		}
	}), {
		modelHasVision,
		hasInboundImages: (params.images?.length ?? 0) > 0
	});
	return normalizeProviderToolSchemas({
		tools: params.toolsAllow && params.toolsAllow.length > 0 ? visionFilteredTools.filter((tool) => params.toolsAllow?.includes(tool.name)) : visionFilteredTools,
		provider: params.provider,
		config: params.config,
		workspaceDir: input.effectiveWorkspace,
		env: process.env,
		modelId: params.modelId,
		modelApi: params.model.api,
		model: params.model
	});
}
function filterToolsForVisionInputs(tools, params) {
	if (!params.modelHasVision || !params.hasInboundImages) return tools;
	return tools.filter((tool) => tool.name !== "image");
}
async function withCodexStartupTimeout(params) {
	if (params.signal.aborted) throw new Error("codex app-server startup aborted");
	let timeout;
	let abortCleanup;
	try {
		return await Promise.race([params.operation(), new Promise((_, reject) => {
			const rejectOnce = (error) => {
				if (timeout) {
					clearTimeout(timeout);
					timeout = void 0;
				}
				reject(error);
			};
			const timeoutMs = Math.max(params.timeoutFloorMs ?? 100, params.timeoutMs);
			timeout = setTimeout(() => {
				rejectOnce(/* @__PURE__ */ new Error("codex app-server startup timed out"));
			}, timeoutMs);
			const abortListener = () => rejectOnce(/* @__PURE__ */ new Error("codex app-server startup aborted"));
			params.signal.addEventListener("abort", abortListener, { once: true });
			abortCleanup = () => params.signal.removeEventListener("abort", abortListener);
		})]);
	} finally {
		if (timeout) clearTimeout(timeout);
		abortCleanup?.();
	}
}
function readDynamicToolCallParams(value) {
	if (!isJsonObject(value)) return;
	const threadId = readString(value, "threadId");
	const turnId = readString(value, "turnId");
	const callId = readString(value, "callId");
	const tool = readString(value, "tool");
	if (!threadId || !turnId || !callId || !tool) return;
	return {
		threadId,
		turnId,
		callId,
		tool,
		arguments: value.arguments
	};
}
function isTurnNotification(value, threadId, turnId) {
	if (!isJsonObject(value)) return false;
	return readString(value, "threadId") === threadId && readNotificationTurnId(value) === turnId;
}
function isTerminalTurnStatus(status) {
	return status === "completed" || status === "interrupted" || status === "failed";
}
function readNotificationTurnId(record) {
	return readString(record, "turnId") ?? readNestedTurnId(record);
}
function readNestedTurnId(record) {
	const turn = record.turn;
	return isJsonObject(turn) ? readString(turn, "id") : void 0;
}
function readString(record, key) {
	const value = record[key];
	return typeof value === "string" ? value : void 0;
}
function readMirroredSessionHistoryMessages(sessionFile) {
	try {
		return SessionManager.open(sessionFile).buildSessionContext().messages;
	} catch (error) {
		embeddedAgentLog.warn("failed to read mirrored session history for codex harness hooks", {
			error,
			sessionFile
		});
		return [];
	}
}
async function mirrorTranscriptBestEffort(params) {
	try {
		await mirrorCodexAppServerTranscript({
			sessionFile: params.params.sessionFile,
			agentId: params.agentId,
			sessionKey: params.sessionKey,
			messages: params.result.messagesSnapshot,
			idempotencyScope: `codex-app-server:${params.threadId}:${params.turnId}`
		});
	} catch (error) {
		embeddedAgentLog.warn("failed to mirror codex app-server transcript", { error });
	}
}
function handleApprovalRequest(params) {
	return handleCodexAppServerApprovalRequest({
		method: params.method,
		requestParams: params.params,
		paramsForRun: params.paramsForRun,
		threadId: params.threadId,
		turnId: params.turnId,
		signal: params.signal
	});
}
({ ...createCodexAppServerClientFactoryTestHooks((factory) => {
	clientFactory = factory;
}) });
//#endregion
export { runCodexAppServerAttempt };
