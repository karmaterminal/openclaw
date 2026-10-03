import type { AssistantMessage } from "openclaw/plugin-sdk/llm";
import { describe, expect, it, vi } from "vitest";
import { createTextEndBlockReplyHarness } from "./embedded-agent-subscribe.e2e-harness.js";
import {
  createOpenAiResponsesTextBlock,
  createOpenAiResponsesTextEvent,
  type OpenAiResponsesTextEventPhase,
} from "./embedded-agent-subscribe.openai-responses.test-helpers.js";

type TextEndBlockReplyHarness = ReturnType<typeof createTextEndBlockReplyHarness>;
type BlockReplyPayload = {
  text?: string;
};

function emitOpenAiResponsesTextEvent(params: {
  emit: TextEndBlockReplyHarness["emit"];
  type: "text_delta" | "text_end";
  text: string;
  delta?: string;
  id: string;
  signaturePhase?: OpenAiResponsesTextEventPhase;
  partialPhase?: OpenAiResponsesTextEventPhase;
}) {
  const { emit, ...eventParams } = params;
  emit(createOpenAiResponsesTextEvent(eventParams));
}

function emitOpenAiResponsesTextDeltaAndEnd(params: {
  emit: TextEndBlockReplyHarness["emit"];
  text: string;
  delta?: string;
  id: string;
  phase?: OpenAiResponsesTextEventPhase;
}) {
  const { phase, ...eventParams } = params;
  emitOpenAiResponsesTextEvent({
    ...eventParams,
    type: "text_delta",
    signaturePhase: phase,
    partialPhase: phase,
  });
  emitOpenAiResponsesTextEvent({
    ...eventParams,
    type: "text_end",
    delta: undefined,
    signaturePhase: phase,
    partialPhase: phase,
  });
}

function requireBlockReplyPayload(onBlockReply: ReturnType<typeof vi.fn>): BlockReplyPayload {
  const call = onBlockReply.mock.calls[0];
  if (!call) {
    throw new Error("expected first block reply call");
  }
  const payload = call[0];
  if (!payload || typeof payload !== "object") {
    throw new Error("expected first block reply payload");
  }
  return payload as BlockReplyPayload;
}

describe("continuation markers in Responses final answers", () => {
  it("hides complete continuation markers during Responses final-answer streaming", async () => {
    const onBlockReply = vi.fn();
    const onAgentEvent = vi.fn();
    const { emit, subscription } = createTextEndBlockReplyHarness({
      onBlockReply,
      onAgentEvent,
    });

    emit({ type: "message_start", message: { role: "assistant" } });
    emitOpenAiResponsesTextDeltaAndEnd({
      emit,
      text: "Done.\nCONTINUE_WORK",
      id: "item-final",
      phase: "final_answer",
    });
    await Promise.resolve();

    expect(onBlockReply).toHaveBeenCalledTimes(1);
    expect(requireBlockReplyPayload(onBlockReply).text).toBe("Done.");
    expect(JSON.stringify(onAgentEvent.mock.calls)).not.toContain("CONTINUE_WORK");
    expect(subscription.assistantTexts).toEqual(["Done."]);
  });

  it("hides continuation markers that terminate earlier final-answer items", async () => {
    const onBlockReply = vi.fn();
    const onAgentEvent = vi.fn();
    const { emit, subscription } = createTextEndBlockReplyHarness({
      onBlockReply,
      onAgentEvent,
    });

    emit({
      type: "message_end",
      message: {
        role: "assistant",
        content: [
          createOpenAiResponsesTextBlock({
            text: "Done.\nCONTINUE_WORK",
            id: "item_final_1",
            phase: "final_answer",
          }),
          createOpenAiResponsesTextBlock({
            text: "Warning: cleanup remains.",
            id: "item_final_2",
            phase: "final_answer",
          }),
        ],
      } as AssistantMessage,
    });
    await Promise.resolve();

    expect(onBlockReply).toHaveBeenCalledTimes(1);
    expect(requireBlockReplyPayload(onBlockReply).text).toBe("Done.\nWarning: cleanup remains.");
    expect(JSON.stringify(onAgentEvent.mock.calls)).not.toContain("CONTINUE_WORK");
    expect(subscription.assistantTexts).toEqual(["Done.\nWarning: cleanup remains."]);
  });
});
