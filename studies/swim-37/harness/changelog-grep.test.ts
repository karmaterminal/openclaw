/**
 * studies/swim-37/harness/changelog-grep.test.ts
 *
 * Live coverage for the SWIM-37 §1 trap-class CHANGELOG-byte-grep
 * discovery channel. Wires the §1 it.todo placeholder
 *   "CHANGELOG-byte-grep discovery channel emits drop-with-reason span"
 * (swim-runner.test.ts L81) onto runnable ground without depending on the
 * unfinished captureSwim() shim.
 *
 * Test data is byte-pinned to studies/swim-37/traps/parallel-evolution-class.md
 * §2 byte-walk: instance `7ee46a3ab9 fix: Add runner label to /status (#70595)`
 * with the changelog line at L164 of v2026.4.24:
 *
 *   - Status: add an explicit `Runner:` field to `/status` ... (#70595) Thanks @Takhoffman.
 *
 * The other two §2 instances (`e515ea1f31`, `aa1908bf38`) are intentionally
 * NOT covered here — they're the test-harness divergence path where the
 * memo says CHANGELOG is silent and conflict-content classification is the
 * channel. Adding negative cases for them keeps the channel boundary honest.
 */

import { describe, expect, it } from "vitest";
import { discoverChangelogHit, extractPrNumberToken, grepChangelog } from "./changelog-grep.ts";

// Synthetic CHANGELOG fixture lifted byte-identical from v2026.4.24
// CHANGELOG.md L164 (the #70595 line) plus surrounding plausible noise.
// The "Thanks @Takhoffman" signature and the "(#70595)" ref are the two
// invariant tokens the memo's byte-walk pinned.
const FIXTURE_CHANGELOG_WITH_70595 = [
  "## v2026.4.24",
  "",
  "- Some unrelated entry that mentions runner in passing.",
  // The byte-pinned line from the memo:
  "- Status: add an explicit `Runner:` field to `/status` so sessions now report whether they are running on embedded Pi, a CLI-backed provider, or an ACP harness agent/backend such as `codex (acp/acpx)` or `gemini (acp/acpx)`. (#70595) Thanks @Takhoffman.",
  "- Another entry that does not mention the trap PR.",
].join("\n");

// A changelog where the PR is genuinely absent — used to confirm the
// channel correctly says "no signal" for the harness-divergence
// instances (e515ea1f31, aa1908bf38) where the memo says CHANGELOG is
// silent.
const FIXTURE_CHANGELOG_WITHOUT_70595 = [
  "## v2026.4.24",
  "",
  "- Some unrelated entry that mentions runner in passing.",
  "- Another entry that does not mention the trap PR.",
].join("\n");

describe("swim-37 §1 :: CHANGELOG-byte-grep discovery channel", () => {
  describe("grepChangelog (subject path)", () => {
    it("matches the trap-class instance #70595 by full subject", () => {
      const subject = "fix: Add runner label to /status (#70595)";
      const result = grepChangelog(subject, FIXTURE_CHANGELOG_WITH_70595);
      // Full-subject match SHOULD fail here — the changelog line uses
      // the maintainer-edited prose ("Status: add an explicit
      // `Runner:` field..."), NOT the commit subject verbatim. This is
      // exactly why the memo's byte-walk uses the PR-number variant for
      // this instance, not the full-subject grep.
      expect(result.matched).toBe(false);
      expect(result.hits).toEqual([]);
      expect(result.needle).toBe(subject);
    });

    it("matches the changelog line when the subject IS verbatim", () => {
      const subject = "Status: add an explicit `Runner:` field to `/status`";
      const result = grepChangelog(subject, FIXTURE_CHANGELOG_WITH_70595);
      expect(result.matched).toBe(true);
      expect(result.hits).toHaveLength(1);
      expect(result.hits[0]?.lineNumber).toBe(4);
      expect(result.hits[0]?.line).toContain("(#70595)");
      expect(result.needle).toBe(subject);
    });

    it("returns ALL hits when the subject collides on multiple lines", () => {
      // Construct a deliberate collision: two changelog lines that
      // both contain the substring "Status:". The memo flags subject-
      // line collisions as a known false-positive mode; the channel
      // returns ALL hits so the caller can decide whether to weight
      // them with PR-number cross-check or treat as ambiguous.
      const collidingChangelog = [
        "- Status: tightened thing one (#11111)",
        "- Unrelated entry",
        "- Status: add an explicit `Runner:` field (#70595) Thanks @x.",
      ].join("\n");
      const result = grepChangelog("Status:", collidingChangelog);
      expect(result.matched).toBe(true);
      expect(result.hits.length).toBeGreaterThanOrEqual(2);
      expect(result.hits.map((h) => h.lineNumber)).toContain(1);
      expect(result.hits.map((h) => h.lineNumber)).toContain(3);
    });

    it("returns matched=false on empty subject (does not match-everything)", () => {
      // Defense-in-depth: `git log -1 --format='%s'` on a malformed
      // commit can return empty. A grep-everything answer would force
      // every conflict to DROP. This is the trap-of-the-trap.
      const result = grepChangelog("", FIXTURE_CHANGELOG_WITH_70595);
      expect(result.matched).toBe(false);
      expect(result.hits).toEqual([]);
      expect(result.needle).toBe("");
    });

    it("returns matched=false on whitespace-only subject", () => {
      const result = grepChangelog("   \t\n  ", FIXTURE_CHANGELOG_WITH_70595);
      expect(result.matched).toBe(false);
      expect(result.hits).toEqual([]);
      expect(result.needle).toBe("");
    });

    it("returns matched=false on empty changelog", () => {
      const result = grepChangelog("fix: Add runner label to /status", "");
      expect(result.matched).toBe(false);
      expect(result.hits).toEqual([]);
      expect(result.needle).toBe("fix: Add runner label to /status");
    });

    it("uses literal byte-grep semantics — no regex interpretation", () => {
      // `grep -F` semantics: special regex chars must match literally,
      // not be interpreted. The trap-class memo cites `grep -F`
      // explicitly; if we accidentally used regex semantics, a subject
      // containing `.` or `(` would over-match.
      const subject = "fix(status): runner.label.add()";
      const changelog = "- fix(status): runner.label.add() (#99999)";
      const result = grepChangelog(subject, changelog);
      expect(result.matched).toBe(true);
      expect(result.hits).toHaveLength(1);
    });
  });

  describe("extractPrNumberToken", () => {
    it("extracts the trailing PR-number from the trap-class instance subject", () => {
      const token = extractPrNumberToken("fix: Add runner label to /status (#70595)");
      expect(token).toBe("#70595");
    });

    it("returns the LAST PR-number when multiple are cited", () => {
      // Commits sometimes cite an earlier PR in the body but the
      // subject's trailing PR is the landing PR.
      const token = extractPrNumberToken("follow-up to (#12345): tighten thing (#67890)");
      expect(token).toBe("#67890");
    });

    it("returns null when no PR-number is present", () => {
      expect(extractPrNumberToken("test(gateway): harden live docker harness probes")).toBeNull();
    });

    it("does not match bare `#NNN` outside parentheses", () => {
      // We only want the `(#N)` form — bare `#NNN` in commit messages
      // (e.g. "step #3") is too noisy.
      expect(extractPrNumberToken("step #3 of refactor")).toBeNull();
    });

    it("does not match empty parens or `(#)`", () => {
      expect(extractPrNumberToken("subject (#)")).toBeNull();
      expect(extractPrNumberToken("subject ()")).toBeNull();
    });
  });

  describe("discoverChangelogHit (composite)", () => {
    it("catches #70595 via PR-number when full-subject grep would miss", () => {
      // This is the load-bearing case. The trap-class memo's byte-walk
      // for `7ee46a3ab9` shows the changelog line uses maintainer-edited
      // prose, not the commit subject verbatim. PR-number-token grep
      // catches it cleanly. This test pins THAT signal.
      const subject = "fix: Add runner label to /status (#70595)";
      const result = discoverChangelogHit(subject, FIXTURE_CHANGELOG_WITH_70595);
      expect(result.matched).toBe(true);
      expect(result.needle).toBe("#70595");
      expect(result.hits).toHaveLength(1);
      expect(result.hits[0]?.lineNumber).toBe(4);
      expect(result.hits[0]?.line).toContain("(#70595)");
      expect(result.hits[0]?.line).toContain("Thanks @Takhoffman");
    });

    it("falls back to full-subject grep when no PR-number in subject", () => {
      // Mirrors the trap-class instances `e515ea1f31` and `aa1908bf38`
      // — test-harness commits with no `(#N)` in subject. We want to
      // confirm the channel does NOT silently report PR-channel hits
      // for these; needle should be the full subject.
      const subject = "test(gateway): harden live docker harness probes";
      const result = discoverChangelogHit(subject, FIXTURE_CHANGELOG_WITHOUT_70595);
      expect(result.matched).toBe(false);
      expect(result.needle).toBe(subject); // not a PR token
    });

    it("correctly reports NO hit for harness-divergence instances", () => {
      // The memo says CHANGELOG is silent for harness-hardening commits
      // because they don't get release-notes. The channel must agree:
      // the conflict-content rubric is a separate channel, NOT a
      // CHANGELOG-grep responsibility.
      const subject = "test(gateway): harden live docker harness probes";
      const result = discoverChangelogHit(subject, FIXTURE_CHANGELOG_WITHOUT_70595);
      expect(result.matched).toBe(false);
      expect(result.hits).toEqual([]);
    });

    it("PR-token misses fall through to subject grep when subject is a substring", () => {
      // If a subject has `(#NNNNN)` but the changelog doesn't carry
      // that token, the composite must still try the full subject
      // path. We construct: subject's full text IS a substring of a
      // changelog line (because maintainer kept the prose but stripped
      // the PR ref), even though the PR token alone misses.
      const subject = "normalize provider runtime selection";
      // Subject above intentionally has NO PR token — to make the
      // fall-through unambiguous, use the variant that DOES have a
      // PR token but where token misses and subject substring hits:
      const subjectWithToken = "normalize provider runtime selection (#99999)";
      const changelog = "- normalize provider runtime selection landed earlier (#71259).";
      // First confirm the bare subject would hit:
      const bareResult = discoverChangelogHit(subject, changelog);
      expect(bareResult.matched).toBe(true);
      // Now the load-bearing case: PR-token #99999 misses, but the
      // subject substring "normalize provider runtime selection" is
      // present in the changelog line, so the full-subject grep
      // (after the PR-token branch fails) must fall through. With
      // grep -F semantics, the literal subject including "(#99999)"
      // won't match — so we expect matched=false but with needle
      // set to the SUBJECT, not the PR token. The downstream span
      // attribution code must record "changelog-grep:subject" as the
      // FINAL channel attempted, not "changelog-grep:pr".
      const result = discoverChangelogHit(subjectWithToken, changelog);
      expect(result.matched).toBe(false);
      expect(result.needle).toBe(subjectWithToken);
      expect(result.needle.startsWith("#")).toBe(false);
    });
  });

  describe("channel attribution (callers can distinguish PR vs subject hits)", () => {
    it("PR-channel hit: needle is a PR token", () => {
      const subject = "fix: Add runner label to /status (#70595)";
      const result = discoverChangelogHit(subject, FIXTURE_CHANGELOG_WITH_70595);
      const prToken = extractPrNumberToken(subject);
      expect(result.matched).toBe(true);
      expect(result.needle).toBe(prToken);
    });

    it("subject-channel hit: needle is the full subject", () => {
      const subject = "Status: add an explicit `Runner:` field to `/status`";
      const result = discoverChangelogHit(subject, FIXTURE_CHANGELOG_WITH_70595);
      expect(result.matched).toBe(true);
      expect(result.needle).toBe(subject);
      // No PR-number in subject → channel is "subject" by elimination.
      expect(extractPrNumberToken(subject)).toBeNull();
    });
  });
});
