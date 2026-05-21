import type { Skill as CanonicalSkill, SourceInfo } from "@earendil-works/pi-coding-agent";

export type SourceScope = "user" | "project" | "temporary";
export type SourceOrigin = "package" | "top-level";

export type Skill = CanonicalSkill & {
  // Preserve legacy source reads while keeping the canonical upstream shape.
  source?: string;
};

export function createSyntheticSourceInfo(
  path: string,
  options: {
    source: string;
    scope?: SourceScope;
    origin?: SourceOrigin;
    baseDir?: string;
  },
): SourceInfo {
  return {
    path,
    source: options.source,
    scope: options.scope ?? "temporary",
    origin: options.origin ?? "top-level",
    baseDir: options.baseDir,
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Keep this formatter's XML layout byte-for-byte aligned with the upstream
 * Agent Skills formatter so we can avoid importing the full pi-coding-agent
 * package root on the cold skills path. Visibility policy is applied upstream
 * before calling this helper.
 *
 * Memoization (per issue #643): per-call template-literal allocation was
 * retaining N copies of `<available_skills>...</available_skills>` in V8 heap
 * across the system-prompt cache + per-session copies (3,664x retained
 * blocks in 10h heap-dump per ronan gcore 2026-05-11 06:18 PDT).
 *
 * Cure-shape: hash-based Map cache keyed by stable concat of
 * name+description+filePath per skill. Handles the snapshot-rebuild-with-same-content
 * case where Skill[] reference changes but content does not (a WeakMap by
 * Skill[] ref alone would miss this). Cache bounded by FORMAT_CACHE_MAX to
 * prevent unbounded growth across distinct skill-set compositions.
 */
const FORMAT_CACHE_MAX = 32;
const formatCache = new Map<string, string>();

function computeSkillsKey(skills: Skill[]): string {
  // Stable key: concat name+description+filePath per skill with field-separators
  // that cannot appear in valid file paths or skill names. \u0001 + \u0002
  // are control chars guaranteed absent from human-authored skill metadata.
  const parts: string[] = [];
  for (const skill of skills) {
    parts.push(skill.name);
    parts.push("\u0001");
    parts.push(skill.description);
    parts.push("\u0001");
    parts.push(skill.filePath);
    parts.push("\u0002");
  }
  return parts.join("");
}

export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return "";
  }
  const key = computeSkillsKey(skills);
  const cached = formatCache.get(key);
  if (cached !== undefined) {
    // LRU-touch: move to end of insertion order so it's not the next eviction target.
    formatCache.delete(key);
    formatCache.set(key, cached);
    return cached;
  }
  const lines = [
    "\n\nThe following skills provide specialized instructions for specific tasks.",
    "Use the read tool to load a skill's file when the task matches its description.",
    "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
    "",
    "<available_skills>",
  ];
  for (const skill of skills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
    lines.push("  </skill>");
  }
  lines.push("</available_skills>");
  const out = lines.join("\n");
  formatCache.set(key, out);
  if (formatCache.size > FORMAT_CACHE_MAX) {
    // Evict oldest entry (Map preserves insertion order; first key is oldest unless touched above).
    const oldest = formatCache.keys().next().value;
    if (oldest !== undefined) {
      formatCache.delete(oldest);
    }
  }
  return out;
}

/**
 * Test-only handle to clear the formatter cache between cases.
 * Internal: not part of public API.
 */
export function __resetFormatSkillsForPromptCache(): void {
  formatCache.clear();
}
