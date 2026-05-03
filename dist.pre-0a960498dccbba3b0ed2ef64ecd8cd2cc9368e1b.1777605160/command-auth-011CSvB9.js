import "./command-registration-lrx31fSB.js";
import "./command-detection-BYHSYyUa.js";
import "./commands-registry-D4AACI9g.js";
import { o as resolveDmGroupAccessWithLists } from "./dm-policy-shared-v2D_A37H.js";
import "./command-auth-CU607fA9.js";
import "./stored-model-override-h5NjHvv3.js";
import { n as buildCommandsMessagePaginated$1, r as buildHelpMessage$1, t as buildCommandsMessage$1 } from "./command-status-builders-D0VGs2BJ.js";
import "./direct-dm-Bq1Z1YWX.js";
import "./skill-commands-D3iT2iWf.js";
import "./commands-models-v82TyHzB.js";
//#region src/plugin-sdk/command-auth.ts
/** Fast-path DM command authorization when only policy and sender allowlist state matter. */
function resolveDirectDmAuthorizationOutcome(params) {
	if (params.isGroup) return "allowed";
	if (params.dmPolicy === "disabled") return "disabled";
	if (params.dmPolicy !== "open" && !params.senderAllowedForCommands) return "unauthorized";
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
	const storeAllowFrom = !params.isGroup && params.dmPolicy !== "allowlist" && (params.dmPolicy !== "open" || shouldComputeAuth) ? await params.readAllowFromStore().catch(() => []) : [];
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
export { resolveSenderCommandAuthorization as a, resolveDirectDmAuthorizationOutcome as i, buildCommandsMessagePaginated as n, resolveSenderCommandAuthorizationWithRuntime as o, buildHelpMessage as r, buildCommandsMessage as t };
