import { describe, expect, it } from "vitest";
import { classifyCompactionReason, resolveCompactionFailureReason } from "./compact-reasons.js";

describe("resolveCompactionFailureReason", () => {
  it("replaces generic compaction cancellation with the safeguard reason", () => {
    expect(
      resolveCompactionFailureReason({
        reason: "Compaction cancelled",
        safeguardCancelReason:
          "Compaction safeguard could not resolve an API key for anthropic/claude-opus-4-6.",
      }),
    ).toBe("Compaction safeguard could not resolve an API key for anthropic/claude-opus-4-6.");
  });

  it("preserves non-generic compaction failures", () => {
    expect(
      resolveCompactionFailureReason({
        reason: "Compaction timed out",
        safeguardCancelReason:
          "Compaction safeguard could not resolve an API key for anthropic/claude-opus-4-6.",
      }),
    ).toBe("Compaction timed out");
  });
});

describe("classifyCompactionReason", () => {
  it('classifies "nothing to compact" as a skip-like reason', () => {
    expect(classifyCompactionReason("Nothing to compact (session too small)")).toBe(
      "no_compactable_entries",
    );
  });

  it("classifies safeguard messages as guard-blocked", () => {
    expect(
      classifyCompactionReason(
        "Compaction safeguard could not resolve an API key for anthropic/claude-opus-4-6.",
      ),
    ).toBe("guard_blocked");
  });

  it("classifies 'Unknown model: ...' as unknown_model (bug #639)", () => {
    // surfaces when DEFAULT_PROVIDER/DEFAULT_MODEL fallback hits an unsupported model
    // — e.g. volitional compaction without provider/model passed routes to openai/gpt-5.4
    expect(classifyCompactionReason("Unknown model: openai/gpt-5.4")).toBe("unknown_model");
    expect(classifyCompactionReason("unknown model: foo/bar")).toBe("unknown_model");
  });
});
