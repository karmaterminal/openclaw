import { a as logWarn } from "./logger-HXvGEyjy.js";
import { b as resolveAgentWorkspaceDir, x as resolveDefaultAgentId } from "./agent-scope-Cmx30dd2.js";
import { t as createOpenClawTools } from "./openclaw-tools-DclzkKxa.js";
import { c as mergeAlsoAllowPolicy, i as collectExplicitAllowlist, m as resolveToolProfilePolicy } from "./tool-policy-DZ8Bwz3v.js";
import { n as getPluginToolMeta } from "./tools-CqiGxZl1.js";
import { a as resolveGroupToolPolicy, o as resolveSubagentToolPolicyForSession, r as resolveEffectiveToolPolicy } from "./read-capability-CQkQhNiw.js";
import { i as resolveSubagentCapabilityStore, t as isSubagentEnvelopeSession } from "./subagent-capabilities-CKWTn2WJ.js";
import { n as buildDefaultToolPolicyPipelineSteps, t as applyToolPolicyPipeline } from "./tool-policy-pipeline-DT3XE-ZB.js";
import { t as DEFAULT_GATEWAY_HTTP_TOOL_DENY } from "./dangerous-tools-CJOLK-sJ.js";
//#region src/gateway/tool-resolution.ts
function resolveGatewayScopedTools(params) {
	const { agentId, globalPolicy, globalProviderPolicy, agentPolicy, agentProviderPolicy, profile, providerProfile, profileAlsoAllow, providerProfileAlsoAllow } = resolveEffectiveToolPolicy({
		config: params.cfg,
		sessionKey: params.sessionKey
	});
	const profilePolicy = resolveToolProfilePolicy(profile);
	const providerProfilePolicy = resolveToolProfilePolicy(providerProfile);
	const profilePolicyWithAlsoAllow = mergeAlsoAllowPolicy(profilePolicy, profileAlsoAllow);
	const providerProfilePolicyWithAlsoAllow = mergeAlsoAllowPolicy(providerProfilePolicy, providerProfileAlsoAllow);
	const groupPolicy = resolveGroupToolPolicy({
		config: params.cfg,
		sessionKey: params.sessionKey,
		messageProvider: params.messageProvider,
		accountId: params.accountId ?? null
	});
	const subagentStore = resolveSubagentCapabilityStore(params.sessionKey, { cfg: params.cfg });
	const subagentPolicy = isSubagentEnvelopeSession(params.sessionKey, {
		cfg: params.cfg,
		store: subagentStore
	}) ? resolveSubagentToolPolicyForSession(params.cfg, params.sessionKey, { store: subagentStore }) : void 0;
	const workspaceDir = resolveAgentWorkspaceDir(params.cfg, agentId ?? resolveDefaultAgentId(params.cfg));
	const policyFiltered = applyToolPolicyPipeline({
		tools: createOpenClawTools({
			agentSessionKey: params.sessionKey,
			agentChannel: params.messageProvider ?? void 0,
			agentAccountId: params.accountId,
			agentTo: params.agentTo,
			agentThreadId: params.agentThreadId,
			allowGatewaySubagentBinding: params.allowGatewaySubagentBinding,
			allowMediaInvokeCommands: params.allowMediaInvokeCommands,
			disablePluginTools: params.disablePluginTools,
			senderIsOwner: params.senderIsOwner,
			config: params.cfg,
			workspaceDir,
			pluginToolAllowlist: collectExplicitAllowlist([
				profilePolicy,
				providerProfilePolicy,
				globalPolicy,
				globalProviderPolicy,
				agentPolicy,
				agentProviderPolicy,
				groupPolicy,
				subagentPolicy
			])
		}),
		toolMeta: (tool) => getPluginToolMeta(tool),
		warn: logWarn,
		steps: [...buildDefaultToolPolicyPipelineSteps({
			profilePolicy: profilePolicyWithAlsoAllow,
			profile,
			profileUnavailableCoreWarningAllowlist: profilePolicy?.allow,
			providerProfilePolicy: providerProfilePolicyWithAlsoAllow,
			providerProfile,
			providerProfileUnavailableCoreWarningAllowlist: providerProfilePolicy?.allow,
			globalPolicy,
			globalProviderPolicy,
			agentPolicy,
			agentProviderPolicy,
			groupPolicy,
			agentId
		}), {
			policy: subagentPolicy,
			label: "subagent tools.allow"
		}]
	});
	const surface = params.surface ?? "http";
	const gatewayToolsCfg = params.cfg.gateway?.tools;
	const defaultGatewayDeny = surface === "http" ? DEFAULT_GATEWAY_HTTP_TOOL_DENY.filter((name) => !gatewayToolsCfg?.allow?.includes(name)) : [];
	const gatewayDenySet = new Set([
		...defaultGatewayDeny,
		...Array.isArray(gatewayToolsCfg?.deny) ? gatewayToolsCfg.deny : [],
		...params.excludeToolNames ? Array.from(params.excludeToolNames) : []
	]);
	return {
		agentId,
		tools: policyFiltered.filter((tool) => !gatewayDenySet.has(tool.name))
	};
}
//#endregion
export { resolveGatewayScopedTools as t };
