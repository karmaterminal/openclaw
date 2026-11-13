export function isRecentNativeDiscordMention(
  raw: { guild_id?: string; timestamp?: unknown; mentions?: Array<{ id: string }> } | undefined,
  botUserId: string | undefined,
  nowMs = Date.now(),
): boolean {
  return Boolean(
    botUserId &&
    raw?.guild_id &&
    typeof raw.timestamp === "string" &&
    Date.parse(raw.timestamp) >= nowMs - 15 * 60_000 &&
    Array.isArray(raw.mentions) &&
    raw.mentions.some((user) => user?.id === botUserId),
  );
}
