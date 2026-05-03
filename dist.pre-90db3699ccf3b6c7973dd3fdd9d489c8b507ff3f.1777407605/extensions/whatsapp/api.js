import { n as __reExport, t as __exportAll } from "./rolldown-runtime-RkAeH_Qm.js";
import { a as markdownToWhatsApp, c as DEFAULT_WHATSAPP_MEDIA_MAX_MB, d as listWhatsAppAccountIds, f as listWhatsAppAuthDirs, g as resolveWhatsAppMediaMaxBytes, h as resolveWhatsAppAuthDir, i as jidToE164, l as hasAnyWhatsAppAuth, m as resolveWhatsAppAccount, n as assertWebChannel, o as resolveJidToE164, p as resolveDefaultWhatsAppAccountId, r as isSelfChatMode, s as toWhatsappJid, t as text_runtime_exports, u as listEnabledWhatsAppAccounts } from "./text-runtime-pSZYjiCV.js";
import { a as normalizeWhatsAppMessagingTarget, i as normalizeWhatsAppAllowFromEntries, n as isWhatsAppUserTarget, o as normalizeWhatsAppTarget, r as looksLikeWhatsAppTargetId, t as isWhatsAppGroupJid } from "./normalize-target-786yB1mC.js";
import { t as resolveWhatsAppOutboundTarget } from "./resolve-outbound-target-Cywu0htE.js";
import { t as whatsappPlugin } from "./channel-CSP1jOJK.js";
import { t as WHATSAPP_LEGACY_OUTBOUND_SEND_DEP_KEYS } from "./outbound-send-deps-DYLgiJmX.js";
import { t as whatsappCommandPolicy } from "./command-policy-BFYuIAgc.js";
import { n as resolveWhatsAppGroupToolPolicy, r as resolveWhatsAppGroupIntroHint, t as resolveWhatsAppGroupRequireMention } from "./group-policy-CaP7ZA2D.js";
import { t as whatsappSetupPlugin } from "./channel.setup-CIXuknof.js";
import { t as DEFAULT_WEB_MEDIA_BYTES } from "./constants-DLuP4vWr.js";
import { n as listWhatsAppDirectoryGroupsFromConfig, r as listWhatsAppDirectoryPeersFromConfig } from "./directory-config-D-47LxeO.js";
import "./runtime-api-BI2Agd00.js";
import { t as __testing } from "./access-control-CNmzwKT9.js";
export * from "openclaw/plugin-sdk/text-runtime";
__reExport(/* @__PURE__ */ __exportAll({
	DEFAULT_WEB_MEDIA_BYTES: () => DEFAULT_WEB_MEDIA_BYTES,
	DEFAULT_WHATSAPP_MEDIA_MAX_MB: () => 50,
	WHATSAPP_LEGACY_OUTBOUND_SEND_DEP_KEYS: () => WHATSAPP_LEGACY_OUTBOUND_SEND_DEP_KEYS,
	assertWebChannel: () => assertWebChannel,
	hasAnyWhatsAppAuth: () => hasAnyWhatsAppAuth,
	isSelfChatMode: () => isSelfChatMode,
	isWhatsAppGroupJid: () => isWhatsAppGroupJid,
	isWhatsAppUserTarget: () => isWhatsAppUserTarget,
	jidToE164: () => jidToE164,
	listEnabledWhatsAppAccounts: () => listEnabledWhatsAppAccounts,
	listWhatsAppAccountIds: () => listWhatsAppAccountIds,
	listWhatsAppAuthDirs: () => listWhatsAppAuthDirs,
	listWhatsAppDirectoryGroupsFromConfig: () => listWhatsAppDirectoryGroupsFromConfig,
	listWhatsAppDirectoryPeersFromConfig: () => listWhatsAppDirectoryPeersFromConfig,
	looksLikeWhatsAppTargetId: () => looksLikeWhatsAppTargetId,
	markdownToWhatsApp: () => markdownToWhatsApp,
	normalizeWhatsAppAllowFromEntries: () => normalizeWhatsAppAllowFromEntries,
	normalizeWhatsAppMessagingTarget: () => normalizeWhatsAppMessagingTarget,
	normalizeWhatsAppTarget: () => normalizeWhatsAppTarget,
	resolveDefaultWhatsAppAccountId: () => resolveDefaultWhatsAppAccountId,
	resolveJidToE164: () => resolveJidToE164,
	resolveWhatsAppAccount: () => resolveWhatsAppAccount,
	resolveWhatsAppAuthDir: () => resolveWhatsAppAuthDir,
	resolveWhatsAppGroupIntroHint: () => resolveWhatsAppGroupIntroHint,
	resolveWhatsAppGroupRequireMention: () => resolveWhatsAppGroupRequireMention,
	resolveWhatsAppGroupToolPolicy: () => resolveWhatsAppGroupToolPolicy,
	resolveWhatsAppMediaMaxBytes: () => resolveWhatsAppMediaMaxBytes,
	resolveWhatsAppOutboundTarget: () => resolveWhatsAppOutboundTarget,
	toWhatsappJid: () => toWhatsappJid,
	whatsappAccessControlTesting: () => __testing,
	whatsappCommandPolicy: () => whatsappCommandPolicy,
	whatsappPlugin: () => whatsappPlugin,
	whatsappSetupPlugin: () => whatsappSetupPlugin
}), text_runtime_exports);
//#endregion
export { DEFAULT_WEB_MEDIA_BYTES, DEFAULT_WHATSAPP_MEDIA_MAX_MB, WHATSAPP_LEGACY_OUTBOUND_SEND_DEP_KEYS, assertWebChannel, hasAnyWhatsAppAuth, isSelfChatMode, isWhatsAppGroupJid, isWhatsAppUserTarget, jidToE164, listEnabledWhatsAppAccounts, listWhatsAppAccountIds, listWhatsAppAuthDirs, listWhatsAppDirectoryGroupsFromConfig, listWhatsAppDirectoryPeersFromConfig, looksLikeWhatsAppTargetId, markdownToWhatsApp, normalizeWhatsAppAllowFromEntries, normalizeWhatsAppMessagingTarget, normalizeWhatsAppTarget, resolveDefaultWhatsAppAccountId, resolveJidToE164, resolveWhatsAppAccount, resolveWhatsAppAuthDir, resolveWhatsAppGroupIntroHint, resolveWhatsAppGroupRequireMention, resolveWhatsAppGroupToolPolicy, resolveWhatsAppMediaMaxBytes, resolveWhatsAppOutboundTarget, toWhatsappJid, __testing as whatsappAccessControlTesting, whatsappCommandPolicy, whatsappPlugin, whatsappSetupPlugin };
