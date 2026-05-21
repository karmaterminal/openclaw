/**
 * RED-test for #725: context-pressure event-text must explicitly enforce
 * AFTER-ordering ("FIRST stage survival, THEN call request_compaction")
 * rather than passive "stage X, then call Y" framing that reads as optional.
 *
 * Disease: pre-#725 pressure-warning at bands 90+ and 95+ told the agent to
 * "stage working-state survival via continue_delegate, then call
 * request_compaction" — but the prose-shape read as two-coequal-options
 * rather than ordered-imperative. Aligned with #725 descriptor disease class.
 *
 * Cure: pressure-warning event-text uses FIRST/THEN imperative + explicit
 * statement that the delegate is what carries state across the seam +
 * explicit warning that calling request_compaction without staging first
 * means state will NOT survive.
 */
import { afterEach, describe, expect, it } from "vitest";
import { checkContextPressure, resetContextPressureForTests } from "./context-pressure.js";

afterEach(() => {
  resetContextPressureForTests();
});

describe("context-pressure event-text enforces AFTER-ordering (#725)", () => {
  const base = {
    sessionKey: "test-session-725",
    contextWindow: 200_000,
    threshold: 0.8,
  };

  it("90-band event uses FIRST/THEN imperative", () => {
    // 92% of 200k → lands in 90 band
    const text = checkContextPressure({ ...base, totalTokens: 184_000 });
    expect(text).not.toBeNull();
    expect(text).toMatch(/FIRST stage working-state survival/);
    expect(text).toMatch(/THEN call request_compaction/);
  });

  it("95-band event uses FIRST/THEN imperative", () => {
    // 96% of 200k → lands in 95 band
    const text = checkContextPressure({ ...base, totalTokens: 192_000 });
    expect(text).not.toBeNull();
    expect(text).toMatch(/FIRST stage working-state survival/);
    expect(text).toMatch(/THEN call request_compaction/);
  });

  it("95-band explicitly warns that state will NOT survive without staging first", () => {
    const text = checkContextPressure({ ...base, totalTokens: 192_000 });
    expect(text).not.toBeNull();
    expect(text).toMatch(/working state will NOT survive/i);
  });

  it("90-band names the delegate as what carries state across the seam", () => {
    const text = checkContextPressure({ ...base, totalTokens: 184_000 });
    expect(text).not.toBeNull();
    expect(text).toMatch(/carries state across the seam/);
  });
});
