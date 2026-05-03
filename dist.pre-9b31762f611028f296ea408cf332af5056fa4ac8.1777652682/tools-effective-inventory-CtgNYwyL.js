import { a as normalizeLowercaseStringOrEmpty, c as normalizeOptionalString } from "./string-coerce-C1IzJjqi.js";
import { b as resolveAgentWorkspaceDir, p as resolveSessionAgentId, y as resolveAgentDir } from "./agent-scope-zHoqFGPE.js";
import { n as extractModelCompat } from "./provider-model-compat-DK8OdTEu.js";
import { n as getPluginToolMeta } from "./tools-Cf6EfoW-.js";
import { n as getChannelAgentToolMeta } from "./channel-tools-C-5d8QZ3.js";
import { r as resolveToolDisplay } from "./tool-display-Cv3xV9o7.js";
import { t as createOpenClawCodingTools } from "./pi-tools-BzUEo1xO.js";
import { r as resolveEffectiveToolPolicy } from "./read-capability-B7n1jIO2.js";
import { t as resolveModel } from "./model-AV_tazi3.js";
import { n as summarizeToolDescriptionText } from "./tool-description-summary-DbUfIR9f.js";
//#region src/agents/tools-effective-inventory.ts
function resolveEffectiveToolLabel(tool) {
	const rawLabel = normalizeOptionalString(tool.label) ?? "";
	if (rawLabel && normalizeLowercaseStringOrEmpty(rawLabel) !== normalizeLowercaseStringOrEmpty(tool.name)) return rawLabel;
	return resolveToolDisplay({ name: tool.name }).title;
}
function resolveRawToolDescription(tool) {
	return normalizeOptionalString(tool.description) ?? "";
}
function summarizeToolDescription(tool) {
	return summarizeToolDescriptionText({
		rawDescription: resolveRawToolDescription(tool),
		displaySummary: tool.displaySummary
	});
}
function resolveEffectiveToolSource(tool) {
	const pluginMeta = getPluginToolMeta(tool);
	if (pluginMeta) return {
		source: "plugin",
		pluginId: pluginMeta.pluginId
	};
	const channelMeta = getChannelAgentToolMeta(tool);
	if (channelMeta) return {
		source: "channel",
		channelId: channelMeta.channelId
	};
	return { source: "core" };
}
function groupLabel(source) {
	switch (source) {
		case "plugin": return "Connected tools";
		case "channel": return "Channel tools";
		default: return "Built-in tools";
	}
}
function disambiguateLabels(entries) {
	const counts = /* @__PURE__ */ new Map();
	for (const entry of entries) counts.set(entry.label, (counts.get(entry.label) ?? 0) + 1);
	return entries.map((entry) => {
		if ((counts.get(entry.label) ?? 0) < 2) return entry;
		const suffix = entry.pluginId ?? entry.channelId ?? entry.id;
		return {
			...entry,
			label: `${entry.label} (${suffix})`
		};
	});
}
function resolveEffectiveModelCompat(params) {
	const provider = params.modelProvider?.trim();
	const modelId = params.modelId?.trim();
	if (!provider || !modelId) return;
	try {
		return extractModelCompat(resolveModel(provider, modelId, params.agentDir, params.cfg).model);
	} catch {
		return;
	}
}
function resolveEffectiveToolInventory(params) {
	const agentId = params.agentId?.trim() || resolveSessionAgentId({
		sessionKey: params.sessionKey,
		config: params.cfg
	});
	const workspaceDir = params.workspaceDir ?? resolveAgentWorkspaceDir(params.cfg, agentId);
	const agentDir = params.agentDir ?? resolveAgentDir(params.cfg, agentId);
	const modelCompat = resolveEffectiveModelCompat({
		cfg: params.cfg,
		agentDir,
		modelProvider: params.modelProvider,
		modelId: params.modelId
	});
	const effectiveTools = createOpenClawCodingTools({
		agentId,
		sessionKey: params.sessionKey,
		workspaceDir,
		agentDir,
		config: params.cfg,
		modelProvider: params.modelProvider,
		modelId: params.modelId,
		modelCompat,
		messageProvider: params.messageProvider,
		senderIsOwner: params.senderIsOwner,
		senderId: params.senderId,
		senderName: params.senderName ?? void 0,
		senderUsername: params.senderUsername ?? void 0,
		senderE164: params.senderE164 ?? void 0,
		agentAccountId: params.accountId ?? void 0,
		currentChannelId: params.currentChannelId,
		currentThreadTs: params.currentThreadTs,
		currentMessageId: params.currentMessageId,
		groupId: params.groupId ?? void 0,
		groupChannel: params.groupChannel ?? void 0,
		groupSpace: params.groupSpace ?? void 0,
		replyToMode: params.replyToMode,
		allowGatewaySubagentBinding: true,
		modelHasVision: params.modelHasVision,
		requireExplicitMessageTarget: params.requireExplicitMessageTarget,
		disableMessageTool: params.disableMessageTool
	});
	const effectivePolicy = resolveEffectiveToolPolicy({
		config: params.cfg,
		agentId,
		sessionKey: params.sessionKey,
		modelProvider: params.modelProvider,
		modelId: params.modelId
	});
	const profile = effectivePolicy.providerProfile ?? effectivePolicy.profile ?? "full";
	const entries = disambiguateLabels(effectiveTools.map((tool) => {
		const source = resolveEffectiveToolSource(tool);
		return Object.assign({
			id: tool.name,
			label: resolveEffectiveToolLabel(tool),
			description: summarizeToolDescription(tool),
			rawDescription: resolveRawToolDescription(tool) || summarizeToolDescription(tool)
		}, source);
	}).toSorted((a, b) => a.label.localeCompare(b.label)));
	const groupsBySource = /* @__PURE__ */ new Map();
	for (const entry of entries) {
		const tools = groupsBySource.get(entry.source) ?? [];
		tools.push(entry);
		groupsBySource.set(entry.source, tools);
	}
	return {
		agentId,
		profile,
		groups: [
			"core",
			"plugin",
			"channel"
		].map((source) => {
			const tools = groupsBySource.get(source);
			if (!tools || tools.length === 0) return null;
			return {
				id: source,
				label: groupLabel(source),
				source,
				tools
			};
		}).filter((group) => group !== null)
	};
}
//#endregion
export { resolveEffectiveToolInventory as t };
