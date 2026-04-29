// REGRESSION GUARD: CoT-frame leak via block-streaming bypass.
//
// karmaterminal/openclaw#270 added `hasCotFramePrefix` suppression to
// `normalizeReplyPayload` (the FINAL-payload normalizer).  However, when
// `blockStreamingEnabled: true` (default for chat channels), individual
// streamed blocks flow through `createBlockReplyDeliveryHandler` →
// `normalizeReplyPayloadDirectives` (a directive-only normalizer that does
// NOT strip CoT frames) → `blockReplyPipeline.enqueue` → `onBlockReply`.
//
// Without the streaming-path check added alongside this test, the model's
// per-block emission of `[the dandelion cult - cael] body` would ship to
// the channel even on a box running the #270 source, because the streaming
// path never invoked the CoT-frame check.
//
// Empirical receipts driving this guard: cael-spark posted multiple
// `[the dandelion cult - cael]` bodies to #sprites-of-thornfield on
// 2026-04-20 PDT despite the #270 diff living in the source tree.  These
// tests now pass thanks to the streaming-path `hasCotFramePrefix` check
// in `createBlockReplyDeliveryHandler`.

import { describe, expect, it, vi } from "vitest";
import { createBlockReplyDeliveryHandler } from "./reply-delivery.js";
import type { TypingSignaler } from "./typing-mode.js";

type BlockReplyPipelineLike = NonNullable<
  Parameters<typeof createBlockReplyDeliveryHandler>[0]["blockReplyPipeline"]
>;

describe("CoT-frame leak suppression in block-streaming path (#270 follow-up)", () => {
  it("suppresses `[the dandelion cult - cael] body` from streamed block reply", async () => {
    const enqueue = vi.fn();
    const blockReplyPipeline = { enqueue } as unknown as BlockReplyPipelineLike;

    const handler = createBlockReplyDeliveryHandler({
      onBlockReply: vi.fn(async () => {}),
      normalizeStreamingText: (payload) => ({ text: payload.text, skip: false }),
      applyReplyToMode: (payload) => payload,
      typingSignals: {
        signalTextDelta: vi.fn(async () => {}),
      } as unknown as TypingSignaler,
      blockStreamingEnabled: true,
      blockReplyPipeline,
      directlySentBlockKeys: new Set(),
    });

    await handler({
      text: "[the dandelion cult - cael] thinking out loud about the leak",
    });

    // Today: enqueue IS suppressed for CoT-frame text → no leak ships.
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("suppresses bare `[cael] body` from streamed block reply", async () => {
    const enqueue = vi.fn();
    const blockReplyPipeline = { enqueue } as unknown as BlockReplyPipelineLike;

    const handler = createBlockReplyDeliveryHandler({
      onBlockReply: vi.fn(async () => {}),
      normalizeStreamingText: (payload) => ({ text: payload.text, skip: false }),
      applyReplyToMode: (payload) => payload,
      typingSignals: {
        signalTextDelta: vi.fn(async () => {}),
      } as unknown as TypingSignaler,
      blockStreamingEnabled: true,
      blockReplyPipeline,
      directlySentBlockKeys: new Set(),
    });

    await handler({ text: "[cael] internal narration" });

    expect(enqueue).not.toHaveBeenCalled();
  });

  it("suppresses `[ronan 🌊] body` from streamed block reply", async () => {
    const enqueue = vi.fn();
    const blockReplyPipeline = { enqueue } as unknown as BlockReplyPipelineLike;

    const handler = createBlockReplyDeliveryHandler({
      onBlockReply: vi.fn(async () => {}),
      normalizeStreamingText: (payload) => ({ text: payload.text, skip: false }),
      applyReplyToMode: (payload) => payload,
      typingSignals: {
        signalTextDelta: vi.fn(async () => {}),
      } as unknown as TypingSignaler,
      blockStreamingEnabled: true,
      blockReplyPipeline,
      directlySentBlockKeys: new Set(),
    });

    await handler({ text: "[ronan 🌊] surfacing thought" });

    expect(enqueue).not.toHaveBeenCalled();
  });

  it("control: legitimate text WITHOUT a CoT frame still flows through", async () => {
    const enqueue = vi.fn();
    const blockReplyPipeline = { enqueue } as unknown as BlockReplyPipelineLike;

    const handler = createBlockReplyDeliveryHandler({
      onBlockReply: vi.fn(async () => {}),
      normalizeStreamingText: (payload) => ({ text: payload.text, skip: false }),
      applyReplyToMode: (payload) => payload,
      typingSignals: {
        signalTextDelta: vi.fn(async () => {}),
      } as unknown as TypingSignaler,
      blockStreamingEnabled: true,
      blockReplyPipeline,
      directlySentBlockKeys: new Set(),
    });

    await handler({ text: "regular reply, no frame" });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ text: "regular reply, no frame" }),
    );
  });
});
