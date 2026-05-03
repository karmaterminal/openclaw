import { t as DEFAULT_ACCOUNT_ID } from "./account-id-C3j_3_su.js";
import { r as createLazyRuntimeModule } from "./lazy-runtime-BZto2g8w.js";
import { p as formatTrimmedAllowFromEntries, s as createScopedChannelConfigAdapter, t as adaptScopedAccountAccessor } from "./channel-config-helpers-BNx8Xp72.js";
import { t as buildOutboundBaseSessionKey } from "./base-session-key-OmkR6kXY.js";
import { n as describeAccountSnapshot } from "./account-helpers-BvmdSMp6.js";
import { c as getChatChannelMeta, i as createChatChannelPlugin, r as createChannelPluginBase } from "./core-CdtRXy9i.js";
import "./channel-core-BhYpo4I7.js";
import "./routing-q9eFfSqP.js";
import { r as createRestrictSendersChannelSecurity } from "./channel-policy-C3JmxiGu.js";
import { c as collectStatusIssuesFromLastError, d as createDefaultChannelRuntimeState, u as createComputedAccountStatusAdapter } from "./status-helpers-Bzp8yHOi.js";
import { t as sanitizeForPlainText } from "./sanitize-text-D9kDXf3y.js";
import "./outbound-runtime-Cwl99jf-.js";
import { t as chunkTextForOutbound } from "./text-chunking-CVRBM2pd.js";
import { n as buildDmGroupAccountAllowlistAdapter } from "./allowlist-config-edit-BIpFVch4.js";
import { n as buildPassiveProbedChannelStatusSummary } from "./extension-shared-yzoqxurt.js";
import { a as listIMessageAccountIds, n as resolveIMessageAttachmentRoots, o as resolveDefaultIMessageAccountId, r as resolveIMessageRemoteAttachmentRoots, s as resolveIMessageAccount } from "./media-contract-HRhLK-e7.js";
import { c as looksLikeIMessageExplicitTargetId, d as parseIMessageTarget, i as resolveIMessageConversationIdFromTarget, l as normalizeIMessageHandle, n as matchIMessageAcpConversation, o as inferIMessageTargetChatType, p as normalizeIMessageMessagingTarget, r as normalizeIMessageAcpConversationId } from "./conversation-id--zASS1Bq.js";
import { n as createIMessageConversationBindingManager } from "./conversation-bindings-C3dwqs9X.js";
import { n as resolveIMessageGroupToolPolicy, t as resolveIMessageGroupRequireMention } from "./group-policy-DTVOe8Li.js";
import { a as imessageSetupAdapter, n as createIMessageSetupWizardProxy } from "./setup-core-TktYE9JX.js";
import { t as IMessageChannelConfigSchema } from "./config-schema-CZ2sjQ7C.js";
//#region extensions/imessage/src/shared.ts
const IMESSAGE_CHANNEL = "imessage";
async function loadIMessageChannelRuntime$1() {
	return await import("./channel.runtime-PTcYYGrx.js");
}
const imessageSetupWizard = createIMessageSetupWizardProxy(async () => (await loadIMessageChannelRuntime$1()).imessageSetupWizard);
const imessageConfigAdapter = createScopedChannelConfigAdapter({
	sectionKey: IMESSAGE_CHANNEL,
	listAccountIds: listIMessageAccountIds,
	resolveAccount: adaptScopedAccountAccessor(resolveIMessageAccount),
	defaultAccountId: resolveDefaultIMessageAccountId,
	clearBaseFields: [
		"cliPath",
		"dbPath",
		"service",
		"region",
		"name"
	],
	resolveAllowFrom: (account) => account.config.allowFrom,
	formatAllowFrom: (allowFrom) => formatTrimmedAllowFromEntries(allowFrom),
	resolveDefaultTo: (account) => account.config.defaultTo
});
const imessageSecurityAdapter = createRestrictSendersChannelSecurity({
	channelKey: IMESSAGE_CHANNEL,
	resolveDmPolicy: (account) => account.config.dmPolicy,
	resolveDmAllowFrom: (account) => account.config.allowFrom,
	resolveGroupPolicy: (account) => account.config.groupPolicy,
	surface: "iMessage groups",
	openScope: "any member",
	groupPolicyPath: "channels.imessage.groupPolicy",
	groupAllowFromPath: "channels.imessage.groupAllowFrom",
	mentionGated: false,
	policyPathSuffix: "dmPolicy"
});
function createIMessagePluginBase(params) {
	return {
		...createChannelPluginBase({
			id: IMESSAGE_CHANNEL,
			meta: {
				...getChatChannelMeta(IMESSAGE_CHANNEL),
				aliases: ["imsg"],
				showConfigured: false
			},
			setupWizard: params.setupWizard,
			capabilities: {
				chatTypes: ["direct", "group"],
				media: true
			},
			reload: { configPrefixes: ["channels.imessage"] },
			configSchema: IMessageChannelConfigSchema,
			config: {
				...imessageConfigAdapter,
				isConfigured: (account) => account.configured,
				describeAccount: (account) => describeAccountSnapshot({
					account,
					configured: account.configured
				})
			},
			security: imessageSecurityAdapter,
			setup: params.setup
		}),
		messaging: {
			resolveInboundAttachmentRoots: (params) => resolveIMessageAttachmentRoots({
				accountId: params.accountId,
				cfg: params.cfg
			}),
			resolveRemoteInboundAttachmentRoots: (params) => resolveIMessageRemoteAttachmentRoots({
				accountId: params.accountId,
				cfg: params.cfg
			})
		}
	};
}
//#endregion
//#region extensions/imessage/src/status-core.ts
async function probeIMessageStatusAccount(params) {
	return await params.probeIMessageAccount({
		timeoutMs: params.timeoutMs,
		cliPath: params.account.config.cliPath,
		dbPath: params.account.config.dbPath
	});
}
//#endregion
//#region extensions/imessage/src/channel.ts
const loadIMessageChannelRuntime = createLazyRuntimeModule(() => import("./channel.runtime-PTcYYGrx.js"));
function buildIMessageBaseSessionKey(params) {
	return buildOutboundBaseSessionKey({
		...params,
		channel: "imessage"
	});
}
function resolveIMessageOutboundSessionRoute(params) {
	const parsed = parseIMessageTarget(params.target);
	if (parsed.kind === "handle") {
		const handle = normalizeIMessageHandle(parsed.to);
		if (!handle) return null;
		const peer = {
			kind: "direct",
			id: handle
		};
		const baseSessionKey = buildIMessageBaseSessionKey({
			cfg: params.cfg,
			agentId: params.agentId,
			accountId: params.accountId,
			peer
		});
		return {
			sessionKey: baseSessionKey,
			baseSessionKey,
			peer,
			chatType: "direct",
			from: `imessage:${handle}`,
			to: `imessage:${handle}`
		};
	}
	const peerId = parsed.kind === "chat_id" ? String(parsed.chatId) : parsed.kind === "chat_guid" ? parsed.chatGuid : parsed.chatIdentifier;
	if (!peerId) return null;
	const peer = {
		kind: "group",
		id: peerId
	};
	const baseSessionKey = buildIMessageBaseSessionKey({
		cfg: params.cfg,
		agentId: params.agentId,
		accountId: params.accountId,
		peer
	});
	const toPrefix = parsed.kind === "chat_id" ? "chat_id" : parsed.kind === "chat_guid" ? "chat_guid" : "chat_identifier";
	return {
		sessionKey: baseSessionKey,
		baseSessionKey,
		peer,
		chatType: "group",
		from: `imessage:group:${peerId}`,
		to: `${toPrefix}:${peerId}`
	};
}
const imessagePlugin = createChatChannelPlugin({
	base: {
		...createIMessagePluginBase({
			setupWizard: imessageSetupWizard,
			setup: imessageSetupAdapter
		}),
		allowlist: buildDmGroupAccountAllowlistAdapter({
			channelId: "imessage",
			resolveAccount: resolveIMessageAccount,
			normalize: ({ values }) => formatTrimmedAllowFromEntries(values),
			resolveDmAllowFrom: (account) => account.config.allowFrom,
			resolveGroupAllowFrom: (account) => account.config.groupAllowFrom,
			resolveDmPolicy: (account) => account.config.dmPolicy,
			resolveGroupPolicy: (account) => account.config.groupPolicy
		}),
		groups: {
			resolveRequireMention: resolveIMessageGroupRequireMention,
			resolveToolPolicy: resolveIMessageGroupToolPolicy
		},
		doctor: { groupAllowFromFallbackToAllowFrom: false },
		conversationBindings: {
			supportsCurrentConversationBinding: true,
			createManager: ({ cfg, accountId }) => createIMessageConversationBindingManager({
				cfg,
				accountId: accountId ?? void 0
			})
		},
		bindings: {
			compileConfiguredBinding: ({ conversationId }) => normalizeIMessageAcpConversationId(conversationId),
			matchInboundConversation: ({ compiledBinding, conversationId }) => matchIMessageAcpConversation({
				bindingConversationId: compiledBinding.conversationId,
				conversationId
			}),
			resolveCommandConversation: ({ originatingTo, commandTo, fallbackTo }) => {
				const conversationId = resolveIMessageConversationIdFromTarget(originatingTo ?? "") ?? resolveIMessageConversationIdFromTarget(commandTo ?? "") ?? resolveIMessageConversationIdFromTarget(fallbackTo ?? "");
				return conversationId ? { conversationId } : null;
			}
		},
		messaging: {
			normalizeTarget: normalizeIMessageMessagingTarget,
			inferTargetChatType: ({ to }) => inferIMessageTargetChatType(to),
			resolveOutboundSessionRoute: (params) => resolveIMessageOutboundSessionRoute(params),
			targetResolver: {
				looksLikeId: looksLikeIMessageExplicitTargetId,
				hint: "<handle|chat_id:ID>",
				resolveTarget: async ({ normalized }) => {
					const to = normalized?.trim();
					if (!to) return null;
					const chatType = inferIMessageTargetChatType(to);
					if (!chatType) return null;
					return {
						to,
						kind: chatType === "direct" ? "user" : "group",
						source: "normalized"
					};
				}
			}
		},
		status: createComputedAccountStatusAdapter({
			defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID, {
				cliPath: null,
				dbPath: null
			}),
			collectStatusIssues: (accounts) => collectStatusIssuesFromLastError("imessage", accounts),
			buildChannelSummary: ({ snapshot }) => buildPassiveProbedChannelStatusSummary(snapshot, {
				cliPath: snapshot.cliPath ?? null,
				dbPath: snapshot.dbPath ?? null
			}),
			probeAccount: async ({ account, timeoutMs }) => await probeIMessageStatusAccount({
				account,
				timeoutMs,
				probeIMessageAccount: async (params) => await (await loadIMessageChannelRuntime()).probeIMessageAccount(params)
			}),
			resolveAccountSnapshot: ({ account, runtime }) => ({
				accountId: account.accountId,
				name: account.name,
				enabled: account.enabled,
				configured: account.configured,
				extra: {
					cliPath: runtime?.cliPath ?? account.config.cliPath ?? null,
					dbPath: runtime?.dbPath ?? account.config.dbPath ?? null
				}
			}),
			resolveAccountState: ({ enabled }) => enabled ? "enabled" : "disabled"
		}),
		gateway: { startAccount: async (ctx) => {
			const conversationBindings = createIMessageConversationBindingManager({
				cfg: ctx.cfg,
				accountId: ctx.accountId
			});
			try {
				return await (await loadIMessageChannelRuntime()).startIMessageGatewayAccount(ctx);
			} finally {
				conversationBindings.stop();
			}
		} }
	},
	pairing: { text: {
		idLabel: "imessageSenderId",
		message: "OpenClaw: your access has been approved.",
		notify: async ({ id, cfg }) => await (await loadIMessageChannelRuntime()).notifyIMessageApproval({
			id,
			cfg
		})
	} },
	security: imessageSecurityAdapter,
	outbound: {
		base: {
			deliveryMode: "direct",
			chunker: chunkTextForOutbound,
			chunkerMode: "text",
			textChunkLimit: 4e3,
			sanitizeText: ({ text }) => sanitizeForPlainText(text)
		},
		attachedResults: {
			channel: "imessage",
			sendText: async ({ cfg, to, text, accountId, deps, replyToId }) => await (await loadIMessageChannelRuntime()).sendIMessageOutbound({
				cfg,
				to,
				text,
				accountId: accountId ?? void 0,
				deps,
				replyToId: replyToId ?? void 0
			}),
			sendMedia: async ({ cfg, to, text, mediaUrl, mediaLocalRoots, accountId, deps, replyToId }) => await (await loadIMessageChannelRuntime()).sendIMessageOutbound({
				cfg,
				to,
				text,
				mediaUrl,
				mediaLocalRoots,
				accountId: accountId ?? void 0,
				deps,
				replyToId: replyToId ?? void 0
			})
		}
	}
});
//#endregion
export { createIMessagePluginBase as n, imessageSetupWizard as r, imessagePlugin as t };
