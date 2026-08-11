// Discord tests cover the gateway-owned channel-kind fact at durable ingress.
import fs from "node:fs/promises";
import path from "node:path";
import {
  ChannelType,
  type APIMessage,
  type GatewayMessageCreateDispatchData,
} from "discord-api-types/v10";
import type { ChannelIngressQueue } from "openclaw/plugin-sdk/channel-outbound";
import { createDeferred } from "openclaw/plugin-sdk/extension-shared";
import {
  closeOpenClawStateDatabaseForTest,
  createChannelIngressQueueForTests,
} from "openclaw/plugin-sdk/plugin-state-test-runtime";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDiscordIngressMonitor, type DiscordIngressLifecycle } from "./ingress.js";

type DiscordIngressPayload = {
  version: 1;
  receivedAt: number;
  rawMessage: GatewayMessageCreateDispatchData;
  channelKind?: "non-thread" | "thread";
};

const STATE_ROOT = path.join(process.cwd(), ".tmp", "discord-ingress-channel-kind-tests");
const WAIT_TIMEOUT_MS = 10_000;

function createRawMessage(
  id: string,
  channelId: string,
  overrides: Partial<GatewayMessageCreateDispatchData> & { guild_id?: string } = {},
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

function runtime(): Pick<RuntimeEnv, "error" | "log"> {
  return { error: vi.fn(), log: vi.fn() };
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

async function withQueue<T>(
  fn: (queue: ChannelIngressQueue<DiscordIngressPayload>) => Promise<T>,
  now?: () => number,
): Promise<T> {
  await fs.mkdir(STATE_ROOT, { recursive: true });
  const created = await fs.mkdtemp(path.join(STATE_ROOT, "openclaw-discord-kind-"));
  const stateDir = await fs.realpath(created);
  const queue = createChannelIngressQueueForTests<DiscordIngressPayload>({
    channelId: "discord",
    accountId: "default",
    stateDir,
    ...(now ? { now } : {}),
  });
  try {
    return await fn(queue);
  } finally {
    closeOpenClawStateDatabaseForTest();
    await fs.rm(stateDir, { recursive: true, force: true });
  }
}

describe("Discord ingress channel-kind persistence", () => {
  beforeAll(async () => {
    await import("openclaw/plugin-sdk/channel-inbound");
  }, 120_000);

  afterEach(() => {
    closeOpenClawStateDatabaseForTest();
  });

  it("persists a closed fact from the raw MESSAGE_CREATE envelope without REST lookup", async () => {
    await withQueue(async (queue) => {
      const appendGate = createDeferred<void>();
      const enqueue = vi.fn(async (...args: Parameters<typeof queue.enqueue>) => {
        await appendGate.promise;
        return await queue.enqueue(...args);
      });
      const fetchChannel = vi.fn();
      const monitor = createDiscordIngressMonitor({
        accountId: "default",
        client: { fetchChannel } as never,
        runtime: runtime(),
        queue: { ...queue, enqueue },
        dispatch: vi.fn(),
      });
      try {
        const rawMessage = createRawMessage("kind-1", "kind-1", {
          guild_id: "guild-1",
          channel_type: ChannelType.GuildText,
        });
        expect(rawMessage).not.toHaveProperty("channel");

        const accepted = monitor.accept(rawMessage);
        await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
        expect(enqueue.mock.calls[0]?.[1]).toEqual(
          expect.objectContaining({
            version: 1,
            rawMessage,
            channelKind: "non-thread",
          }),
        );
        expect(fetchChannel).not.toHaveBeenCalled();

        appendGate.resolve();
        await accepted;
      } finally {
        appendGate.resolve();
        await monitor.stop();
      }
    });
  });

  it("uses the persisted non-thread fact after restart to suppress stale ambient backlog", async () => {
    const now = 1_780_000_000_000;
    await withQueue(
      async (queue) => {
        const producer = createDiscordIngressMonitor({
          accountId: "default",
          client: {} as never,
          runtime: runtime(),
          queue,
          now: () => now,
          dispatch: vi.fn(),
        });
        await producer.accept(
          createRawMessage("persisted-kind", "persisted-kind", {
            guild_id: "guild-1",
            channel_type: ChannelType.GuildText,
            timestamp: new Date(now - 16 * 60 * 1_000).toISOString(),
          }),
        );
        await producer.stop();
        expect(await queue.listPending({ limit: "all" })).toEqual([
          expect.objectContaining({
            id: "persisted-kind",
            payload: expect.objectContaining({ channelKind: "non-thread" }),
          }),
        ]);

        const log = vi.fn();
        const dispatch = vi.fn();
        const recovered = createDiscordIngressMonitor({
          accountId: "default",
          client: {} as never,
          runtime: { error: vi.fn(), log },
          queue,
          now: () => now,
          botUserId: "bot-1",
          dispatch,
        });
        recovered.start();
        try {
          await vi.waitFor(
            () =>
              expect(log).toHaveBeenCalledWith(
                expect.objectContaining({
                  eventId: "persisted-kind",
                  reason: "stale-ambient-backlog",
                }),
                "discord ingress stale ambient backlog suppressed",
              ),
            { timeout: WAIT_TIMEOUT_MS },
          );
          expect(dispatch).not.toHaveBeenCalled();
          expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
        } finally {
          await recovered.stop();
        }
      },
      () => now,
    );
  });

  it("fails open for legacy, future, and malformed persisted channel kinds", async () => {
    const now = 1_780_000_100_000;
    await withQueue(
      async (queue) => {
        const staleTimestamp = new Date(now - 16 * 60 * 1_000).toISOString();
        const legacy = createRawMessage("legacy-kind", "legacy-kind", {
          guild_id: "guild-1",
          timestamp: staleTimestamp,
        });
        const future = createRawMessage("future-kind", "future-kind", {
          guild_id: "guild-1",
          channel_type: 255 as GatewayMessageCreateDispatchData["channel_type"],
          timestamp: staleTimestamp,
        });
        const malformed = createRawMessage("malformed-kind", "malformed-kind", {
          guild_id: "guild-1",
          timestamp: staleTimestamp,
        });
        await queue.enqueue(
          "legacy-kind",
          { version: 1, receivedAt: now, rawMessage: legacy },
          {
            laneKey: "channel:legacy-kind",
            receivedAt: now,
          },
        );
        await queue.enqueue("future-kind", payloadFor(future, now), {
          laneKey: "channel:future-kind",
          receivedAt: now,
        });
        await queue.enqueue(
          "malformed-kind",
          {
            version: 1,
            receivedAt: now,
            rawMessage: malformed,
            channelKind: "malformed",
          } as unknown as DiscordIngressPayload,
          { laneKey: "channel:malformed-kind", receivedAt: now },
        );

        const dispatched: string[] = [];
        const monitor = createDiscordIngressMonitor({
          accountId: "default",
          client: {} as never,
          runtime: runtime(),
          queue,
          now: () => now,
          botUserId: "bot-1",
          guildEntries: { "guild-1": { requireMention: true } },
          dispatch: async (event, lifecycle: DiscordIngressLifecycle) => {
            if (event.id) {
              dispatched.push(event.id);
            }
            await lifecycle.onAdopted();
          },
        });
        monitor.start();
        try {
          await vi.waitFor(() => expect(dispatched).toHaveLength(3), {
            timeout: WAIT_TIMEOUT_MS,
          });
          expect(dispatched.toSorted()).toEqual(["future-kind", "legacy-kind", "malformed-kind"]);
          expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
        } finally {
          await monitor.stop();
        }
      },
      () => now,
    );
  });

  it("admits a fresh direct mention while stale same-lane suppression is settling", async () => {
    const now = 1_780_000_300_000;
    await withQueue(
      async (queue) => {
        const stale = createRawMessage("stale-kind", "same-lane", {
          guild_id: "guild-1",
          channel_type: ChannelType.GuildText,
          timestamp: new Date(now - 16 * 60 * 1_000).toISOString(),
        });
        const fresh = createRawMessage("fresh-kind", "same-lane", {
          guild_id: "guild-1",
          channel_type: ChannelType.GuildText,
          content: "hello <@bot-1>",
          mentions: [{ id: "bot-1" }] as APIMessage["mentions"],
          timestamp: new Date(now).toISOString(),
        });

        // Preload the stale ambient row as a durable pending fact with channelKind.
        await queue.enqueue("stale-kind", payloadFor(stale, now - 16 * 60 * 1_000), {
          laneKey: "channel:same-lane",
          receivedAt: now - 16 * 60 * 1_000,
        });

        const dispatched: string[] = [];
        const log = vi.fn();
        const error = vi.fn();
        const monitor = createDiscordIngressMonitor({
          accountId: "default",
          client: {} as never,
          runtime: { error, log },
          botUserId: "bot-1",
          queue,
          now: () => now,
          guildEntries: { "guild-1": { requireMention: true } },
          dispatch: async (event, lifecycle: DiscordIngressLifecycle) => {
            if (event.id) {
              dispatched.push(event.id);
            }
            await lifecycle.onAdopted();
          },
        });
        monitor.start();
        try {
          // Fresh production envelope can be admitted while the drain settles the
          // stale same-lane ambient head via pending disposition.
          await monitor.accept(fresh);
          await vi.waitFor(() => expect(dispatched).toEqual(["fresh-kind"]), {
            timeout: WAIT_TIMEOUT_MS,
          });
          expect(log).toHaveBeenCalledWith(
            expect.objectContaining({
              eventId: "stale-kind",
              reason: "stale-ambient-backlog",
              disposition: "completed",
            }),
            "discord ingress stale ambient backlog suppressed",
          );
          expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
          expect(error).not.toHaveBeenCalled();
        } finally {
          await monitor.stop();
        }
      },
      () => now,
    );
  });
});
