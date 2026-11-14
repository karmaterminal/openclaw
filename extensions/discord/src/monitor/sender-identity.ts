import { normalizeOptionalString } from "openclaw/plugin-sdk/string-coerce-runtime";
import { MessageType, type User } from "../internal/discord.js";
import type { PluralKitMessageInfo } from "../pluralkit.js";
import { formatDiscordUserTag } from "./format.js";

export type DiscordSenderIdentity = {
  id: string;
  name?: string;
  tag?: string;
  label: string;
  isPluralKit: boolean;
};

type DiscordWebhookMessageLike = {
  webhookId?: string | null;
  webhook_id?: string | null;
};

export function resolveDiscordWebhookId(message: DiscordWebhookMessageLike): string | null {
  return normalizeOptionalString(message.webhookId ?? message.webhook_id) ?? null;
}

// Frond (karmaterminal, #1564): account provenance for the owner's queue protection. Discord's user
// object carries `bot: true` on every application account and `system: true` on Official Discord
// System accounts, and omits both on other user accounts (APIUser.bot, APIUser.system); MESSAGE_CREATE
// always carries the full author. So an ordinary message or reply whose author has neither is that
// account's own post. A webhook post authenticates no account, and PluralKit proxies only through
// webhooks; other message types are Discord's notices about the account, not its post.
export function isDiscordAccountOwnPost(
  author: Pick<User, "bot" | "system">,
  message: DiscordWebhookMessageLike & { type?: MessageType },
): boolean {
  return (
    author.bot !== true &&
    author.system !== true &&
    !resolveDiscordWebhookId(message) &&
    (message.type === MessageType.Default || message.type === MessageType.Reply)
  );
}

export function resolveDiscordSenderIdentity(params: {
  author: User;
  member?: {
    nickname?: string | null;
    nick?: string | null;
  } | null;
  pluralkitInfo?: PluralKitMessageInfo | null;
}): DiscordSenderIdentity {
  const pkInfo = params.pluralkitInfo ?? null;
  const pkMember = pkInfo?.member ?? undefined;
  const pkSystem = pkInfo?.system ?? undefined;
  const memberId = pkMember?.id?.trim();
  const memberNameRaw = pkMember?.display_name ?? pkMember?.name ?? "";
  const memberName = memberNameRaw?.trim();
  if (memberId && memberName) {
    const systemName = pkSystem?.name?.trim();
    const label = systemName ? `${memberName} (PK:${systemName})` : `${memberName} (PK)`;
    return {
      id: memberId,
      name: memberName,
      tag: normalizeOptionalString(pkMember?.name),
      label,
      isPluralKit: true,
    };
  }

  const senderTag = formatDiscordUserTag(params.author);
  const senderDisplay =
    params.member?.nickname ??
    params.member?.nick ??
    params.author.globalName ??
    params.author.username;
  const senderLabel =
    senderDisplay && senderTag && senderDisplay !== senderTag
      ? `${senderDisplay} (${senderTag})`
      : (senderDisplay ?? senderTag ?? params.author.id);
  return {
    id: params.author.id,
    name: params.author.username,
    tag: senderTag,
    label: senderLabel,
    isPluralKit: false,
  };
}
