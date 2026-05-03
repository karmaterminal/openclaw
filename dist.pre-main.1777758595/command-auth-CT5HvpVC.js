import "./commands-BB4nEWXP.js";
import "./command-detection-BTBHOigx.js";
import "./commands-registry-eOWtYpGJ.js";
import { o as resolveDmGroupAccessWithLists } from "./dm-policy-shared-D7Cgibny.js";
import "./command-auth-0T_-M8go.js";
import "./stored-model-override-D9Dd1b7_.js";
import { n as buildCommandsMessagePaginated$1, r as buildHelpMessage$1, t as buildCommandsMessage$1 } from "./command-status-builders-GCEmSHaE.js";
import "./direct-dm-D4xTcqGQ.js";
import "./skill-commands-CUk5nHQT.js";
import "./commands-models-Bg9p1ArG.js";
//#region src/plugin-sdk/telegram-command-ui.ts
function buildCommandsPaginationKeyboard(currentPage, totalPages, agentId) {
	const buttons = [];
	const suffix = agentId ? `:${agentId}` : "";
	if (currentPage > 1) buttons.push({
		text: "◀ Prev",
		callback_data: `commands_page_${currentPage - 1}${suffix}`
	});
	buttons.push({
		text: `${currentPage}/${totalPages}`,
		callback_data: `commands_page_noop${suffix}`
	});
	if (currentPage < totalPages) buttons.push({
		text: "Next ▶",
		callback_data: `commands_page_${currentPage + 1}${suffix}`
	});
	return [buttons];
}
//#endregion
//#region src/plugin-sdk/command-auth.ts
/** Fast-path DM command authorization when only policy and sender allowlist state matter. */
function resolveDirectDmAuthorizationOutcome(params) {
	if (params.isGroup) return "allowed";
	if (params.dmPolicy === "disabled") return "disabled";
	if (!params.senderAllowedForCommands) return "unauthorized";
	return "allowed";
}
/** Runtime-backed wrapper around sender command authorization for grouped helper surfaces. */
async function resolveSenderCommandAuthorizationWithRuntime(params) {
	return resolveSenderCommandAuthorization({
		...params,
		shouldComputeCommandAuthorized: params.runtime.shouldComputeCommandAuthorized,
		resolveCommandAuthorizedFromAuthorizers: params.runtime.resolveCommandAuthorizedFromAuthorizers
	});
}
/** Compute effective allowlists and command authorization for one inbound sender. */
async function resolveSenderCommandAuthorization(params) {
	const shouldComputeAuth = params.shouldComputeCommandAuthorized(params.rawBody, params.cfg);
	const storeAllowFrom = !params.isGroup && params.dmPolicy !== "allowlist" && params.dmPolicy !== "open" ? await params.readAllowFromStore().catch(() => []) : [];
	const access = resolveDmGroupAccessWithLists({
		isGroup: params.isGroup,
		dmPolicy: params.dmPolicy,
		groupPolicy: "allowlist",
		allowFrom: params.configuredAllowFrom,
		groupAllowFrom: params.configuredGroupAllowFrom ?? [],
		storeAllowFrom,
		isSenderAllowed: (allowFrom) => params.isSenderAllowed(params.senderId, allowFrom)
	});
	const effectiveAllowFrom = access.effectiveAllowFrom;
	const effectiveGroupAllowFrom = access.effectiveGroupAllowFrom;
	const useAccessGroups = params.cfg.commands?.useAccessGroups !== false;
	const senderAllowedForCommands = params.isSenderAllowed(params.senderId, params.isGroup ? effectiveGroupAllowFrom : effectiveAllowFrom);
	const ownerAllowedForCommands = params.isSenderAllowed(params.senderId, effectiveAllowFrom);
	const groupAllowedForCommands = params.isSenderAllowed(params.senderId, effectiveGroupAllowFrom);
	return {
		shouldComputeAuth,
		effectiveAllowFrom,
		effectiveGroupAllowFrom,
		senderAllowedForCommands,
		commandAuthorized: shouldComputeAuth ? params.resolveCommandAuthorizedFromAuthorizers({
			useAccessGroups,
			authorizers: [{
				configured: effectiveAllowFrom.length > 0,
				allowed: ownerAllowedForCommands
			}, {
				configured: effectiveGroupAllowFrom.length > 0,
				allowed: groupAllowedForCommands
			}]
		}) : void 0
	};
}
/** @deprecated Use `openclaw/plugin-sdk/command-status` instead. */
function buildCommandsMessage(...args) {
	return buildCommandsMessage$1(...args);
}
/** @deprecated Use `openclaw/plugin-sdk/command-status` instead. */
function buildCommandsMessagePaginated(...args) {
	return buildCommandsMessagePaginated$1(...args);
}
/** @deprecated Use `openclaw/plugin-sdk/command-status` instead. */
function buildHelpMessage(...args) {
	return buildHelpMessage$1(...args);
}
//#endregion
export { resolveSenderCommandAuthorization as a, resolveDirectDmAuthorizationOutcome as i, buildCommandsMessagePaginated as n, resolveSenderCommandAuthorizationWithRuntime as o, buildHelpMessage as r, buildCommandsPaginationKeyboard as s, buildCommandsMessage as t };
