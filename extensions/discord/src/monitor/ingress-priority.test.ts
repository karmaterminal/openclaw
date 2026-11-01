import { describe, expect, it } from "vitest";
import { isRecentNativeDiscordMention } from "./ingress.js";

describe("Discord recovery priority", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  const botUserId = "bot-123";
  const mention = {
    guild_id: "guild-1",
    timestamp: new Date(now).toISOString(),
    mentions: [{ id: botUserId }],
  };

  it("prioritizes only a recent native mention of this bot in a guild", () => {
    expect(isRecentNativeDiscordMention(mention, botUserId, now)).toBe(true);
    expect(isRecentNativeDiscordMention(mention, "another-bot", now)).toBe(false);
    expect(isRecentNativeDiscordMention(mention, undefined, now)).toBe(false);
    expect(isRecentNativeDiscordMention({ ...mention, guild_id: undefined }, botUserId, now)).toBe(
      false,
    );
    expect(isRecentNativeDiscordMention({ ...mention, mentions: [] }, botUserId, now)).toBe(false);
    expect(isRecentNativeDiscordMention({ ...mention, timestamp: "invalid" }, botUserId, now)).toBe(
      false,
    );
    expect(
      isRecentNativeDiscordMention(
        { ...mention, timestamp: new Date(now - 15 * 60_000 - 1).toISOString() },
        botUserId,
        now,
      ),
    ).toBe(false);
  });

  it("treats a malformed stored timestamp as non-priority instead of throwing", () => {
    // Valid JSON whose own non-callable toString makes Date.parse throw on coercion.
    const stored = JSON.parse(
      `{"guild_id":"guild-1","timestamp":{"toString":null},"mentions":[{"id":"${botUserId}"}]}`,
    );
    expect(() => isRecentNativeDiscordMention(stored, botUserId, now)).not.toThrow();
    expect(isRecentNativeDiscordMention(stored, botUserId, now)).toBe(false);
  });
});
