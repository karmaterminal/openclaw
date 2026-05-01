// REGRESSION GUARD: CoT-frame leak via block-streaming bypass.
//
// `hasCotFramePrefix` suppression was originally added to
// `normalizeReplyPayload` (the FINAL-payload normalizer). However, when
// `blockStreamingEnabled: true` (default for chat channels), individual
// streamed blocks flow through `createBlockReplyDeliveryHandler` →
// `normalizeReplyPayloadDirectives` (a directive-only normalizer that does
// NOT strip CoT frames) → `blockReplyPipeline.enqueue` → `onBlockReply`.
//
// Without the streaming-path check guarded by these tests, per-block
// emissions of `[<agent-name>] body` would ship to the channel, because the
// streaming path never invoked the CoT-frame check. These tests now pass
// thanks to the streaming-path `hasCotFramePrefix` check in
// `createBlockReplyDeliveryHandler`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetCotFrameRegexCacheForTests } from "./cot-frame.js";
import { createBlockReplyDeliveryHandler } from "./reply-delivery.js";
import type { TypingSignaler } from "./typing-mode.js";

type BlockReplyPipelineLike = NonNullable<
  Parameters<typeof createBlockReplyDeliveryHandler>[0]["blockReplyPipeline"]
>;

const NAMES_ENV = "OPENCLAW_COT_FRAME_AGENT_NAMES";
const GLYPHS_ENV = "OPENCLAW_COT_FRAME_AGENT_GLYPHS";

function configureAgents(names: string, glyphs?: string): void {
  process.env[NAMES_ENV] = names;
  if (glyphs !== undefined) {
    process.env[GLYPHS_ENV] = glyphs;
  } else {
    delete process.env[GLYPHS_ENV];
  }
  __resetCotFrameRegexCacheForTests();
}

function clearAgents(): void {
  delete process.env[NAMES_ENV];
  delete process.env[GLYPHS_ENV];
  __resetCotFrameRegexCacheForTests();
}

describe("CoT-frame leak suppression in block-streaming path", () => {
  beforeEach(() => {
    configureAgents("agent-a,agent-b", "🟦,🟩");
  });

  afterEach(() => {
    clearAgents();
  });

  it("suppresses `[some prefix - agent-a] body` from streamed block reply", async () => {
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
      text: "[some prefix - agent-a] thinking out loud about the leak",
    });

    expect(enqueue).not.toHaveBeenCalled();
  });

  it("suppresses bare `[agent-a] body` from streamed block reply", async () => {
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

    await handler({ text: "[agent-a] internal narration" });

    expect(enqueue).not.toHaveBeenCalled();
  });

  it("suppresses `[agent-b 🟩] body` from streamed block reply", async () => {
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

    await handler({ text: "[agent-b 🟩] surfacing thought" });

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
