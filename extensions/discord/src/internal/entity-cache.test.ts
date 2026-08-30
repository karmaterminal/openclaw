// Discord tests cover entity cache plugin behavior.
import { GatewayDispatchEvents } from "discord-api-types/v10";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscordEntityCache } from "./entity-cache.js";
import type { RequestClient } from "./rest.js";
import type { StructureClient } from "./structures.js";

function makeCache(opts: { ttlMs?: number; maxEntries?: number; sweepIntervalMs?: number }) {
  let getCalls = 0;
  const rest = {
    get: async (route: string) => {
      getCalls += 1;
      const id = route.split("/").pop() ?? "x";
      return { id };
    },
  } as unknown as RequestClient;
  const client = {} as StructureClient;
  const cache = new DiscordEntityCache({ client, rest, ...opts });
  return { cache, getCalls: () => getCalls };
}

describe("DiscordEntityCache eviction", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("caps entries by dropping oldest on insert past maxEntries", async () => {
    const { cache } = makeCache({ ttlMs: 60_000, maxEntries: 3 });

    await cache.fetchUser("u1");
    await cache.fetchUser("u2");
    await cache.fetchUser("u3");
    expect(cache.size).toBe(3);

    await cache.fetchUser("u4");
    expect(cache.size).toBe(3);
  });

  it("sweeps expired entries on insert when sweep interval has elapsed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { cache } = makeCache({ ttlMs: 1, sweepIntervalMs: 0, maxEntries: 1000 });

    await cache.fetchUser("u1");
    await cache.fetchUser("u2");
    expect(cache.size).toBe(2);

    vi.advanceTimersByTime(5);

    await cache.fetchUser("u3");
    expect(cache.size).toBe(1);
  });

  it("does not sweep before sweep interval elapses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { cache } = makeCache({
      ttlMs: 1,
      sweepIntervalMs: 60_000,
      maxEntries: 1000,
    });

    await cache.fetchUser("u1");
    await cache.fetchUser("u2");
    vi.advanceTimersByTime(5);
    await cache.fetchUser("u3");

    expect(cache.size).toBe(3);
  });

  it("does not write when ttl is 0", async () => {
    const { cache } = makeCache({ ttlMs: 0 });

    await cache.fetchUser("u1");
    await cache.fetchUser("u2");

    expect(cache.size).toBe(0);
  });

  it("reuses normalized guild emojis until their cache entry expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { cache } = makeCache({ ttlMs: 30_000 });
    const fetchEmojis = vi.fn(async () => [{ name: "party", identifier: "party:1" }]);

    expect(await cache.fetchGuildEmojis("g1", fetchEmojis)).toEqual([
      { name: "party", identifier: "party:1" },
    ]);
    await cache.fetchGuildEmojis("g1", fetchEmojis);
    expect(fetchEmojis).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    await cache.fetchGuildEmojis("g1", fetchEmojis);
    expect(fetchEmojis).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["updated", GatewayDispatchEvents.ThreadUpdate],
    ["deleted", GatewayDispatchEvents.ThreadDelete],
  ])("invalidates cached channels when a thread is %s", async (_label, eventType) => {
    const { cache, getCalls } = makeCache({ ttlMs: 60_000 });

    await cache.fetchChannel("thread-42");
    await cache.fetchChannel("thread-42");
    expect(getCalls()).toBe(1);

    cache.invalidateForGatewayEvent(eventType, { id: "thread-42" });
    await cache.fetchChannel("thread-42");

    expect(getCalls()).toBe(2);
  });
});

describe("DiscordEntityCache gateway invalidation", () => {
  it("tracks channel types from guild and thread lifecycle events", () => {
    const { cache } = makeCache({ ttlMs: 60_000 });

    cache.invalidateForGatewayEvent(GatewayDispatchEvents.GuildCreate, {
      channels: [{ id: "guild-channel", type: 0 }],
      threads: [{ id: "guild-thread", type: 11 }],
    });
    expect(cache.getGatewayChannelType("guild-channel")).toBe(0);
    expect(cache.getGatewayChannelType("guild-thread")).toBe(11);

    cache.invalidateForGatewayEvent(GatewayDispatchEvents.ChannelUpdate, {
      id: "guild-channel",
      type: 2,
    });
    cache.invalidateForGatewayEvent(GatewayDispatchEvents.ThreadDelete, {
      id: "guild-thread",
    });
    expect(cache.getGatewayChannelType("guild-channel")).toBe(2);
    expect(cache.getGatewayChannelType("guild-thread")).toBeUndefined();

    cache.invalidateForGatewayEvent(GatewayDispatchEvents.Ready, {});
    expect(cache.getGatewayChannelType("guild-channel")).toBeUndefined();
  });

  it("bounds gateway channel metadata by the cache entry limit", () => {
    const { cache } = makeCache({ maxEntries: 2 });

    for (const id of ["channel-1", "channel-2", "channel-3"]) {
      cache.invalidateForGatewayEvent(GatewayDispatchEvents.ChannelCreate, { id, type: 0 });
    }

    expect(cache.getGatewayChannelType("channel-1")).toBeUndefined();
    expect(cache.getGatewayChannelType("channel-2")).toBe(0);
    expect(cache.getGatewayChannelType("channel-3")).toBe(0);
  });

  it("invalidates only the updated guild's normalized emoji list", async () => {
    const { cache } = makeCache({ ttlMs: 60_000 });
    const fetchEmojis = vi.fn(async () => [{ name: "party", identifier: "party:1" }]);

    await cache.fetchGuildEmojis("g1", fetchEmojis);
    await cache.fetchGuildEmojis("g2", fetchEmojis);
    cache.invalidateForGatewayEvent(GatewayDispatchEvents.GuildEmojisUpdate, { guild_id: "g1" });
    await cache.fetchGuildEmojis("g1", fetchEmojis);
    await cache.fetchGuildEmojis("g2", fetchEmojis);

    expect(fetchEmojis).toHaveBeenCalledTimes(3);
  });

  it.each([
    GatewayDispatchEvents.GuildMemberAdd,
    GatewayDispatchEvents.GuildMemberRemove,
    GatewayDispatchEvents.GuildMemberUpdate,
  ])("invalidates member and user entries for %s", async (event) => {
    const { cache, getCalls } = makeCache({ ttlMs: 60_000 });

    await cache.fetchMember("g1", "u1");
    await cache.fetchUser("u1");
    await cache.fetchMember("g1", "u1");
    await cache.fetchUser("u1");
    expect(getCalls()).toBe(2);

    cache.invalidateForGatewayEvent(event, { guild_id: "g1", user: { id: "u1" } });

    await cache.fetchMember("g1", "u1");
    await cache.fetchUser("u1");
    expect(getCalls()).toBe(4);
  });
});
