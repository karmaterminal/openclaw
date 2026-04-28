// Rebase-bot tracer shim — span emission for the §1 trap-class classifier.
//
// Per `docs/design/swim-37-classifier-span-memo.md` (cohort sign-off
// 2026-04-27, Q1=Option B, Q2/Q2.5=in-PR helper at `src/rebase/tracer.ts`,
// Q4=emit PICK normally with no special handling): this module is a peer
// of `src/infra/continuation-tracer.ts`, NOT a member of it. The two
// domains share the underlying `Tracer` shim type from `src/infra/`, but
// their span vocabularies are structurally distinct:
//
//   - `src/infra/continuation-tracer.ts` emits `continuation.*` and
//     `heartbeat` spans whose canonical attribute set is dominated by
//     `chain.id`, `chain.step.remaining`, `compaction.id`, etc.
//
//   - This module emits `rebase.classify` spans whose canonical attribute
//     set is dominated by `verdict`, `discovery.channel`, `pick.sha`, and
//     channel-specific `evidence.*` attrs.
//
// The negative-assert pins (`chain.id`, `chain.step.remaining`,
// `disabled.reason` MUST be absent on `rebase.classify` spans) defend
// against future drift toward conflating rebase-bot lifecycle with
// continuation lifecycle. Same family-resemblance discipline as
// #410/#411/#412/#414/#415.
//
// The harness in `studies/swim-37/harness/swim-runner.test.ts` pins
// against THIS module via a separate `captureClassify()` entry point
// (Option B), which makes the negative-asserts structurally enforceable
// at the type-system level — `CaptureClassifyOptions` literally cannot
// accept `chainId`/`compactionId` because the params don't exist.

import { getContinuationTracer, type SpanAttributes } from "../infra/continuation-tracer.ts";

/**
 * Canonical enumeration of `verdict` attribute values emitted by
 * `rebase.classify` spans. Mirrors `RebaseVerdict` in
 * `studies/swim-37/harness/rebase-classifier.ts:45` — runtime SSOT.
 */
export const REBASE_VERDICTS = ["DROP", "PICK", "REVIEW"] as const;
export type RebaseVerdict = (typeof REBASE_VERDICTS)[number];

/**
 * Canonical enumeration of `discovery.channel` attribute values.
 * Mirrors `RebaseDiscoveryChannel` in
 * `studies/swim-37/harness/rebase-classifier.ts:46-51` — runtime SSOT.
 */
export const REBASE_DISCOVERY_CHANNELS = [
  "changelog-grep:pr",
  "changelog-grep:subject",
  "cherry-pick-provenance",
  "conflict-content",
  "none",
] as const;
export type RebaseDiscoveryChannel = (typeof REBASE_DISCOVERY_CHANNELS)[number];

/**
 * Canonical enumeration of `evidence.conflict.bin` attribute values.
 * Mirrors the conflict-content rubric bin set from
 * `studies/swim-37/harness/conflict-content-rubric.ts`.
 */
export const REBASE_CONFLICT_BINS = [
  "test-harness",
  "naming-label",
  "release-plumbing",
  "feature-runtime",
  "none",
] as const;
export type RebaseConflictBin = (typeof REBASE_CONFLICT_BINS)[number];

/**
 * Channel-specific evidence inputs. Per memo §2 conditional-attributes
 * table: each evidence sub-object MUST be present iff its channel
 * matches; unrelated channels' evidence MUST be omitted.
 *
 * The helper does NOT cross-validate channel vs evidence — that's the
 * caller's contract. The helper attaches whatever evidence sub-objects
 * are supplied as the corresponding `evidence.*` attributes; if the
 * caller passes inconsistent evidence (e.g. `cherryPickSourceSha` on a
 * `changelog-grep:pr` channel), the resulting span will be honest about
 * what the caller did wrong.
 */
export interface RebaseClassifyEvidence {
  /** present iff `channel === "changelog-grep:pr"`; the matched PR-token (e.g. `"#70595"`) */
  readonly changelogPrToken?: string;
  /** present iff `channel === "changelog-grep:subject"`; count of subject-line hits */
  readonly changelogSubjectMatchCount?: number;
  /** present iff `channel === "cherry-pick-provenance"`; source SHA from footer (truncated to 12 chars by the helper) */
  readonly cherryPickSourceSha?: string;
  /** present iff `channel === "conflict-content"` OR (`channel === "none"` AND callback ran AND returned REVIEW) */
  readonly conflictBin?: RebaseConflictBin;
  /** present iff `verdict === "REVIEW" && channel === "none"` AND the `conflictContent` callback was NOT supplied */
  readonly needsConflictContentInspection?: boolean;
}

export interface EmitRebaseClassifySpanArgs {
  readonly verdict: RebaseVerdict;
  readonly channel: RebaseDiscoveryChannel;
  /** Commit SHA being classified. The helper truncates to 12 chars before emit. */
  readonly pickSha: string;
  readonly evidence?: RebaseClassifyEvidence;
  readonly log?: (message: string) => void;
}

/**
 * Truncate a SHA-like string to the canonical 12-char prefix. Matches
 * the `git rev-parse --short=12` shape the rebase-bot uses elsewhere.
 * Strings shorter than 12 chars are returned unchanged (the helper does
 * NOT pad — short input is honest about being short).
 */
function truncateSha(sha: string): string {
  return sha.length > 12 ? sha.slice(0, 12) : sha;
}

/**
 * Emit a `rebase.classify` span describing a single classifier verdict.
 *
 * Per memo §0–§4 cohort sign-off (2026-04-27):
 *   - PICK emits normally (no throw, no special handling) — the helper
 *     is a transparent record of classifier output (Q4 lean A)
 *   - Negative-assert pins: this helper MUST NOT attach `chain.id`,
 *     `chain.step.remaining`, or `disabled.reason` (rebase-bot domain
 *     ≠ continuation domain). The signature has no params for those
 *     so the assertion is structurally enforced at type-system level
 *   - try/catch wrap mirrors `emitContinuationCompactionReleasedSpan`
 *     and `emitContinuationWorkSpan` so producer-side construction
 *     errors don't propagate through to the rebase-bot caller
 */
export function emitRebaseClassifySpan(args: EmitRebaseClassifySpanArgs): void {
  try {
    const truncatedSha = truncateSha(args.pickSha);

    // §B conditional-spread: each evidence attr is attached iff the
    // caller supplied it. The helper performs no cross-channel
    // validation — see RebaseClassifyEvidence docstring for why.
    const ev = args.evidence;
    const attrs: SpanAttributes = {
      "signal.kind": "rebase.classify",
      verdict: args.verdict,
      "discovery.channel": args.channel,
      "pick.sha": truncatedSha,
      ...(ev?.changelogPrToken !== undefined
        ? { "evidence.changelog.pr_token": ev.changelogPrToken }
        : {}),
      ...(ev?.changelogSubjectMatchCount !== undefined
        ? { "evidence.changelog.subject_match_count": ev.changelogSubjectMatchCount }
        : {}),
      ...(ev?.cherryPickSourceSha !== undefined
        ? { "evidence.cherry_pick.source_sha": truncateSha(ev.cherryPickSourceSha) }
        : {}),
      ...(ev?.conflictBin !== undefined ? { "evidence.conflict.bin": ev.conflictBin } : {}),
      ...(ev?.needsConflictContentInspection === true
        ? { "needs.conflict_content_inspection": true }
        : {}),
    };

    const tracer = getContinuationTracer();
    const span = tracer.startSpan("rebase.classify", { attributes: attrs });
    span.setStatus("OK");
    span.end();
  } catch (err) {
    args.log?.(`Failed to emit rebase.classify span: ${String(err)}`);
  }
}
