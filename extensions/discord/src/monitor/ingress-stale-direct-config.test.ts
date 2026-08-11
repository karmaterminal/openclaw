// Discord direct-configured stale ingress regression tests.
import fs from "node:fs/promises";
import path from "node:path";
import {
  ChannelType,
  MessageReferenceType,
  MessageType,
  type APIMessage,
  type GatewayMessageCreateDispatchData,
} from "discord-api-types/v10";
import type { ChannelIngressQueue } from "openclaw/plugin-sdk/channel-outbound";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import {
  closeOpenClawStateDatabaseForTest,
  createChannelIngressQueueForTests,
} from "openclaw/plugin-sdk/plugin-state-test-runtime";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DiscordGuildEntryResolved } from "./allow-list.js";
import { createDiscordIngressMonitor, type DiscordIngressLifecycle } from "./ingress.js";

type DiscordIngressPayload = {
  version: 1;
  receivedAt: number;
  rawMessage: GatewayMessageCreateDispatchData;
  channelKind?: "non-thread" | "thread";
};

type RawMessageOverrides = Partial<GatewayMessageCreateDispatchData> & {
  guild_id?: string;
};

type DiscordGuildEntries = Record<string, DiscordGuildEntryResolved>;

const DIRECT_OPEN_CHANNEL_ID = "direct-configured-mention-open-channel";
const STALE_MS = 15 * 60 * 1_000;
const DISCORD_INGRESS_WAIT_TIMEOUT_MS = 10_000;
const DISCORD_INGRESS_TEST_STATE_ROOT = path.join(process.cwd(), ".tmp", "discord-ingress-tests");
// Pre-claim stale checks lazily import the mention runtime on first use. Warming
// it outside the dispatch waits keeps a cold module graph from being charged to
// whichever test happens to evaluate stale ambient backlog first.
const DISCORD_INGRESS_RUNTIME_WARM_TIMEOUT_MS = 120_000;

function createRawMessage(
  id: string,
  channelId = DIRECT_OPEN_CHANNEL_ID,
  overrides: RawMessageOverrides = {},
): GatewayMessageCreateDispatchData {
  return {
    id,
    channel_id: channelId,
    content: "hello",
    author: {
      id: "user-1",
      username: "alice",
      discriminator: "0",
      avatar: null,
    },
    attachments: [],
    embeds: [],
    mentions: [],
    mention_roles: [],
    mention_everyone: false,
    timestamp: new Date().toISOString(),
    edited_timestamp: null,
    components: [],
    pinned: false,
    type: 0,
    tts: false,
    ...overrides,
  } as unknown as GatewayMessageCreateDispatchData;
}

function payloadFor(
  rawMessage: GatewayMessageCreateDispatchData,
  receivedAt: number,
): DiscordIngressPayload {
  const channelKind =
    rawMessage.channel_type === ChannelType.PublicThread ||
    rawMessage.channel_type === ChannelType.PrivateThread ||
    rawMessage.channel_type === ChannelType.AnnouncementThread
      ? "thread"
      : rawMessage.channel_type === ChannelType.GuildText ||
          rawMessage.channel_type === ChannelType.GuildAnnouncement ||
          rawMessage.channel_type === ChannelType.GuildVoice ||
          rawMessage.channel_type === ChannelType.GuildStageVoice
        ? "non-thread"
        : undefined;
  return { version: 1, receivedAt, rawMessage, ...(channelKind ? { channelKind } : {}) };
}

function runtime(): Pick<RuntimeEnv, "error" | "log"> {
  return { error: vi.fn(), log: vi.fn() };
}

function directOpenGuildEntries(channelId = DIRECT_OPEN_CHANNEL_ID): DiscordGuildEntries {
  return {
    "guild-1": {
      channels: {
        [channelId]: { enabled: true, requireMention: false },
      },
    },
  };
}

function mentionRequiredGuildEntries(channelId = DIRECT_OPEN_CHANNEL_ID): DiscordGuildEntries {
  return {
    "guild-1": {
      channels: {
        [channelId]: { enabled: true, requireMention: true },
      },
    },
  };
}

async function withQueue<T>(
  now: () => number,
  fn: (queue: ChannelIngressQueue<DiscordIngressPayload>) => Promise<T>,
): Promise<T> {
  await fs.mkdir(DISCORD_INGRESS_TEST_STATE_ROOT, { recursive: true });
  const created = await fs.mkdtemp(
    path.join(DISCORD_INGRESS_TEST_STATE_ROOT, "openclaw-discord-ingress-"),
  );
  const stateDir = await fs.realpath(created);
  const queue = createChannelIngressQueueForTests<DiscordIngressPayload>({
    channelId: "discord",
    accountId: "default",
    stateDir,
    now,
  });
  try {
    return await fn(queue);
  } finally {
    closeOpenClawStateDatabaseForTest();
    await fs.rm(stateDir, { recursive: true, force: true });
  }
}

function createMonitor(params: {
  queue: ChannelIngressQueue<DiscordIngressPayload>;
  now: () => number;
  guildEntries?: DiscordGuildEntries;
  runtime?: Pick<RuntimeEnv, "error" | "log">;
  cfg?: OpenClawConfig;
  startLimit?: number;
  dispatch: Parameters<typeof createDiscordIngressMonitor>[0]["dispatch"];
}) {
  return createDiscordIngressMonitor({
    accountId: "default",
    client: {} as never,
    runtime: params.runtime ?? runtime(),
    botUserId: "bot-1",
    guildEntries: params.guildEntries ?? directOpenGuildEntries(),
    cfg: params.cfg,
    now: params.now,
    queue: params.queue,
    dispatch: params.dispatch,
    ...(params.startLimit !== undefined ? { startLimit: params.startLimit } : {}),
  });
}

async function expectDispatches(params: {
  rawMessage: APIMessage;
  clock: number;
  guildEntries?: DiscordGuildEntries;
  cfg?: OpenClawConfig;
}): Promise<void> {
  await withQueue(
    () => params.clock,
    async (queue) => {
      const sentAt = Date.parse(params.rawMessage.timestamp);
      await queue.enqueue(params.rawMessage.id, payloadFor(params.rawMessage, sentAt), {
        laneKey: `channel:${params.rawMessage.channel_id}`,
        receivedAt: sentAt,
      });
      const dispatched: string[] = [];
      const monitor = createMonitor({
        queue,
        now: () => params.clock,
        guildEntries: params.guildEntries,
        cfg: params.cfg,
        dispatch: async (event, lifecycle: DiscordIngressLifecycle) => {
          if (!event.id) {
            throw new Error("expected dispatched Discord event id");
          }
          dispatched.push(event.id);
          await lifecycle.onAdopted();
        },
      });
      monitor.start();
      try {
        await vi.waitFor(() => expect(dispatched).toEqual([params.rawMessage.id]), {
          timeout: DISCORD_INGRESS_WAIT_TIMEOUT_MS,
        });
        expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      } finally {
        await monitor.stop();
      }
    },
  );
}

async function expectSuppressedAsAmbient(params: {
  rawMessage: APIMessage;
  clock: number;
  guildEntries?: DiscordGuildEntries;
  cfg?: OpenClawConfig;
}): Promise<void> {
  await withQueue(
    () => params.clock,
    async (queue) => {
      const sentAt = Date.parse(params.rawMessage.timestamp);
      await queue.enqueue(params.rawMessage.id, payloadFor(params.rawMessage, sentAt), {
        laneKey: `channel:${params.rawMessage.channel_id}`,
        receivedAt: sentAt,
      });
      const dispatch = vi.fn(async (_event, lifecycle: DiscordIngressLifecycle) => {
        await lifecycle.onAdopted();
      });
      const log = vi.fn();
      const error = vi.fn();
      const monitor = createMonitor({
        queue,
        now: () => params.clock,
        guildEntries: params.guildEntries,
        cfg: params.cfg,
        runtime: { error, log },
        dispatch,
      });
      monitor.start();
      try {
        await vi.waitFor(
          async () => {
            expect(await queue.listPending({ limit: "all" })).toEqual([]);
          },
          { timeout: DISCORD_INGRESS_WAIT_TIMEOUT_MS },
        );
        expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
        expect(dispatch).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(
          expect.objectContaining({
            eventId: params.rawMessage.id,
            reason: "stale-ambient-backlog",
            disposition: "completed",
          }),
          "discord ingress stale ambient backlog suppressed",
        );
        expect(
          await queue.enqueue(
            params.rawMessage.id,
            payloadFor(params.rawMessage, Date.parse(params.rawMessage.timestamp)),
          ),
        ).toMatchObject({ kind: "completed", duplicate: true });
        expect(error).not.toHaveBeenCalled();
      } finally {
        await monitor.stop();
      }
    },
  );
}

const MENTION_REQUIRED_CHANNEL_ID = "mention-required-guild-text-channel";
const CONFIGURED_MENTION_CFG = {
  messages: { groupChat: { mentionPatterns: ["clawbot"] } },
} as unknown as OpenClawConfig;

function staleGuildTextMessage(
  id: string,
  clock: number,
  overrides: RawMessageOverrides = {},
): GatewayMessageCreateDispatchData {
  return createRawMessage(id, MENTION_REQUIRED_CHANNEL_ID, {
    guild_id: "guild-1",
    channel_type: ChannelType.GuildText,
    content: "ordinary old room text",
    timestamp: new Date(clock - 16 * 60 * 1_000).toISOString(),
    ...overrides,
  } as RawMessageOverrides);
}

describe("Discord direct-configured stale ingress", () => {
  beforeAll(async () => {
    await import("openclaw/plugin-sdk/channel-inbound");
  }, DISCORD_INGRESS_RUNTIME_WARM_TIMEOUT_MS);

  afterEach(() => {
    closeOpenClawStateDatabaseForTest();
  });

  it("keeps directly configured stale rows with unknown raw channel type fail-open", async () => {
    const clock = 1_780_000_000_000;
    const staleId = `stale-${DIRECT_OPEN_CHANNEL_ID}-a`;
    const freshId = `fresh-${DIRECT_OPEN_CHANNEL_ID}-b`;
    await withQueue(
      () => clock,
      async (queue) => {
        const staleSentAt = clock - 16 * 60 * 1_000;
        const stale = createRawMessage(staleId, DIRECT_OPEN_CHANNEL_ID, {
          guild_id: "guild-1",
          content: "ordinary old room text",
          timestamp: new Date(staleSentAt).toISOString(),
        } as RawMessageOverrides);
        const fresh = createRawMessage(freshId, DIRECT_OPEN_CHANNEL_ID, {
          guild_id: "guild-1",
          content: "fresh direct ask <@bot-1>",
          mentions: [{ id: "bot-1" }] as APIMessage["mentions"],
          timestamp: new Date(clock).toISOString(),
        } as RawMessageOverrides);
        await queue.enqueue(staleId, payloadFor(stale, clock), {
          laneKey: `channel:${DIRECT_OPEN_CHANNEL_ID}`,
          receivedAt: clock,
        });
        await queue.enqueue(freshId, payloadFor(fresh, clock), {
          laneKey: `channel:${DIRECT_OPEN_CHANNEL_ID}`,
          receivedAt: clock + 1,
        });

        const dispatched: string[] = [];
        const log = vi.fn();
        const monitor = createMonitor({
          queue,
          now: () => clock,
          runtime: { error: vi.fn(), log },
          dispatch: async (event, lifecycle: DiscordIngressLifecycle) => {
            if (!event.id) {
              throw new Error("expected dispatched Discord event id");
            }
            dispatched.push(event.id);
            await lifecycle.onAdopted();
          },
        });
        monitor.start();
        try {
          await vi.waitFor(() => expect(dispatched).toEqual([staleId, freshId]));
          expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
          expect(log).not.toHaveBeenCalled();
        } finally {
          await monitor.stop();
        }
      },
    );
  });

  it("preserves stale mention-open raw non-thread backlog before fresh addressed work", async () => {
    const clock = 1_780_000_050_000;
    const staleId = `stale-non-thread-${DIRECT_OPEN_CHANNEL_ID}-a`;
    const freshId = `fresh-non-thread-${DIRECT_OPEN_CHANNEL_ID}-b`;
    await withQueue(
      () => clock,
      async (queue) => {
        const staleSentAt = clock - 16 * 60 * 1_000;
        const stale = createRawMessage(staleId, DIRECT_OPEN_CHANNEL_ID, {
          guild_id: "guild-1",
          channel_type: ChannelType.GuildText,
          content: "ordinary old room text",
          timestamp: new Date(staleSentAt).toISOString(),
        } as RawMessageOverrides);
        const fresh = createRawMessage(freshId, DIRECT_OPEN_CHANNEL_ID, {
          guild_id: "guild-1",
          channel_type: ChannelType.GuildText,
          content: "fresh direct ask <@bot-1>",
          mentions: [{ id: "bot-1" }] as APIMessage["mentions"],
          timestamp: new Date(clock).toISOString(),
        } as RawMessageOverrides);
        await queue.enqueue(staleId, payloadFor(stale, clock), {
          laneKey: `channel:${DIRECT_OPEN_CHANNEL_ID}`,
          receivedAt: clock,
        });
        await queue.enqueue(freshId, payloadFor(fresh, clock), {
          laneKey: `channel:${DIRECT_OPEN_CHANNEL_ID}`,
          receivedAt: clock + 1,
        });

        const dispatched: string[] = [];
        const log = vi.fn();
        const monitor = createMonitor({
          queue,
          now: () => clock,
          runtime: { error: vi.fn(), log },
          dispatch: async (event, lifecycle: DiscordIngressLifecycle) => {
            if (!event.id) {
              throw new Error("expected dispatched Discord event id");
            }
            dispatched.push(event.id);
            await lifecycle.onAdopted();
          },
        });
        monitor.start();
        try {
          await vi.waitFor(() => expect(dispatched).toEqual([staleId, freshId]));
          expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
          expect(log).not.toHaveBeenCalled();
        } finally {
          await monitor.stop();
        }
      },
    );
  });

  it.each([STALE_MS, STALE_MS + 1] as const)(
    "keeps mention-open rows dispatching at age %sms",
    async (ageMs) => {
      const clock = 1_780_000_100_000;
      const rawMessage = createRawMessage(`boundary-${ageMs}`, `direct-boundary-${ageMs}`, {
        guild_id: "guild-1",
        channel_type: ChannelType.GuildText,
        content: "ordinary old room text",
        timestamp: new Date(clock - ageMs).toISOString(),
      } as RawMessageOverrides);
      const guildEntries = directOpenGuildEntries(rawMessage.channel_id);
      await expectDispatches({ rawMessage, clock, guildEntries });
    },
  );

  it("suppresses stale mention-required ambient rows before fresh addressed work", async () => {
    const clock = 1_780_000_150_000;
    const channelId = "mention-required-channel";
    await withQueue(
      () => clock,
      async (queue) => {
        for (const [index, id] of ["stale-ambient-a", "stale-ambient-b"].entries()) {
          const sentAt = clock - STALE_MS - 1_000 - index;
          const stale = createRawMessage(id, channelId, {
            guild_id: "guild-1",
            channel_type: ChannelType.GuildText,
            content: `old ambient room text ${index}`,
            timestamp: new Date(sentAt).toISOString(),
          } as RawMessageOverrides);
          await queue.enqueue(id, payloadFor(stale, clock - 10_000 + index), {
            laneKey: `channel:${channelId}`,
            receivedAt: clock - 10_000 + index,
          });
        }
        const fresh = createRawMessage("fresh-mention-required", channelId, {
          guild_id: "guild-1",
          channel_type: ChannelType.GuildText,
          content: "fresh direct ask <@bot-1>",
          mentions: [{ id: "bot-1" }] as APIMessage["mentions"],
          timestamp: new Date(clock).toISOString(),
        } as RawMessageOverrides);
        await queue.enqueue(fresh.id, payloadFor(fresh, clock), {
          laneKey: `channel:${channelId}`,
          receivedAt: clock,
        });

        const dispatched: string[] = [];
        const log = vi.fn();
        const error = vi.fn();
        const monitor = createMonitor({
          queue,
          now: () => clock,
          guildEntries: mentionRequiredGuildEntries(channelId),
          runtime: { error, log },
          dispatch: async (event, lifecycle: DiscordIngressLifecycle) => {
            if (!event.id) {
              throw new Error("expected dispatched Discord event id");
            }
            dispatched.push(event.id);
            await lifecycle.onAdopted();
          },
        });
        monitor.start();
        try {
          await vi.waitFor(() => expect(dispatched).toEqual([fresh.id]), {
            timeout: DISCORD_INGRESS_WAIT_TIMEOUT_MS,
          });
          await vi.waitFor(async () => {
            expect(await queue.listPending({ limit: "all" })).toEqual([]);
          });
          for (const id of ["stale-ambient-a", "stale-ambient-b"]) {
            expect(log).toHaveBeenCalledWith(
              expect.objectContaining({ eventId: id, reason: "stale-ambient-backlog" }),
              "discord ingress stale ambient backlog suppressed",
            );
          }
          expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
          expect(error).not.toHaveBeenCalled();
        } finally {
          await monitor.stop();
        }
      },
    );
  });

  it("does not suppress a stale ambient message when a name-keyed override could open it", async () => {
    const clock = 1_780_000_190_000;
    const channelId = "1310000000000000123";
    const stale = createRawMessage("stale-name-keyed-override", channelId, {
      guild_id: "guild-1",
      channel_type: ChannelType.GuildText,
      content: "old ambient room text",
      timestamp: new Date(clock - STALE_MS - 1_000).toISOString(),
    } as RawMessageOverrides);
    // The wildcard resolves by id and reports `requireMention: true`, but the
    // more specific `general` entry opens this channel and can only be matched
    // by name. A raw gateway payload carries no channel name, so pre-claim
    // lookup cannot see it and would otherwise suppress a direct-open channel.
    await expectDispatches({
      rawMessage: stale,
      clock,
      guildEntries: {
        "guild-1": {
          channels: {
            "*": { enabled: true, requireMention: true },
            general: { enabled: true, requireMention: false },
          },
        },
      },
    });
  });

  it("does not suppress when a numeric channel-name override could open it", async () => {
    const clock = 1_780_000_191_000;
    const channelId = "1310000000000000456";
    const stale = createRawMessage("stale-numeric-name-override", channelId, {
      guild_id: "guild-1",
      channel_type: ChannelType.GuildText,
      content: "old ambient room text",
      timestamp: new Date(clock - STALE_MS - 1_000).toISOString(),
    } as RawMessageOverrides);
    // A channel literally named "2026" is not a snowflake id. Raw ingress only
    // has the channel id, so this override remains unproven and must fail open.
    await expectDispatches({
      rawMessage: stale,
      clock,
      guildEntries: {
        "guild-1": {
          channels: {
            "*": { enabled: true, requireMention: true },
            "2026": { enabled: true, requireMention: false },
          },
        },
      },
    });
  });

  it("still suppresses a stale ambient message under a wildcard-only override", async () => {
    const clock = 1_780_000_193_000;
    const channelId = "1310000000000000123";
    const stale = createRawMessage("stale-wildcard-only", channelId, {
      guild_id: "guild-1",
      channel_type: ChannelType.GuildText,
      content: "old ambient room text",
      timestamp: new Date(clock - STALE_MS - 1_000).toISOString(),
    } as RawMessageOverrides);
    // No name-only entry exists, so the wildcard policy is fully resolvable
    // pre-hydration and the fail-open guard must not disable suppression.
    await expectSuppressedAsAmbient({
      rawMessage: stale,
      clock,
      guildEntries: {
        "guild-1": {
          channels: {
            "*": { enabled: true, requireMention: true },
          },
        },
      },
    });
  });

  it("still suppresses a stale ambient message when every channel override is id-keyed", async () => {
    const clock = 1_780_000_195_000;
    const channelId = "1310000000000000123";
    const stale = createRawMessage("stale-id-keyed-overrides", channelId, {
      guild_id: "guild-1",
      channel_type: ChannelType.GuildText,
      content: "old ambient room text",
      timestamp: new Date(clock - STALE_MS - 1_000).toISOString(),
    } as RawMessageOverrides);
    // Id-keyed entries are fully resolvable pre-hydration, so the fail-open
    // guard must not disable stale suppression for ordinary configurations.
    await expectSuppressedAsAmbient({
      rawMessage: stale,
      clock,
      guildEntries: {
        "guild-1": {
          channels: {
            [channelId]: { enabled: true, requireMention: true },
            "1310000000000000999": { enabled: true, requireMention: true },
          },
        },
      },
    });
  });

  it("does not fence a fresh bot mention behind a retry-delayed stale ambient head", async () => {
    const clock = 1_780_000_175_000;
    const channelId = "mention-required-retry-channel";
    const laneKey = `channel:${channelId}`;
    await withQueue(
      () => clock,
      async (queue) => {
        const staleId = "stale-ambient-retry-delayed";
        const stale = createRawMessage(staleId, channelId, {
          guild_id: "guild-1",
          channel_type: ChannelType.GuildText,
          content: "old ambient room text",
          timestamp: new Date(clock - STALE_MS - 1_000).toISOString(),
        } as RawMessageOverrides);
        await queue.enqueue(staleId, payloadFor(stale, clock - 10_000), {
          laneKey,
          receivedAt: clock - 10_000,
        });

        // The lane head already lost a delivery attempt to a transient failure,
        // so it sits under retry backoff that has not expired.
        const claim = await queue.claim(staleId, { ownerId: "earlier-drain" });
        expect(claim).not.toBeNull();
        if (claim) {
          await queue.release(claim, {
            recordAttempt: true,
            lastError: "transient Discord gateway failure",
            releasedAt: clock,
          });
        }
        const delayed = await queue.listPending({ limit: "all" });
        expect(delayed.map((event) => event.id)).toEqual([staleId]);
        expect(delayed[0]?.attempts).toBeGreaterThan(0);

        const fresh = createRawMessage("fresh-behind-retry-delay", channelId, {
          guild_id: "guild-1",
          channel_type: ChannelType.GuildText,
          content: "fresh direct ask <@bot-1>",
          mentions: [{ id: "bot-1" }] as APIMessage["mentions"],
          timestamp: new Date(clock).toISOString(),
        } as RawMessageOverrides);
        await queue.enqueue(fresh.id, payloadFor(fresh, clock), { laneKey, receivedAt: clock });

        const dispatched: string[] = [];
        const log = vi.fn();
        const error = vi.fn();
        const monitor = createMonitor({
          queue,
          now: () => clock,
          guildEntries: mentionRequiredGuildEntries(channelId),
          runtime: { error, log },
          dispatch: async (event, lifecycle: DiscordIngressLifecycle) => {
            if (!event.id) {
              throw new Error("expected dispatched Discord event id");
            }
            dispatched.push(event.id);
            await lifecycle.onAdopted();
          },
        });
        monitor.start();
        try {
          // No clock advance through the backoff: the user's new mention must
          // not wait behind a row already known to be non-actionable.
          await vi.waitFor(() => expect(dispatched).toEqual([fresh.id]), {
            timeout: DISCORD_INGRESS_WAIT_TIMEOUT_MS,
          });
          await vi.waitFor(async () => {
            expect(await queue.listPending({ limit: "all" })).toEqual([]);
          });
          expect(
            log.mock.calls.filter(
              ([entry]) =>
                (entry as { eventId?: string; reason?: string }).eventId === staleId &&
                (entry as { reason?: string }).reason === "stale-ambient-backlog",
            ),
          ).toHaveLength(1);
          expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
          expect(error).not.toHaveBeenCalled();
        } finally {
          await monitor.stop();
        }
      },
    );
  });

  it("clears a deep same-lane stale backlog without one pump per row", async () => {
    const clock = 1_780_000_205_000;
    const channelId = "mention-required-backlog-channel";
    const laneKey = `channel:${channelId}`;
    await withQueue(
      () => clock,
      async (queue) => {
        // Reconnect-shaped backlog: many stale ambient rows on one channel lane
        // with the user's fresh mention behind all of them.
        const staleIds: string[] = [];
        for (let index = 0; index < 12; index += 1) {
          const staleId = `stale-backlog-${index}`;
          staleIds.push(staleId);
          const stale = createRawMessage(staleId, channelId, {
            guild_id: "guild-1",
            channel_type: ChannelType.GuildText,
            content: `old ambient room text ${index}`,
            timestamp: new Date(clock - STALE_MS - 60_000 + index).toISOString(),
          } as RawMessageOverrides);
          await queue.enqueue(staleId, payloadFor(stale, clock - STALE_MS - 60_000 + index), {
            laneKey,
            receivedAt: clock - STALE_MS - 60_000 + index,
          });
        }

        // The oldest row also lost an attempt to a transient failure, so its
        // lane is under retry backoff that never expires during this test.
        const head = await queue.claim(staleIds[0] as string, { ownerId: "earlier-drain" });
        expect(head).not.toBeNull();
        if (head) {
          await queue.release(head, {
            recordAttempt: true,
            lastError: "transient Discord gateway failure",
            releasedAt: clock,
          });
        }

        const fresh = createRawMessage("fresh-behind-backlog", channelId, {
          guild_id: "guild-1",
          channel_type: ChannelType.GuildText,
          content: "fresh direct ask <@bot-1>",
          mentions: [{ id: "bot-1" }] as APIMessage["mentions"],
          timestamp: new Date(clock).toISOString(),
        } as RawMessageOverrides);
        await queue.enqueue(fresh.id, payloadFor(fresh, clock), { laneKey, receivedAt: clock });

        // One pending scan per drain pass, so this counts pump cycles.
        let scanCount = 0;
        const listPending = queue.listPending.bind(queue);
        queue.listPending = async (...args: Parameters<typeof listPending>) => {
          scanCount += 1;
          return await listPending(...args);
        };

        const dispatched: string[] = [];
        const log = vi.fn();
        const error = vi.fn();
        const monitor = createMonitor({
          queue,
          now: () => clock,
          guildEntries: mentionRequiredGuildEntries(channelId),
          runtime: { error, log },
          dispatch: async (event, lifecycle: DiscordIngressLifecycle) => {
            if (!event.id) {
              throw new Error("expected dispatched Discord event id");
            }
            dispatched.push(event.id);
            await lifecycle.onAdopted();
          },
        });
        monitor.start();
        try {
          await vi.waitFor(() => expect(dispatched).toEqual([fresh.id]), {
            timeout: DISCORD_INGRESS_WAIT_TIMEOUT_MS,
          });
          await vi.waitFor(async () => {
            expect(await queue.listPending({ limit: "all" })).toEqual([]);
          });
          // Prefer a single first-wave settlement: with default startLimit the
          // 12-row backlog plus fresh mention must not require one scan per row.
          expect(scanCount).toBeLessThan(staleIds.length);
          expect(
            log.mock.calls.filter(
              ([entry]) =>
                (entry as { reason?: string }).reason === "stale-ambient-backlog" &&
                staleIds.includes((entry as { eventId?: string }).eventId ?? ""),
            ),
          ).toHaveLength(staleIds.length);
          expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
          for (const id of staleIds) {
            const raw = createRawMessage(id, channelId, {
              guild_id: "guild-1",
              channel_type: ChannelType.GuildText,
              content: "probe",
              timestamp: new Date(clock).toISOString(),
            } as RawMessageOverrides);
            expect(await queue.enqueue(id, payloadFor(raw, clock))).toMatchObject({
              kind: "completed",
              duplicate: true,
            });
          }
          expect(error).not.toHaveBeenCalled();
        } finally {
          await monitor.stop();
        }
      },
    );
  });

  it("treats dead-letter resubmit as fresh operator intent", async () => {
    let clock = 1_780_000_200_000;
    const messageId = `resubmit-${DIRECT_OPEN_CHANNEL_ID}`;
    await withQueue(
      () => clock,
      async (queue) => {
        const rawMessage = createRawMessage(messageId, DIRECT_OPEN_CHANNEL_ID, {
          guild_id: "guild-1",
          channel_type: ChannelType.GuildText,
          content: "ordinary old room text",
          timestamp: new Date(clock - 16 * 60 * 1_000).toISOString(),
        } as RawMessageOverrides);
        await queue.enqueue(messageId, payloadFor(rawMessage, clock), {
          laneKey: `channel:${DIRECT_OPEN_CHANNEL_ID}`,
          receivedAt: clock,
        });
        // Real dead letter, not a policy suppression: suppression settles as a
        // completion, so only genuine failures reach the resubmit surface.
        await queue.fail(messageId, { reason: "invalid-event", message: "durable decode failed" });

        clock += 5 * 60 * 1_000;
        if (!queue.resubmit) {
          throw new Error("expected queue.resubmit");
        }
        await expect(queue.resubmit(messageId, { resubmittedAt: clock })).resolves.toMatchObject({
          kind: "resubmitted",
          record: { id: messageId, receivedAt: clock, attempts: 0 },
        });
        const dispatched: string[] = [];
        const replayMonitor = createMonitor({
          queue,
          now: () => clock,
          guildEntries: mentionRequiredGuildEntries(),
          dispatch: async (event, lifecycle: DiscordIngressLifecycle) => {
            if (!event.id) {
              throw new Error("expected dispatched Discord event id");
            }
            dispatched.push(event.id);
            await lifecycle.onAdopted();
          },
        });
        replayMonitor.start();
        try {
          await vi.waitFor(() => expect(dispatched).toEqual([messageId]));
          expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
        } finally {
          await replayMonitor.stop();
        }
      },
    );
  });

  it.each([
    {
      name: "direct bot mention",
      id: "1023-direct-mention",
      overrides: {
        content: "old direct ask <@bot-1>",
        mentions: [{ id: "bot-1" }] as APIMessage["mentions"],
      },
    },
    {
      name: "reply to the bot",
      id: "1023-reply",
      overrides: {
        content: "old explicit reply",
        referenced_message: createRawMessage("reply-source-bot", DIRECT_OPEN_CHANNEL_ID, {
          guild_id: "guild-1",
          author: {
            id: "bot-1",
            username: "openclaw",
            discriminator: "0",
            global_name: null,
            avatar: null,
            bot: true,
          },
        } as RawMessageOverrides),
      },
    },
    {
      name: "everyone mention",
      id: "1023-everyone",
      overrides: { content: "@everyone old explicit ask", mention_everyone: true },
    },
    {
      name: "text control command",
      id: "1023-control",
      overrides: { content: "/status" },
      cfg: {} satisfies OpenClawConfig,
    },
  ])("keeps stale $name in a direct-configured mention-open raw channel", async (testCase) => {
    const clock = 1_780_000_300_000;
    await expectDispatches({
      rawMessage: createRawMessage(testCase.id, DIRECT_OPEN_CHANNEL_ID, {
        guild_id: "guild-1",
        timestamp: new Date(clock - 16 * 60 * 1_000).toISOString(),
        ...testCase.overrides,
      } as RawMessageOverrides),
      cfg: testCase.cfg,
      clock,
    });
  });

  // Suppression-eligible route: raw GuildText channel with requireMention true.
  // Mention-open routes fail open before these checks, so only this route
  // proves each preservation reason actually blocks the terminal branch.
  it.each([
    {
      name: "direct bot mention",
      id: "1023-required-mention",
      overrides: {
        content: "old direct ask <@bot-1>",
        mentions: [{ id: "bot-1" }] as APIMessage["mentions"],
      },
    },
    {
      name: "reply to the bot",
      id: "1023-required-bot-reply",
      overrides: {
        content: "old explicit reply",
        type: MessageType.Reply,
        message_reference: {
          type: MessageReferenceType.Default,
          message_id: "reply-source-bot",
          channel_id: MENTION_REQUIRED_CHANNEL_ID,
          guild_id: "guild-1",
        },
        referenced_message: createRawMessage("reply-source-bot", MENTION_REQUIRED_CHANNEL_ID, {
          guild_id: "guild-1",
          author: {
            id: "bot-1",
            username: "openclaw",
            discriminator: "0",
            global_name: null,
            avatar: null,
            bot: true,
          },
        } as RawMessageOverrides),
      },
    },
    {
      name: "reply with a missing referenced payload",
      id: "1023-required-missing-reply",
      overrides: {
        content: "old reply without nested referenced payload",
        type: MessageType.Reply,
        message_reference: {
          type: MessageReferenceType.Default,
          message_id: "reply-source-missing",
          channel_id: MENTION_REQUIRED_CHANNEL_ID,
          guild_id: "guild-1",
        },
      },
    },
    {
      // Canonical hydration refetches a mismatched nested payload too, so
      // pre-claim must not terminally fail before the referenced author is proven.
      name: "reply with a mismatched referenced payload",
      id: "1023-required-mismatched-reply",
      overrides: {
        content: "old reply with a stale nested payload",
        type: MessageType.Reply,
        message_reference: {
          type: MessageReferenceType.Default,
          message_id: "reply-source-authoritative",
          channel_id: MENTION_REQUIRED_CHANNEL_ID,
          guild_id: "guild-1",
        },
        referenced_message: createRawMessage("reply-source-other", MENTION_REQUIRED_CHANNEL_ID, {
          guild_id: "guild-1",
          author: {
            id: "user-2",
            username: "bob",
            discriminator: "0",
            global_name: null,
            avatar: null,
          },
        } as RawMessageOverrides),
      },
    },
    {
      name: "configured text mention",
      id: "1023-required-configured-text",
      overrides: { content: "hey clawbot are you around" },
      cfg: CONFIGURED_MENTION_CFG,
    },
    {
      name: "configured audio mention candidate",
      id: "1023-required-configured-audio",
      overrides: {
        content: "",
        attachments: [
          { id: "att-1", filename: "voice-note.ogg", url: "https://cdn.example/voice-note.ogg" },
        ] as unknown as APIMessage["attachments"],
      },
      cfg: CONFIGURED_MENTION_CFG,
    },
    {
      name: "text control command",
      id: "1023-required-control",
      overrides: { content: "/status" },
      cfg: {} satisfies OpenClawConfig,
    },
  ])(
    "keeps stale $name in a suppression-eligible mention-required raw channel",
    async (testCase) => {
      const clock = 1_780_000_600_000;
      await expectDispatches({
        rawMessage: staleGuildTextMessage(testCase.id, clock, testCase.overrides),
        guildEntries: mentionRequiredGuildEntries(MENTION_REQUIRED_CHANNEL_ID),
        cfg: testCase.cfg,
        clock,
      });
    },
  );

  it.each([
    { name: "plain ambient text", id: "1023-required-ambient", overrides: {} },
    {
      name: "human reply with a matching referenced payload",
      id: "1023-required-human-reply",
      overrides: {
        content: "old reply to a human",
        type: MessageType.Reply,
        message_reference: {
          type: MessageReferenceType.Default,
          message_id: "reply-source-human",
          channel_id: MENTION_REQUIRED_CHANNEL_ID,
          guild_id: "guild-1",
        },
        referenced_message: createRawMessage("reply-source-human", MENTION_REQUIRED_CHANNEL_ID, {
          guild_id: "guild-1",
          author: {
            id: "user-2",
            username: "bob",
            discriminator: "0",
            global_name: null,
            avatar: null,
          },
        } as RawMessageOverrides),
      },
    },
    {
      name: "text that misses every configured mention pattern",
      id: "1023-required-unmatched-text",
      overrides: { content: "old room chatter about lunch" },
      cfg: CONFIGURED_MENTION_CFG,
    },
  ])(
    "suppresses stale $name in a suppression-eligible mention-required raw channel",
    async (testCase) => {
      const clock = 1_780_000_700_000;
      await expectSuppressedAsAmbient({
        rawMessage: staleGuildTextMessage(testCase.id, clock, testCase.overrides),
        guildEntries: mentionRequiredGuildEntries(MENTION_REQUIRED_CHANNEL_ID),
        cfg: testCase.cfg,
        clock,
      });
    },
  );
});
