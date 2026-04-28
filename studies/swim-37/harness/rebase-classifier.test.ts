/**
 * studies/swim-37/harness/rebase-classifier.test.ts
 *
 * Live coverage for the SWIM-37 §1 trap-class entry-point classifier.
 *
 * Wires the §1 entry-point it.todo placeholder
 *   "rebase bot classifies synthetic squash-rebased commit as DROP (not PICK)"
 * (swim-runner.test.ts L80) onto runnable ground.
 *
 * Composes the two §1 discovery primitives:
 *   - changelog-grep.ts (PR-token + subject channels)
 *   - cherry-pick-provenance.ts (anchored footer parser)
 *
 * Test data byte-pinned to all three §2 byte-walk verdicts in
 * studies/swim-37/traps/parallel-evolution-class.md.
 */

import { describe, expect, it } from "vitest";
import { classifyRebasePick } from "./rebase-classifier.ts";

// Byte-pinned changelog: includes the v2026.4.24 L164 line for the
// 7ee46a3ab9 (#70595) instance.
const FIXTURE_CHANGELOG = [
  "## v2026.4.24",
  "",
  "- Some unrelated entry that mentions runner in passing.",
  "- Status: add an explicit `Runner:` field to `/status` so sessions now report whether they are running on embedded Pi, a CLI-backed provider, or an ACP harness agent/backend such as `codex (acp/acpx)` or `gemini (acp/acpx)`. (#70595) Thanks @Takhoffman.",
  "- Another entry that does not mention the trap PR.",
].join("\n");

// Helper: ancestor-of-base callback that returns true only for SHAs
// in the provided allowlist.
const ancestorAllowlist = (allowlist: readonly string[]): ((sha: string) => boolean) => {
  return (sha: string) => allowlist.includes(sha);
};

describe("swim-37 §1 :: rebase-classifier (entry-point verdict)", () => {
  describe("Instance 1 :: 7ee46a3ab9 (#70595) — DROP via CHANGELOG-grep:pr", () => {
    it("classifies as DROP via changelog-grep:pr channel", () => {
      const result = classifyRebasePick({
        subject: "fix: Add runner label to /status (#70595)",
        commitBody: "fix: Add runner label to /status\n\nAdds `Runner:` field for /status output.",
        baseChangelog: FIXTURE_CHANGELOG,
        isAncestorOf: ancestorAllowlist([]),
      });
      expect(result.verdict).toBe("DROP");
      expect(result.channel).toBe("changelog-grep:pr");
      expect(result.evidence.changelogPrHit).toBeDefined();
      expect(result.evidence.changelogPrHit?.line).toContain("(#70595)");
      expect(result.evidence.cherryPickFooter).toBeUndefined();
    });

    it("DROP verdict carries no `needsConflictContentInspection` flag", () => {
      const result = classifyRebasePick({
        subject: "fix: Add runner label to /status (#70595)",
        commitBody: "fix: Add runner label to /status",
        baseChangelog: FIXTURE_CHANGELOG,
        isAncestorOf: ancestorAllowlist([]),
      });
      expect(result.needsConflictContentInspection).toBeUndefined();
    });
  });

  describe("Instance 3 :: aa1908bf38 — DROP via cherry-pick-provenance", () => {
    it("classifies as DROP via cherry-pick-provenance when footer's source is ancestor-of-base", () => {
      const sourceSha = "9dd097a7a5b3c4d5e6f7081929384a5b6c7d8e9f";
      const result = classifyRebasePick({
        subject: "test: harden docker live backend probes",
        commitBody: [
          "test: harden docker live backend probes",
          "",
          "Probe ordering tightenings + retry wrappers.",
          "",
          `(cherry picked from commit ${sourceSha})`,
        ].join("\n"),
        baseChangelog: FIXTURE_CHANGELOG, // CHANGELOG silent for this instance
        isAncestorOf: ancestorAllowlist([sourceSha]),
      });
      expect(result.verdict).toBe("DROP");
      expect(result.channel).toBe("cherry-pick-provenance");
      expect(result.evidence.cherryPickFooter?.sha).toBe(sourceSha);
    });

    it("cherry-pick-provenance takes precedence over changelog when both fire", () => {
      // If a commit had BOTH a PR-channel changelog hit AND an
      // ancestor-of-base cherry-pick footer, channel ordering says
      // provenance wins (highest precision). We verify by setting up
      // both signals on the same commit.
      const sourceSha = "1234567abcdef89";
      const result = classifyRebasePick({
        subject: "fix: Add runner label to /status (#70595)",
        commitBody: [
          "fix: Add runner label to /status",
          "",
          `(cherry picked from commit ${sourceSha})`,
        ].join("\n"),
        baseChangelog: FIXTURE_CHANGELOG,
        isAncestorOf: ancestorAllowlist([sourceSha]),
      });
      expect(result.verdict).toBe("DROP");
      expect(result.channel).toBe("cherry-pick-provenance");
      // BUT both evidences are recorded so the downstream span can
      // carry the full audit trail.
      expect(result.evidence.cherryPickFooter?.sha).toBe(sourceSha);
      expect(result.evidence.changelogPrHit?.line).toContain("(#70595)");
    });

    it("cherry-pick footer whose source is NOT ancestor-of-base does not trigger DROP via that channel", () => {
      const result = classifyRebasePick({
        subject: "test: harden docker live backend probes",
        commitBody: [
          "test: harden docker live backend probes",
          "",
          "(cherry picked from commit 9999999aaaa)",
        ].join("\n"),
        baseChangelog: "", // empty changelog
        isAncestorOf: ancestorAllowlist([]), // 9999999 NOT in base
      });
      expect(result.verdict).toBe("REVIEW");
      expect(result.channel).toBe("none");
      // But the parsed-but-not-ancestor footer is still recorded for
      // downstream cross-branch provenance audit.
      expect(result.evidence.cherryPickFootersNotAncestor).toHaveLength(1);
      expect(result.evidence.cherryPickFootersNotAncestor?.[0]?.sha).toBe("9999999aaaa");
      expect(result.evidence.cherryPickFooter).toBeUndefined();
    });
  });

  describe("Instance 2 :: e515ea1f31 — REVIEW (CHANGELOG silent, conflict-content rubric)", () => {
    it("classifies as REVIEW with needsConflictContentInspection=true when both channels miss", () => {
      // The memo says CHANGELOG is silent for test-harness divergence
      // commits and there's no cherry-pick footer either. Classifier
      // MUST NOT silently default to PICK — it must surface the gap so
      // the caller can hand off to the conflict-content rubric.
      const result = classifyRebasePick({
        subject: "test(gateway): harden live docker harness probes",
        commitBody: "test(gateway): harden live docker harness probes\n\nAdjusts probe ordering.",
        baseChangelog: FIXTURE_CHANGELOG,
        isAncestorOf: ancestorAllowlist([]),
      });
      expect(result.verdict).toBe("REVIEW");
      expect(result.channel).toBe("none");
      expect(result.needsConflictContentInspection).toBe(true);
      expect(result.evidence.changelogPrHit).toBeUndefined();
      expect(result.evidence.cherryPickFooter).toBeUndefined();
    });
  });

  describe("subject-channel verdict (medium-precision DROP)", () => {
    it("classifies as DROP via changelog-grep:subject when subject substring hits but no PR token", () => {
      const result = classifyRebasePick({
        subject: "Status: add an explicit `Runner:` field to `/status`",
        commitBody: "Status: add an explicit `Runner:` field",
        baseChangelog: FIXTURE_CHANGELOG,
        isAncestorOf: ancestorAllowlist([]),
      });
      expect(result.verdict).toBe("DROP");
      expect(result.channel).toBe("changelog-grep:subject");
      expect(result.evidence.changelogSubjectHits).toBeDefined();
      expect(result.evidence.changelogSubjectHits?.length).toBeGreaterThanOrEqual(1);
      expect(result.evidence.changelogPrHit).toBeUndefined();
    });
  });

  describe("PICK path (no signal at all = genuinely new work)", () => {
    it("…is NEVER returned by this classifier; absence of signal is REVIEW, not PICK", () => {
      // Important invariant: the classifier defaults to REVIEW when
      // both positive-signal channels miss, NOT PICK. This is the
      // memo's discipline — silent CHANGELOG + absent cherry-pick
      // footer is INSUFFICIENT evidence to safely PICK; the conflict-
      // content rubric must run before any PICK verdict.
      //
      // PICK as a verdict can only be reached by an upstream caller
      // that owns the full three-channel rubric. This module by
      // construction never returns PICK.
      const result = classifyRebasePick({
        subject: "feat: completely novel feature with no prior art",
        commitBody: "feat: completely novel feature",
        baseChangelog: "## v1.0\n\n- something completely unrelated",
        isAncestorOf: ancestorAllowlist([]),
      });
      expect(result.verdict).toBe("REVIEW");
      expect(result.verdict).not.toBe("PICK");
    });
  });

  describe("evidence completeness (downstream span audit trail)", () => {
    it("records both channels' evidence even when only one is load-bearing", () => {
      // Per channel-ordering doc-comment: provenance wins over
      // changelog when both fire, but BOTH evidences are kept so the
      // emitted span can carry full audit data.
      const sourceSha = "abcdef0123456789";
      const result = classifyRebasePick({
        subject: "fix: Add runner label to /status (#70595)",
        commitBody: [
          "fix: Add runner label to /status",
          "",
          `(cherry picked from commit ${sourceSha})`,
        ].join("\n"),
        baseChangelog: FIXTURE_CHANGELOG,
        isAncestorOf: ancestorAllowlist([sourceSha]),
      });
      expect(result.channel).toBe("cherry-pick-provenance"); // load-bearing
      expect(result.evidence.cherryPickFooter).toBeDefined();
      expect(result.evidence.changelogPrHit).toBeDefined(); // recorded too
    });

    it("non-ancestor footers go to cherryPickFootersNotAncestor, not the load-bearing slot", () => {
      const result = classifyRebasePick({
        subject: "fix: Add runner label to /status (#70595)",
        commitBody: [
          "fix: Add runner label to /status",
          "",
          "(cherry picked from commit 1111111aaaa)", // not ancestor
          "(cherry picked from commit 2222222bbbb)", // not ancestor
        ].join("\n"),
        baseChangelog: FIXTURE_CHANGELOG,
        isAncestorOf: ancestorAllowlist([]),
      });
      expect(result.channel).toBe("changelog-grep:pr"); // load-bearing
      expect(result.evidence.cherryPickFooter).toBeUndefined();
      expect(result.evidence.cherryPickFootersNotAncestor).toHaveLength(2);
    });
  });
});
