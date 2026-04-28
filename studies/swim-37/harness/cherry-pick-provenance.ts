/**
 * studies/swim-37/harness/cherry-pick-provenance.ts
 *
 * SWIM-37 trap-class §1 cross-cut discovery channel:
 * **cherry-pick provenance grep**.
 *
 * From studies/swim-37/traps/parallel-evolution-class.md (cross-cut, L168):
 *
 *   Instances 2 and 3 carry `(cherry picked from commit <sha>)` markers in
 *   their commit bodies. A second discovery channel falls out: parse the
 *   provenance footer; if the source SHA is already an ancestor of base,
 *   the picked commit is functionally already there → DROP.
 *
 *   for sha in $(git log --format=%H <merge-base>..<rebase-source>); do
 *     src=$(git show -s --format=%B "$sha" \
 *           | sed -n 's/^.*cherry picked from commit \([0-9a-f]*\).*$/\1/p')
 *     [ -n "$src" ] && git merge-base --is-ancestor "$src" <base> \
 *       && echo "DROP $sha (source $src already in base)"
 *   done
 *
 *   Would have caught `aa1908bf38` deterministically before conflict triage.
 *
 * This module implements the parse step as a pure function. The caller is
 * responsible for the `git merge-base --is-ancestor` check (which is the
 * runtime/git-side decision) and for driving `git show -s --format=%B`
 * to obtain the commit body.
 *
 * Boundary: pure string-in, structured-out. No git, no fs, no network.
 *
 * Discipline points:
 *   - Multiple cherry-pick footers can stack when a commit has been
 *     cherry-picked across multiple branches; return ALL footers in
 *     body order so the caller can decide which is load-bearing.
 *   - The standard footer form is exactly:
 *       `(cherry picked from commit <40-hex>)`
 *     We accept that form and the variant with a trailing period or
 *     other trailing punctuation. We do NOT accept arbitrary text.
 *   - Some tools emit short SHAs (7-12 hex). We accept 7+ hex chars
 *     (git's minimum unique short-SHA floor) so we don't drop legitimate
 *     provenance signals from non-default tooling.
 */

export interface CherryPickProvenanceFooter {
  /** The full hex SHA exactly as it appeared in the footer. */
  readonly sha: string;
  /** 1-indexed line number in the commit body. */
  readonly lineNumber: number;
  /** The full footer line (trimmed of trailing whitespace only). */
  readonly line: string;
}

export interface CherryPickProvenanceResult {
  /** True iff at least one footer was parsed. */
  readonly hasProvenance: boolean;
  /** All footers in body-line order. Empty when hasProvenance=false. */
  readonly footers: readonly CherryPickProvenanceFooter[];
}

// Anchored: line must be exactly the footer (after optional leading
// whitespace, with optional trailing punctuation). 7+ hex chars matches
// git's minimum unique short-SHA floor; 40 hex is the standard full SHA.
//
// Capture groups: 1 = sha
const CHERRY_PICK_FOOTER_RE = /^\s*\(cherry picked from commit ([0-9a-f]{7,40})\)[.,;:]?\s*$/u;

/**
 * Parse all `(cherry picked from commit <sha>)` footers out of a commit
 * message body. Returns ALL footers in body order so the caller can
 * decide which provenance is load-bearing when a commit has been
 * cherry-picked across multiple branches.
 *
 * Empty input returns hasProvenance=false with no footers.
 */
export function parseCherryPickProvenance(commitBody: string): CherryPickProvenanceResult {
  if (commitBody.length === 0) {
    return { hasProvenance: false, footers: [] };
  }
  const lines = commitBody.split("\n");
  const footers: CherryPickProvenanceFooter[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const match = CHERRY_PICK_FOOTER_RE.exec(line);
    if (match && match[1]) {
      footers.push({
        sha: match[1],
        lineNumber: i + 1,
        line: line.replace(/\s+$/u, ""),
      });
    }
  }
  return { hasProvenance: footers.length > 0, footers };
}

/**
 * Convenience: returns the LAST cherry-pick footer's SHA, or null if
 * no footer is present. The last footer is the most recent pick in the
 * chain (chronologically), which is typically what the caller wants
 * for "is the immediate source of THIS commit already in base?".
 *
 * For multi-pick provenance walking, use `parseCherryPickProvenance`
 * directly and iterate.
 */
export function lastCherryPickSourceSha(commitBody: string): string | null {
  const result = parseCherryPickProvenance(commitBody);
  if (!result.hasProvenance) return null;
  const last = result.footers[result.footers.length - 1];
  return last ? last.sha : null;
}
