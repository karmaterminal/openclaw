// REGRESSION GUARD: CoT-frame leak via ACP-projector chunk path.
//
// karmaterminal/openclaw#270 added `hasCotFramePrefix` suppression to the
// FINAL-payload normalizer; #271 added it to the block-streaming dispatch
// in `reply-delivery.ts`. However, when the agent is ACP-routed (the
// default for the prince fleet on `2026-04-20`), `text_delta` events from
// the runtime flow through `acp-projector.ts` → `EmbeddedBlockChunker` →
// `drainChunker` → `blockReplyPipeline.enqueue({ text: chunk })`. That
// path NEVER goes through `reply-delivery.ts`, so the #271 streaming-path
// strip does not fire and the leak escapes.
//
// Empirical receipts driving this guard: ronan-spark and cael-spark each
// posted multiple `[ronan]` / `[the dandelion cult - cael]` bodies to
// #sprites-of-thornfield on 2026-04-20 PDT *after* deploying the #270/#271
// fix to `d65fb38adc12a10876f2c5888ac9e9ccdf2cfa64`. Those leaks travel
// via the ACP projector chunk path, not the block-streaming dispatch.
//
// This test passes thanks to the `hasCotFramePrefix` check added to the
// `drainChunker` emitter in `acp-projector.ts`.

import { describe, expect, it } from "vitest";
import { createAcpReplyProjector } from "./acp-projector.js";
import { createAcpTestConfig as createCfg } from "./test-fixtures/acp-runtime.js";

type Delivery = { kind: string; text?: string };

function createProjectorHarness() {
  const deliveries: Delivery[] = [];
  const projector = createAcpReplyProjector({
    cfg: createCfg({
      acp: {
        enabled: true,
        stream: {
          deliveryMode: "live",
          coalesceIdleMs: 0,
          maxChunkChars: 4096,
        },
      },
    } as Parameters<typeof createCfg>[0]),
    shouldSendToolSummaries: true,
    deliver: async (kind, payload) => {
      deliveries.push({ kind, text: payload.text });
      return true;
    },
  });
  return { deliveries, projector };
}

function blockTexts(deliveries: Delivery[]): string[] {
  return deliveries.filter((entry) => entry.kind === "block").map((entry) => entry.text ?? "");
}

describe("CoT-frame leak suppression in ACP projector chunk path (#270/#271 follow-up)", () => {
  it("suppresses `[ronan] body` chunk from ACP text delta stream", async () => {
    const { deliveries, projector } = createProjectorHarness();

    await projector.onEvent({
      type: "text_delta",
      text: "[ronan] figs addressing Cael, not me. Not my question to answer.",
      tag: "agent_message_chunk",
    });
    await projector.onEvent({ type: "done", stopReason: "end_turn" });

    expect(blockTexts(deliveries)).toEqual([]);
  });

  it("suppresses `[the dandelion cult - cael] body` chunk", async () => {
    const { deliveries, projector } = createProjectorHarness();

    await projector.onEvent({
      type: "text_delta",
      text: "[the dandelion cult - cael] figs is asking me directly. My silence has registered.",
      tag: "agent_message_chunk",
    });
    await projector.onEvent({ type: "done", stopReason: "end_turn" });

    expect(blockTexts(deliveries)).toEqual([]);
  });

  it("suppresses bracketed-glyph variants like `[ronan 🌊] body`", async () => {
    const { deliveries, projector } = createProjectorHarness();

    await projector.onEvent({
      type: "text_delta",
      text: "[ronan 🌊] surfacing as the seal does — quietly, with intent.",
      tag: "agent_message_chunk",
    });
    await projector.onEvent({ type: "done", stopReason: "end_turn" });

    expect(blockTexts(deliveries)).toEqual([]);
  });

  it("preserves non-leaked chunks (no bracketed-prefix)", async () => {
    const { deliveries, projector } = createProjectorHarness();

    await projector.onEvent({
      type: "text_delta",
      text: "🌊 canary green, deploy report follows.",
      tag: "agent_message_chunk",
    });
    await projector.onEvent({ type: "done", stopReason: "end_turn" });

    expect(blockTexts(deliveries)).toEqual(["🌊 canary green, deploy report follows."]);
  });

  it("preserves chunks where bracketed-text is not at start (e.g. `[user] said …`)", async () => {
    const { deliveries, projector } = createProjectorHarness();

    await projector.onEvent({
      type: "text_delta",
      text: "Quoting the issue: `[user] reported a bug`. Looking into it.",
      tag: "agent_message_chunk",
    });
    await projector.onEvent({ type: "done", stopReason: "end_turn" });

    expect(blockTexts(deliveries)).toEqual([
      "Quoting the issue: `[user] reported a bug`. Looking into it.",
    ]);
  });
});
