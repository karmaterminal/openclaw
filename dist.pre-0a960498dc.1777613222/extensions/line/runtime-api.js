import { a as normalizeLowercaseStringOrEmpty } from "../../string-coerce-C1IzJjqi.js";
import { t as formatDocsLink } from "../../links-BtCHUQX8.js";
import { r as logVerbose } from "../../globals-BMZFdRyi.js";
import { r as buildChannelConfigSchema } from "../../config-schema-OPypi1r3.js";
import { t as DEFAULT_ACCOUNT_ID } from "../../account-id-C3j_3_su.js";
import { t as clearAccountEntryFields } from "../../config-helpers-xGgW25ph.js";
import { r as stripMarkdown } from "../../text-runtime-BK-9rIrb.js";
import "../../core-C1EU-l7z.js";
import { t as firstDefined } from "../../allow-from-CBb-vZYD.js";
import "../../channel-config-schema-7ArgWb3n.js";
import { J as setSetupChannelEnabled, Q as splitSetupEntries } from "../../setup-wizard-helpers-xYUM67Xd.js";
import { o as buildTokenChannelStatusSummary, r as buildComputedAccountStatusSnapshot } from "../../status-helpers-C2uknUoo.js";
import "../../runtime-env-CngwFFDM.js";
import "../../setup-CNPAlM7z.js";
import { i as resolveLineAccount, n as normalizeAccountId, r as resolveDefaultLineAccountId, t as listLineAccountIds } from "../../accounts-C5w71lhz.js";
import { i as resolveLineGroupsConfig, n as resolveLineGroupConfigEntry, r as resolveLineGroupLookupIds, t as resolveExactLineGroupConfigKey } from "../../group-keys-BCARjKdi.js";
import { a as createMediaPlayerCard, c as LineChannelConfigSchema, i as createDeviceControlCard, l as LineConfigSchema, n as parseLineDirectives, r as createAppleTvRemoteCard, s as setLineRuntime, t as hasLineDirectives } from "../../reply-payload-transform-D-6iyN83.js";
import { n as createEventCard, r as createReceiptCard, t as createAgendaCard } from "../../schedule-cards-tUKOhzKe.js";
import { a as createListCard, i as createInfoCard, n as createCarousel, o as createNotificationBubble, r as createImageCard, t as createActionCard } from "../../basic-cards-BMj9Tu52.js";
import { A as createButtonMenu, B as datetimePickerAction, C as pushTemplateMessage, D as showLoadingAnimation, E as sendMessageLine, F as createImageCarouselColumn, H as postbackAction, I as createLinkMenu, L as createProductCarousel, M as createCarouselColumn, N as createConfirmTemplate, O as resolveLineChannelAccessToken, P as createImageCarousel, R as createTemplateCarousel, S as pushMessagesLine, T as replyMessageLine, U as uriAction, V as messageAction, W as toFlexMessage, _ as getUserProfile, a as extractLinks, b as pushLocationMessage, c as processLineMessage, d as createImageMessage, f as createLocationMessage, g as getUserDisplayName, h as createVideoMessage, i as extractCodeBlocks, j as createButtonTemplate, k as buildTemplateMessageFromPayload, l as createAudioMessage, m as createTextMessageWithQuickReplies, n as convertLinksToFlexBubble, o as extractMarkdownTables, p as createQuickReplyItems, r as convertTableToFlexBubble, s as hasMarkdownToConvert, t as convertCodeBlockToFlexBubble, u as createFlexMessage, v as pushFlexMessage, w as pushTextMessageWithQuickReplies, x as pushMessageLine, y as pushImageMessage, z as createYesNoConfirm } from "../../markdown-to-line-CD45ng91.js";
import { a as startLineWebhook, c as downloadLineMedia, d as normalizeAllowFrom, f as normalizeDmAllowFromWithStore, i as createLineWebhookMiddleware, l as MessagingApiBlobClient, n as createLineNodeWebhookHandler, o as parseLineWebhookBody, r as readLineWebhookRequestBody, s as validateLineSignature, t as monitorLineProvider, u as isSenderAllowed } from "../../monitor-p6N3EIld.js";
import { t as MessagingApiClient } from "../../messagingApiClient-s6UYf7aZ.js";
import { t as probeLineBot } from "../../probe-CNjxoYty.js";
import { readFile } from "node:fs/promises";
//#region extensions/line/src/rich-menu.ts
const USER_BATCH_SIZE = 500;
function getClient(opts) {
	const account = resolveLineAccount({
		cfg: opts.cfg,
		accountId: opts.accountId
	});
	return new MessagingApiClient({ channelAccessToken: resolveLineChannelAccessToken(opts.channelAccessToken, account) });
}
function getBlobClient(opts) {
	const account = resolveLineAccount({
		cfg: opts.cfg,
		accountId: opts.accountId
	});
	return new MessagingApiBlobClient({ channelAccessToken: resolveLineChannelAccessToken(opts.channelAccessToken, account) });
}
function chunkUserIds(userIds) {
	const batches = [];
	for (let i = 0; i < userIds.length; i += USER_BATCH_SIZE) batches.push(userIds.slice(i, i + USER_BATCH_SIZE));
	return batches;
}
async function createRichMenu(menu, opts) {
	const client = getClient(opts);
	const richMenuRequest = {
		size: menu.size,
		selected: menu.selected ?? false,
		name: menu.name.slice(0, 300),
		chatBarText: menu.chatBarText.slice(0, 14),
		areas: menu.areas
	};
	const response = await client.createRichMenu(richMenuRequest);
	if (opts.verbose) logVerbose(`line: created rich menu ${response.richMenuId}`);
	return response.richMenuId;
}
async function uploadRichMenuImage(richMenuId, imagePath, opts) {
	const blobClient = getBlobClient(opts);
	const imageData = await readFile(imagePath);
	const contentType = normalizeLowercaseStringOrEmpty(imagePath).endsWith(".png") ? "image/png" : "image/jpeg";
	await blobClient.setRichMenuImage(richMenuId, new Blob([imageData], { type: contentType }));
	if (opts.verbose) logVerbose(`line: uploaded image to rich menu ${richMenuId}`);
}
async function setDefaultRichMenu(richMenuId, opts) {
	await getClient(opts).setDefaultRichMenu(richMenuId);
	if (opts.verbose) logVerbose(`line: set default rich menu to ${richMenuId}`);
}
async function cancelDefaultRichMenu(opts) {
	await getClient(opts).cancelDefaultRichMenu();
	if (opts.verbose) logVerbose("line: cancelled default rich menu");
}
async function getDefaultRichMenuId(opts) {
	const client = getClient(opts);
	try {
		return (await client.getDefaultRichMenuId()).richMenuId ?? null;
	} catch {
		return null;
	}
}
async function linkRichMenuToUser(userId, richMenuId, opts) {
	await getClient(opts).linkRichMenuIdToUser(userId, richMenuId);
	if (opts.verbose) logVerbose(`line: linked rich menu ${richMenuId} to user ${userId}`);
}
async function linkRichMenuToUsers(userIds, richMenuId, opts) {
	const client = getClient(opts);
	for (const batch of chunkUserIds(userIds)) await client.linkRichMenuIdToUsers({
		richMenuId,
		userIds: batch
	});
	if (opts.verbose) logVerbose(`line: linked rich menu ${richMenuId} to ${userIds.length} users`);
}
async function unlinkRichMenuFromUser(userId, opts) {
	await getClient(opts).unlinkRichMenuIdFromUser(userId);
	if (opts.verbose) logVerbose(`line: unlinked rich menu from user ${userId}`);
}
async function unlinkRichMenuFromUsers(userIds, opts) {
	const client = getClient(opts);
	for (const batch of chunkUserIds(userIds)) await client.unlinkRichMenuIdFromUsers({ userIds: batch });
	if (opts.verbose) logVerbose(`line: unlinked rich menu from ${userIds.length} users`);
}
async function getRichMenuIdOfUser(userId, opts) {
	const client = getClient(opts);
	try {
		return (await client.getRichMenuIdOfUser(userId)).richMenuId ?? null;
	} catch {
		return null;
	}
}
async function getRichMenuList(opts) {
	return (await getClient(opts).getRichMenuList()).richmenus ?? [];
}
async function getRichMenu(richMenuId, opts) {
	const client = getClient(opts);
	try {
		return await client.getRichMenu(richMenuId);
	} catch {
		return null;
	}
}
async function deleteRichMenu(richMenuId, opts) {
	await getClient(opts).deleteRichMenu(richMenuId);
	if (opts.verbose) logVerbose(`line: deleted rich menu ${richMenuId}`);
}
async function createRichMenuAlias(richMenuId, aliasId, opts) {
	await getClient(opts).createRichMenuAlias({
		richMenuId,
		richMenuAliasId: aliasId
	});
	if (opts.verbose) logVerbose(`line: created alias ${aliasId} for rich menu ${richMenuId}`);
}
async function deleteRichMenuAlias(aliasId, opts) {
	await getClient(opts).deleteRichMenuAlias(aliasId);
	if (opts.verbose) logVerbose(`line: deleted alias ${aliasId}`);
}
function createGridLayout(height, actions) {
	const colWidth = Math.floor(2500 / 3);
	const rowHeight = Math.floor(height / 2);
	return [
		{
			bounds: {
				x: 0,
				y: 0,
				width: colWidth,
				height: rowHeight
			},
			action: actions[0]
		},
		{
			bounds: {
				x: colWidth,
				y: 0,
				width: colWidth,
				height: rowHeight
			},
			action: actions[1]
		},
		{
			bounds: {
				x: colWidth * 2,
				y: 0,
				width: colWidth,
				height: rowHeight
			},
			action: actions[2]
		},
		{
			bounds: {
				x: 0,
				y: rowHeight,
				width: colWidth,
				height: rowHeight
			},
			action: actions[3]
		},
		{
			bounds: {
				x: colWidth,
				y: rowHeight,
				width: colWidth,
				height: rowHeight
			},
			action: actions[4]
		},
		{
			bounds: {
				x: colWidth * 2,
				y: rowHeight,
				width: colWidth,
				height: rowHeight
			},
			action: actions[5]
		}
	];
}
function createDefaultMenuConfig() {
	return {
		size: {
			width: 2500,
			height: 843
		},
		selected: false,
		name: "Default Menu",
		chatBarText: "Menu",
		areas: createGridLayout(843, [
			messageAction("Help", "/help"),
			messageAction("Status", "/status"),
			messageAction("Settings", "/settings"),
			messageAction("About", "/about"),
			messageAction("Feedback", "/feedback"),
			messageAction("Contact", "/contact")
		])
	};
}
//#endregion
export { DEFAULT_ACCOUNT_ID, LineChannelConfigSchema, LineConfigSchema, buildChannelConfigSchema, buildComputedAccountStatusSnapshot, buildTemplateMessageFromPayload, buildTokenChannelStatusSummary, cancelDefaultRichMenu, clearAccountEntryFields, convertCodeBlockToFlexBubble, convertLinksToFlexBubble, convertTableToFlexBubble, createActionCard, createAgendaCard, createAppleTvRemoteCard, createAudioMessage, createButtonMenu, createButtonTemplate, createCarousel, createCarouselColumn, createConfirmTemplate, createDefaultMenuConfig, createDeviceControlCard, createEventCard, createFlexMessage, createGridLayout, createImageCard, createImageCarousel, createImageCarouselColumn, createImageMessage, createInfoCard, createLineNodeWebhookHandler, createLineWebhookMiddleware, createLinkMenu, createListCard, createLocationMessage, createMediaPlayerCard, createNotificationBubble, createProductCarousel, createQuickReplyItems, createReceiptCard, createRichMenu, createRichMenuAlias, createTemplateCarousel, createTextMessageWithQuickReplies, createVideoMessage, createYesNoConfirm, datetimePickerAction, deleteRichMenu, deleteRichMenuAlias, downloadLineMedia, extractCodeBlocks, extractLinks, extractMarkdownTables, firstDefined, formatDocsLink, getDefaultRichMenuId, getRichMenu, getRichMenuIdOfUser, getRichMenuList, getUserDisplayName, getUserProfile, hasLineDirectives, hasMarkdownToConvert, isSenderAllowed, linkRichMenuToUser, linkRichMenuToUsers, listLineAccountIds, messageAction, monitorLineProvider, normalizeAccountId, normalizeAllowFrom, normalizeDmAllowFromWithStore, parseLineDirectives, parseLineWebhookBody, postbackAction, probeLineBot, processLineMessage, pushFlexMessage, pushImageMessage, pushLocationMessage, pushMessageLine, pushMessagesLine, pushTemplateMessage, pushTextMessageWithQuickReplies, readLineWebhookRequestBody, replyMessageLine, resolveDefaultLineAccountId, resolveExactLineGroupConfigKey, resolveLineAccount, resolveLineChannelAccessToken, resolveLineGroupConfigEntry, resolveLineGroupLookupIds, resolveLineGroupsConfig, sendMessageLine, setDefaultRichMenu, setLineRuntime, setSetupChannelEnabled, showLoadingAnimation, splitSetupEntries, startLineWebhook, stripMarkdown, toFlexMessage, unlinkRichMenuFromUser, unlinkRichMenuFromUsers, uploadRichMenuImage, uriAction, validateLineSignature };
