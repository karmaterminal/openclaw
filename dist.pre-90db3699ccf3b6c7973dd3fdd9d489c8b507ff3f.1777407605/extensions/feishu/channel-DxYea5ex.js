import { a as parseFeishuTargetId, i as parseFeishuDirectConversationId, n as buildFeishuModelOverrideParentCandidates, r as parseFeishuConversationId, t as buildFeishuConversationId } from "./conversation-id-DWS3Ep2A.js";
import { n as looksLikeFeishuId, r as normalizeFeishuTarget } from "./targets-JMFJRKSe.js";
import { a as resolveFeishuAccount, i as resolveDefaultFeishuAccountId, n as listEnabledFeishuAccounts, o as resolveFeishuRuntimeAccount, r as listFeishuAccountIds, t as inspectFeishuCredentials, u as isRecord$1 } from "./accounts-BtXgszRg.js";
import { i as resolveFeishuGroupToolPolicy } from "./policy-CrABD4B7.js";
import { n as listFeishuDirectoryPeers, t as listFeishuDirectoryGroups } from "./directory.static-DUNuCqGh.js";
import { t as messageActionTargetAliases } from "./security-audit-BKMITGYC.js";
import { n as collectRuntimeConfigAssignments, r as secretTargetRegistryEntries } from "./secret-contract-rHaRqxlR.js";
import { t as collectFeishuSecurityAuditFindings } from "./security-audit-shared-DI5YVHPQ.js";
import { t as resolveFeishuSessionConversation } from "./session-conversation-B37aT6Do.js";
import { n as runFeishuLogin, r as feishuSetupAdapter, t as feishuSetupWizard } from "./setup-surface-B6HjmkJy.js";
import { normalizeLowercaseStringOrEmpty, normalizeOptionalLowercaseString } from "openclaw/plugin-sdk/text-runtime";
import { getSessionBindingService } from "openclaw/plugin-sdk/conversation-runtime";
import { describeAccountSnapshot } from "openclaw/plugin-sdk/account-helpers";
import { formatAllowFromLowercase } from "openclaw/plugin-sdk/allow-from";
import { adaptScopedAccountAccessor, createHybridChannelConfigAdapter } from "openclaw/plugin-sdk/channel-config-helpers";
import { buildChannelOutboundSessionRoute, createChatChannelPlugin, stripChannelTargetPrefix } from "openclaw/plugin-sdk/channel-core";
import { createPairingPrefixStripper } from "openclaw/plugin-sdk/channel-pairing";
import { createAllowlistProviderGroupPolicyWarningCollector, projectConfigAccountIdWarningCollector } from "openclaw/plugin-sdk/channel-policy";
import { createChannelDirectoryAdapter, createRuntimeDirectoryLiveAdapter } from "openclaw/plugin-sdk/directory-runtime";
import { normalizeMessagePresentation, renderMessagePresentationFallbackText } from "openclaw/plugin-sdk/interactive-runtime";
import { createLazyRuntimeNamedExport } from "openclaw/plugin-sdk/lazy-runtime";
import { createRuntimeOutboundDelegates } from "openclaw/plugin-sdk/outbound-runtime";
import { buildProbeChannelStatusSummary, createComputedAccountStatusAdapter, createDefaultChannelRuntimeState } from "openclaw/plugin-sdk/status-helpers";
import { DEFAULT_ACCOUNT_ID as DEFAULT_ACCOUNT_ID$1 } from "openclaw/plugin-sdk/account-resolution";
import { createResolvedApproverActionAuthAdapter, resolveApprovalApprovers } from "openclaw/plugin-sdk/approval-auth-runtime";
import { createActionGate } from "openclaw/plugin-sdk/channel-actions";
import { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-primitives";
import { PAIRING_APPROVED_MESSAGE } from "openclaw/plugin-sdk/channel-status";
import { chunkTextForOutbound } from "openclaw/plugin-sdk/text-chunking";
import { normalizeAccountId as normalizeAccountId$1 } from "openclaw/plugin-sdk/account-id";
import { z } from "openclaw/plugin-sdk/zod";
import { buildSecretInputSchema, hasConfiguredSecretInput as hasConfiguredSecretInput$1 } from "openclaw/plugin-sdk/secret-input";
//#region extensions/feishu/src/approval-auth.ts
function normalizeFeishuApproverId(value) {
	const trimmed = normalizeOptionalLowercaseString(normalizeFeishuTarget(String(value)));
	return trimmed?.startsWith("ou_") ? trimmed : void 0;
}
const feishuApprovalAuth = createResolvedApproverActionAuthAdapter({
	channelLabel: "Feishu",
	resolveApprovers: ({ cfg, accountId }) => {
		const account = resolveFeishuAccount({
			cfg,
			accountId
		}).config;
		return resolveApprovalApprovers({
			allowFrom: account.allowFrom,
			normalizeApprover: normalizeFeishuApproverId
		});
	},
	normalizeSenderId: (value) => normalizeFeishuApproverId(value)
});
//#endregion
//#region extensions/feishu/src/config-schema.ts
const ChannelActionsSchema = z.object({ reactions: z.boolean().optional() }).strict().optional();
const DmPolicySchema = z.enum([
	"open",
	"pairing",
	"allowlist"
]);
const GroupPolicySchema = z.union([z.enum([
	"open",
	"allowlist",
	"disabled"
]), z.literal("allowall").transform(() => "open")]);
const FeishuDomainSchema = z.union([z.enum(["feishu", "lark"]), z.string().url().startsWith("https://")]);
const FeishuConnectionModeSchema = z.enum(["websocket", "webhook"]);
const ToolPolicySchema = z.object({
	allow: z.array(z.string()).optional(),
	deny: z.array(z.string()).optional()
}).strict().optional();
const DmConfigSchema = z.object({
	enabled: z.boolean().optional(),
	systemPrompt: z.string().optional()
}).strict().optional();
const MarkdownConfigSchema = z.object({
	mode: z.enum([
		"native",
		"escape",
		"strip"
	]).optional(),
	tableMode: z.enum([
		"native",
		"ascii",
		"simple"
	]).optional()
}).strict().optional();
const RenderModeSchema = z.enum([
	"auto",
	"raw",
	"card"
]).optional();
const StreamingModeSchema = z.boolean().optional();
const BlockStreamingCoalesceSchema = z.object({
	enabled: z.boolean().optional(),
	minDelayMs: z.number().int().positive().optional(),
	maxDelayMs: z.number().int().positive().optional()
}).strict().optional();
const ChannelHeartbeatVisibilitySchema = z.object({
	visibility: z.enum(["visible", "hidden"]).optional(),
	intervalMs: z.number().int().positive().optional()
}).strict().optional();
/**
* Dynamic agent creation configuration.
* When enabled, a new agent is created for each unique DM user.
*/
const DynamicAgentCreationSchema = z.object({
	enabled: z.boolean().optional(),
	workspaceTemplate: z.string().optional(),
	agentDirTemplate: z.string().optional(),
	maxAgents: z.number().int().positive().optional()
}).strict().optional();
/**
* Feishu tools configuration.
* Controls which tool categories are enabled.
*
* Dependencies:
* - wiki requires doc (wiki content is edited via doc tools)
* - perm can work independently but is typically used with drive
*/
const FeishuToolsConfigSchema = z.object({
	doc: z.boolean().optional(),
	chat: z.boolean().optional(),
	wiki: z.boolean().optional(),
	drive: z.boolean().optional(),
	perm: z.boolean().optional(),
	scopes: z.boolean().optional()
}).strict().optional();
/**
* Group session scope for routing Feishu group messages.
* - "group" (default): one session per group chat
* - "group_sender": one session per (group + sender)
* - "group_topic": one session per group topic thread (falls back to group if no topic)
* - "group_topic_sender": one session per (group + topic thread + sender),
*   falls back to (group + sender) if no topic
*/
const GroupSessionScopeSchema = z.enum([
	"group",
	"group_sender",
	"group_topic",
	"group_topic_sender"
]).optional();
/**
* @deprecated Use groupSessionScope instead.
*
* Topic session isolation mode for group chats.
* - "disabled" (default): All messages in a group share one session
* - "enabled": Messages in different topics get separate sessions
*
* Topic routing uses `root_id` when present to keep session continuity and
* falls back to `thread_id` when `root_id` is unavailable.
*/
const TopicSessionModeSchema = z.enum(["disabled", "enabled"]).optional();
const ReactionNotificationModeSchema = z.enum([
	"off",
	"own",
	"all"
]).optional();
/**
* Reply-in-thread mode for group chats.
* - "disabled" (default): Bot replies are normal inline replies
* - "enabled": Bot replies create or continue a Feishu topic thread
*
* When enabled, the Feishu reply API is called with `reply_in_thread: true`,
* causing the reply to appear as a topic (话题) under the original message.
*/
const ReplyInThreadSchema = z.enum(["disabled", "enabled"]).optional();
const FeishuGroupSchema = z.object({
	requireMention: z.boolean().optional(),
	tools: ToolPolicySchema,
	skills: z.array(z.string()).optional(),
	enabled: z.boolean().optional(),
	allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
	systemPrompt: z.string().optional(),
	groupSessionScope: GroupSessionScopeSchema,
	topicSessionMode: TopicSessionModeSchema,
	replyInThread: ReplyInThreadSchema
}).strict();
const FeishuSharedConfigShape = {
	webhookHost: z.string().optional(),
	webhookPort: z.number().int().positive().optional(),
	capabilities: z.array(z.string()).optional(),
	markdown: MarkdownConfigSchema,
	configWrites: z.boolean().optional(),
	dmPolicy: DmPolicySchema.optional(),
	allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
	groupPolicy: GroupPolicySchema.optional(),
	groupAllowFrom: z.array(z.union([z.string(), z.number()])).optional(),
	groupSenderAllowFrom: z.array(z.union([z.string(), z.number()])).optional(),
	requireMention: z.boolean().optional(),
	groups: z.record(z.string(), FeishuGroupSchema.optional()).optional(),
	historyLimit: z.number().int().min(0).optional(),
	dmHistoryLimit: z.number().int().min(0).optional(),
	dms: z.record(z.string(), DmConfigSchema).optional(),
	textChunkLimit: z.number().int().positive().optional(),
	chunkMode: z.enum(["length", "newline"]).optional(),
	blockStreamingCoalesce: BlockStreamingCoalesceSchema,
	mediaMaxMb: z.number().positive().optional(),
	httpTimeoutMs: z.number().int().positive().max(3e5).optional(),
	heartbeat: ChannelHeartbeatVisibilitySchema,
	renderMode: RenderModeSchema,
	streaming: StreamingModeSchema,
	tools: FeishuToolsConfigSchema,
	actions: ChannelActionsSchema,
	replyInThread: ReplyInThreadSchema,
	reactionNotifications: ReactionNotificationModeSchema,
	typingIndicator: z.boolean().optional(),
	resolveSenderNames: z.boolean().optional()
};
/**
* Per-account configuration.
* All fields are optional - missing fields inherit from top-level config.
*/
const FeishuAccountConfigSchema = z.object({
	enabled: z.boolean().optional(),
	name: z.string().optional(),
	appId: z.string().optional(),
	appSecret: buildSecretInputSchema().optional(),
	encryptKey: buildSecretInputSchema().optional(),
	verificationToken: buildSecretInputSchema().optional(),
	domain: FeishuDomainSchema.optional(),
	connectionMode: FeishuConnectionModeSchema.optional(),
	webhookPath: z.string().optional(),
	...FeishuSharedConfigShape,
	groupSessionScope: GroupSessionScopeSchema,
	topicSessionMode: TopicSessionModeSchema
}).strict();
const FeishuConfigSchema = z.object({
	enabled: z.boolean().optional(),
	defaultAccount: z.string().optional(),
	appId: z.string().optional(),
	appSecret: buildSecretInputSchema().optional(),
	encryptKey: buildSecretInputSchema().optional(),
	verificationToken: buildSecretInputSchema().optional(),
	domain: FeishuDomainSchema.optional().default("feishu"),
	connectionMode: FeishuConnectionModeSchema.optional().default("websocket"),
	webhookPath: z.string().optional().default("/feishu/events"),
	...FeishuSharedConfigShape,
	dmPolicy: DmPolicySchema.optional().default("pairing"),
	reactionNotifications: ReactionNotificationModeSchema.optional().default("own"),
	groupPolicy: GroupPolicySchema.optional().default("allowlist"),
	requireMention: z.boolean().optional(),
	groupSessionScope: GroupSessionScopeSchema,
	topicSessionMode: TopicSessionModeSchema,
	dynamicAgentCreation: DynamicAgentCreationSchema,
	typingIndicator: z.boolean().optional().default(true),
	resolveSenderNames: z.boolean().optional().default(true),
	accounts: z.record(z.string(), FeishuAccountConfigSchema.optional()).optional()
}).strict().superRefine((value, ctx) => {
	const defaultAccount = value.defaultAccount?.trim();
	if (defaultAccount && value.accounts && Object.keys(value.accounts).length > 0) {
		const normalizedDefaultAccount = normalizeAccountId$1(defaultAccount);
		if (!Object.prototype.hasOwnProperty.call(value.accounts, normalizedDefaultAccount)) ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["defaultAccount"],
			message: `channels.feishu.defaultAccount="${defaultAccount}" does not match a configured account key`
		});
	}
	const defaultConnectionMode = value.connectionMode ?? "websocket";
	const defaultVerificationTokenConfigured = hasConfiguredSecretInput$1(value.verificationToken);
	const defaultEncryptKeyConfigured = hasConfiguredSecretInput$1(value.encryptKey);
	if (defaultConnectionMode === "webhook") {
		if (!defaultVerificationTokenConfigured) ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["verificationToken"],
			message: "channels.feishu.connectionMode=\"webhook\" requires channels.feishu.verificationToken"
		});
		if (!defaultEncryptKeyConfigured) ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["encryptKey"],
			message: "channels.feishu.connectionMode=\"webhook\" requires channels.feishu.encryptKey"
		});
	}
	for (const [accountId, account] of Object.entries(value.accounts ?? {})) {
		if (!account) continue;
		if ((account.connectionMode ?? defaultConnectionMode) !== "webhook") continue;
		const accountVerificationTokenConfigured = hasConfiguredSecretInput$1(account.verificationToken) || defaultVerificationTokenConfigured;
		const accountEncryptKeyConfigured = hasConfiguredSecretInput$1(account.encryptKey) || defaultEncryptKeyConfigured;
		if (!accountVerificationTokenConfigured) ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: [
				"accounts",
				accountId,
				"verificationToken"
			],
			message: `channels.feishu.accounts.${accountId}.connectionMode="webhook" requires a verificationToken (account-level or top-level)`
		});
		if (!accountEncryptKeyConfigured) ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: [
				"accounts",
				accountId,
				"encryptKey"
			],
			message: `channels.feishu.accounts.${accountId}.connectionMode="webhook" requires an encryptKey (account-level or top-level)`
		});
	}
	if (value.dmPolicy === "open") {
		if (!(value.allowFrom ?? []).some((entry) => String(entry).trim() === "*")) ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["allowFrom"],
			message: "channels.feishu.dmPolicy=\"open\" requires channels.feishu.allowFrom to include \"*\""
		});
	}
});
//#endregion
//#region extensions/feishu/src/session-route.ts
function resolveFeishuOutboundSessionRoute(params) {
	let trimmed = stripChannelTargetPrefix(params.target, "feishu", "lark");
	if (!trimmed) return null;
	const lower = normalizeLowercaseStringOrEmpty(trimmed);
	let isGroup = false;
	let typeExplicit = false;
	if (lower.startsWith("group:") || lower.startsWith("chat:") || lower.startsWith("channel:")) {
		trimmed = trimmed.replace(/^(group|chat|channel):/i, "").trim();
		isGroup = true;
		typeExplicit = true;
	} else if (lower.startsWith("user:") || lower.startsWith("dm:")) {
		trimmed = trimmed.replace(/^(user|dm):/i, "").trim();
		isGroup = false;
		typeExplicit = true;
	}
	if (!typeExplicit) {
		const idLower = normalizeLowercaseStringOrEmpty(trimmed);
		if (idLower.startsWith("ou_") || idLower.startsWith("on_")) isGroup = false;
	}
	return buildChannelOutboundSessionRoute({
		cfg: params.cfg,
		agentId: params.agentId,
		channel: "feishu",
		accountId: params.accountId,
		peer: {
			kind: isGroup ? "group" : "direct",
			id: trimmed
		},
		chatType: isGroup ? "group" : "direct",
		from: isGroup ? `feishu:group:${trimmed}` : `feishu:${trimmed}`,
		to: trimmed
	});
}
//#endregion
//#region extensions/feishu/src/channel.ts
function readFeishuMediaParam(params) {
	const media = params.media;
	if (typeof media !== "string") return;
	return media.trim() ? media : void 0;
}
function hasLegacyFeishuCardCommandValue(actionValue) {
	return isRecord$1(actionValue) && actionValue.oc !== "ocf1" && (Boolean(typeof actionValue.command === "string" && actionValue.command.trim()) || Boolean(typeof actionValue.text === "string" && actionValue.text.trim()));
}
function containsLegacyFeishuCardCommandValue(node) {
	if (Array.isArray(node)) return node.some((item) => containsLegacyFeishuCardCommandValue(item));
	if (!isRecord$1(node)) return false;
	if (node.tag === "button" && hasLegacyFeishuCardCommandValue(node.value)) return true;
	return Object.values(node).some((value) => containsLegacyFeishuCardCommandValue(value));
}
const meta = {
	id: "feishu",
	label: "Feishu",
	selectionLabel: "Feishu/Lark (飞书)",
	docsPath: "/channels/feishu",
	docsLabel: "feishu",
	blurb: "飞书/Lark enterprise messaging.",
	aliases: ["lark"],
	order: 70
};
const loadFeishuChannelRuntime = createLazyRuntimeNamedExport(() => import("./channel.runtime-BwkiXgXr.js"), "feishuChannelRuntime");
function buildFeishuPresentationCard(params) {
	const fallbackPresentation = {
		...params.presentation.tone ? { tone: params.presentation.tone } : {},
		blocks: params.presentation.blocks
	};
	return {
		schema: "2.0",
		config: { width_mode: "fill" },
		...params.presentation.title ? { header: {
			title: {
				tag: "plain_text",
				content: params.presentation.title
			},
			template: "blue"
		} } : {},
		body: { elements: [{
			tag: "markdown",
			content: renderMessagePresentationFallbackText({
				text: params.fallbackText,
				presentation: fallbackPresentation
			})
		}] }
	};
}
async function createFeishuActionClient(account) {
	const { createFeishuClient } = await import("./client-cp9ZRF_-.js").then((n) => n.t);
	return createFeishuClient(account);
}
const collectFeishuSecurityWarnings = createAllowlistProviderGroupPolicyWarningCollector({
	providerConfigPresent: (cfg) => cfg.channels?.feishu !== void 0,
	resolveGroupPolicy: ({ cfg, accountId }) => resolveFeishuAccount({
		cfg,
		accountId
	}).config?.groupPolicy,
	collect: ({ cfg, accountId, groupPolicy }) => {
		if (groupPolicy !== "open") return [];
		return [`- Feishu[${resolveFeishuAccount({
			cfg,
			accountId
		}).accountId}] groups: groupPolicy="open" allows any member to trigger (mention-gated). Set channels.feishu.groupPolicy="allowlist" + channels.feishu.groupAllowFrom to restrict senders.`];
	}
});
function describeFeishuMessageTool({ cfg, accountId }) {
	const enabledAccounts = accountId ? [resolveFeishuAccount({
		cfg,
		accountId
	})].filter((account) => account.enabled && account.configured) : listEnabledFeishuAccounts(cfg);
	const enabled = enabledAccounts.length > 0 || !accountId && cfg.channels?.feishu?.enabled !== false && Boolean(inspectFeishuCredentials(cfg.channels?.feishu));
	if (enabledAccounts.length === 0) return {
		actions: [],
		capabilities: enabled ? ["presentation"] : []
	};
	const actions = new Set([
		"send",
		"read",
		"edit",
		"thread-reply",
		"pin",
		"list-pins",
		"unpin",
		"member-info",
		"channel-info",
		"channel-list"
	]);
	if (accountId ? enabledAccounts.some((account) => isFeishuReactionsActionEnabled({
		cfg,
		account
	})) : areAnyFeishuReactionActionsEnabled(cfg)) {
		actions.add("react");
		actions.add("reactions");
	}
	return {
		actions: Array.from(actions),
		capabilities: enabled ? ["presentation"] : []
	};
}
function setFeishuNamedAccountEnabled(cfg, accountId, enabled) {
	const feishuCfg = cfg.channels?.feishu;
	return {
		...cfg,
		channels: {
			...cfg.channels,
			feishu: {
				...feishuCfg,
				accounts: {
					...feishuCfg?.accounts,
					[accountId]: {
						...feishuCfg?.accounts?.[accountId],
						enabled
					}
				}
			}
		}
	};
}
const feishuConfigAdapter = createHybridChannelConfigAdapter({
	sectionKey: "feishu",
	listAccountIds: listFeishuAccountIds,
	resolveAccount: adaptScopedAccountAccessor(resolveFeishuAccount),
	defaultAccountId: resolveDefaultFeishuAccountId,
	clearBaseFields: [],
	resolveAllowFrom: (account) => account.config.allowFrom,
	formatAllowFrom: (allowFrom) => formatAllowFromLowercase({ allowFrom })
});
function isFeishuReactionsActionEnabled(params) {
	if (!params.account.enabled || !params.account.configured) return false;
	return createActionGate(params.account.config.actions ?? (params.cfg.channels?.feishu)?.actions)("reactions");
}
function areAnyFeishuReactionActionsEnabled(cfg) {
	for (const account of listEnabledFeishuAccounts(cfg)) if (isFeishuReactionsActionEnabled({
		cfg,
		account
	})) return true;
	return false;
}
function isSupportedFeishuDirectConversationId(conversationId) {
	const trimmed = conversationId.trim();
	if (!trimmed || trimmed.includes(":")) return false;
	if (trimmed.startsWith("oc_") || trimmed.startsWith("on_")) return false;
	return true;
}
function normalizeFeishuAcpConversationId(conversationId) {
	const parsed = parseFeishuConversationId({ conversationId });
	if (!parsed || parsed.scope !== "group_topic" && parsed.scope !== "group_topic_sender" && !isSupportedFeishuDirectConversationId(parsed.canonicalConversationId)) return null;
	return {
		conversationId: parsed.canonicalConversationId,
		parentConversationId: parsed.scope === "group_topic" || parsed.scope === "group_topic_sender" ? parsed.chatId : void 0
	};
}
function matchFeishuAcpConversation(params) {
	const binding = normalizeFeishuAcpConversationId(params.bindingConversationId);
	if (!binding) return null;
	const incoming = parseFeishuConversationId({
		conversationId: params.conversationId,
		parentConversationId: params.parentConversationId
	});
	if (!incoming || incoming.scope !== "group_topic" && incoming.scope !== "group_topic_sender" && !isSupportedFeishuDirectConversationId(incoming.canonicalConversationId)) return null;
	const matchesCanonicalConversation = binding.conversationId === incoming.canonicalConversationId;
	const matchesParentTopicForSenderScopedConversation = incoming.scope === "group_topic_sender" && binding.parentConversationId === incoming.chatId && binding.conversationId === `${incoming.chatId}:topic:${incoming.topicId}`;
	if (!matchesCanonicalConversation && !matchesParentTopicForSenderScopedConversation) return null;
	return {
		conversationId: matchesParentTopicForSenderScopedConversation ? binding.conversationId : incoming.canonicalConversationId,
		parentConversationId: incoming.scope === "group_topic" || incoming.scope === "group_topic_sender" ? incoming.chatId : void 0,
		matchPriority: matchesCanonicalConversation ? 2 : 1
	};
}
function resolveFeishuSenderScopedCommandConversation(params) {
	const parentConversationId = params.parentConversationId?.trim();
	const threadId = params.threadId?.trim();
	const senderId = params.senderId?.trim();
	if (!parentConversationId || !threadId || !senderId) return;
	const expectedScopePrefix = `feishu:group:${normalizeLowercaseStringOrEmpty(parentConversationId)}:topic:${normalizeLowercaseStringOrEmpty(threadId)}:sender:`;
	const isSenderScopedSession = [params.sessionKey, params.parentSessionKey].some((candidate) => {
		const normalized = normalizeLowercaseStringOrEmpty(candidate ?? "");
		if (!normalized) return false;
		return normalized.replace(/^agent:[^:]+:/, "").startsWith(expectedScopePrefix);
	});
	const senderScopedConversationId = buildFeishuConversationId({
		chatId: parentConversationId,
		scope: "group_topic_sender",
		topicId: threadId,
		senderOpenId: senderId
	});
	if (isSenderScopedSession) return senderScopedConversationId;
	if (!params.sessionKey?.trim()) return;
	return getSessionBindingService().listBySession(params.sessionKey).find((binding) => {
		if (binding.conversation.channel !== "feishu" || binding.conversation.accountId !== params.accountId) return false;
		return binding.conversation.conversationId === senderScopedConversationId;
	})?.conversation.conversationId;
}
function resolveFeishuCommandConversation(params) {
	if (params.threadId) {
		const parentConversationId = parseFeishuTargetId(params.originatingTo) ?? parseFeishuTargetId(params.commandTo) ?? parseFeishuTargetId(params.fallbackTo);
		if (!parentConversationId) return null;
		return {
			conversationId: resolveFeishuSenderScopedCommandConversation({
				accountId: params.accountId,
				parentConversationId,
				threadId: params.threadId,
				senderId: params.senderId,
				sessionKey: params.sessionKey,
				parentSessionKey: params.parentSessionKey
			}) ?? buildFeishuConversationId({
				chatId: parentConversationId,
				scope: "group_topic",
				topicId: params.threadId
			}),
			parentConversationId
		};
	}
	const conversationId = parseFeishuDirectConversationId(params.originatingTo) ?? parseFeishuDirectConversationId(params.commandTo) ?? parseFeishuDirectConversationId(params.fallbackTo);
	return conversationId ? { conversationId } : null;
}
function jsonActionResult(details) {
	return {
		content: [{
			type: "text",
			text: JSON.stringify(details)
		}],
		details
	};
}
function readFirstString(params, keys, fallback) {
	for (const key of keys) {
		const value = params[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	if (typeof fallback === "string" && fallback.trim()) return fallback.trim();
}
function readOptionalNumber(params, keys) {
	for (const key of keys) {
		const value = params[key];
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "string" && value.trim()) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed;
		}
	}
}
function resolveFeishuActionTarget(ctx) {
	return readFirstString(ctx.params, ["to", "target"], ctx.toolContext?.currentChannelId);
}
function resolveFeishuChatId(ctx) {
	const raw = readFirstString(ctx.params, [
		"chatId",
		"chat_id",
		"channelId",
		"channel_id",
		"to",
		"target"
	], ctx.toolContext?.currentChannelId);
	if (!raw) return;
	if (/^(user|dm|open_id):/i.test(raw)) return;
	if (/^(chat|group|channel):/i.test(raw)) return normalizeFeishuTarget(raw) ?? void 0;
	return raw;
}
function resolveFeishuMessageId(params) {
	return readFirstString(params, [
		"messageId",
		"message_id",
		"replyTo",
		"reply_to"
	]);
}
function resolveFeishuMemberId(params) {
	return readFirstString(params, [
		"memberId",
		"member_id",
		"userId",
		"user_id",
		"openId",
		"open_id",
		"unionId",
		"union_id"
	]);
}
function resolveFeishuMemberIdType(params) {
	const raw = readFirstString(params, [
		"memberIdType",
		"member_id_type",
		"userIdType",
		"user_id_type"
	]);
	if (raw === "open_id" || raw === "user_id" || raw === "union_id") return raw;
	if (readFirstString(params, ["userId", "user_id"]) && !readFirstString(params, [
		"openId",
		"open_id",
		"unionId",
		"union_id"
	])) return "user_id";
	if (readFirstString(params, ["unionId", "union_id"]) && !readFirstString(params, ["openId", "open_id"])) return "union_id";
	return "open_id";
}
const feishuPlugin = createChatChannelPlugin({
	base: {
		id: "feishu",
		meta: { ...meta },
		capabilities: {
			chatTypes: ["direct", "channel"],
			polls: false,
			threads: true,
			media: true,
			reactions: true,
			edit: true,
			reply: true
		},
		agentPrompt: { messageToolHints: () => [
			"- Feishu targeting: omit `target` to reply to the current conversation (auto-inferred). Explicit targets: `user:open_id` or `chat:chat_id`.",
			"- Feishu supports interactive cards plus native image, file, audio, and video/media delivery.",
			"- Feishu supports `send`, `read`, `edit`, `thread-reply`, pins, and channel/member lookup, plus reactions when enabled."
		] },
		groups: { resolveToolPolicy: resolveFeishuGroupToolPolicy },
		conversationBindings: {
			defaultTopLevelPlacement: "current",
			buildModelOverrideParentCandidates: ({ parentConversationId }) => buildFeishuModelOverrideParentCandidates(parentConversationId)
		},
		mentions: { stripPatterns: () => ["<at user_id=\"[^\"]*\">[^<]*</at>"] },
		reload: { configPrefixes: ["channels.feishu"] },
		configSchema: buildChannelConfigSchema(FeishuConfigSchema),
		config: {
			...feishuConfigAdapter,
			setAccountEnabled: ({ cfg, accountId, enabled }) => {
				if (accountId === DEFAULT_ACCOUNT_ID$1) return {
					...cfg,
					channels: {
						...cfg.channels,
						feishu: {
							...cfg.channels?.feishu,
							enabled
						}
					}
				};
				return setFeishuNamedAccountEnabled(cfg, accountId, enabled);
			},
			deleteAccount: ({ cfg, accountId }) => {
				if (accountId === DEFAULT_ACCOUNT_ID$1) {
					const next = { ...cfg };
					const nextChannels = { ...cfg.channels };
					delete nextChannels.feishu;
					if (Object.keys(nextChannels).length > 0) next.channels = nextChannels;
					else delete next.channels;
					return next;
				}
				const feishuCfg = cfg.channels?.feishu;
				const accounts = { ...feishuCfg?.accounts };
				delete accounts[accountId];
				return {
					...cfg,
					channels: {
						...cfg.channels,
						feishu: {
							...feishuCfg,
							accounts: Object.keys(accounts).length > 0 ? accounts : void 0
						}
					}
				};
			},
			isConfigured: (account) => account.configured,
			describeAccount: (account) => describeAccountSnapshot({
				account,
				configured: account.configured,
				extra: {
					appId: account.appId,
					domain: account.domain
				}
			})
		},
		approvalCapability: feishuApprovalAuth,
		secrets: {
			secretTargetRegistryEntries,
			collectRuntimeConfigAssignments
		},
		actions: {
			messageActionTargetAliases,
			describeMessageTool: describeFeishuMessageTool,
			handleAction: async (ctx) => {
				const account = resolveFeishuAccount({
					cfg: ctx.cfg,
					accountId: ctx.accountId ?? void 0
				});
				if ((ctx.action === "react" || ctx.action === "reactions") && !isFeishuReactionsActionEnabled({
					cfg: ctx.cfg,
					account
				})) throw new Error("Feishu reactions are disabled via actions.reactions.");
				if (ctx.action === "send" || ctx.action === "thread-reply") {
					const to = resolveFeishuActionTarget(ctx);
					if (!to) throw new Error(`Feishu ${ctx.action} requires a target (to).`);
					const replyToMessageId = ctx.action === "thread-reply" ? resolveFeishuMessageId(ctx.params) : void 0;
					if (ctx.action === "thread-reply" && !replyToMessageId) throw new Error("Feishu thread-reply requires messageId.");
					const presentation = normalizeMessagePresentation(ctx.params.presentation);
					const text = readFirstString(ctx.params, ["text", "message"]);
					const mediaUrl = readFeishuMediaParam(ctx.params);
					const card = presentation ? buildFeishuPresentationCard({
						presentation,
						fallbackText: text
					}) : void 0;
					if (card && mediaUrl) throw new Error(`Feishu ${ctx.action} does not support card with media.`);
					if (!card && !text && !mediaUrl) throw new Error(`Feishu ${ctx.action} requires text/message, media, or card.`);
					const runtime = await loadFeishuChannelRuntime();
					const maybeSendMedia = runtime.feishuOutbound.sendMedia;
					if (mediaUrl && !maybeSendMedia) throw new Error("Feishu media sending is not available.");
					const sendMedia = maybeSendMedia;
					let result;
					if (card) {
						if (containsLegacyFeishuCardCommandValue(card)) throw new Error("Feishu card buttons that trigger text or commands must use structured interaction envelopes.");
						result = await runtime.sendCardFeishu({
							cfg: ctx.cfg,
							to,
							card,
							accountId: ctx.accountId ?? void 0,
							replyToMessageId,
							replyInThread: ctx.action === "thread-reply"
						});
					} else if (mediaUrl) result = await sendMedia({
						cfg: ctx.cfg,
						to,
						text: text ?? "",
						mediaUrl,
						accountId: ctx.accountId ?? void 0,
						mediaLocalRoots: ctx.mediaLocalRoots,
						replyToId: replyToMessageId
					});
					else result = await runtime.sendMessageFeishu({
						cfg: ctx.cfg,
						to,
						text,
						accountId: ctx.accountId ?? void 0,
						replyToMessageId,
						replyInThread: ctx.action === "thread-reply"
					});
					return jsonActionResult({
						ok: true,
						channel: "feishu",
						action: ctx.action,
						...result
					});
				}
				if (ctx.action === "read") {
					const messageId = resolveFeishuMessageId(ctx.params);
					if (!messageId) throw new Error("Feishu read requires messageId.");
					const { getMessageFeishu } = await loadFeishuChannelRuntime();
					const message = await getMessageFeishu({
						cfg: ctx.cfg,
						messageId,
						accountId: ctx.accountId ?? void 0
					});
					if (!message) return {
						isError: true,
						content: [{
							type: "text",
							text: JSON.stringify({ error: `Feishu read failed or message not found: ${messageId}` })
						}],
						details: { error: `Feishu read failed or message not found: ${messageId}` }
					};
					return jsonActionResult({
						ok: true,
						channel: "feishu",
						action: "read",
						message
					});
				}
				if (ctx.action === "edit") {
					const messageId = resolveFeishuMessageId(ctx.params);
					if (!messageId) throw new Error("Feishu edit requires messageId.");
					const text = readFirstString(ctx.params, ["text", "message"]);
					const card = ctx.params.card && typeof ctx.params.card === "object" ? ctx.params.card : void 0;
					const { editMessageFeishu } = await loadFeishuChannelRuntime();
					return jsonActionResult({
						ok: true,
						channel: "feishu",
						action: "edit",
						...await editMessageFeishu({
							cfg: ctx.cfg,
							messageId,
							text,
							card,
							accountId: ctx.accountId ?? void 0
						})
					});
				}
				if (ctx.action === "pin") {
					const messageId = resolveFeishuMessageId(ctx.params);
					if (!messageId) throw new Error("Feishu pin requires messageId.");
					const { createPinFeishu } = await loadFeishuChannelRuntime();
					return jsonActionResult({
						ok: true,
						channel: "feishu",
						action: "pin",
						pin: await createPinFeishu({
							cfg: ctx.cfg,
							messageId,
							accountId: ctx.accountId ?? void 0
						})
					});
				}
				if (ctx.action === "unpin") {
					const messageId = resolveFeishuMessageId(ctx.params);
					if (!messageId) throw new Error("Feishu unpin requires messageId.");
					const { removePinFeishu } = await loadFeishuChannelRuntime();
					await removePinFeishu({
						cfg: ctx.cfg,
						messageId,
						accountId: ctx.accountId ?? void 0
					});
					return jsonActionResult({
						ok: true,
						channel: "feishu",
						action: "unpin",
						messageId
					});
				}
				if (ctx.action === "list-pins") {
					const chatId = resolveFeishuChatId(ctx);
					if (!chatId) throw new Error("Feishu list-pins requires chatId or channelId.");
					const { listPinsFeishu } = await loadFeishuChannelRuntime();
					return jsonActionResult({
						ok: true,
						channel: "feishu",
						action: "list-pins",
						...await listPinsFeishu({
							cfg: ctx.cfg,
							chatId,
							startTime: readFirstString(ctx.params, ["startTime", "start_time"]),
							endTime: readFirstString(ctx.params, ["endTime", "end_time"]),
							pageSize: readOptionalNumber(ctx.params, ["pageSize", "page_size"]),
							pageToken: readFirstString(ctx.params, ["pageToken", "page_token"]),
							accountId: ctx.accountId ?? void 0
						})
					});
				}
				if (ctx.action === "channel-info") {
					const chatId = resolveFeishuChatId(ctx);
					if (!chatId) throw new Error("Feishu channel-info requires chatId or channelId.");
					const runtime = await loadFeishuChannelRuntime();
					const client = await createFeishuActionClient(account);
					const channel = await runtime.getChatInfo(client, chatId);
					if (!(ctx.params.includeMembers === true || ctx.params.members === true)) return jsonActionResult({
						ok: true,
						provider: "feishu",
						action: "channel-info",
						channel
					});
					return jsonActionResult({
						ok: true,
						provider: "feishu",
						action: "channel-info",
						channel,
						members: await runtime.getChatMembers(client, chatId, readOptionalNumber(ctx.params, ["pageSize", "page_size"]), readFirstString(ctx.params, ["pageToken", "page_token"]), resolveFeishuMemberIdType(ctx.params))
					});
				}
				if (ctx.action === "member-info") {
					const runtime = await loadFeishuChannelRuntime();
					const client = await createFeishuActionClient(account);
					const memberId = resolveFeishuMemberId(ctx.params);
					if (memberId) return jsonActionResult({
						ok: true,
						channel: "feishu",
						action: "member-info",
						member: await runtime.getFeishuMemberInfo(client, memberId, resolveFeishuMemberIdType(ctx.params))
					});
					const chatId = resolveFeishuChatId(ctx);
					if (!chatId) throw new Error("Feishu member-info requires memberId or chatId/channelId.");
					return jsonActionResult({
						ok: true,
						channel: "feishu",
						action: "member-info",
						...await runtime.getChatMembers(client, chatId, readOptionalNumber(ctx.params, ["pageSize", "page_size"]), readFirstString(ctx.params, ["pageToken", "page_token"]), resolveFeishuMemberIdType(ctx.params))
					});
				}
				if (ctx.action === "channel-list") {
					const runtime = await loadFeishuChannelRuntime();
					const query = readFirstString(ctx.params, ["query"]);
					const limit = readOptionalNumber(ctx.params, ["limit"]);
					const scope = readFirstString(ctx.params, ["scope", "kind"]) ?? "all";
					if (scope === "groups" || scope === "group" || scope === "channels" || scope === "channel") return jsonActionResult({
						ok: true,
						channel: "feishu",
						action: "channel-list",
						groups: await runtime.listFeishuDirectoryGroupsLive({
							cfg: ctx.cfg,
							query,
							limit,
							fallbackToStatic: false,
							accountId: ctx.accountId ?? void 0
						})
					});
					if (scope === "peers" || scope === "peer" || scope === "members" || scope === "member" || scope === "users" || scope === "user") return jsonActionResult({
						ok: true,
						channel: "feishu",
						action: "channel-list",
						peers: await runtime.listFeishuDirectoryPeersLive({
							cfg: ctx.cfg,
							query,
							limit,
							fallbackToStatic: false,
							accountId: ctx.accountId ?? void 0
						})
					});
					const [groups, peers] = await Promise.all([runtime.listFeishuDirectoryGroupsLive({
						cfg: ctx.cfg,
						query,
						limit,
						fallbackToStatic: false,
						accountId: ctx.accountId ?? void 0
					}), runtime.listFeishuDirectoryPeersLive({
						cfg: ctx.cfg,
						query,
						limit,
						fallbackToStatic: false,
						accountId: ctx.accountId ?? void 0
					})]);
					return jsonActionResult({
						ok: true,
						channel: "feishu",
						action: "channel-list",
						groups,
						peers
					});
				}
				if (ctx.action === "react") {
					const messageId = resolveFeishuMessageId(ctx.params);
					if (!messageId) throw new Error("Feishu reaction requires messageId.");
					const emoji = typeof ctx.params.emoji === "string" ? ctx.params.emoji.trim() : "";
					const remove = ctx.params.remove === true;
					const clearAll = ctx.params.clearAll === true;
					if (remove) {
						if (!emoji) throw new Error("Emoji is required to remove a Feishu reaction.");
						const { listReactionsFeishu, removeReactionFeishu } = await loadFeishuChannelRuntime();
						const ownReaction = (await listReactionsFeishu({
							cfg: ctx.cfg,
							messageId,
							emojiType: emoji,
							accountId: ctx.accountId ?? void 0
						})).find((entry) => entry.operatorType === "app");
						if (!ownReaction) return jsonActionResult({
							ok: true,
							removed: null
						});
						await removeReactionFeishu({
							cfg: ctx.cfg,
							messageId,
							reactionId: ownReaction.reactionId,
							accountId: ctx.accountId ?? void 0
						});
						return jsonActionResult({
							ok: true,
							removed: emoji
						});
					}
					if (!emoji) {
						if (!clearAll) throw new Error("Emoji is required to add a Feishu reaction. Set clearAll=true to remove all bot reactions.");
						const { listReactionsFeishu, removeReactionFeishu } = await loadFeishuChannelRuntime();
						const reactions = await listReactionsFeishu({
							cfg: ctx.cfg,
							messageId,
							accountId: ctx.accountId ?? void 0
						});
						let removed = 0;
						for (const reaction of reactions.filter((entry) => entry.operatorType === "app")) {
							await removeReactionFeishu({
								cfg: ctx.cfg,
								messageId,
								reactionId: reaction.reactionId,
								accountId: ctx.accountId ?? void 0
							});
							removed += 1;
						}
						return jsonActionResult({
							ok: true,
							removed
						});
					}
					const { addReactionFeishu } = await loadFeishuChannelRuntime();
					await addReactionFeishu({
						cfg: ctx.cfg,
						messageId,
						emojiType: emoji,
						accountId: ctx.accountId ?? void 0
					});
					return jsonActionResult({
						ok: true,
						added: emoji
					});
				}
				if (ctx.action === "reactions") {
					const messageId = resolveFeishuMessageId(ctx.params);
					if (!messageId) throw new Error("Feishu reactions lookup requires messageId.");
					const { listReactionsFeishu } = await loadFeishuChannelRuntime();
					return jsonActionResult({
						ok: true,
						reactions: await listReactionsFeishu({
							cfg: ctx.cfg,
							messageId,
							accountId: ctx.accountId ?? void 0
						})
					});
				}
				throw new Error(`Unsupported Feishu action: "${ctx.action}"`);
			}
		},
		bindings: {
			compileConfiguredBinding: ({ conversationId }) => normalizeFeishuAcpConversationId(conversationId),
			matchInboundConversation: ({ compiledBinding, conversationId, parentConversationId }) => matchFeishuAcpConversation({
				bindingConversationId: compiledBinding.conversationId,
				conversationId,
				parentConversationId
			}),
			resolveCommandConversation: ({ accountId, threadId, senderId, sessionKey, parentSessionKey, originatingTo, commandTo, fallbackTo }) => resolveFeishuCommandConversation({
				accountId,
				threadId,
				senderId,
				sessionKey,
				parentSessionKey,
				originatingTo,
				commandTo,
				fallbackTo
			})
		},
		auth: { login: async ({ cfg }) => {
			const { createClackPrompter } = await import("openclaw/plugin-sdk/setup-runtime");
			const { writeConfigFile } = await import("openclaw/plugin-sdk/config-runtime");
			const nextCfg = await runFeishuLogin({
				cfg,
				prompter: createClackPrompter()
			});
			if (nextCfg !== cfg) await writeConfigFile(nextCfg);
		} },
		setup: feishuSetupAdapter,
		setupWizard: feishuSetupWizard,
		messaging: {
			normalizeTarget: (raw) => normalizeFeishuTarget(raw) ?? void 0,
			resolveSessionConversation: ({ kind, rawId }) => resolveFeishuSessionConversation({
				kind,
				rawId
			}),
			resolveOutboundSessionRoute: (params) => resolveFeishuOutboundSessionRoute(params),
			targetResolver: {
				looksLikeId: looksLikeFeishuId,
				hint: "<chatId|user:openId|chat:chatId>"
			}
		},
		directory: createChannelDirectoryAdapter({
			listPeers: async ({ cfg, query, limit, accountId }) => listFeishuDirectoryPeers({
				cfg,
				query: query ?? void 0,
				limit: limit ?? void 0,
				accountId: accountId ?? void 0
			}),
			listGroups: async ({ cfg, query, limit, accountId }) => listFeishuDirectoryGroups({
				cfg,
				query: query ?? void 0,
				limit: limit ?? void 0,
				accountId: accountId ?? void 0
			}),
			...createRuntimeDirectoryLiveAdapter({
				getRuntime: loadFeishuChannelRuntime,
				listPeersLive: (runtime) => async ({ cfg, query, limit, accountId }) => await runtime.listFeishuDirectoryPeersLive({
					cfg,
					query: query ?? void 0,
					limit: limit ?? void 0,
					accountId: accountId ?? void 0
				}),
				listGroupsLive: (runtime) => async ({ cfg, query, limit, accountId }) => await runtime.listFeishuDirectoryGroupsLive({
					cfg,
					query: query ?? void 0,
					limit: limit ?? void 0,
					accountId: accountId ?? void 0
				})
			})
		}),
		status: createComputedAccountStatusAdapter({
			defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID$1, { port: null }),
			buildChannelSummary: ({ snapshot }) => buildProbeChannelStatusSummary(snapshot, { port: snapshot.port ?? null }),
			probeAccount: async ({ account }) => await (await loadFeishuChannelRuntime()).probeFeishu(account),
			resolveAccountSnapshot: ({ account, runtime }) => ({
				accountId: account.accountId,
				enabled: account.enabled,
				configured: account.configured,
				name: account.name,
				extra: {
					appId: account.appId,
					domain: account.domain,
					port: runtime?.port ?? null
				}
			})
		}),
		gateway: { startAccount: async (ctx) => {
			const { monitorFeishuProvider } = await import("./monitor-BPkLDEKG.js");
			const account = resolveFeishuRuntimeAccount({
				cfg: ctx.cfg,
				accountId: ctx.accountId
			}, { requireEventSecrets: true });
			const port = account.config?.webhookPort ?? null;
			ctx.setStatus({
				accountId: ctx.accountId,
				port
			});
			ctx.log?.info(`starting feishu[${ctx.accountId}] (mode: ${account.config?.connectionMode ?? "websocket"})`);
			return monitorFeishuProvider({
				config: ctx.cfg,
				runtime: ctx.runtime,
				abortSignal: ctx.abortSignal,
				accountId: ctx.accountId
			});
		} }
	},
	security: {
		collectWarnings: projectConfigAccountIdWarningCollector(collectFeishuSecurityWarnings),
		collectAuditFindings: ({ cfg }) => collectFeishuSecurityAuditFindings({ cfg })
	},
	pairing: { text: {
		idLabel: "feishuUserId",
		message: PAIRING_APPROVED_MESSAGE,
		normalizeAllowEntry: createPairingPrefixStripper(/^(feishu|user|open_id):/i),
		notify: async ({ cfg, id, message, accountId }) => {
			const { sendMessageFeishu } = await loadFeishuChannelRuntime();
			await sendMessageFeishu({
				cfg,
				to: id,
				text: message,
				accountId
			});
		}
	} },
	outbound: {
		deliveryMode: "direct",
		chunker: chunkTextForOutbound,
		chunkerMode: "markdown",
		textChunkLimit: 4e3,
		...createRuntimeOutboundDelegates({
			getRuntime: loadFeishuChannelRuntime,
			sendText: { resolve: (runtime) => runtime.feishuOutbound.sendText },
			sendMedia: { resolve: (runtime) => runtime.feishuOutbound.sendMedia }
		})
	}
});
//#endregion
export { feishuPlugin as t };
