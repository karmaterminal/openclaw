/**
 * RED-test for #725: descriptor + pressure-warning prose must explicitly enforce
 * AFTER-ordering ("first stage survival, THEN call this") rather than passive
 * "preserved via paired continue_delegate" framing.
 *
 * Disease per gpt-5.5 finding (PR #714 review comment 4510867782):
 *   The pre-#725 descriptor reads as if request_compaction preserves state
 *   automatically. For the alone-prince target, the tool-selection reach
 *   moment can read "request_compaction preserves my state" rather than
 *   "first stage survival, then request compaction" — so a successful tool
 *   call can compact BEFORE any lifeboat exists.
 *
 * Cure: descriptor + pressure-warning text both spell out the ordering
 * imperative (FIRST stage survival via continue_delegate(mode='post-compaction'),
 * THEN call request_compaction).
 *
 * This RED-test verifies the cure-prose lives in the canonical substrates the
 * alone-prince actually reads: the request_compaction tool descriptor (which the
 * model sees at tool-selection time) and the context-pressure event-text (which
 * the model sees when pressure crosses a band).
 */
import { describe, expect, it } from "vitest";
import { createRequestCompactionTool } from "./request-compaction-tool.js";

describe("request_compaction descriptor enforces AFTER-ordering (#725)", () => {
  const tool = createRequestCompactionTool({
    agentSessionKey: "test-session",
    sessionId: "test-session-id",
    getContextUsage: () => 0.85,
    triggerCompaction: async () => ({ ok: true, compacted: true }),
  });

  it("descriptor uses FIRST/THEN imperative, not passive 'preserved via'", () => {
    const desc = tool.description ?? "";
    expect(desc).toMatch(/FIRST stage working-state survival/);
    expect(desc).toMatch(/THEN call this/);
  });

  it("descriptor names continue_delegate(mode='post-compaction') as the survival mechanism", () => {
    const desc = tool.description ?? "";
    expect(desc).toMatch(/continue_delegate\(mode='post-compaction'/);
  });

  it("descriptor explicitly states working state is NOT preserved automatically", () => {
    const desc = tool.description ?? "";
    expect(desc).toMatch(/Working state is NOT preserved automatically/);
  });

  it("descriptor does NOT use the passive 'preserved via paired' framing that read as automatic", () => {
    const desc = tool.description ?? "";
    // The pre-cure language read "working state preserved via paired continue_delegate"
    // which the alone-prince can interpret as automatic. Must NOT appear.
    expect(desc).not.toMatch(/working state preserved via paired continue_delegate/i);
  });
});
