// Continuation (karmaterminal): the streamed display text never shows a continuation signal,
// including on upstream's settled-prefix append path (#186622), which skips the re-parse.
import { expect, it } from "vitest";
import { createStreamingReplyResolver } from "./embedded-agent-subscribe.handlers.messages.stream.js";

type Frame = { next: string; delta: string };

/** Canonical display text: a fresh resolver with no append to reuse runs the full parse. */
function canonical(next: string): string {
  return createStreamingReplyResolver()({
    evtType: "text_delta",
    next,
    previousText: "",
    previousCleaned: "",
    visibleDelta: next,
    appendDelta: null,
    parsedStreamDirectives: { text: next, replyToTag: false },
    previousAudioDirectiveCount: 0,
  }).text;
}

function streamFrames(chunks: readonly string[]): Frame[] {
  let next = "";
  return chunks.map((delta) => {
    next += delta;
    return { next, delta };
  });
}

it.each([
  ["a bare signal after a stripped media line", ["MEDIA: ./a.png\nDone.\n", "CONTINUE_WORK"]],
  ["a bare signal split across appends", ["MEDIA: ./a.png\nDone.\n", "CONTINUE", "_WORK"]],
  ["text that follows an earlier signal", ["MEDIA: ./a.png\nDone.\nCONTINUE_WORK", " and more"]],
])("keeps every streamed frame equal to the canonical display for %s", (_name, chunks) => {
  const resolve = createStreamingReplyResolver();
  let previousText = "";
  let previousCleaned = "";
  for (const { next, delta } of streamFrames(chunks)) {
    const result = resolve({
      evtType: "text_delta",
      next,
      previousText,
      previousCleaned,
      visibleDelta: delta,
      appendDelta: delta,
      parsedStreamDirectives: { text: delta, replyToTag: false },
      previousAudioDirectiveCount: 0,
    });
    expect(result.text, JSON.stringify(next)).toBe(canonical(next));
    previousText = next;
    previousCleaned = result.text;
  }
  expect(previousCleaned).not.toMatch(/CONTINUE_WORK\s*$/);
});
