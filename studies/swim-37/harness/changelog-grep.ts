/**
 * studies/swim-37/harness/changelog-grep.ts
 *
 * SWIM-37 trap-class §1 (parallel-evolution / cherry-false-negative)
 * discovery channel: CHANGELOG-byte-grep.
 *
 * From studies/swim-37/traps/parallel-evolution-class.md:
 *
 *   When `git cherry` says "not yet upstream" but the upstream PR has
 *   actually landed in base under a different patch-id (squash-merge,
 *   rebase, parallel evolution), the rebase agent will mis-classify and
 *   either burn cycles wedging a `--theirs` resolution that regresses
 *   base, or abort and flag a false merge-conflict.
 *
 *   CHANGELOG-byte-grep is the high-precision positive signal:
 *     git show <base>:CHANGELOG.md | grep -F "$(git log -1 --format='%s' <commit>)"
 *
 *   If a hit lands, the upstream PR is already in base; the conflict is
 *   parallel-evolution, not feature collision. → DROP.
 *
 * This module implements the grep step as a pure function so the swim-37
 * harness can drive it deterministically without shelling out, and so the
 * §1 `it.todo("CHANGELOG-byte-grep discovery channel emits drop-with-reason
 * span")` placeholder can be wired without captureSwim().
 *
 * Boundary: pure string-in, structured-result-out. No git, no fs, no
 * network. The caller is responsible for `git show <base>:CHANGELOG.md`
 * and `git log -1 --format='%s' <commit>`.
 *
 * Discipline points captured from the trap-class memo's "Limitations"
 * section:
 *   - Subject-line collisions can produce false positives → return ALL
 *     matching lines, not just the first, so the caller can decide.
 *   - PR-number-only matching (e.g. "#70595") is the most reliable signal
 *     when the commit subject embeds one; provide a separate path for it.
 *   - Empty/whitespace subject must NOT match every CHANGELOG line.
 */

export interface ChangelogGrepHit {
  /** 1-indexed line number in the changelog where the match was found. */
  readonly lineNumber: number;
  /** The full changelog line, trimmed of trailing whitespace only. */
  readonly line: string;
}

export interface ChangelogGrepResult {
  /** True iff at least one hit was found. */
  readonly matched: boolean;
  /**
   * All hits in changelog-line order. Empty when matched=false.
   * Multiple hits indicate a subject-line collision; the caller decides
   * how to weight that — DROP on first hit is the trap-class memo's
   * default but may be tightened with PR-number cross-check.
   */
  readonly hits: readonly ChangelogGrepHit[];
  /**
   * Diagnostic for downstream span-emission: the exact needle the grep
   * was performed against, after trimming. Empty string if the input
   * was empty/whitespace and the grep was therefore skipped.
   */
  readonly needle: string;
}

/**
 * Grep `commitSubject` (verbatim, with `grep -F` semantics — no regex)
 * against the lines of `changelogContent`. Returns ALL hits so callers
 * can detect subject-line collisions.
 *
 * Empty/whitespace subject returns matched=false with needle="" — does
 * NOT match every line. This matters because `git log -1 --format='%s'`
 * on a malformed commit can return empty, and a grep-everything answer
 * would force every conflict to DROP.
 */
export function grepChangelog(
  commitSubject: string,
  changelogContent: string,
): ChangelogGrepResult {
  const needle = commitSubject.trim();
  if (needle.length === 0) {
    return { matched: false, hits: [], needle: "" };
  }
  const lines = changelogContent.split("\n");
  const hits: ChangelogGrepHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.includes(needle)) {
      hits.push({
        lineNumber: i + 1,
        line: line.replace(/\s+$/u, ""),
      });
    }
  }
  return { matched: hits.length > 0, hits, needle };
}

/**
 * Tighter signal: extract a `(#NNNNN)` PR-number reference from a
 * commit subject and grep the changelog for THAT token. This is the
 * `7ee46a3ab9` instance in the trap-class memo: the subject ended in
 * `(#70595)`, and the changelog had a hit on `#70595` byte-identical.
 *
 * Returns null if no PR-number is present in the subject (caller falls
 * back to `grepChangelog` against the full subject).
 *
 * Pattern: `(#` followed by 1+ digits followed by `)`. Last match wins
 * if multiple are present (commits sometimes cite earlier PRs in body
 * but the subject typically ends with the landing PR).
 */
export function extractPrNumberToken(commitSubject: string): string | null {
  const matches = [...commitSubject.matchAll(/\(#(\d+)\)/gu)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  if (!last) return null;
  return `#${last[1]}`;
}

/**
 * Composite discovery: prefer PR-number signal when available, fall back
 * to full-subject grep. Returns the result that found hits, or the
 * full-subject result when both are empty (so the caller still has the
 * needle for span attrs).
 *
 * Channel attribution is in the result's `needle` field — callers should
 * record `discovery.channel="changelog-grep:pr"` vs `"changelog-grep:subject"`
 * based on whether `extractPrNumberToken(subject) === result.needle`.
 */
export function discoverChangelogHit(
  commitSubject: string,
  changelogContent: string,
): ChangelogGrepResult {
  const prToken = extractPrNumberToken(commitSubject);
  if (prToken !== null) {
    const prResult = grepChangelog(prToken, changelogContent);
    if (prResult.matched) return prResult;
  }
  return grepChangelog(commitSubject, changelogContent);
}
