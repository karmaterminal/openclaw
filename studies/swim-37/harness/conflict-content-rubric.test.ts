/**
 * studies/swim-37/harness/conflict-content-rubric.test.ts
 *
 * Live tests for the §1 trap-class third discovery channel:
 * conflict-content classification rubric.
 *
 * Pinned to memo §2 byte-walk:
 *   - Instance 2 (`e515ea1f31`, test-harness divergence) → DROP via
 *     test-harness bin
 *   - Instance 1 (`aa1908bf38`, docker live backend) → DROP via
 *     test-harness bin
 *
 * Plus integration with `classifyRebasePick`: the optional
 * conflict-content callback flips the no-signal REVIEW into a
 * channel-attributed verdict.
 *
 * Issue: karmaterminal/openclaw#409
 */

import { describe, expect, it } from "vitest";
import { classifyConflictContent, type ConflictReport } from "./conflict-content-rubric.ts";
import { classifyRebasePick } from "./rebase-classifier.ts";

describe("swim-37 §1 cross-cut :: conflict-content rubric (#409)", () => {
  describe("classifyConflictContent (rubric)", () => {
    it("returns REVIEW + bin='none' on empty report (refuses silent PICK)", () => {
      const result = classifyConflictContent({ files: [] });
      expect(result.verdict).toBe("REVIEW");
      expect(result.bin).toBe("none");
      expect(result.files).toEqual([]);
    });

    it("test-harness bin: e515ea1f31 (live.test.ts) → DROP", () => {
      // Memo §2 Instance 2: gateway live test hardening.
      // Files conflicted under *.live.test.ts paths.
      const report: ConflictReport = {
        files: [
          {
            basePath: "src/gateway/__tests__/probe.live.test.ts",
            pickPath: "src/gateway/__tests__/probe.live.test.ts",
          },
          {
            basePath: "src/gateway/__tests__/retry.live.test.ts",
            pickPath: "src/gateway/__tests__/retry.live.test.ts",
          },
        ],
      };
      const result = classifyConflictContent(report);
      expect(result.verdict).toBe("DROP");
      expect(result.bin).toBe("test-harness");
      expect(result.files).toHaveLength(2);
      expect(result.files.every((f) => f.bin === "test-harness")).toBe(true);
    });

    it("test-harness bin: aa1908bf38 (e2e/) → DROP", () => {
      // Memo §2 Instance 1: docker live backend probes.
      // Files under e2e/.
      const report: ConflictReport = {
        files: [{ basePath: "e2e/docker-backend.spec.ts", pickPath: "e2e/docker-backend.spec.ts" }],
      };
      const result = classifyConflictContent(report);
      expect(result.verdict).toBe("DROP");
      expect(result.bin).toBe("test-harness");
    });

    it("test-harness bin: scripts/test-* → DROP", () => {
      const report: ConflictReport = {
        files: [
          { basePath: "scripts/test-live-probes.sh", pickPath: "scripts/test-live-probes.sh" },
        ],
      };
      expect(classifyConflictContent(report).verdict).toBe("DROP");
    });

    it("test-harness bin: __tests__/ → DROP", () => {
      const report: ConflictReport = {
        files: [
          { basePath: "src/foo/__tests__/bar.test.ts", pickPath: "src/foo/__tests__/bar.test.ts" },
        ],
      };
      expect(classifyConflictContent(report).verdict).toBe("DROP");
    });

    it("release-plumbing bin: package.json → DROP", () => {
      const report: ConflictReport = {
        files: [{ basePath: "package.json", pickPath: "package.json" }],
      };
      const result = classifyConflictContent(report);
      expect(result.verdict).toBe("DROP");
      expect(result.bin).toBe("release-plumbing");
    });

    it("release-plumbing bin: pnpm-lock.yaml → DROP", () => {
      const report: ConflictReport = {
        files: [{ basePath: "pnpm-lock.yaml", pickPath: "pnpm-lock.yaml" }],
      };
      expect(classifyConflictContent(report).verdict).toBe("DROP");
    });

    it("release-plumbing bin: CHANGELOG.md → DROP", () => {
      const report: ConflictReport = {
        files: [{ basePath: "CHANGELOG.md", pickPath: "CHANGELOG.md" }],
      };
      expect(classifyConflictContent(report).verdict).toBe("DROP");
    });

    it("release-plumbing bin: __snapshots__/ → DROP", () => {
      const report: ConflictReport = {
        files: [
          {
            basePath: "src/foo/__snapshots__/bar.test.ts.snap",
            pickPath: "src/foo/__snapshots__/bar.test.ts.snap",
          },
        ],
      };
      expect(classifyConflictContent(report).verdict).toBe("DROP");
    });

    it("naming-label bin: string-literal-only diff → DROP", () => {
      // Memo §2 Instance 3 (`7ee46a3ab9`): "Runtime:" vs "Execution:"
      // label substitution. Both adds + dels share residual code
      // structure once the quoted regions are stripped.
      const report: ConflictReport = {
        files: [
          {
            basePath: "src/status/format.ts",
            pickPath: "src/status/format.ts",
            diffLines: [
              { kind: "del", content: "return `Runtime: ${runtime}`;" },
              { kind: "add", content: "return `Execution: ${runtime}`;" },
            ],
          },
        ],
      };
      const result = classifyConflictContent(report);
      expect(result.verdict).toBe("DROP");
      expect(result.bin).toBe("naming-label");
    });

    it("feature-runtime bin: ANY file with no safe-bin match → REVIEW", () => {
      const report: ConflictReport = {
        files: [{ basePath: "src/gateway/server.ts", pickPath: "src/gateway/server.ts" }],
      };
      const result = classifyConflictContent(report);
      expect(result.verdict).toBe("REVIEW");
      expect(result.bin).toBe("feature-runtime");
    });

    it("mixed: feature-runtime present → REVIEW even if other files are safe", () => {
      const report: ConflictReport = {
        files: [
          { basePath: "src/foo/__tests__/bar.test.ts", pickPath: "src/foo/__tests__/bar.test.ts" },
          { basePath: "src/gateway/server.ts", pickPath: "src/gateway/server.ts" },
        ],
      };
      const result = classifyConflictContent(report);
      expect(result.verdict).toBe("REVIEW");
      expect(result.bin).toBe("feature-runtime");
      // Per-file evidence preserves test-harness bin on the first
      // file even though summary bin is feature-runtime.
      expect(result.files[0]?.bin).toBe("test-harness");
      expect(result.files[1]?.bin).toBe("feature-runtime");
    });

    it("mixed safe bins: precedence reports highest-precision summary bin", () => {
      // naming-label > test-harness > release-plumbing
      const report: ConflictReport = {
        files: [
          { basePath: "package.json", pickPath: "package.json" },
          { basePath: "src/foo/__tests__/bar.test.ts", pickPath: "src/foo/__tests__/bar.test.ts" },
          {
            basePath: "src/status/format.ts",
            pickPath: "src/status/format.ts",
            diffLines: [
              { kind: "del", content: 'return "Runtime";' },
              { kind: "add", content: 'return "Execution";' },
            ],
          },
        ],
      };
      const result = classifyConflictContent(report);
      expect(result.verdict).toBe("DROP");
      expect(result.bin).toBe("naming-label");
    });

    it("naming-label is conservative: refuses to fire without diffLines", () => {
      // Without diff content, label-only cannot be claimed. The
      // file falls through to feature-runtime.
      const report: ConflictReport = {
        files: [{ basePath: "src/status/format.ts", pickPath: "src/status/format.ts" }],
      };
      const result = classifyConflictContent(report);
      expect(result.verdict).toBe("REVIEW");
      expect(result.bin).toBe("feature-runtime");
    });

    it("naming-label rejects when residuals diverge (real code change)", () => {
      const report: ConflictReport = {
        files: [
          {
            basePath: "src/foo.ts",
            pickPath: "src/foo.ts",
            diffLines: [
              { kind: "del", content: 'const limit = "10";' },
              { kind: "add", content: 'const cap = "20";' },
            ],
          },
        ],
      };
      const result = classifyConflictContent(report);
      // Residuals: 'const limit = Q;' vs 'const cap = Q;' → not equal
      expect(result.verdict).toBe("REVIEW");
      expect(result.bin).toBe("feature-runtime");
    });

    it("rename-into-test-harness still classifies as test-harness", () => {
      // basePath is production, pickPath is test-harness — caller
      // relocated the file. Either side matching wins the bin.
      const report: ConflictReport = {
        files: [{ basePath: "src/foo/probe.ts", pickPath: "e2e/probe.spec.ts" }],
      };
      const result = classifyConflictContent(report);
      expect(result.verdict).toBe("DROP");
      expect(result.bin).toBe("test-harness");
    });
  });

  describe("classifyRebasePick :: conflict-content callback integration", () => {
    it("when changelog/provenance miss AND callback supplied → callback's verdict drives", () => {
      // Memo §2 Instance 2 shape: CHANGELOG silent, no cherry-pick
      // footer, conflict-content rubric should DROP.
      const result = classifyRebasePick({
        subject: "test(gateway): harden live docker harness probes",
        commitBody: "Test hardening for live docker probes.",
        baseChangelog: "# Changelog\n\nNothing relevant here.\n",
        isAncestorOf: () => false,
        conflictContent: () =>
          classifyConflictContent({
            files: [
              {
                basePath: "src/gateway/__tests__/probe.live.test.ts",
                pickPath: "src/gateway/__tests__/probe.live.test.ts",
              },
            ],
          }),
      });
      expect(result.verdict).toBe("DROP");
      expect(result.channel).toBe("conflict-content");
      expect(result.evidence.conflictContent?.bin).toBe("test-harness");
    });

    it("when changelog/provenance miss AND callback returns REVIEW → REVIEW preserved", () => {
      const result = classifyRebasePick({
        subject: "feat(gateway): new continuation primitive",
        commitBody: "Adds a new continuation primitive.",
        baseChangelog: "# Changelog\n",
        isAncestorOf: () => false,
        conflictContent: () =>
          classifyConflictContent({
            files: [{ basePath: "src/gateway/server.ts", pickPath: "src/gateway/server.ts" }],
          }),
      });
      expect(result.verdict).toBe("REVIEW");
      expect(result.channel).toBe("conflict-content");
      expect(result.needsConflictContentInspection).toBeUndefined();
      expect(result.evidence.conflictContent?.bin).toBe("feature-runtime");
    });

    it("when callback omitted → REVIEW + needsConflictContentInspection (back-compat with #408)", () => {
      const result = classifyRebasePick({
        subject: "test(gateway): harden live docker harness probes",
        commitBody: "Test hardening.",
        baseChangelog: "# Changelog\n",
        isAncestorOf: () => false,
        // no conflictContent callback
      });
      expect(result.verdict).toBe("REVIEW");
      expect(result.channel).toBe("none");
      expect(result.needsConflictContentInspection).toBe(true);
    });

    it("channel ordering: positive channel-1 (cherry-pick) wins over conflict-content", () => {
      const result = classifyRebasePick({
        subject: "test: probe hardening",
        commitBody:
          "Test hardening.\n\n(cherry picked from commit 9dd097a7a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0)",
        baseChangelog: "# Changelog\n",
        isAncestorOf: () => true,
        conflictContent: () =>
          classifyConflictContent({
            files: [{ basePath: "src/gateway/server.ts", pickPath: "src/gateway/server.ts" }],
          }),
      });
      // Cherry-pick channel fires first (higher precision than
      // conflict-content). Conflict-content callback should NOT
      // even be invoked.
      expect(result.verdict).toBe("DROP");
      expect(result.channel).toBe("cherry-pick-provenance");
    });

    it("callback NOT invoked when channel-1 fires (precedence + side-effect-free)", () => {
      let invocations = 0;
      const result = classifyRebasePick({
        subject: "fix(runner): add label (#70595)",
        commitBody: "Fix.",
        baseChangelog: "# Changelog\n\n- fix(runner): add label (#70595)\n",
        isAncestorOf: () => false,
        conflictContent: () => {
          invocations++;
          return classifyConflictContent({ files: [] });
        },
      });
      expect(result.verdict).toBe("DROP");
      expect(result.channel).toBe("changelog-grep:pr");
      expect(invocations).toBe(0);
    });
  });
});
