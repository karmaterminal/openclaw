import { describe, expect, it } from "vitest";
import { extractAssistantStreamSnapshot } from "./embedded-agent-subscribe.handlers.messages.snapshot.js";
import { createMessageUpdateContext } from "./embedded-agent-subscribe.handlers.messages.test-helpers.js";
import { createZeroUsageFixture } from "./test-helpers/usage-fixtures.js";

function finalAnswerBlock(id: string, text: string) {
  return {
    type: "text" as const,
    text,
    textSignature: JSON.stringify({ v: 1, id, phase: "final_answer" }),
  };
}

describe("extractAssistantStreamSnapshot continuation markers", () => {
  it.each(["CONTINUE_WORK", "[[CONTINUE_WORK]]"])(
    "strips %s ending an earlier final-answer part before block grouping",
    (marker) => {
      const message = {
        role: "assistant" as const,
        api: "openai-responses" as const,
        provider: "fixture",
        model: "fixture",
        usage: createZeroUsageFixture(),
        timestamp: 0,
        stopReason: "stop" as const,
        phase: "final_answer" as const,
        content: [
          finalAnswerBlock("item_a", `First item. ${marker}`),
          finalAnswerBlock("item_b", "Second item."),
        ],
      };

      const snapshot = extractAssistantStreamSnapshot(createMessageUpdateContext(), message);

      expect(snapshot.blockText).toBe("First item.\nSecond item.");
    },
  );
});
