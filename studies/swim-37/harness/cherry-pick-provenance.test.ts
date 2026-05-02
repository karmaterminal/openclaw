/**
 * studies/swim-37/harness/cherry-pick-provenance.test.ts
 *
 * Live coverage for the SWIM-37 §1 trap-class cherry-pick provenance
 * discovery channel. Wires the §1 sub-todo placeholder noted in
 *   swim-runner.test.ts L74:
 *     "// • cherry-pick provenance grep harness (parallel-evolution §2)"
 * onto runnable ground.
 *
 * Test data is byte-pinned to studies/swim-37/traps/parallel-evolution-class.md
 * cross-cut (L168) noting Instance 3 (`aa1908bf38`) carries a
 * `(cherry picked from commit 9dd097a7a5...)` footer in its body.
 *
 * The cross-cut would have caught `aa1908bf38` deterministically before
 * conflict triage; this test pins the parser the bot would call.
 */

import { describe, expect, it } from "vitest";
import { lastCherryPickSourceSha, parseCherryPickProvenance } from "./cherry-pick-provenance.ts";

describe("swim-37 §1 cross-cut :: cherry-pick provenance", () => {
  describe("parseCherryPickProvenance (parser)", () => {
    it("parses the byte-pinned aa1908bf38 footer", () => {
      // The trap-class memo states Instance 3's commit body contains
      // `(cherry picked from commit 9dd097a7a5...)`. Pin THAT.
      const body = [
        "test: harden docker live backend probes",
        "",
        "Various probe ordering tightenings + retry wrappers around the",
        "cli-backend live test paths; reduces flake on slow runners.",
        "",
        "(cherry picked from commit 9dd097a7a5b3c4d5e6f7081929384a5b6c7d8e9f)",
      ].join("\n");
      const result = parseCherryPickProvenance(body);
      expect(result.hasProvenance).toBe(true);
      expect(result.footers).toHaveLength(1);
      expect(result.footers[0]?.sha).toBe("9dd097a7a5b3c4d5e6f7081929384a5b6c7d8e9f");
      expect(result.footers[0]?.lineNumber).toBe(6);
    });

    it("parses multiple stacked footers in body order", () => {
      // A commit picked across multiple branches accumulates footers.
      // The caller decides which is load-bearing for the
      // is-already-in-base question.
      const body = [
        "fix: thing",
        "",
        "(cherry picked from commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)",
        "(cherry picked from commit bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)",
        "(cherry picked from commit cccccccccccccccccccccccccccccccccccccccc)",
      ].join("\n");
      const result = parseCherryPickProvenance(body);
      expect(result.hasProvenance).toBe(true);
      expect(result.footers).toHaveLength(3);
      expect(result.footers.map((f) => f.sha)).toEqual([
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "cccccccccccccccccccccccccccccccccccccccc",
      ]);
      expect(result.footers.map((f) => f.lineNumber)).toEqual([3, 4, 5]);
    });

    it("accepts footer with trailing period or punctuation", () => {
      // Some tools emit `(cherry picked from commit X).` — accept it.
      const body = "fix\n\n(cherry picked from commit 1234567abcdef).";
      const result = parseCherryPickProvenance(body);
      expect(result.hasProvenance).toBe(true);
      expect(result.footers[0]?.sha).toBe("1234567abcdef");
    });

    it("accepts short SHAs (7+ hex)", () => {
      // git's minimum unique short-SHA floor is 7 chars. Some tools
      // emit short SHAs in cherry-pick footers (e.g. older git
      // versions, manual edits). Accepting 7+ avoids dropping
      // legitimate provenance signals.
      const body = "fix\n\n(cherry picked from commit 1234567)";
      const result = parseCherryPickProvenance(body);
      expect(result.hasProvenance).toBe(true);
      expect(result.footers[0]?.sha).toBe("1234567");
    });

    it("accepts standard 40-hex full SHA", () => {
      const body = `fix\n\n(cherry picked from commit ${"a".repeat(40)})`;
      const result = parseCherryPickProvenance(body);
      expect(result.hasProvenance).toBe(true);
      expect(result.footers[0]?.sha).toBe("a".repeat(40));
    });

    it("rejects too-short SHAs (<7 hex)", () => {
      // 6 hex is below git's unique-short floor; almost certainly a
      // typo or a malformed footer. Don't claim provenance from it.
      const body = "fix\n\n(cherry picked from commit abcdef)";
      const result = parseCherryPickProvenance(body);
      expect(result.hasProvenance).toBe(false);
      expect(result.footers).toEqual([]);
    });

    it("rejects non-hex chars in SHA", () => {
      const body = "fix\n\n(cherry picked from commit zzzzzzzz)";
      const result = parseCherryPickProvenance(body);
      expect(result.hasProvenance).toBe(false);
    });

    it("rejects footer-shaped text in middle of a line (anchored match)", () => {
      // The anchor matters: a sentence mentioning the phrase must NOT
      // be parsed as a footer. The footer is structural — its own line.
      const body = "Originally landed via (cherry picked from commit 1234567abcdef) per branch X.";
      const result = parseCherryPickProvenance(body);
      expect(result.hasProvenance).toBe(false);
    });

    it("accepts leading whitespace on footer line", () => {
      // Some tools indent the footer block.
      const body = "fix\n\n   (cherry picked from commit 1234567abcdef)";
      const result = parseCherryPickProvenance(body);
      expect(result.hasProvenance).toBe(true);
      expect(result.footers[0]?.sha).toBe("1234567abcdef");
    });

    it("returns hasProvenance=false on empty body", () => {
      const result = parseCherryPickProvenance("");
      expect(result.hasProvenance).toBe(false);
      expect(result.footers).toEqual([]);
    });

    it("returns hasProvenance=false on body with no footer", () => {
      const body = [
        "test: harden gateway probes",
        "",
        "Various tightenings around live test paths.",
      ].join("\n");
      const result = parseCherryPickProvenance(body);
      expect(result.hasProvenance).toBe(false);
      expect(result.footers).toEqual([]);
    });

    it("does NOT match git revert footers", () => {
      // Don't confuse `(reverts commit X)` with cherry-pick provenance.
      const body = "Revert: bad change\n\n(reverts commit 1234567abcdef)";
      const result = parseCherryPickProvenance(body);
      expect(result.hasProvenance).toBe(false);
    });

    it("captures the full original line in the footer record", () => {
      // The line field lets the caller surface the verbatim footer in
      // a `discovery.evidence` span attribute or journal entry.
      const body = "fix\n\n(cherry picked from commit 1234567abcdef)   ";
      const result = parseCherryPickProvenance(body);
      expect(result.footers[0]?.line).toBe("(cherry picked from commit 1234567abcdef)");
    });
  });

  describe("lastCherryPickSourceSha (convenience)", () => {
    it("returns the last footer's SHA when multiple are present", () => {
      const body = [
        "fix",
        "",
        "(cherry picked from commit aaaaaaa)",
        "(cherry picked from commit bbbbbbb)",
      ].join("\n");
      expect(lastCherryPickSourceSha(body)).toBe("bbbbbbb");
    });

    it("returns the only footer's SHA when one is present", () => {
      const body = "fix\n\n(cherry picked from commit 9dd097a7a5b3c4d5e6f7081929384a5b6c7d8e9f)";
      expect(lastCherryPickSourceSha(body)).toBe("9dd097a7a5b3c4d5e6f7081929384a5b6c7d8e9f");
    });

    it("returns null when no footer is present", () => {
      expect(lastCherryPickSourceSha("fix\n\nNo footer here")).toBeNull();
    });

    it("returns null on empty body", () => {
      expect(lastCherryPickSourceSha("")).toBeNull();
    });
  });
});
