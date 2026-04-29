/**
 * studies/swim-37/harness/conflict-content-rubric.ts
 *
 * SWIM-37 §1 trap-class third discovery channel: **conflict-content
 * classification rubric**.
 *
 * Closes the gap left explicitly uncovered by PR #408 (where
 * `classifyRebasePick` returns
 * `REVIEW + needsConflictContentInspection=true` when the two pure
 * positive-signal channels — `changelog-grep` and
 * `cherry-pick-provenance` — both miss).
 *
 * Memo cross-reference: studies/swim-37/traps/parallel-evolution-class.md
 *   §"Conflict-content classification rubric" (four bins):
 *     - feature/runtime  → REVIEW (STOP, prince inspection)
 *     - test-harness     → DROP   (paths: *.live.test.*, scripts/test-*, e2e/)
 *     - naming/label     → DROP   (string-literal substitutions only)
 *     - release-plumbing → DROP   (version bumps, generated baselines)
 *
 * The pure-function shape from #408 is preserved: the module takes a
 * `ConflictReport` struct produced by the rebase driver (caller's
 * responsibility) and returns a structured verdict. NO git, NO fs, NO
 * network in this module.
 *
 * Pinned to memo §2 byte-walk Instance 2 (`e515ea1f31`,
 * test-harness divergence) — the representative case where CHANGELOG
 * is silent, no cherry-pick footer, but ground-truth verdict is DROP.
 *
 * Issue: karmaterminal/openclaw#409
 * Parent: karmaterminal/openclaw#324
 */

export type ConflictRubricVerdict = "DROP" | "PICK" | "REVIEW";

/**
 * Classifies which of the four rubric bins fired (or "none" when
 * insufficient evidence). Mirrors the memo's §"Conflict-content
 * classification rubric" enumeration.
 */
export type ConflictRubricBin =
  | "test-harness"
  | "naming-label"
  | "release-plumbing"
  | "feature-runtime"
  | "none";

/**
 * Per-file diff descriptor supplied by the rebase driver. The
 * `pathA`/`pathB` distinction lets the caller represent renames
 * (path differs across the conflict) without dragging the rubric
 * into rename-detection. For non-renamed conflicts, pass the same
 * path on both sides.
 */
export interface ConflictReportFile {
  /** Path on the base side of the conflict (the upstream tree). */
  readonly basePath: string;
  /** Path on the pick side of the conflict (the rebase-source tree). */
  readonly pickPath: string;
  /**
   * Optional: lines changed by the picked commit, NOT counting
   * conflict markers. When supplied, used by the naming-label bin
   * to detect "string-literal-only" diffs. When omitted, the
   * naming-label bin is conservative and won't fire (sources
   * cannot be classified as label-only without diff content).
   */
  readonly diffLines?: readonly ConflictDiffLine[];
}

/**
 * Single diff line as the rubric needs it. `kind` matches
 * unified-diff prefixes; `content` is the line body (no leading +/-).
 */
export interface ConflictDiffLine {
  readonly kind: "add" | "del" | "context";
  readonly content: string;
}

/**
 * Input contract for `classifyConflictContent`. Caller's job:
 * collect the conflicted files + diff content from the rebase
 * driver and hand them in. The rubric does the classification
 * and nothing else.
 */
export interface ConflictReport {
  readonly files: readonly ConflictReportFile[];
}

/**
 * Per-file evidence produced by the rubric. Preserves which bin
 * matched the file so the caller can attribute classification
 * granularly even when multiple files conflicted.
 */
export interface ConflictRubricFileEvidence {
  readonly basePath: string;
  readonly pickPath: string;
  readonly bin: ConflictRubricBin;
  /**
   * Brief human-readable reason for the bin assignment (e.g.
   * "matches *.live.test.ts pattern"). Useful for span emission
   * and prince journal entries.
   */
  readonly reason: string;
}

export interface ConflictRubricClassification {
  readonly verdict: ConflictRubricVerdict;
  /**
   * Bin that drove the verdict. When all files match safe-DROP
   * bins (test-harness, naming-label, release-plumbing) the
   * verdict is DROP and `bin` reports the highest-precision bin
   * observed. When ANY file matches feature-runtime the verdict
   * is REVIEW and `bin` is `feature-runtime`. When the report has
   * no files, the verdict is REVIEW with `bin: "none"` (rubric
   * cannot speak without input).
   */
  readonly bin: ConflictRubricBin;
  readonly files: readonly ConflictRubricFileEvidence[];
}

// ─── Path heuristics (test-harness bin) ────────────────────────────

/**
 * Pre-compiled patterns for the test-harness bin. Memo-aligned:
 *   *.live.test.ts / *.live.test.js
 *   scripts/test-*
 *   e2e/* (any depth)
 *   __tests__/* (any depth)  — common JS-ecosystem convention
 *
 * The patterns are INTENTIONALLY conservative. The rubric prefers
 * REVIEW over a wrongful DROP; broadening the test-harness bin
 * risks misclassifying production code that happens to live near
 * a test file.
 */
const TEST_HARNESS_PATTERNS: readonly RegExp[] = [
  /\.live\.test\.(ts|tsx|js|jsx|mjs|cjs)$/,
  /(^|\/)scripts\/test-[^/]+$/,
  /(^|\/)e2e\//,
  /(^|\/)__tests__\//,
];

function matchesTestHarnessPath(path: string): boolean {
  return TEST_HARNESS_PATTERNS.some((re) => re.test(path));
}

// ─── Path heuristics (release-plumbing bin) ────────────────────────

/**
 * Release-plumbing patterns. Memo: "version bumps, generated
 * baselines, i18n regen — already explicitly `--theirs` per #325
 * conflict policy".
 *
 * CHANGELOG.md is included because parallel-evolution often
 * conflicts on duplicate-PR-entry insertions.
 */
const RELEASE_PLUMBING_PATTERNS: readonly RegExp[] = [
  /(^|\/)package\.json$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)CHANGELOG\.md$/,
  /(^|\/)i18n\/.+\.(json|po|pot|yml|yaml)$/,
  /\.snap$/,
  /(^|\/)__snapshots__\//,
];

function matchesReleasePlumbingPath(path: string): boolean {
  return RELEASE_PLUMBING_PATTERNS.some((re) => re.test(path));
}

// ─── Diff-content heuristics (naming-label bin) ────────────────────

/**
 * The naming-label bin requires diff lines (non-context add/del
 * pairs) to be byte-equivalent modulo a small set of string-literal
 * substitutions. This is intentionally narrow:
 *
 *   - every non-context line must contain a quoted string literal
 *   - removing the quoted regions, the residual code must be
 *     byte-identical between an add line and at least one del line
 *
 * If diff content is absent, this bin cannot fire (returns false),
 * because we refuse to claim "label-only" without observing the
 * actual diff.
 */
function isNamingLabelOnly(diffLines: readonly ConflictDiffLine[] | undefined): boolean {
  if (!diffLines || diffLines.length === 0) return false;
  const adds = diffLines.filter((l) => l.kind === "add");
  const dels = diffLines.filter((l) => l.kind === "del");
  if (adds.length === 0 || dels.length === 0) return false;
  // Strip quoted regions (single, double, backtick) from each line.
  // If the residual is byte-identical between any add/del pair AND
  // both lines actually contained a quoted region, treat the diff
  // as label-only.
  const stripQuoted = (s: string): { residual: string; hadQuote: boolean } => {
    let hadQuote = false;
    const residual = s.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, () => {
      hadQuote = true;
      return "Q";
    });
    return { residual: residual.trim(), hadQuote };
  };
  const delResiduals = dels.map((d) => stripQuoted(d.content));
  for (const add of adds) {
    const { residual: addRes, hadQuote: addHad } = stripQuoted(add.content);
    if (!addHad) return false;
    const matched = delResiduals.find((d) => d.hadQuote && d.residual === addRes);
    if (!matched) return false;
  }
  return true;
}

// ─── Per-file classification ───────────────────────────────────────

function classifyFile(file: ConflictReportFile): ConflictRubricFileEvidence {
  // Path-based bins fire before diff-based bins. Both paths are
  // checked so a rename-into-test-harness still classifies as
  // test-harness (path on the pick side carries the new location).
  const isTestHarness =
    matchesTestHarnessPath(file.basePath) || matchesTestHarnessPath(file.pickPath);
  if (isTestHarness) {
    return {
      basePath: file.basePath,
      pickPath: file.pickPath,
      bin: "test-harness",
      reason: "matches test-harness path pattern",
    };
  }
  const isReleasePlumbing =
    matchesReleasePlumbingPath(file.basePath) || matchesReleasePlumbingPath(file.pickPath);
  if (isReleasePlumbing) {
    return {
      basePath: file.basePath,
      pickPath: file.pickPath,
      bin: "release-plumbing",
      reason: "matches release-plumbing path pattern",
    };
  }
  if (isNamingLabelOnly(file.diffLines)) {
    return {
      basePath: file.basePath,
      pickPath: file.pickPath,
      bin: "naming-label",
      reason: "diff is string-literal-only substitution",
    };
  }
  return {
    basePath: file.basePath,
    pickPath: file.pickPath,
    bin: "feature-runtime",
    reason: "no safe-DROP bin matched; defaults to feature-runtime (REVIEW)",
  };
}

// ─── Rubric entry point ────────────────────────────────────────────

/**
 * Classify a `ConflictReport` against the four-bin rubric.
 *
 * Verdict semantics:
 *   - ALL files in safe-DROP bins (test-harness | naming-label |
 *     release-plumbing) → `DROP`. The reported `bin` is the
 *     highest-precision safe bin observed (see precedence below).
 *   - ANY file in `feature-runtime` → `REVIEW`. The reported `bin`
 *     is `feature-runtime`.
 *   - Empty report (no files) → `REVIEW` with `bin: "none"`. The
 *     rubric refuses to default to PICK on no input — a silent
 *     PICK is exactly the failure shape this channel exists to
 *     prevent.
 *
 * Bin precedence for reporting (highest precision first):
 *   1. naming-label       (diff-content evidence)
 *   2. test-harness       (path pattern + memo-named bin)
 *   3. release-plumbing   (path pattern + memo-named bin)
 *
 * Precedence affects the SUMMARY `bin` field only; per-file
 * evidence preserves each file's actual bin.
 */
export function classifyConflictContent(report: ConflictReport): ConflictRubricClassification {
  if (report.files.length === 0) {
    return {
      verdict: "REVIEW",
      bin: "none",
      files: [],
    };
  }
  const fileEvidence = report.files.map(classifyFile);
  const hasFeatureRuntime = fileEvidence.some((f) => f.bin === "feature-runtime");
  if (hasFeatureRuntime) {
    return {
      verdict: "REVIEW",
      bin: "feature-runtime",
      files: fileEvidence,
    };
  }
  // All files in safe-DROP bins. Report the highest-precision bin
  // observed in `bin`; per-file evidence carries each file's actual
  // bin.
  const observedBins = new Set(fileEvidence.map((f) => f.bin));
  const summaryBin: ConflictRubricBin = observedBins.has("naming-label")
    ? "naming-label"
    : observedBins.has("test-harness")
      ? "test-harness"
      : "release-plumbing";
  return {
    verdict: "DROP",
    bin: summaryBin,
    files: fileEvidence,
  };
}
