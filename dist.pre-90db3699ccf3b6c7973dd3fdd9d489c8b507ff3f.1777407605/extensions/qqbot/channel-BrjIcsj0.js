import { a as resolveApprovalTarget, o as ensurePlatformAdapter, s as getBridgeLogger } from "./approval-BDA938lx.js";
import { A as normalizeLowercaseStringOrEmpty$1, k as asOptionalObjectRecord } from "./sender-qjPIur5o.js";
import { a as resolveQQBotExecApprovalConfig, c as applyQQBotAccountConfig, d as resolveQQBotAccount, g as isAccountConfigured, h as formatAllowFrom, i as matchesQQBotApprovalAccount, l as listQQBotAccountIds, m as describeAccount, n as isQQBotExecApprovalAuthorizedSender, o as shouldHandleQQBotExecApprovalRequest, p as applyAccountConfig, r as isQQBotExecApprovalClientEnabled, s as DEFAULT_ACCOUNT_ID$2, t as isQQBotExecApprovalApprover, u as resolveDefaultQQBotAccountId } from "./exec-approvals-ILWq0EPV.js";
import { t as getQQBotRuntime } from "./runtime-C1b9vHAC.js";
import { l as getQQBotDataPath, n as normalizeTarget, t as looksLikeQQBotTarget } from "./target-parser-BZG5a7rI.js";
import { getExecApprovalReplyMetadata } from "openclaw/plugin-sdk/approval-runtime";
import { buildSecretInputSchema } from "openclaw/plugin-sdk/secret-input";
import { createChannelApprovalCapability, splitChannelApprovalCapability } from "openclaw/plugin-sdk/approval-delivery-runtime";
import { createLazyChannelApprovalNativeRuntimeAdapter } from "openclaw/plugin-sdk/approval-handler-adapter-runtime";
import { resolveApprovalRequestSessionConversation } from "openclaw/plugin-sdk/approval-native-runtime";
import { normalizeOptionalString } from "openclaw/plugin-sdk/text-runtime";
import fs from "node:fs";
import { applyAccountNameToChannelSection, deleteAccountFromConfigSection, setAccountEnabledInConfigSection } from "openclaw/plugin-sdk/core";
import { DEFAULT_ACCOUNT_ID, createStandardChannelSetupStatus, setSetupChannelEnabled } from "openclaw/plugin-sdk/setup";
import { formatDocsLink } from "openclaw/plugin-sdk/setup-tools";
import { AllowFromListSchema, buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-schema";
import { z } from "zod";
import path from "node:path";
//#region extensions/qqbot/src/bridge/approval/capability.ts
/**
* QQ Bot Approval Capability — entry point.
*
* QQBot uses a simpler approval model than Telegram/Slack: any user who
* can see the inline-keyboard buttons can approve. No explicit approver
* list is required — the bot simply sends the approval message to the
* originating conversation and whoever clicks the button resolves it.
*
* When `execApprovals` IS configured, it gates which requests are
* handled natively and who is authorized.  When it is NOT configured,
* QQBot falls back to "always handle, anyone can approve".
*/
/**
* When `execApprovals` is configured, delegate to the profile-based
* check.  Otherwise fall back to target-resolvability plus the shared
* per-account ownership rule in `matchesQQBotApprovalAccount` so that
* each QQBot account handler only delivers approvals that originated
* from its own account (openids are account-scoped — cross-account
* delivery fails with 500 on the QQ Bot API).
*/
function shouldHandleRequest(params) {
	if (hasExecApprovalConfig(params)) return shouldHandleQQBotExecApprovalRequest(params);
	if (!canResolveTarget(params.request)) return false;
	return matchesQQBotApprovalAccount({
		cfg: params.cfg,
		accountId: params.accountId,
		request: params.request
	});
}
function hasExecApprovalConfig(params) {
	return resolveQQBotExecApprovalConfig(params) !== void 0;
}
function isNativeDeliveryEnabled(params) {
	if (hasExecApprovalConfig(params)) return isQQBotExecApprovalClientEnabled(params);
	const account = resolveQQBotAccount(params.cfg, params.accountId);
	return account.enabled && account.secretSource !== "none";
}
function canResolveTarget(request) {
	if (resolveApprovalTarget(request.request.sessionKey ?? null, request.request.turnSourceTo ?? null)) return true;
	return resolveApprovalRequestSessionConversation({
		request,
		channel: "qqbot",
		bundledFallback: true
	})?.id != null;
}
function createQQBotApprovalCapability() {
	return createChannelApprovalCapability({
		authorizeActorAction: ({ cfg, accountId, senderId, approvalKind }) => {
			if (hasExecApprovalConfig({
				cfg,
				accountId
			})) return (approvalKind === "plugin" ? isQQBotExecApprovalApprover({
				cfg,
				accountId,
				senderId
			}) : isQQBotExecApprovalAuthorizedSender({
				cfg,
				accountId,
				senderId
			})) ? { authorized: true } : {
				authorized: false,
				reason: "You are not authorized to approve this request."
			};
			return { authorized: true };
		},
		getActionAvailabilityState: ({ cfg, accountId }) => {
			return isNativeDeliveryEnabled({
				cfg,
				accountId
			}) ? { kind: "enabled" } : { kind: "disabled" };
		},
		getExecInitiatingSurfaceState: ({ cfg, accountId }) => {
			return isNativeDeliveryEnabled({
				cfg,
				accountId
			}) ? { kind: "enabled" } : { kind: "disabled" };
		},
		describeExecApprovalSetup: ({ accountId }) => {
			return `QQBot native exec approvals are enabled by default. To restrict who can approve, configure \`${accountId && accountId !== "default" ? `channels.qqbot.accounts.${accountId}` : "channels.qqbot"}.execApprovals.approvers\` with QQ user OpenIDs.`;
		},
		delivery: {
			hasConfiguredDmRoute: () => true,
			shouldSuppressForwardingFallback: (input) => {
				const channel = normalizeOptionalString(input.target?.channel);
				if (channel !== "qqbot") return false;
				const accountId = normalizeOptionalString(input.target?.accountId) ?? normalizeOptionalString(input.request?.request?.turnSourceAccountId);
				const result = isNativeDeliveryEnabled({
					cfg: input.cfg,
					accountId
				});
				getBridgeLogger().debug?.(`[qqbot:approval] shouldSuppressForwardingFallback channel=${channel} accountId=${accountId} → ${result}`);
				return result;
			}
		},
		native: {
			describeDeliveryCapabilities: ({ cfg, accountId }) => ({
				enabled: isNativeDeliveryEnabled({
					cfg,
					accountId
				}),
				preferredSurface: "origin",
				supportsOriginSurface: true,
				supportsApproverDmSurface: false,
				notifyOriginWhenDmOnly: false
			}),
			resolveOriginTarget: ({ request }) => {
				const target = resolveApprovalTarget(request.request.sessionKey ?? null, request.request.turnSourceTo ?? null);
				if (target) return { to: `${target.type}:${target.id}` };
				const sessionConversation = resolveApprovalRequestSessionConversation({
					request,
					channel: "qqbot",
					bundledFallback: true
				});
				if (sessionConversation?.id) return { to: `${sessionConversation.kind === "group" ? "group" : "c2c"}:${sessionConversation.id}` };
				return null;
			}
		},
		nativeRuntime: createLazyChannelApprovalNativeRuntimeAdapter({
			eventKinds: ["exec", "plugin"],
			isConfigured: ({ cfg, accountId }) => {
				const result = isNativeDeliveryEnabled({
					cfg,
					accountId
				});
				getBridgeLogger().debug?.(`[qqbot:approval] nativeRuntime.isConfigured accountId=${accountId} → ${result}`);
				return result;
			},
			shouldHandle: ({ cfg, accountId, request }) => {
				const result = shouldHandleRequest({
					cfg,
					accountId,
					request
				});
				getBridgeLogger().debug?.(`[qqbot:approval] nativeRuntime.shouldHandle accountId=${accountId} → ${result}`);
				return result;
			},
			load: async () => {
				ensurePlatformAdapter();
				return (await import("./handler-runtime-BGhCI3lI.js")).qqbotApprovalNativeRuntime;
			}
		})
	});
}
const qqbotApprovalCapability = createQQBotApprovalCapability();
splitChannelApprovalCapability(qqbotApprovalCapability);
let _cachedCapability;
function getQQBotApprovalCapability() {
	_cachedCapability ??= qqbotApprovalCapability;
	return _cachedCapability;
}
//#endregion
//#region extensions/qqbot/src/engine/config/setup-logic.ts
/**
* QQBot setup business logic (pure layer).
* QQBot setup 相关纯业务逻辑。
*
* Token parsing, input validation, and setup config application.
* All functions are framework-agnostic and operate on plain objects.
*/
/** Parse an inline "appId:clientSecret" token string. */
function parseInlineToken(token) {
	const colonIdx = token.indexOf(":");
	if (colonIdx <= 0 || colonIdx === token.length - 1) return null;
	const appId = token.slice(0, colonIdx).trim();
	const clientSecret = token.slice(colonIdx + 1).trim();
	if (!appId || !clientSecret) return null;
	return {
		appId,
		clientSecret
	};
}
/** Validate setup input for a QQBot account. Returns an error string or null. */
function validateSetupInput(accountId, input) {
	if (!input.token && !input.tokenFile && !input.useEnv) return "QQBot requires --token (format: appId:clientSecret) or --use-env";
	if (input.useEnv && accountId !== "default") return "QQBot --use-env only supports the default account";
	if (input.token && !parseInlineToken(input.token)) return "QQBot --token must be in appId:clientSecret format";
	return null;
}
/** Apply setup input to account config. Returns updated config. */
function applySetupAccountConfig(cfg, accountId, input) {
	if (input.useEnv && accountId !== "default") return cfg;
	let appId = "";
	let clientSecret = "";
	if (input.token) {
		const parsed = parseInlineToken(input.token);
		if (!parsed) return cfg;
		appId = parsed.appId;
		clientSecret = parsed.clientSecret;
	}
	if (!appId && !input.tokenFile && !input.useEnv) return cfg;
	return applyAccountConfig(cfg, accountId, {
		appId,
		clientSecret,
		clientSecretFile: input.tokenFile,
		name: input.name
	});
}
//#endregion
//#region extensions/qqbot/src/bridge/config-shared.ts
const qqbotMeta = {
	id: "qqbot",
	label: "QQ Bot",
	selectionLabel: "QQ Bot (Bot API)",
	docsPath: "/channels/qqbot",
	blurb: "Connect to QQ via official QQ Bot API",
	order: 50
};
function validateQQBotSetupInput(params) {
	return validateSetupInput(params.accountId, params.input);
}
function applyQQBotSetupAccountConfig(params) {
	return applySetupAccountConfig(params.cfg, params.accountId, params.input);
}
function isQQBotConfigured(account) {
	return isAccountConfigured(account);
}
function describeQQBotAccount(account) {
	return describeAccount(account);
}
function formatQQBotAllowFrom(params) {
	return formatAllowFrom(params.allowFrom);
}
const qqbotConfigAdapter = {
	listAccountIds: (cfg) => listQQBotAccountIds(cfg),
	resolveAccount: (cfg, accountId) => resolveQQBotAccount(cfg, accountId, { allowUnresolvedSecretRef: true }),
	defaultAccountId: (cfg) => resolveDefaultQQBotAccountId(cfg),
	setAccountEnabled: ({ cfg, accountId, enabled }) => setAccountEnabledInConfigSection({
		cfg,
		sectionKey: "qqbot",
		accountId,
		enabled,
		allowTopLevel: true
	}),
	deleteAccount: ({ cfg, accountId }) => deleteAccountFromConfigSection({
		cfg,
		sectionKey: "qqbot",
		accountId,
		clearBaseFields: [
			"appId",
			"clientSecret",
			"clientSecretFile",
			"name"
		]
	}),
	isConfigured: isQQBotConfigured,
	describeAccount: describeQQBotAccount,
	resolveAllowFrom: ({ cfg, accountId }) => resolveQQBotAccount(cfg, accountId, { allowUnresolvedSecretRef: true }).config?.allowFrom,
	formatAllowFrom: ({ allowFrom }) => formatQQBotAllowFrom({ allowFrom })
};
const qqbotSetupAdapterShared = {
	resolveAccountId: ({ cfg, accountId }) => normalizeLowercaseStringOrEmpty$1(accountId) || resolveDefaultQQBotAccountId(cfg),
	applyAccountName: ({ cfg, accountId, name }) => applyAccountNameToChannelSection({
		cfg,
		channelKey: "qqbot",
		accountId,
		name
	}),
	validateInput: ({ accountId, input }) => validateQQBotSetupInput({
		accountId,
		input
	}),
	applyAccountConfig: ({ cfg, accountId, input }) => applyQQBotSetupAccountConfig({
		cfg,
		accountId,
		input
	})
};
//#endregion
//#region extensions/qqbot/src/bridge/setup/finalize.ts
function isQQBotAccountConfigured(cfg, accountId) {
	const account = resolveQQBotAccount(cfg, accountId, { allowUnresolvedSecretRef: true });
	return Boolean(account.appId && account.clientSecret);
}
async function linkViaQrCode(params) {
	try {
		const { qrConnect } = await import("@tencent-connect/qqbot-connector");
		const accounts = await qrConnect({ source: "openclaw" });
		if (accounts.length === 0) {
			await params.prompter.note("未获取到任何 QQ Bot 账号信息。", "QQ Bot");
			return params.cfg;
		}
		let next = params.cfg;
		for (let i = 0; i < accounts.length; i++) {
			const { appId, appSecret } = accounts[i];
			const targetAccountId = i === 0 ? params.accountId : appId;
			next = applyQQBotAccountConfig(next, targetAccountId, {
				appId,
				clientSecret: appSecret
			});
		}
		if (accounts.length === 1) params.runtime.log(`✔ QQ Bot 绑定成功！(AppID: ${accounts[0].appId})`);
		else {
			const idList = accounts.map((a) => a.appId).join(", ");
			params.runtime.log(`✔ ${accounts.length} 个 QQ Bot 绑定成功！(AppID: ${idList})`);
		}
		return next;
	} catch (error) {
		params.runtime.error(`QQ Bot 绑定失败: ${String(error)}`);
		await params.prompter.note(["绑定失败，您可以稍后手动配置。", `文档: ${formatDocsLink("/channels/qqbot", "qqbot")}`].join("\n"), "QQ Bot");
		return params.cfg;
	}
}
async function linkViaManualInput(params) {
	const appId = await params.prompter.text({
		message: "请输入 QQ Bot AppID",
		validate: (value) => value.trim() ? void 0 : "AppID 不能为空"
	});
	const appSecret = await params.prompter.text({
		message: "请输入 QQ Bot AppSecret",
		validate: (value) => value.trim() ? void 0 : "AppSecret 不能为空"
	});
	const next = applyQQBotAccountConfig(params.cfg, params.accountId, {
		appId: appId.trim(),
		clientSecret: appSecret.trim()
	});
	await params.prompter.note("✔ QQ Bot 配置完成！", "QQ Bot");
	return next;
}
async function finalizeQQBotSetup(params) {
	const accountId = params.accountId.trim() || DEFAULT_ACCOUNT_ID;
	let next = params.cfg;
	const configured = isQQBotAccountConfigured(next, accountId);
	const mode = await params.prompter.select({
		message: configured ? "QQ 已绑定，选择操作" : "选择 QQ 绑定方式",
		options: [
			{
				value: "qr",
				label: "扫码绑定（推荐）",
				hint: "使用 QQ 扫描二维码自动完成绑定"
			},
			{
				value: "manual",
				label: "手动输入 QQ Bot AppID 和 AppSecret",
				hint: "需到 QQ 开放平台 q.qq.com 查看"
			},
			{
				value: "skip",
				label: configured ? "保持当前配置" : "稍后配置"
			}
		]
	});
	if (mode === "qr") next = await linkViaQrCode({
		cfg: next,
		accountId,
		prompter: params.prompter,
		runtime: params.runtime
	});
	else if (mode === "manual") next = await linkViaManualInput({
		cfg: next,
		accountId,
		prompter: params.prompter
	});
	else if (!configured) await params.prompter.note(["您可以稍后运行以下命令重新选择 QQ Bot 进行配置：", "  openclaw channels add"].join("\n"), "QQ Bot");
	return { cfg: next };
}
//#endregion
//#region extensions/qqbot/src/bridge/setup/surface.ts
const channel = "qqbot";
const qqbotSetupWizard = {
	channel,
	status: createStandardChannelSetupStatus({
		channelLabel: "QQ Bot",
		configuredLabel: "configured",
		unconfiguredLabel: "needs AppID + AppSercet",
		configuredHint: "configured",
		unconfiguredHint: "needs AppID + AppSercet",
		configuredScore: 1,
		unconfiguredScore: 6,
		resolveConfigured: ({ cfg, accountId }) => (accountId ? [accountId] : listQQBotAccountIds(cfg)).some((resolvedAccountId) => {
			return isAccountConfigured(resolveQQBotAccount(cfg, resolvedAccountId, { allowUnresolvedSecretRef: true }));
		})
	}),
	credentials: [],
	finalize: async ({ cfg, accountId, forceAllowFrom, prompter, runtime }) => await finalizeQQBotSetup({
		cfg,
		accountId,
		forceAllowFrom,
		prompter,
		runtime
	}),
	disable: (cfg) => setSetupChannelEnabled(cfg, channel, false)
};
//#endregion
//#region extensions/qqbot/src/config-schema.ts
const AudioFormatPolicySchema = z.object({
	sttDirectFormats: z.array(z.string()).optional(),
	uploadDirectFormats: z.array(z.string()).optional(),
	transcodeEnabled: z.boolean().optional()
}).optional();
const QQBotSttSchema = z.object({
	enabled: z.boolean().optional(),
	provider: z.string().optional(),
	baseUrl: z.string().optional(),
	apiKey: z.string().optional(),
	model: z.string().optional()
}).strict().optional();
const QQBotStreamingSchema = z.union([z.boolean(), z.object({ mode: z.enum(["off", "partial"]).default("partial") }).passthrough()]).optional();
const QQBotExecApprovalsSchema = z.object({
	enabled: z.union([z.boolean(), z.literal("auto")]).optional(),
	approvers: z.array(z.string()).optional(),
	agentFilter: z.array(z.string()).optional(),
	sessionFilter: z.array(z.string()).optional(),
	target: z.enum([
		"dm",
		"channel",
		"both"
	]).optional()
}).strict().optional();
const QQBotDmPolicySchema = z.enum([
	"open",
	"allowlist",
	"disabled"
]).optional();
const QQBotGroupPolicySchema = z.enum([
	"open",
	"allowlist",
	"disabled"
]).optional();
const QQBotAccountSchema = z.object({
	enabled: z.boolean().optional(),
	name: z.string().optional(),
	appId: z.string().optional(),
	clientSecret: buildSecretInputSchema().optional(),
	clientSecretFile: z.string().optional(),
	allowFrom: AllowFromListSchema,
	groupAllowFrom: AllowFromListSchema,
	dmPolicy: QQBotDmPolicySchema,
	groupPolicy: QQBotGroupPolicySchema,
	systemPrompt: z.string().optional(),
	markdownSupport: z.boolean().optional(),
	voiceDirectUploadFormats: z.array(z.string()).optional(),
	audioFormatPolicy: AudioFormatPolicySchema,
	urlDirectUpload: z.boolean().optional(),
	upgradeUrl: z.string().optional(),
	upgradeMode: z.enum(["doc", "hot-reload"]).optional(),
	streaming: QQBotStreamingSchema,
	execApprovals: QQBotExecApprovalsSchema
}).passthrough();
const qqbotChannelConfigSchema = buildChannelConfigSchema(QQBotAccountSchema.extend({
	stt: QQBotSttSchema,
	accounts: z.object({}).catchall(QQBotAccountSchema.passthrough()).optional(),
	defaultAccount: z.string().optional()
}).passthrough());
//#endregion
//#region extensions/qqbot/src/engine/utils/data-paths.ts
/**
* Centralised filename helpers for persisted QQBot state.
*
* Every persistence module routes file paths through these helpers so the
* naming convention stays in sync and legacy migrations are handled
* consistently.
*
* Key design decisions:
* - Credential backup is keyed only by `accountId` because recovery runs
*   exactly when the appId is missing from config.
*/
/**
* Normalise an identifier so it is safe to embed in a filename.
* Keeps alphanumerics, dot, underscore, dash; everything else becomes `_`.
*/
function safeName(id) {
	return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}
/**
* Per-accountId credential backup file. Not keyed by appId because the
* whole point of this file is to recover credentials when appId is
* missing from the live config.
*/
function getCredentialBackupFile(accountId) {
	return path.join(getQQBotDataPath("data"), `credential-backup-${safeName(accountId)}.json`);
}
/** Legacy single-file credential backup (pre-multi-account-isolation). */
function getLegacyCredentialBackupFile() {
	return path.join(getQQBotDataPath("data"), "credential-backup.json");
}
//#endregion
//#region extensions/qqbot/src/engine/config/credential-backup.ts
/**
* Credential backup & recovery.
* 凭证暂存与恢复。
*
* Solves the "hot-upgrade interrupted, appId/secret vanished from
* openclaw.json" failure mode.
*
* Mechanics:
*   - After each successful gateway start we snapshot the currently
*     resolved `appId` / `clientSecret` to a per-account backup file.
*   - During plugin startup, if the live config has an empty appId or
*     secret, the gateway consults the backup and restores the values
*     via `writeConfigFile`.
*   - Backups live under `~/.openclaw/qqbot/data/` so they survive
*     plugin directory replacement.
*
* Safety notes:
*   - Only restore when credentials are **actually empty** — never
*     overwrite a user's intentional config change.
*   - Atomic write (temp file + rename) to avoid torn files.
*   - Per-account file: `credential-backup-<accountId>.json`. We do
*     **not** also key by appId because recovery happens precisely
*     when appId is unknown.
*   - Legacy single `credential-backup.json` is migrated automatically
*     when the stored accountId matches the caller.
*/
/** Persist a credential snapshot (called once gateway reaches READY). */
function saveCredentialBackup(accountId, appId, clientSecret) {
	if (!appId || !clientSecret) return;
	try {
		const backupPath = getCredentialBackupFile(accountId);
		fs.mkdirSync(path.dirname(backupPath), { recursive: true });
		const data = {
			accountId,
			appId,
			clientSecret,
			savedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		const tmpPath = `${backupPath}.tmp`;
		fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
		fs.renameSync(tmpPath, backupPath);
	} catch {}
}
/**
* Load a credential snapshot for `accountId`.
*
* Consults the new per-account file first; falls back to the legacy
* global backup file and migrates it when the embedded `accountId`
* matches the request. Returns `null` when no usable backup exists.
*/
function loadCredentialBackup(accountId) {
	try {
		if (accountId) {
			const newPath = getCredentialBackupFile(accountId);
			if (fs.existsSync(newPath)) {
				const data = JSON.parse(fs.readFileSync(newPath, "utf8"));
				if (data?.appId && data.clientSecret) return data;
			}
		}
		const legacy = getLegacyCredentialBackupFile();
		if (fs.existsSync(legacy)) {
			const data = JSON.parse(fs.readFileSync(legacy, "utf8"));
			if (!data?.appId || !data?.clientSecret) return null;
			if (accountId && data.accountId !== accountId) return null;
			if (data.accountId) try {
				const backupPath = getCredentialBackupFile(data.accountId);
				fs.mkdirSync(path.dirname(backupPath), { recursive: true });
				const tmpPath = `${backupPath}.tmp`;
				fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
				fs.renameSync(tmpPath, backupPath);
				fs.unlinkSync(legacy);
			} catch {}
			return data;
		}
	} catch {}
	return null;
}
//#endregion
//#region extensions/qqbot/src/engine/config/credentials.ts
/**
* QQBot credential management (pure logic layer).
* QQBot 凭证管理（纯逻辑层）。
*
* Credential clearing and field-level cleanup for logout and setup
* flows. All functions operate on plain objects (Record<string, unknown>)
* and stay framework-agnostic.
*/
/**
* Remove clientSecret / clientSecretFile from a QQBot account config.
*
* Returns a shallow-cloned config with credentials removed, plus flags
* indicating whether anything actually changed.
*/
function clearAccountCredentials(cfg, accountId) {
	const nextCfg = { ...cfg };
	const channels = asOptionalObjectRecord(cfg.channels);
	const nextQQBot = channels?.qqbot ? { ...asOptionalObjectRecord(channels.qqbot) } : void 0;
	let cleared = false;
	let changed = false;
	if (nextQQBot) {
		const qqbot = nextQQBot;
		if (accountId === "default") {
			if (qqbot.clientSecret) {
				delete qqbot.clientSecret;
				cleared = true;
				changed = true;
			}
			if (qqbot.clientSecretFile) {
				delete qqbot.clientSecretFile;
				cleared = true;
				changed = true;
			}
		}
		const accounts = qqbot.accounts;
		if (accounts && accountId in accounts) {
			const entry = accounts[accountId];
			if (entry && "clientSecret" in entry) {
				delete entry.clientSecret;
				cleared = true;
				changed = true;
			}
			if (entry && "clientSecretFile" in entry) {
				delete entry.clientSecretFile;
				cleared = true;
				changed = true;
			}
			if (entry && Object.keys(entry).length === 0) {
				delete accounts[accountId];
				changed = true;
			}
		}
	}
	if (changed && nextQQBot) nextCfg.channels = {
		...channels,
		qqbot: nextQQBot
	};
	return {
		nextCfg,
		cleared,
		changed
	};
}
//#endregion
//#region extensions/qqbot/src/channel.ts
let _gatewayModulePromise;
function loadGatewayModule() {
	_gatewayModulePromise ??= import("./gateway-DeqwEpyi.js");
	return _gatewayModulePromise;
}
const EXEC_APPROVAL_COMMAND_RE = /\/approve(?:@[^\s]+)?\s+[A-Za-z0-9][A-Za-z0-9._:-]*\s+(?:allow-once|allow-always|always|deny)\b/i;
function shouldSuppressLocalQQBotApprovalPrompt(params) {
	if (params.hint?.kind !== "approval-pending" || params.hint.approvalKind !== "exec") return false;
	const account = resolveQQBotAccount(params.cfg, params.accountId);
	if (!account.enabled || account.secretSource === "none") return false;
	if (getExecApprovalReplyMetadata(params.payload)) return true;
	const text = typeof params.payload.text === "string" ? params.payload.text : "";
	return EXEC_APPROVAL_COMMAND_RE.test(text);
}
const qqbotPlugin = {
	id: "qqbot",
	setupWizard: qqbotSetupWizard,
	meta: { ...qqbotMeta },
	capabilities: {
		chatTypes: ["direct", "group"],
		media: true,
		reactions: false,
		threads: false,
		blockStreaming: true
	},
	reload: { configPrefixes: ["channels.qqbot"] },
	configSchema: qqbotChannelConfigSchema,
	config: {
		...qqbotConfigAdapter,
		isConfigured: (account) => {
			if (qqbotConfigAdapter.isConfigured(account)) return true;
			if (!account) return false;
			const backup = loadCredentialBackup(account.accountId);
			return Boolean(backup?.appId && backup?.clientSecret);
		}
	},
	setup: { ...qqbotSetupAdapterShared },
	approvalCapability: getQQBotApprovalCapability(),
	messaging: {
		normalizeTarget,
		targetResolver: {
			looksLikeId: looksLikeQQBotTarget,
			hint: "QQ Bot target format: qqbot:c2c:openid (direct) or qqbot:group:groupid (group)"
		}
	},
	outbound: {
		deliveryMode: "direct",
		chunker: (text, limit) => getQQBotRuntime().channel.text.chunkMarkdownText(text, limit),
		chunkerMode: "markdown",
		textChunkLimit: 5e3,
		shouldSuppressLocalPayloadPrompt: ({ cfg, accountId, payload, hint }) => shouldSuppressLocalQQBotApprovalPrompt({
			cfg,
			accountId,
			payload,
			hint
		}),
		sendText: async ({ to, text, accountId, replyToId, cfg }) => {
			await loadGatewayModule();
			const account = resolveQQBotAccount(cfg, accountId);
			const { sendText } = await import("./outbound-kOuVQX8d.js").then((n) => n.i);
			const result = await sendText({
				to,
				text,
				accountId,
				replyToId,
				account
			});
			return {
				channel: "qqbot",
				messageId: result.messageId ?? "",
				meta: result.error ? { error: result.error } : void 0
			};
		},
		sendMedia: async ({ to, text, mediaUrl, accountId, replyToId, cfg }) => {
			await loadGatewayModule();
			const account = resolveQQBotAccount(cfg, accountId);
			const { sendMedia } = await import("./outbound-kOuVQX8d.js").then((n) => n.i);
			const result = await sendMedia({
				to,
				text: text ?? "",
				mediaUrl: mediaUrl ?? "",
				accountId,
				replyToId,
				account
			});
			return {
				channel: "qqbot",
				messageId: result.messageId ?? "",
				meta: result.error ? { error: result.error } : void 0
			};
		}
	},
	gateway: {
		startAccount: async (ctx) => {
			let { account, cfg } = ctx;
			const { abortSignal, log } = ctx;
			if (!account.appId || !account.clientSecret) {
				const backup = loadCredentialBackup(account.accountId);
				if (backup?.appId && backup?.clientSecret) try {
					const nextCfg = applyQQBotAccountConfig(cfg, account.accountId, {
						appId: backup.appId,
						clientSecret: backup.clientSecret
					});
					await getQQBotRuntime().config.writeConfigFile(nextCfg);
					cfg = nextCfg;
					account = resolveQQBotAccount(nextCfg, account.accountId);
					log?.info(`[qqbot:${account.accountId}] Restored credentials from backup (appId=${account.appId})`);
				} catch (err) {
					log?.error(`[qqbot:${account.accountId}] Failed to restore credentials from backup: ${err instanceof Error ? err.message : String(err)}`);
				}
			}
			const { startGateway } = await loadGatewayModule();
			log?.info(`[qqbot:${account.accountId}] Starting gateway — appId=${account.appId}, enabled=${account.enabled}, name=${account.name ?? "unnamed"}`);
			await startGateway({
				account,
				abortSignal,
				cfg,
				log,
				channelRuntime: ctx.channelRuntime,
				onReady: () => {
					log?.info(`[qqbot:${account.accountId}] Gateway ready`);
					ctx.setStatus({
						...ctx.getStatus(),
						running: true,
						connected: true,
						lastConnectedAt: Date.now()
					});
					if (account.appId && account.clientSecret) saveCredentialBackup(account.accountId, account.appId, account.clientSecret);
				},
				onResumed: () => {
					log?.info(`[qqbot:${account.accountId}] Gateway resumed`);
					ctx.setStatus({
						...ctx.getStatus(),
						running: true,
						connected: true,
						lastConnectedAt: Date.now()
					});
					if (account.appId && account.clientSecret) saveCredentialBackup(account.accountId, account.appId, account.clientSecret);
				},
				onError: (error) => {
					log?.error(`[qqbot:${account.accountId}] Gateway error: ${error.message}`);
					ctx.setStatus({
						...ctx.getStatus(),
						lastError: error.message
					});
				}
			});
		},
		logoutAccount: async ({ accountId, cfg }) => {
			const { nextCfg, cleared, changed } = clearAccountCredentials(cfg, accountId);
			if (changed) await getQQBotRuntime().config.writeConfigFile(nextCfg);
			const loggedOut = resolveQQBotAccount(changed ? nextCfg : cfg, accountId).secretSource === "none";
			return {
				ok: true,
				cleared,
				envToken: Boolean(process.env.QQBOT_CLIENT_SECRET),
				loggedOut
			};
		}
	},
	status: {
		defaultRuntime: {
			accountId: DEFAULT_ACCOUNT_ID$2,
			running: false,
			connected: false,
			lastConnectedAt: null,
			lastError: null,
			lastInboundAt: null,
			lastOutboundAt: null
		},
		buildChannelSummary: ({ snapshot }) => ({
			configured: snapshot.configured ?? false,
			tokenSource: snapshot.tokenSource ?? "none",
			running: snapshot.running ?? false,
			connected: snapshot.connected ?? false,
			lastConnectedAt: snapshot.lastConnectedAt ?? null,
			lastError: snapshot.lastError ?? null
		}),
		buildAccountSnapshot: ({ account, runtime }) => ({
			accountId: account?.accountId ?? DEFAULT_ACCOUNT_ID$2,
			name: account?.name,
			enabled: account?.enabled ?? false,
			configured: Boolean(account?.appId && account?.clientSecret),
			tokenSource: account?.secretSource,
			running: runtime?.running ?? false,
			connected: runtime?.connected ?? false,
			lastConnectedAt: runtime?.lastConnectedAt ?? null,
			lastError: runtime?.lastError ?? null,
			lastInboundAt: runtime?.lastInboundAt ?? null,
			lastOutboundAt: runtime?.lastOutboundAt ?? null
		})
	}
};
//#endregion
export { qqbotMeta as a, qqbotConfigAdapter as i, qqbotChannelConfigSchema as n, qqbotSetupAdapterShared as o, qqbotSetupWizard as r, qqbotPlugin as t };
