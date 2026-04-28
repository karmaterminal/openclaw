/**
 * studies/swim-37/harness/rebase-classifier.ts
 *
 * SWIM-37 §1 trap-class entry-point: the rebase-bot's classifier verdict.
 *
 * Combines the two positive-signal §1 discovery channels (CHANGELOG-grep
 * + cherry-pick-provenance) into a single DROP/PICK/REVIEW decision, with
 * channel attribution and structured evidence for downstream span emission.
 *
 * Wires the §1 entry-point it.todo placeholder
 *   "rebase bot classifies synthetic squash-rebased commit as DROP (not PICK)"
 * (swim-runner.test.ts L80) onto runnable ground.
 *
 * Memo cross-reference: studies/swim-37/traps/parallel-evolution-class.md
 *   §2 byte-walk verdicts —
 *     7ee46a3ab9 (#70595)         → DROP via CHANGELOG-grep:pr
 *     e515ea1f31 (test-harness)   → DROP via conflict-content rubric (NOT pinnable here)
 *     aa1908bf38 (cherry-picked)  → DROP via cherry-pick-provenance
 *
 * Boundary: pure function. Caller supplies:
 *   - commit subject (from `git log -1 --format='%s' <pick>`)
 *   - commit body (from `git show -s --format=%B <pick>`)
 *   - base CHANGELOG content (from `git show <base>:CHANGELOG.md`)
 *   - `isAncestorOf(sha) → boolean` callback wrapping `git merge-base
 *     --is-ancestor <sha> <base>`
 *
 * No git, no fs, no network in this module — all I/O is the caller's job.
 *
 * Conflict-content classification rubric (the third channel from the memo)
 * is NOT covered here. It needs file-path + diff inspection, which is a
 * different shape (not pure string→struct). When CHANGELOG-grep AND
 * cherry-pick-provenance both miss, this classifier returns REVIEW with
 * `needs.conflict_content_inspection=true` so the caller can hand off to
 * the conflict-content channel rather than silently default to PICK.
 */

import { discoverChangelogHit, type ChangelogGrepHit } from "./changelog-grep.ts";
import {
  parseCherryPickProvenance,
  type CherryPickProvenanceFooter,
} from "./cherry-pick-provenance.ts";

export type RebaseVerdict = "DROP" | "PICK" | "REVIEW";

export type RebaseDiscoveryChannel =
  | "changelog-grep:pr"
  | "changelog-grep:subject"
  | "cherry-pick-provenance"
  | "none";

export interface RebaseEvidence {
  /** PR-token hits (composite returned matched=true with PR-token needle). */
  readonly changelogPrHit?: ChangelogGrepHit;
  /** Subject hits (composite returned matched=true with subject needle). */
  readonly changelogSubjectHits?: readonly ChangelogGrepHit[];
  /** Cherry-pick footer whose source SHA was found ancestor-of-base. */
  readonly cherryPickFooter?: CherryPickProvenanceFooter;
  /**
   * Cherry-pick footers parsed but NOT ancestor-of-base. Caller may use
   * these for cross-branch provenance audit even though they don't
   * support a DROP verdict.
   */
  readonly cherryPickFootersNotAncestor?: readonly CherryPickProvenanceFooter[];
}

export interface RebaseClassification {
  readonly verdict: RebaseVerdict;
  readonly channel: RebaseDiscoveryChannel;
  readonly evidence: RebaseEvidence;
  /**
   * True when verdict is REVIEW and the caller should run the
   * conflict-content classification rubric (third channel from memo §1).
   * Not set on DROP/PICK paths.
   */
  readonly needsConflictContentInspection?: boolean;
}

export interface ClassifyRebasePickInput {
  readonly subject: string;
  readonly commitBody: string;
  readonly baseChangelog: string;
  readonly isAncestorOf: (sha: string) => boolean;
}

/**
 * Classify a single picked-commit candidate against base. Returns DROP
 * with channel attribution when either discovery channel produces a
 * positive signal; returns REVIEW with `needsConflictContentInspection`
 * when both miss; returns PICK only when explicitly safe (no provenance
 * signal AND no changelog signal — i.e. genuinely new work).
 *
 * Channel ordering (deterministic, memo-aligned):
 *   1. cherry-pick-provenance (highest precision: an exact source SHA
 *      that's ancestor-of-base is unambiguous)
 *   2. changelog-grep PR-token (high precision: PR number tokens rarely
 *      collide)
 *   3. changelog-grep subject (medium precision: substring, can collide)
 *
 * The first channel to fire wins; ties impossible by ordering. Other
 * channels' evidence is still recorded in the evidence record so the
 * downstream span can carry full audit data even when only one channel
 * was load-bearing for the verdict.
 */
export function classifyRebasePick(input: ClassifyRebasePickInput): RebaseClassification {
  const { subject, commitBody, baseChangelog, isAncestorOf } = input;

  // ── Channel 1: cherry-pick-provenance ──────────────────────────────
  const provenance = parseCherryPickProvenance(commitBody);
  const ancestorFooters: CherryPickProvenanceFooter[] = [];
  const nonAncestorFooters: CherryPickProvenanceFooter[] = [];
  for (const footer of provenance.footers) {
    if (isAncestorOf(footer.sha)) {
      ancestorFooters.push(footer);
    } else {
      nonAncestorFooters.push(footer);
    }
  }

  // ── Channel 2 / 3: CHANGELOG-grep (composite) ──────────────────────
  // Run regardless of channel-1 outcome so evidence is complete even
  // when channel-1 is load-bearing for the verdict.
  const changelogResult = discoverChangelogHit(subject, baseChangelog);
  // The composite returns ALL hits but flags channel by `needle`.
  // We re-derive channel attribution here for evidence shaping.
  const subjectIsPrToken =
    changelogResult.needle.startsWith("#") && changelogResult.needle.length > 1;
  const changelogPrHit =
    changelogResult.matched && subjectIsPrToken ? changelogResult.hits[0] : undefined;
  const changelogSubjectHits =
    changelogResult.matched && !subjectIsPrToken ? changelogResult.hits : undefined;

  const evidence: RebaseEvidence = {
    ...(changelogPrHit ? { changelogPrHit } : {}),
    ...(changelogSubjectHits ? { changelogSubjectHits } : {}),
    ...(ancestorFooters.length > 0
      ? { cherryPickFooter: ancestorFooters[ancestorFooters.length - 1] }
      : {}),
    ...(nonAncestorFooters.length > 0 ? { cherryPickFootersNotAncestor: nonAncestorFooters } : {}),
  };

  // ── Verdict (channel ordering deterministic) ───────────────────────
  if (ancestorFooters.length > 0) {
    return {
      verdict: "DROP",
      channel: "cherry-pick-provenance",
      evidence,
    };
  }
  if (changelogPrHit) {
    return {
      verdict: "DROP",
      channel: "changelog-grep:pr",
      evidence,
    };
  }
  if (changelogSubjectHits && changelogSubjectHits.length > 0) {
    return {
      verdict: "DROP",
      channel: "changelog-grep:subject",
      evidence,
    };
  }

  // ── No positive signal: hand off to conflict-content rubric ────────
  // The memo's §1 third channel is harder than a pure function — needs
  // file paths + diff inspection. The classifier surfaces the gap
  // explicitly rather than defaulting to PICK, which would silently
  // misclassify the test-harness divergence cases (e515ea1f31).
  return {
    verdict: "REVIEW",
    channel: "none",
    evidence,
    needsConflictContentInspection: true,
  };
}
