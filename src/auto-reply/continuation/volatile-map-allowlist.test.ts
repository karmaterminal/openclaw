import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guard-test for session-keyed volatile Maps/Sets/WeakMaps in the
 * §4 continuation surface (per `docs/test-trap-walk/codewalk-file-list.txt`
 * + workorder rule: session/run/task/chain/delegate/queue keyed
 * Map/Set/WeakMap holding future/process-needed state needs an explicit
 * safe-volatile justification or a substrate path).
 *
 * Today the rule is enforced by code review. This test fails when a future
 * change adds `new Map` / `new Set` / `new WeakMap` to the listed prod files
 * without an explicit allowlist entry below.
 *
 * Adding an entry to `ALLOWLIST` MUST include:
 *   - `owner`:        the original author / current substrate owner
 *   - `purpose`:      what the structure tracks
 *   - `classification`: "safe-volatile" (process-scoped, restart-OK to lose)
 *                     | "load-bearing"  (substrate path required, this entry is a TODO)
 *                     | "ephemeral"     (function-scoped, scope justifies absence of substrate)
 *   - `restartContract`: explicit description of what happens to the data on restart
 *   - `justification`: 1-2 sentences explaining why this is safe-volatile
 *                     (or why the load-bearing TODO is acceptable as an interim state)
 *
 * Adding an entry without all five fields fails the test by construction.
 *
 * Companion to:
 *   - PR #462 (#438): mode-only PendingContinuationDelegate trap (encoding-shape)
 *   - PR #463 (#446): continue_delegate descriptor closed-set trap (API-surface)
 *
 * Coverage gap closed: this is the third leg — substrate-shape enforcement
 * over runtime state in continuation-surface modules.
 */

interface AllowlistEntry {
  readonly file: string; // repo-relative path
  readonly line: number; // 1-based line of the `new Map`/`Set`/`WeakMap`
  readonly symbol: string; // identifier the structure is bound to
  readonly owner: string;
  readonly purpose: string;
  readonly classification: "safe-volatile" | "load-bearing" | "ephemeral";
  readonly restartContract: string;
  readonly justification: string;
}

// -----------------------------------------------------------------------------
// Allowlist — every `new Map` / `new Set` / `new WeakMap` in §4 prod files MUST
// appear below or this test fails. Updating the allowlist is intentional and
// requires PR review on the canon (workorder rule cite + comment in the prod
// file marking the structure as volatile-justified).
// -----------------------------------------------------------------------------
const ALLOWLIST: readonly AllowlistEntry[] = [
  {
    file: "src/agents/tools/request-compaction-tool.ts",
    line: 48,
    symbol: "pendingCompactionSessions",
    owner: "🩸 (request-compaction-tool author)",
    purpose:
      "Tracks sessions that have a compaction request in-flight; dedups concurrent request_compaction tool calls before the first lands.",
    classification: "safe-volatile",
    restartContract:
      "Lost on restart by design — a fresh process has no in-flight requests to dedup. Returning 'already pending' is a soft optimization, not a correctness invariant.",
    justification:
      "Process-scoped dedup of active compaction calls. After restart the model retries from a clean state; no chain state lives here.",
  },
  {
    file: "src/auto-reply/continuation/context-pressure.ts",
    line: 44,
    symbol: "lastFiredBand",
    owner: "🌫 (context-pressure subsystem)",
    purpose:
      "Per-session dedup of last-fired pressure band; replaces a prior `-1` magic sentinel via map.has() absence.",
    classification: "safe-volatile",
    restartContract:
      "Lost on restart; pressure-band dedup re-bootstraps when a new lifecycle begins (also reset on compaction by design).",
    justification:
      "Dedup memory, not durable state. The next pressure event after a restart legitimately re-fires for that band.",
  },
  {
    file: "src/auto-reply/continuation/delegate-dispatch.ts",
    line: 33,
    symbol: "hedgeTimers",
    owner: "🩸 (continuation hedge dispatcher)",
    purpose:
      "Per-session hedge timer for re-checking unmatured pending delegates in fully-quiet channels; idempotent per sessionKey (fresh dispatch cancels + replaces).",
    classification: "safe-volatile",
    restartContract:
      "Timer handles do not survive restart. Persistent delegate state lives in TaskFlow. On restart, the next dispatch call re-creates the hedge.",
    justification:
      "Wraps NodeJS.Timeout handles which are inherently process-scoped. Substrate (TaskFlow) holds the durable delegate; this is the local timer registry.",
  },
  {
    file: "src/auto-reply/continuation/delegate-store.ts",
    line: 341,
    symbol: "delayedReservations",
    owner: "🌻 (continuation reservation model, midnight ship)",
    purpose:
      "Tracks delayed continuation reservations whose timers have not yet fired; pairs 1:1 with timer handles in continuation/state.ts.",
    classification: "safe-volatile",
    restartContract:
      "Timer handles do not survive restart. Persistent reservation state for delegates lives in TaskFlow; this Map only tracks the in-process `setTimeout` handles backing the reservation.",
    justification:
      "Process-scoped — timers themselves don't survive restart, so the reservation tracking doesn't need to either. Comment block in source explicitly cites this rule.",
  },
  {
    file: "src/auto-reply/continuation/state.ts",
    line: 14,
    symbol: "continuationTimerHandles",
    owner: "🩸 (continue-work-signal-v2 §3.3 author)",
    purpose:
      "Per-session timer handles for delayed continuation work; cleared on session reset / compaction.",
    classification: "safe-volatile",
    restartContract:
      "Timer handles are process-scoped. After restart, the next continue_work tool call re-arms timers from canonical session-store state.",
    justification:
      "Wraps `ReturnType<typeof setTimeout>` which is inherently process-scoped. RFC `docs/design/continue-work-signal-v2.md §3.3` cites this allowance.",
  },
  {
    file: "src/auto-reply/continuation/state.ts",
    line: 17,
    symbol: "continuationTimerRefs",
    owner: "🩸 (continue-work-signal-v2 §3.3 author)",
    purpose:
      "Per-session ref count for outstanding timers; used to determine if continuation state should be kept alive.",
    classification: "safe-volatile",
    restartContract:
      "Lost on restart; ref count is recomputed from active handles. No state crosses the restart boundary via this Map.",
    justification: "Companion to `continuationTimerHandles` — same scope, same restart semantics.",
  },
  {
    file: "src/auto-reply/continuation/state.ts",
    line: 72,
    symbol: "continuationTimerHandles[set-init]",
    owner: "🩸 (continue-work-signal-v2 §3.3 author)",
    purpose:
      "Inline `new Set([handle])` initializer for a fresh per-session entry in `continuationTimerHandles`.",
    classification: "ephemeral",
    restartContract:
      "Inherits restart contract from the parent Map (`continuationTimerHandles`, line 14).",
    justification:
      "Function-scoped initializer — not a top-level structure. Allowlisted for completeness; deletion would break the registry init path.",
  },
  {
    file: "src/auto-reply/reply/post-compaction-delegate-dispatch.ts",
    line: 504,
    symbol: "entryIds",
    owner: "🩸 (post-compaction-delegate-dispatch author)",
    purpose:
      "Function-local Set materializing a readonly entryIds array for O(1) membership checks during a single drain pass.",
    classification: "ephemeral",
    restartContract: "Function-scoped; lifetime ends when the drain returns.",
    justification:
      "Not a top-level state container — local to one async function call. No restart concern; allowlisted only because the bare `new Set(...)` shape matches the scan regex.",
  },
] as const;

// -----------------------------------------------------------------------------
// §4 prod glob set — derived from `docs/test-trap-walk/codewalk-file-list.txt`
// (continuation surface + adjacent runner/persistence). Excludes *.test.ts.
// -----------------------------------------------------------------------------
const SECTION_4_PROD_FILES: readonly string[] = [
  // src/auto-reply/continuation/**/*.ts
  "src/auto-reply/continuation/config.ts",
  "src/auto-reply/continuation/context-pressure.ts",
  "src/auto-reply/continuation/delegate-dispatch.ts",
  "src/auto-reply/continuation/delegate-store.ts",
  "src/auto-reply/continuation/lazy.runtime.ts",
  "src/auto-reply/continuation/post-compaction-release.ts",
  "src/auto-reply/continuation/scheduler.ts",
  "src/auto-reply/continuation/signal.ts",
  "src/auto-reply/continuation/state.ts",
  "src/auto-reply/continuation/types.ts",
  // src/auto-reply/continuation-*.ts
  "src/auto-reply/continuation-delegate-store.ts",
  "src/auto-reply/continuation-delegate.types.ts",
  // continuation tools
  "src/agents/tools/continue-delegate-tool.ts",
  "src/agents/tools/continuation-tools-registration.ts",
  "src/agents/tools/request-compaction-tool.ts",
  // subagent-announce continuation runtime
  "src/agents/subagent-announce.continuation.runtime.ts",
  // adjacent runner/persistence (continuation chain & post-compaction dispatch)
  "src/auto-reply/reply/followup-runner.ts",
  "src/auto-reply/reply/post-compaction-delegate-dispatch.ts",
] as const;

const VOLATILE_CTOR_RE = /\bnew\s+(Map|Set|WeakMap)\s*[<(]/g;

interface ScanHit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly ctor: "Map" | "Set" | "WeakMap";
}

const repoRoot = path.resolve(__dirname, "..", "..", "..");

async function scanFile(relPath: string): Promise<readonly ScanHit[]> {
  const abs = path.resolve(repoRoot, relPath);
  if (!existsSync(abs)) {
    return [];
  }
  const src = await readFile(abs, "utf8");
  const hits: ScanHit[] = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    VOLATILE_CTOR_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((match = VOLATILE_CTOR_RE.exec(line)) != null) {
      hits.push({
        file: relPath,
        line: i + 1,
        text: line.trim(),
        ctor: match[1] as "Map" | "Set" | "WeakMap",
      });
    }
  }
  return hits;
}

describe("§4 continuation: volatile Map/Set/WeakMap allowlist guard", () => {
  it("rejects new session-keyed volatile Maps outside the reviewed allowlist", async () => {
    const allHits: ScanHit[] = [];
    for (const f of SECTION_4_PROD_FILES) {
      const hits = await scanFile(f);
      allHits.push(...hits);
    }

    // Index allowlist by `${file}:${line}` for O(1) lookup. Multiple allowlist
    // entries can live on the same file/line (e.g. nested `new Set` inside a
    // `new Map<…, Set<…>>` initializer); the index value is an array.
    const allowlistIndex = new Map<string, AllowlistEntry[]>();
    for (const entry of ALLOWLIST) {
      const key = `${entry.file}:${entry.line}`;
      const existing = allowlistIndex.get(key);
      if (existing != null) {
        existing.push(entry);
      } else {
        allowlistIndex.set(key, [entry]);
      }
    }

    const unallowlisted: ScanHit[] = [];
    const matchedKeys = new Set<string>();
    for (const hit of allHits) {
      const key = `${hit.file}:${hit.line}`;
      if (allowlistIndex.has(key)) {
        matchedKeys.add(key);
      } else {
        unallowlisted.push(hit);
      }
    }

    if (unallowlisted.length > 0) {
      const description = unallowlisted.map((h) => `  - ${h.file}:${h.line}  ${h.text}`).join("\n");
      throw new Error(
        [
          `Found ${unallowlisted.length} new \`new ${"Map|Set|WeakMap"}\` occurrence(s) in §4 ` +
            `continuation surface that are NOT in the volatile-Map allowlist:`,
          description,
          "",
          "If this is intentional substrate (process-scoped, restart-OK to lose), add an entry " +
            "to `ALLOWLIST` in `volatile-map-allowlist.test.ts` with all five fields populated:",
          "  - owner / purpose / classification / restartContract / justification",
          "",
          "If this is load-bearing state that must cross the restart boundary, route it through " +
            "TaskFlow (the canonical substrate path) instead of an in-process Map. " +
            "See workorder rule + #368 lane.",
        ].join("\n"),
      );
    }

    // Also fail if the allowlist has stale entries (file/line that no longer
    // contains a matching `new Map|Set|WeakMap` occurrence). Stale entries
    // erode the discipline — they let a deletion silently widen the allowlist
    // without review.
    const stale: AllowlistEntry[] = [];
    for (const entry of ALLOWLIST) {
      const key = `${entry.file}:${entry.line}`;
      if (!matchedKeys.has(key)) {
        stale.push(entry);
      }
    }
    if (stale.length > 0) {
      const description = stale
        .map((e) => `  - ${e.file}:${e.line}  (allowlisted as \`${e.symbol}\`)`)
        .join("\n");
      throw new Error(
        [
          `Found ${stale.length} stale allowlist entry/entries (file/line no longer matches a \`new Map|Set|WeakMap\` ` +
            `in the §4 continuation surface):`,
          description,
          "",
          "Either the prod occurrence was deleted (drop the allowlist entry) or it moved (update the line). " +
            "Stale entries weaken the guard — a future addition could land on the same line without review.",
        ].join("\n"),
      );
    }
  });
});
