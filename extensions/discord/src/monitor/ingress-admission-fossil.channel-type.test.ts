// #1229 fossil A — real-shaped MESSAGE_CREATE freshness fence.
//
// Gateway MESSAGE_CREATE guild payloads expose `channel_type` (see
// discord-api-types GatewayMessageCreateDispatchData). They do not ship a
// hydrated `channel` object. Production canExpireDiscordStaleAmbientBacklog
// currently reads only rawMessage.channel via resolveDiscordChannelInfoSafe,
// so a captured-shape row with channel_type:0 fails open and the stale ambient
// fence is inert (upstream #121204-class miss).
//
// Desired contract (this file): stale ambient guild rows are suppressed while
// a fresh mention remains eligible. Expected RED on current #1229 tree until
// the fence reads channel_type (or equivalent authoritative raw type).
// Test-only; do not "fix" by adding a synthetic channel object to fixtures.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ChannelType, type APIMessage } from "discord-api-types/v10";
import type { ChannelIngressQueue } from "openclaw/plugin-sdk/channel-outbound";
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
  rawMessage: APIMessage;
};

/** Captured MESSAGE_CREATE extras that are not on plain APIMessage. */
type MessageCreateShape = Partial<APIMessage> & {
  guild_id?: string;
  channel_type?: number;
  /** Must stay absent on the fossil fixture. */
  channel?: undefined;
};

const CHANNEL_ID = "fossil-message-create-guild-text";
const STALE_MS = 15 * 60 * 1_000;
const WAIT_MS = 10_000;
const WARM_MS = 120_000;

function createMessageCreateFixture(id: string, overrides: MessageCreateShape = {}): APIMessage {
  const { channel: _forbidChannel, ...rest } = overrides;
  const raw = {
    id,
    channel_id: CHANNEL_ID,
    // Authoritative guild text type on the wire for MESSAGE_CREATE.
    channel_type: ChannelType.GuildText,
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
    guild_id: "guild-1",
    ...rest,
  };
  // Fossil invariant: no synthetic channel object may sneak in.
  expect(Object.hasOwn(raw, "channel")).toBe(false);
  expect(raw.channel_type).toBe(ChannelType.GuildText);
  return raw as unknown as APIMessage;
}

function payloadFor(rawMessage: APIMessage, receivedAt: number): DiscordIngressPayload {
  return { version: 1, receivedAt, rawMessage };
}

function runtime(): Pick<RuntimeEnv, "error" | "log"> {
  return { error: vi.fn(), log: vi.fn() };
}

function guildEntries(): Record<string, DiscordGuildEntryResolved> {
  return {
    "guild-1": {
      channels: {
        [CHANNEL_ID]: { enabled: true, requireMention: false },
      },
    },
  };
}

async function withQueue<T>(
  now: () => number,
  fn: (queue: ChannelIngressQueue<DiscordIngressPayload>) => Promise<T>,
): Promise<T> {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-discord-fossil-a-"));
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

describe("fossil A: MESSAGE_CREATE channel_type freshness fence (#1229)", () => {
  beforeAll(async () => {
    await import("openclaw/plugin-sdk/channel-inbound");
  }, WARM_MS);

  afterEach(() => {
    closeOpenClawStateDatabaseForTest();
  });

  it("suppresses stale ambient guild rows with channel_type:0 and no channel object", async () => {
    const clock = 1_790_000_000_000;
    const staleId = "fossil-a-stale-ambient";
    const freshId = "fossil-a-fresh-mention";
    await withQueue(
      () => clock,
      async (queue) => {
        const staleSentAt = clock - STALE_MS - 1_000;
        const stale = createMessageCreateFixture(staleId, {
          content: "ordinary old room text",
          timestamp: new Date(staleSentAt).toISOString(),
        });
        const fresh = createMessageCreateFixture(freshId, {
          content: "fresh direct ask <@bot-1>",
          mentions: [{ id: "bot-1" }] as APIMessage["mentions"],
          timestamp: new Date(clock).toISOString(),
        });

        await queue.enqueue(staleId, payloadFor(stale, clock), {
          laneKey: `channel:${CHANNEL_ID}`,
          receivedAt: clock,
        });
        await queue.enqueue(freshId, payloadFor(fresh, clock), {
          laneKey: `channel:${CHANNEL_ID}`,
          receivedAt: clock + 1,
        });

        const dispatched: string[] = [];
        const monitor = createDiscordIngressMonitor({
          accountId: "default",
          client: {} as never,
          runtime: runtime(),
          botUserId: "bot-1",
          guildEntries: guildEntries(),
          now: () => clock,
          queue,
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
          // Desired: only the fresh mention is admitted; stale ambient is fenced.
          await vi.waitFor(() => expect(dispatched).toEqual([freshId]), { timeout: WAIT_MS });
          expect(await queue.listFailed?.({ limit: "all" })).toMatchObject([
            { id: staleId, reason: "stale-ambient-backlog" },
          ]);
        } finally {
          await monitor.stop();
        }
      },
    );
  });
});
