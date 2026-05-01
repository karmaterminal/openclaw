// Detects an agent-name "speaker" prefix at the start of a message body,
// e.g. `[agent-name] ...` or `[some prefix - agent-name] ...` with optional
// trailing emoji glyph.
//
// When the frame is present the entire payload is treated as leaked internal
// narration and suppressed silently by `normalize-reply` (mirrors the
// trailing-NO_REPLY silent-class semantics).
//
// The agent-name allow-list and glyph allow-list are sourced from environment
// variables with empty defaults: an unconfigured deployment matches nothing
// and suppresses nothing. Each variable is a comma-separated list, e.g.
//
//   OPENCLAW_COT_FRAME_AGENT_NAMES="agent-a,agent-b"
//   OPENCLAW_COT_FRAME_AGENT_GLYPHS="🟦,🟩"
//
// The glyph match accepts an optional VS16 (U+FE0F) so emitters that drop
// the variation selector still match. Names are case-insensitive.

function readListFromEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPrefixRegex(): RegExp | null {
  const names = readListFromEnv("OPENCLAW_COT_FRAME_AGENT_NAMES");
  if (names.length === 0) {
    return null;
  }
  const glyphs = readListFromEnv("OPENCLAW_COT_FRAME_AGENT_GLYPHS");
  const namesAlt = names.map(escapeForRegex).join("|");
  const glyphSuffix =
    glyphs.length > 0 ? String.raw`(?:\s*(?:${glyphs.map(escapeForRegex).join("|")})\uFE0F?)?` : "";
  return new RegExp(String.raw`^\s*\[(?:[^\]]+ - )?(?:${namesAlt})${glyphSuffix}\]`, "iu");
}

let cachedRegex: RegExp | null | undefined;

function getPrefixRegex(): RegExp | null {
  if (cachedRegex === undefined) {
    cachedRegex = buildPrefixRegex();
  }
  return cachedRegex;
}

/** Test-only: clears the env-derived regex cache so tests can mutate env vars. */
export function __resetCotFrameRegexCacheForTests(): void {
  cachedRegex = undefined;
}

export function hasCotFramePrefix(text: string): boolean {
  if (!text) {
    return false;
  }
  const re = getPrefixRegex();
  if (!re) {
    return false;
  }
  return re.test(text);
}
