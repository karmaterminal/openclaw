import { ChannelType } from "discord-api-types/v10";
import type { ChannelIngressQueueRecord } from "openclaw/plugin-sdk/channel-outbound";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { describe, expect, it } from "vitest";
import { MessageType } from "../internal/discord.js";
// Discord tests prove the stale ambient policy expires only what preflight would skip.
import { installDiscordIngressTestRuntime } from "../test-support/ingress-runtime.js";
import type { DiscordGuildEntryResolved } from "./allow-list.js";
import { createDiscordStaleAmbientPendingDisposition } from "./ingress-stale-policy.js";
import type { DiscordLivePolicy } from "./live-policy.js";
import { preflightDiscordMessage } from "./message-handler.preflight.js";
import {
  createDiscordMessage,
  createDiscordPreflightArgs,
  createGuildEvent,
  createGuildTextClient,
  DEFAULT_PREFLIGHT_CFG,
} from "./message-handler.preflight.test-helpers.js";

installDiscordIngressTestRuntime();

const BOT_ID = "openclaw-bot";
const GUILD_ID = "g1";
const CHANNEL_ID = "c1";
const STALE_TIMESTAMP = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
const HUMAN = { id: "user-1", bot: false, username: "alice" };

const gated = (requireMention: boolean): Record<string, DiscordGuildEntryResolved> => ({
  [GUILD_ID]: { channels: { [CHANNEL_ID]: { enabled: true, requireMention } } },
});
const NAMED_AGENT_CFG = {
  ...DEFAULT_PREFLIGHT_CFG,
  agents: { list: [{ id: "main", identity: { name: "claw" } }] },
} as unknown as OpenClawConfig;
const BROADCAST_CFG = {
  ...DEFAULT_PREFLIGHT_CFG,
  agents: { entries: { helper: { groupChat: { mentionPatterns: ["\\bhelper\\b"] } } } },
  broadcast: { [`discord:${CHANNEL_ID}`]: ["helper"] },
} as unknown as OpenClawConfig;
const DENY_HERE = { mentionPatterns: { denyIn: [CHANNEL_ID] } };

type Row = {
  name: string;
  content: string;
  cfg?: OpenClawConfig;
  discordConfig?: Record<string, unknown>;
  guildEntries?: Record<string, DiscordGuildEntryResolved>;
  mentionedUsers?: Array<{ id: string }>;
  mentionedEveryone?: boolean;
  replyToBot?: boolean;
};

const ROWS: Row[] = [
  { name: "plain chatter", content: "just chatting" },
  { name: "native bot mention", content: "look at this", mentionedUsers: [{ id: BOT_ID }] },
  { name: "@everyone", content: "heads up all", mentionedEveryone: true },
  { name: "bare <@id> text without a native mention entry", content: `hey <@${BOT_ID}> look` },
  { name: "reply to the bot", content: "yes, that one", replyToBot: true },
  { name: "configured name mention", content: "claw please look", cfg: NAMED_AGENT_CFG },
  { name: "name in prose, no pattern", content: "claw please look" },
  {
    name: "broadcast participant under denyIn (rev 17)",
    content: "@helper can you look at this",
    cfg: BROADCAST_CFG,
    discordConfig: DENY_HERE,
  },
  {
    name: "participant named without an address under denyIn",
    content: "helper can you look at this",
    cfg: BROADCAST_CFG,
    discordConfig: DENY_HERE,
  },
  {
    name: "address without a broadcast entry under denyIn",
    content: "@helper can you look at this",
    cfg: { ...BROADCAST_CFG, broadcast: undefined } as unknown as OpenClawConfig,
    discordConfig: DENY_HERE,
  },
  { name: "direct-open channel", content: "just chatting", guildEntries: gated(false) },
];

function buildMessage(row: Row) {
  const referencedMessage = row.replyToBot
    ? createDiscordMessage({
        id: "m0",
        channelId: CHANNEL_ID,
        content: "earlier answer",
        author: { id: BOT_ID, bot: true },
      })
    : undefined;
  return createDiscordMessage({
    id: "m1",
    channelId: CHANNEL_ID,
    content: row.content,
    author: HUMAN,
    timestamp: STALE_TIMESTAMP,
    mentionedUsers: row.mentionedUsers,
    mentionedEveryone: row.mentionedEveryone,
    ...(referencedMessage
      ? {
          type: MessageType.Reply,
          messageReference: { message_id: "m0", channel_id: CHANNEL_ID },
          referencedMessage,
        }
      : {}),
  });
}

async function preflightAccepts(row: Row): Promise<boolean> {
  const message = buildMessage(row);
  const result = await preflightDiscordMessage({
    ...createDiscordPreflightArgs({
      cfg: row.cfg ?? DEFAULT_PREFLIGHT_CFG,
      discordConfig: row.discordConfig ?? {},
      data: createGuildEvent({
        channelId: CHANNEL_ID,
        guildId: GUILD_ID,
        author: message.author,
        message,
      }),
      client: createGuildTextClient(CHANNEL_ID),
      botUserId: BOT_ID,
    }),
    guildEntries: row.guildEntries ?? gated(true),
  });
  return result !== null;
}

async function policyKeeps(row: Row): Promise<boolean> {
  const message = buildMessage(row);
  const policy = {
    isCurrent: () => true,
    accountId: "default",
    cfg: row.cfg ?? DEFAULT_PREFLIGHT_CFG,
    discordConfig: row.discordConfig ?? {},
    guildEntries: row.guildEntries ?? gated(true),
    allowFrom: [],
    dmPolicy: "open",
    groupPolicy: "open",
    dmEnabled: true,
    groupDmEnabled: true,
    groupDmChannels: [],
    allowNameMatching: false,
    // SAFETY: the stale policy reads only the published policy fields set above.
  } as unknown as DiscordLivePolicy;
  const disposition = createDiscordStaleAmbientPendingDisposition({
    botUserId: BOT_ID,
    readPolicy: async () => policy,
    resolveChannelInfo: () => ({ guildId: GUILD_ID, name: "general", type: ChannelType.GuildText }),
    isChannelInventoryHydrating: () => false,
  });
  const sentAt = Date.parse(STALE_TIMESTAMP);
  const record: ChannelIngressQueueRecord<unknown> = {
    id: "m1",
    channelId: "discord",
    accountId: "default",
    queueName: "discord:default",
    payload: {
      version: 1,
      receivedAt: sentAt,
      rawMessage: { ...message.rawData, guild_id: GUILD_ID },
    },
    receivedAt: sentAt,
    updatedAt: sentAt,
    laneKey: `channel:${CHANNEL_ID}`,
    attempts: 0,
  };
  return (
    (await disposition(record, { laneKey: `channel:${CHANNEL_ID}`, now: Date.now() })) === null
  );
}

describe("discord stale ambient policy agrees with preflight", () => {
  it.each(ROWS)("$name", async (row) => {
    const accepted = await preflightAccepts(row);
    await expect(policyKeeps(row)).resolves.toBe(accepted);
  });

  it("covers both verdicts", async () => {
    const verdicts = await Promise.all(ROWS.map((row) => preflightAccepts(row)));
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });
});
