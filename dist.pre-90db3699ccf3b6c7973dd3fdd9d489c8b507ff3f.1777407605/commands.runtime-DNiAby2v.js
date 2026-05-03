import { r as logVerbose } from "./globals-Bo8QPRgM.js";
import { _ as isAcpSessionKey } from "./session-key-Cn2QoOyX.js";
import { r as isInternalMessageChannel } from "./message-channel-Bk_YHfQg.js";
import { s as updateSessionStoreEntry } from "./store-COeaE7A7.js";
import { t as clearBootstrapSnapshot } from "./bootstrap-cache-DX5g1YuC.js";
import { f as shouldHandleTextCommands } from "./commands-registry-x2AHOYwB.js";
import { t as clearAllCliSessions } from "./cli-session-GscASrM6.js";
import { t as resolveCommandAuthorization } from "./command-auth-xXFzDzU0.js";
import "./commands-context-BPRhCwwA.js";
import { t as parseSoftResetCommand } from "./commands-reset-mode-C4I87yFx.js";
import { r as resetConfiguredBindingTargetInPlace } from "./binding-targets-a7u8m_ZE.js";
import { n as resolveBoundAcpThreadSessionKey } from "./targets-EtOBn4UL.js";
import { t as emitResetCommandHooks } from "./commands-reset-hooks-2UIepE2u.js";
import { t as buildStatusReply } from "./commands-status-BVGGNFdO.js";
//#region src/auto-reply/reply/commands-reset.ts
function applyAcpResetTailContext(ctx, resetTail) {
	const mutableCtx = ctx;
	mutableCtx.Body = resetTail;
	mutableCtx.RawBody = resetTail;
	mutableCtx.CommandBody = resetTail;
	mutableCtx.BodyForCommands = resetTail;
	mutableCtx.BodyForAgent = resetTail;
	mutableCtx.BodyStripped = resetTail;
	mutableCtx.AcpDispatchTailAfterReset = true;
}
function isResetAuthorized(params) {
	const auth = resolveCommandAuthorization({
		ctx: params.ctx,
		cfg: params.cfg,
		commandAuthorized: params.ctx.CommandAuthorized === true
	});
	if (!params.command.isAuthorizedSender && !auth.isAuthorizedSender) return false;
	const provider = params.ctx.Provider;
	if (!(provider ? isInternalMessageChannel(provider) : isInternalMessageChannel(params.ctx.Surface))) return true;
	const scopes = params.ctx.GatewayClientScopes;
	if (!Array.isArray(scopes) || scopes.length === 0) return true;
	return scopes.includes("operator.admin");
}
async function maybeHandleResetCommand(params) {
	const softReset = parseSoftResetCommand(params.command.commandBodyNormalized);
	if (softReset.matched) {
		if (!isResetAuthorized(params)) {
			logVerbose(`Ignoring /reset soft from unauthorized sender: ${params.command.senderId || "<unknown>"}`);
			return { shouldContinue: false };
		}
		const boundAcpSessionKey = resolveBoundAcpThreadSessionKey(params);
		if (boundAcpSessionKey && isAcpSessionKey(boundAcpSessionKey) ? boundAcpSessionKey.trim() : void 0) return {
			shouldContinue: false,
			reply: { text: "Usage: /reset soft is not available for ACP-bound sessions yet." }
		};
		const targetSessionEntry = params.sessionStore?.[params.sessionKey] ?? params.sessionEntry;
		const previousSessionEntry = params.previousSessionEntry ?? (targetSessionEntry ? { ...targetSessionEntry } : void 0);
		if (targetSessionEntry) {
			clearAllCliSessions(targetSessionEntry);
			if (params.sessionEntry && params.sessionEntry !== targetSessionEntry) {
				clearAllCliSessions(params.sessionEntry);
				params.sessionEntry.updatedAt = Date.now();
			}
			if (params.sessionKey) clearBootstrapSnapshot(params.sessionKey);
			targetSessionEntry.updatedAt = Date.now();
			if (params.sessionStore && params.sessionKey) params.sessionStore[params.sessionKey] = targetSessionEntry;
			if (params.storePath && params.sessionKey) await updateSessionStoreEntry({
				storePath: params.storePath,
				sessionKey: params.sessionKey,
				update: async (entry) => {
					const next = { ...entry };
					clearAllCliSessions(next);
					return {
						cliSessionBindings: next.cliSessionBindings,
						cliSessionIds: next.cliSessionIds,
						claudeCliSessionId: next.claudeCliSessionId,
						updatedAt: Date.now()
					};
				}
			});
		}
		await emitResetCommandHooks({
			action: "reset",
			ctx: params.ctx,
			cfg: params.cfg,
			command: params.command,
			sessionKey: params.sessionKey,
			sessionEntry: targetSessionEntry,
			previousSessionEntry,
			workspaceDir: params.workspaceDir
		});
		params.command.softResetTriggered = true;
		params.command.softResetTail = softReset.tail;
		return null;
	}
	const resetMatch = params.command.commandBodyNormalized.match(/^\/(new|reset)(?:\s|$)/);
	if (!resetMatch) return null;
	if (!isResetAuthorized(params)) {
		logVerbose(`Ignoring /reset from unauthorized sender: ${params.command.senderId || "<unknown>"}`);
		return { shouldContinue: false };
	}
	const commandAction = resetMatch[1] === "reset" ? "reset" : "new";
	const resetTail = params.command.commandBodyNormalized.slice(resetMatch[0].length).trimStart();
	const boundAcpSessionKey = resolveBoundAcpThreadSessionKey(params);
	const boundAcpKey = boundAcpSessionKey && isAcpSessionKey(boundAcpSessionKey) ? boundAcpSessionKey.trim() : void 0;
	if (boundAcpKey) {
		const resetResult = await resetConfiguredBindingTargetInPlace({
			cfg: params.cfg,
			sessionKey: boundAcpKey,
			reason: commandAction,
			commandSource: `${params.command.surface}:${params.ctx.CommandSource ?? "text"}`
		});
		if (!resetResult.ok) logVerbose(`acp reset failed for ${boundAcpKey}: ${resetResult.error ?? "unknown error"}`);
		if (resetResult.ok) {
			params.command.resetHookTriggered = true;
			if (resetTail) {
				applyAcpResetTailContext(params.ctx, resetTail);
				if (params.rootCtx && params.rootCtx !== params.ctx) applyAcpResetTailContext(params.rootCtx, resetTail);
				return { shouldContinue: false };
			}
			return {
				shouldContinue: false,
				reply: { text: "✅ ACP session reset in place." }
			};
		}
		return {
			shouldContinue: false,
			reply: { text: "⚠️ ACP session reset failed. Check /acp status and try again." }
		};
	}
	const targetSessionEntry = params.sessionStore?.[params.sessionKey] ?? params.sessionEntry;
	await emitResetCommandHooks({
		action: commandAction,
		ctx: params.ctx,
		cfg: params.cfg,
		command: params.command,
		sessionKey: params.sessionKey,
		sessionEntry: targetSessionEntry,
		previousSessionEntry: params.previousSessionEntry,
		workspaceDir: params.workspaceDir
	});
	return null;
}
//#endregion
//#region src/auto-reply/reply/commands-core.ts
let commandHandlersRuntimePromise = null;
function loadCommandHandlersRuntime() {
	commandHandlersRuntimePromise ??= import("./commands-handlers.runtime-CoXFJ_LM.js");
	return commandHandlersRuntimePromise;
}
let HANDLERS = null;
function normalizeCommandHandlerResult(result) {
	if (!result.reply) return result;
	return {
		...result,
		reply: {
			...result.reply,
			replyToId: void 0,
			replyToCurrent: false
		}
	};
}
async function handleCommands(params) {
	if (HANDLERS === null) HANDLERS = (await loadCommandHandlersRuntime()).loadCommandHandlers();
	const resetResult = await maybeHandleResetCommand(params);
	if (resetResult) return normalizeCommandHandlerResult(resetResult);
	const allowTextCommands = shouldHandleTextCommands({
		cfg: params.cfg,
		surface: params.command.surface,
		commandSource: params.ctx.CommandSource
	});
	for (const handler of HANDLERS) {
		const result = await handler(params, allowTextCommands);
		if (result) return normalizeCommandHandlerResult(result);
	}
	return { shouldContinue: true };
}
//#endregion
export { buildStatusReply, handleCommands };
