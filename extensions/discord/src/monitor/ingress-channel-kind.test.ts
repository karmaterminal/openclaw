// Discord tests cover the gateway-owned channel-kind fact at durable ingress.
//
// Spiderweb around stale-ambient channel-kind resolution:
// - Write side must persist a definite kind (gateway channel_type OR client hydrate).
// - Read side may expire only after a PROVEN non-thread fact.
// - Unknown/unhydrated must RETAIN (answer), never terminal-settle.
// If write-side hydrate or effective-kind resolution is clipped by merge, multiple
// independent cases below fail — that is intentional.
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
import {
  createDiscordIngressMonitor,
  isDiscordProvenNonThreadAmbientExpirable,
  type DiscordIngressLifecycle,
} from "./ingress.js";

type DiscordIngressChannelKind = "non-thread" | "thread";

type DiscordIngressPayload = {
  version: 1;
  receivedAt: number;
  rawMessage: GatewayMessageCreateDispatchData;
  channelKind?: DiscordIngressChannelKind;
};

const STATE_ROOT = path.join(process.cwd(), ".tmp", "discord-ingress-channel-kind-tests");
const WAIT_TIMEOUT_MS = 10_000;
/** Mirrors DISCORD_STALE_AMBIENT_BACKLOG_MS in ingress.ts (not exported). */
const STALE_AMBIENT_BACKLOG_MS = 15 * 60 * 1_000;
const MENTION_REQUIRED_GUILD = { "guild-1": { requireMention: true } } as const;

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
  channelKindOverride?: DiscordIngressChannelKind | null,
): DiscordIngressPayload {
  if (channelKindOverride === null) {
    return { version: 1, receivedAt, rawMessage };
  }
  if (channelKindOverride !== undefined) {
    return { version: 1, receivedAt, rawMessage, channelKind: channelKindOverride };
  }
  const channelKind =
    rawMessage.channel_type === ChannelType.PublicThread ||
    rawMessage.channel_type === ChannelType.PrivateThread ||
    rawMessage.channel_type === ChannelType.AnnouncementThread
      ? ("thread" as const)
      : rawMessage.channel_type === ChannelType.GuildText ||
          rawMessage.channel_type === ChannelType.GuildAnnouncement ||
          rawMessage.channel_type === ChannelType.GuildVoice ||
          rawMessage.channel_type === ChannelType.GuildStageVoice
        ? ("non-thread" as const)
        : undefined;
  return { version: 1, receivedAt, rawMessage, ...(channelKind ? { channelKind } : {}) };
}

function clientWithChannelType(typeByChannelId: Record<string, number | undefined>) {
  return {
    fetchChannel: vi.fn(async (channelId: string) => {
      const type = typeByChannelId[channelId];
      if (type === undefined) {
        throw new Error(`channel ${channelId} not found`);
      }
      return { id: channelId, type };
    }),
  };
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

/** Dual-contract: terminally settled WITHOUT dispatch (no 24h replay emission). */
async function expectSettledWithoutEmission(params: {
  eventId: string;
  queue: ChannelIngressQueue<DiscordIngressPayload>;
  now: number;
  rawMessage: GatewayMessageCreateDispatchData;
  payload?: DiscordIngressPayload;
  receivedAt?: number;
  client?: { fetchChannel?: (id: string) => Promise<unknown> };
}): Promise<void> {
  const receivedAt = params.receivedAt ?? params.now;
  const payload = params.payload ?? payloadFor(params.rawMessage, receivedAt);
  await params.queue.enqueue(params.eventId, payload, {
    laneKey: `channel:${params.rawMessage.channel_id}`,
    receivedAt,
  });

  const log = vi.fn();
  const error = vi.fn();
  const dispatch = vi.fn(async (_event, lifecycle: DiscordIngressLifecycle) => {
    await lifecycle.onAdopted();
  });
  const monitor = createDiscordIngressMonitor({
    accountId: "default",
    client: (params.client ?? {}) as never,
    runtime: { error, log },
    queue: params.queue,
    now: () => params.now,
    botUserId: "bot-1",
    guildEntries: { ...MENTION_REQUIRED_GUILD },
    dispatch,
  });
  monitor.start();
  try {
    await vi.waitFor(
      () =>
        expect(log).toHaveBeenCalledWith(
          expect.objectContaining({
            eventId: params.eventId,
            reason: "stale-ambient-backlog",
            disposition: "suppressed",
          }),
          "discord ingress stale ambient backlog suppressed",
        ),
      { timeout: WAIT_TIMEOUT_MS },
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(await params.queue.listFailed?.({ limit: "all" })).toEqual([]);
    expect(await params.queue.listPending({ limit: "all" })).toEqual([]);
    expect(await params.queue.listClaims()).toEqual([]);
    expect(error).not.toHaveBeenCalled();
  } finally {
    await monitor.stop();
  }
}

/** Dual-contract: dispatch adopts the row; it is NOT ambient-suppressed. */
async function expectEmittedNotSuppressed(params: {
  eventId: string;
  queue: ChannelIngressQueue<DiscordIngressPayload>;
  now: number;
  rawMessage: GatewayMessageCreateDispatchData;
  payload?: DiscordIngressPayload;
  receivedAt?: number;
  guildEntries?: Record<string, unknown>;
  client?: { fetchChannel?: (id: string) => Promise<unknown> };
}): Promise<void> {
  const receivedAt = params.receivedAt ?? params.now;
  const payload = params.payload ?? payloadFor(params.rawMessage, receivedAt);
  await params.queue.enqueue(params.eventId, payload, {
    laneKey: `channel:${params.rawMessage.channel_id}`,
    receivedAt,
  });

  const log = vi.fn();
  const dispatched: string[] = [];
  const monitor = createDiscordIngressMonitor({
    accountId: "default",
    client: (params.client ?? {}) as never,
    runtime: { error: vi.fn(), log },
    queue: params.queue,
    now: () => params.now,
    botUserId: "bot-1",
    ...(params.guildEntries ? { guildEntries: params.guildEntries as never } : {}),
    dispatch: async (event, lifecycle: DiscordIngressLifecycle) => {
      if (event.id) {
        dispatched.push(event.id);
      }
      await lifecycle.onAdopted();
    },
  });
  monitor.start();
  try {
    await vi.waitFor(() => expect(dispatched).toEqual([params.eventId]), {
      timeout: WAIT_TIMEOUT_MS,
    });
    expect(
      log.mock.calls.some(
        (call) =>
          call[0] &&
          typeof call[0] === "object" &&
          (call[0] as { reason?: string }).reason === "stale-ambient-backlog" &&
          (call[0] as { eventId?: string }).eventId === params.eventId,
      ),
    ).toBe(false);
    expect(await params.queue.listFailed?.({ limit: "all" })).toEqual([]);
    expect(await params.queue.listPending({ limit: "all" })).toEqual([]);
  } finally {
    await monitor.stop();
  }
}

describe("Discord ingress channel-kind persistence", () => {
  beforeAll(async () => {
    await import("openclaw/plugin-sdk/channel-inbound");
  }, 120_000);

  afterEach(() => {
    closeOpenClawStateDatabaseForTest();
  });

  describe("isDiscordProvenNonThreadAmbientExpirable (sync tripwire)", () => {
    // Instant failure if the terminal kind gate is clipped to `!== "thread"`
    // (treats unknown as ambient) or widened to always-true.
    it.each([
      {
        name: "proven non-thread is expirable",
        channelKind: "non-thread" as const,
        expected: true,
      },
      {
        name: "proven thread is NOT expirable",
        channelKind: "thread" as const,
        expected: false,
      },
      {
        name: "undefined kind is NOT expirable — ambiguous ordinary-or-thread",
        channelKind: undefined,
        expected: false,
      },
    ])("$name", ({ channelKind, expected }) => {
      expect(isDiscordProvenNonThreadAmbientExpirable(channelKind)).toBe(expected);
    });

    it("rejects non-closed values that decode would drop (malformed must not expire)", () => {
      expect(isDiscordProvenNonThreadAmbientExpirable("malformed" as unknown as "non-thread")).toBe(
        false,
      );
      expect(isDiscordProvenNonThreadAmbientExpirable(null as unknown as undefined)).toBe(false);
    });
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

  it("write-side hydrates and persists kind when gateway channel_type is absent — cure for optional envelope field", async () => {
    await withQueue(async (queue) => {
      const client = clientWithChannelType({ "absent-write": ChannelType.GuildText });
      const monitor = createDiscordIngressMonitor({
        accountId: "default",
        client: client as never,
        runtime: runtime(),
        queue,
        dispatch: vi.fn(),
      });
      try {
        const rawMessage = createRawMessage("absent-write", "absent-write", {
          guild_id: "guild-1",
        });
        expect(rawMessage).not.toHaveProperty("channel_type");
        await monitor.accept(rawMessage);
        const pending = await queue.listPending({ limit: "all" });
        expect(pending).toEqual([
          expect.objectContaining({
            id: "absent-write",
            payload: expect.objectContaining({ channelKind: "non-thread" }),
          }),
        ]);
        expect(client.fetchChannel).toHaveBeenCalledWith("absent-write");
      } finally {
        await monitor.stop();
      }
    });
  });

  it("write-side hydrates thread kind when gateway channel_type is absent — autoThread / real threads must persist as thread", async () => {
    await withQueue(async (queue) => {
      const client = clientWithChannelType({ "absent-thread-write": ChannelType.PublicThread });
      const monitor = createDiscordIngressMonitor({
        accountId: "default",
        client: client as never,
        runtime: runtime(),
        queue,
        dispatch: vi.fn(),
      });
      try {
        const rawMessage = createRawMessage("absent-thread-write", "absent-thread-write", {
          guild_id: "guild-1",
        });
        await monitor.accept(rawMessage);
        const pending = await queue.listPending({ limit: "all" });
        expect(pending).toEqual([
          expect.objectContaining({
            id: "absent-thread-write",
            payload: expect.objectContaining({ channelKind: "thread" }),
          }),
        ]);
      } finally {
        await monitor.stop();
      }
    });
  });

  describe("stale-ambient channelKind resolve-before-drop fence (regression spiderweb)", () => {
    it("settles (does not emit) a stale guild row whose gateway channel_type was absent after write-side hydrate to non-thread — regression guard for 24h replay", async () => {
      const now = 1_780_000_050_000;
      await withQueue(
        async (queue) => {
          const client = clientWithChannelType({ "absent-kind": ChannelType.GuildText });
          const producer = createDiscordIngressMonitor({
            accountId: "default",
            client: client as never,
            runtime: runtime(),
            queue,
            now: () => now,
            dispatch: vi.fn(),
          });
          const rawMessage = createRawMessage("absent-kind", "absent-kind", {
            guild_id: "guild-1",
            content: "ordinary old room text",
            timestamp: new Date(now - STALE_AMBIENT_BACKLOG_MS - 60_000).toISOString(),
          });
          expect(rawMessage).not.toHaveProperty("channel_type");
          await producer.accept(rawMessage);
          await producer.stop();
          const pending = await queue.listPending({ limit: "all" });
          expect(pending).toEqual([
            expect.objectContaining({
              id: "absent-kind",
              payload: expect.objectContaining({ channelKind: "non-thread" }),
            }),
          ]);

          const log = vi.fn();
          const dispatch = vi.fn(async (_event, lifecycle: DiscordIngressLifecycle) => {
            await lifecycle.onAdopted();
          });
          const recovered = createDiscordIngressMonitor({
            accountId: "default",
            client: client as never,
            runtime: { error: vi.fn(), log },
            queue,
            now: () => now,
            botUserId: "bot-1",
            guildEntries: { ...MENTION_REQUIRED_GUILD },
            dispatch,
          });
          recovered.start();
          try {
            await vi.waitFor(
              () =>
                expect(log).toHaveBeenCalledWith(
                  expect.objectContaining({
                    eventId: "absent-kind",
                    reason: "stale-ambient-backlog",
                    disposition: "suppressed",
                  }),
                  "discord ingress stale ambient backlog suppressed",
                ),
              { timeout: WAIT_TIMEOUT_MS },
            );
            expect(dispatch).not.toHaveBeenCalled();
            expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
            expect(await queue.listPending({ limit: "all" })).toEqual([]);
            expect(await queue.listClaims()).toEqual([]);
          } finally {
            await recovered.stop();
          }
        },
        () => now,
      );
    });

    it('settles (does not emit) a stale guild row with persisted channelKind "non-thread" — proven ambient still expires', async () => {
      const now = 1_780_000_060_000;
      await withQueue(
        async (queue) => {
          const rawMessage = createRawMessage("non-thread-kind", "non-thread-kind", {
            guild_id: "guild-1",
            channel_type: ChannelType.GuildText,
            content: "old ambient room chatter",
            timestamp: new Date(now - STALE_AMBIENT_BACKLOG_MS - 60_000).toISOString(),
          });
          await expectSettledWithoutEmission({
            eventId: "non-thread-kind",
            queue,
            now,
            rawMessage,
            payload: payloadFor(rawMessage, now),
          });
          expect(payloadFor(rawMessage, now).channelKind).toBe("non-thread");
        },
        () => now,
      );
    });

    it("settles (does not emit) a legacy absent channelKind after read-side hydrate proves non-thread — drain-path cure", async () => {
      const now = 1_780_000_070_000;
      await withQueue(
        async (queue) => {
          const rawMessage = createRawMessage("legacy-kind", "legacy-kind", {
            guild_id: "guild-1",
            content: "legacy row without channelKind field",
            timestamp: new Date(now - STALE_AMBIENT_BACKLOG_MS - 60_000).toISOString(),
          });
          expect(rawMessage).not.toHaveProperty("channel_type");
          const client = clientWithChannelType({ "legacy-kind": ChannelType.GuildText });
          await expectSettledWithoutEmission({
            eventId: "legacy-kind",
            queue,
            now,
            rawMessage,
            payload: { version: 1, receivedAt: now, rawMessage },
            client,
          });
          expect(client.fetchChannel).toHaveBeenCalledWith("legacy-kind");
        },
        () => now,
      );
    });

    it("emits (does not settle) when kind remains unknown after failed hydrate — retain over silent drop", async () => {
      const now = 1_780_000_080_000;
      await withQueue(
        async (queue) => {
          const rawMessage = createRawMessage("unknown-kind", "unknown-kind", {
            guild_id: "guild-1",
            channel_type: 255 as GatewayMessageCreateDispatchData["channel_type"],
            content: "future channel type — unproven",
            timestamp: new Date(now - STALE_AMBIENT_BACKLOG_MS - 60_000).toISOString(),
          });
          const client = {
            fetchChannel: vi.fn(async () => {
              throw new Error("REST unavailable");
            }),
          };
          await expectEmittedNotSuppressed({
            eventId: "unknown-kind",
            queue,
            now,
            rawMessage,
            payload: payloadFor(rawMessage, now),
            guildEntries: { ...MENTION_REQUIRED_GUILD },
            client,
          });
        },
        () => now,
      );
    });

    it("emits (does not settle) a stale row with malformed persisted channelKind when hydrate also fails — garbage is unproven", async () => {
      const now = 1_780_000_090_000;
      await withQueue(
        async (queue) => {
          const rawMessage = createRawMessage("malformed-kind", "malformed-kind", {
            guild_id: "guild-1",
            content: "malformed kind ambient",
            timestamp: new Date(now - STALE_AMBIENT_BACKLOG_MS - 60_000).toISOString(),
          });
          await expectEmittedNotSuppressed({
            eventId: "malformed-kind",
            queue,
            now,
            rawMessage,
            payload: {
              version: 1,
              receivedAt: now,
              rawMessage,
              channelKind: "malformed",
            } as unknown as DiscordIngressPayload,
            guildEntries: { ...MENTION_REQUIRED_GUILD },
            client: {
              fetchChannel: vi.fn(async () => {
                throw new Error("gone");
              }),
            },
          });
        },
        () => now,
      );
    });

    it("emits (does not settle as ambient) a stale proven thread row — over-correction guard: threads stay answerable", async () => {
      const now = 1_780_000_100_000;
      await withQueue(
        async (queue) => {
          const rawMessage = createRawMessage("thread-kind", "thread-kind", {
            guild_id: "guild-1",
            channel_type: ChannelType.PublicThread,
            content: "old thread follow-up without mention",
            timestamp: new Date(now - STALE_AMBIENT_BACKLOG_MS - 60_000).toISOString(),
          });
          const payload = payloadFor(rawMessage, now);
          expect(payload.channelKind).toBe("thread");
          await expectEmittedNotSuppressed({
            eventId: "thread-kind",
            queue,
            now,
            rawMessage,
            payload,
          });
        },
        () => now,
      );
    });

    it("emits (does not settle) a stale bot-owned autoThread whose gateway channel_type was absent — hydrate proves thread", async () => {
      // Reviewer case: preflight would discover bot-owned autoThread and answer.
      // Ingress must not tombstone before that path runs.
      const now = 1_780_000_105_000;
      await withQueue(
        async (queue) => {
          const rawMessage = createRawMessage("autothread-absent", "autothread-absent", {
            guild_id: "guild-1",
            content: "follow-up in bot autoThread without mention",
            timestamp: new Date(now - STALE_AMBIENT_BACKLOG_MS - 60_000).toISOString(),
          });
          expect(rawMessage).not.toHaveProperty("channel_type");
          const client = clientWithChannelType({
            "autothread-absent": ChannelType.PublicThread,
          });
          await expectEmittedNotSuppressed({
            eventId: "autothread-absent",
            queue,
            now,
            rawMessage,
            payload: { version: 1, receivedAt: now, rawMessage },
            guildEntries: { ...MENTION_REQUIRED_GUILD },
            client,
          });
          expect(client.fetchChannel).toHaveBeenCalledWith("autothread-absent");
        },
        () => now,
      );
    });

    it("emits (does not settle) a stale parent-mention-open channel with absent channel_type — direct-open must answer", async () => {
      // Reviewer case: parent/channel policy requireMention:false means the
      // message deserves a reply even without @mention. Must not ambient-expire.
      const now = 1_780_000_106_000;
      await withQueue(
        async (queue) => {
          const rawMessage = createRawMessage("mention-open-absent", "mention-open-absent", {
            guild_id: "guild-1",
            content: "direct-open room chatter",
            timestamp: new Date(now - STALE_AMBIENT_BACKLOG_MS - 60_000).toISOString(),
          });
          expect(rawMessage).not.toHaveProperty("channel_type");
          await expectEmittedNotSuppressed({
            eventId: "mention-open-absent",
            queue,
            now,
            rawMessage,
            payload: { version: 1, receivedAt: now, rawMessage },
            guildEntries: {
              "guild-1": {
                requireMention: false,
                channels: {
                  "mention-open-absent": { enabled: true, requireMention: false },
                },
              },
            },
            client: clientWithChannelType({
              "mention-open-absent": ChannelType.GuildText,
            }),
          });
        },
        () => now,
      );
    });

    it("emits (does not settle as ambient) a stale DM — DMs are always addressed and must never ambient-expire", async () => {
      const now = 1_780_000_110_000;
      await withQueue(
        async (queue) => {
          const rawMessage = createRawMessage("dm-kind", "dm-kind", {
            content: "old direct message",
            timestamp: new Date(now - STALE_AMBIENT_BACKLOG_MS - 60_000).toISOString(),
          });
          expect(rawMessage).not.toHaveProperty("guild_id");
          await expectEmittedNotSuppressed({
            eventId: "dm-kind",
            queue,
            now,
            rawMessage,
            payload: payloadFor(rawMessage, now, null),
          });
        },
        () => now,
      );
    });

    it("emits a fresh guild ambient row just under the 15m fence — freshness lower bound must still answer", async () => {
      const now = 1_780_000_120_000;
      const ageMs = STALE_AMBIENT_BACKLOG_MS - 1;
      await withQueue(
        async (queue) => {
          const rawMessage = createRawMessage("fresh-boundary", "fresh-boundary", {
            guild_id: "guild-1",
            channel_type: ChannelType.GuildText,
            content: "almost-stale ambient",
            timestamp: new Date(now - ageMs).toISOString(),
          });
          await expectEmittedNotSuppressed({
            eventId: "fresh-boundary",
            queue,
            now,
            rawMessage,
            payload: payloadFor(rawMessage, now),
            receivedAt: now - ageMs,
            guildEntries: { ...MENTION_REQUIRED_GUILD },
          });
        },
        () => now,
      );
    });

    it("settles (does not emit) a proven non-thread guild ambient row just over the 15m fence — freshness upper bound must suppress replay", async () => {
      const now = 1_780_000_130_000;
      const ageMs = STALE_AMBIENT_BACKLOG_MS + 1;
      await withQueue(
        async (queue) => {
          const rawMessage = createRawMessage("stale-boundary", "stale-boundary", {
            guild_id: "guild-1",
            channel_type: ChannelType.GuildText,
            content: "just-stale ambient",
            timestamp: new Date(now - ageMs).toISOString(),
          });
          await expectSettledWithoutEmission({
            eventId: "stale-boundary",
            queue,
            now,
            rawMessage,
            payload: payloadFor(rawMessage, now),
            receivedAt: now - ageMs,
          });
        },
        () => now,
      );
    });
  });

  it("admits a fresh direct mention while stale same-lane suppression is settling", async () => {
    const now = Date.now();
    await withQueue(async (queue) => {
      const stale = createRawMessage("stale-kind", "same-lane", {
        guild_id: "guild-1",
        channel_type: ChannelType.GuildText,
        timestamp: new Date(now - STALE_AMBIENT_BACKLOG_MS - 60_000).toISOString(),
      });
      const fresh = createRawMessage("fresh-kind", "same-lane", {
        guild_id: "guild-1",
        content: "hello <@bot-1>",
        mentions: [{ id: "bot-1" }] as APIMessage["mentions"],
        timestamp: new Date(now).toISOString(),
      });
      const producer = createDiscordIngressMonitor({
        accountId: "default",
        client: {} as never,
        runtime: runtime(),
        queue,
        now: () => now,
        dispatch: vi.fn(),
      });
      await producer.accept(stale);
      await producer.stop();

      const completeStarted = createDeferred<void>();
      const releaseComplete = createDeferred<void>();
      const complete = vi.fn(async (...args: Parameters<typeof queue.complete>) => {
        completeStarted.resolve();
        await releaseComplete.promise;
        return await queue.complete(...args);
      });
      const dispatched: string[] = [];
      const log = vi.fn();
      const error = vi.fn();
      const monitor = createDiscordIngressMonitor({
        accountId: "default",
        client: {} as never,
        runtime: { error, log },
        botUserId: "bot-1",
        queue: { ...queue, complete },
        now: () => now,
        guildEntries: { ...MENTION_REQUIRED_GUILD },
        dispatch: async (event, lifecycle: DiscordIngressLifecycle) => {
          if (event.id) {
            dispatched.push(event.id);
          }
          await lifecycle.onAdopted();
        },
      });
      monitor.start();
      try {
        await completeStarted.promise;
        await monitor.accept(fresh);
        releaseComplete.resolve();
        await vi.waitFor(() => expect(dispatched).toEqual(["fresh-kind"]), {
          timeout: WAIT_TIMEOUT_MS,
        });
        expect(
          log.mock.calls.some(
            (call) =>
              call[0] &&
              typeof call[0] === "object" &&
              (call[0] as { reason?: string }).reason === "stale-ambient-backlog",
          ),
        ).toBe(true);
        expect(error).not.toHaveBeenCalled();
      } finally {
        releaseComplete.resolve();
        await monitor.stop();
      }
    });
  });
});
