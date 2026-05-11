import { describe, expect, it, vi } from "vitest";
import {
  buildCurrentTurnPromptContextPrefix,
  buildRuntimeContextSystemContext,
  queueRuntimeContextForNextTurn,
  resolveRuntimeContextPromptParts,
} from "./runtime-context-prompt.js";

describe("runtime context prompt submission", () => {
  it("keeps unchanged prompts as a normal user prompt", () => {
    expect(
      resolveRuntimeContextPromptParts({
        effectivePrompt: "visible ask",
        transcriptPrompt: "visible ask",
      }),
    ).toEqual({ prompt: "visible ask" });
  });

  it("moves hidden runtime context out of the visible prompt", () => {
    const effectivePrompt = [
      "visible ask",
      "",
      "<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>",
      "secret runtime context",
      "<<<END_OPENCLAW_INTERNAL_CONTEXT>>>",
    ].join("\n");

    expect(
      resolveRuntimeContextPromptParts({
        effectivePrompt,
        transcriptPrompt: "visible ask",
      }),
    ).toEqual({
      prompt: "visible ask",
      runtimeContext:
        "<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>\nsecret runtime context\n<<<END_OPENCLAW_INTERNAL_CONTEXT>>>",
    });
  });

  it("preserves prompt additions as hidden runtime context", () => {
    expect(
      resolveRuntimeContextPromptParts({
        effectivePrompt: ["runtime prefix", "", "visible ask", "", "retry instruction"].join("\n"),
        transcriptPrompt: "visible ask",
      }),
    ).toEqual({
      prompt: "visible ask",
      runtimeContext: "runtime prefix\n\nretry instruction",
    });
  });

  it("uses a marker prompt for runtime-only events", () => {
    expect(
      resolveRuntimeContextPromptParts({
        effectivePrompt: "internal event",
        transcriptPrompt: "",
      }),
    ).toEqual({
      prompt: "Continue the OpenClaw runtime event.",
      runtimeContext: "internal event",
      runtimeOnly: true,
      runtimeSystemContext: expect.stringContaining("internal event"),
    });
  });

  it("uses current-turn context as prompt-local text", () => {
    expect(
      buildCurrentTurnPromptContextPrefix({
        text: "Conversation info (untrusted metadata):\n```json\n{}\n```",
      }),
    ).toBe("Conversation info (untrusted metadata):\n```json\n{}\n```");
  });

  it("omits empty current-turn context", () => {
    expect(buildCurrentTurnPromptContextPrefix(undefined)).toBe("");
    expect(buildCurrentTurnPromptContextPrefix({ text: "   " })).toBe("");
  });

  it("queues runtime context as a hidden next-turn custom message", async () => {
    const sentMessages: Array<{ content: string }> = [];
    const sendCustomMessage = vi.fn(async (message: { content: string }) => {
      sentMessages.push(message);
    });

    await queueRuntimeContextForNextTurn({
      session: { sendCustomMessage },
      runtimeContext: "secret runtime context",
    });

    expect(sendCustomMessage).toHaveBeenCalledWith(
      {
        customType: "openclaw.runtime-context",
        content: "secret runtime context",
        display: false,
        details: { source: "openclaw-runtime-context" },
      },
      { deliverAs: "nextTurn" },
    );
    expect(sentMessages[0]?.content).not.toContain(
      "OpenClaw runtime context for the immediately preceding user message.",
    );
    expect(sentMessages[0]?.content).not.toContain("not user-authored");
  });

  it("labels next-turn runtime context only when used as prompt-local system context", () => {
    const systemContext = buildRuntimeContextSystemContext("secret runtime context");

    expect(systemContext).toContain(
      "OpenClaw runtime context for the immediately preceding user message.",
    );
    expect(systemContext).toContain("not user-authored");
    expect(systemContext).toContain("secret runtime context");
  });

  it("labels runtime-only events as system context", async () => {
    const { buildRuntimeEventSystemContext } = await import("./runtime-context-prompt.js");

    expect(buildRuntimeEventSystemContext("internal event")).toContain("OpenClaw runtime event.");
    expect(buildRuntimeEventSystemContext("internal event")).toContain("not user-authored");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Body-duplication bug repros (figs WO 2026-05-11, 🩸 source-walk)
  //
  // Substrate-leak shape: trailing `||` fallback in resolveRuntimeContextPromptParts
  // turns an empty-string return from removeLastPromptOccurrence into a full
  // duplicate of effectivePrompt as runtimeContext. Both then get sent to the
  // model: prompt as user-role message + runtimeContext as runtime-context
  // custom_message, so the body lands TWICE in the model context per turn.
  //
  // Each test names the substrate condition that triggers the duplication.
  // ─────────────────────────────────────────────────────────────────────────
  describe("body-duplication bug repros", () => {
    it("BUG: when transcriptPrompt equals effectivePrompt with only whitespace\n      delta, runtimeContext duplicates the full prompt body", () => {
      // effectivePrompt has the same content as transcriptPrompt but with
      // surrounding whitespace (a real-world shape: discord trims, internal
      // pipeline doesn't). Whitespace delta means transcriptPrompt !==
      // effectivePrompt, so the early-return doesn't fire, but
      // removeLastPromptOccurrence returns "" because the prompt is the
      // entire text. The `||` fallback then duplicates the full body.
      const body = "Hello world this is a substantive message that should not duplicate.";
      const result = resolveRuntimeContextPromptParts({
        effectivePrompt: `\n${body}\n`,
        transcriptPrompt: body,
      });

      // Bug behavior (current): runtimeContext is set to a full copy of the body
      expect(result.runtimeContext).toBeDefined();
      // The duplication: prompt and runtimeContext both contain the same body
      expect(result.prompt).toContain(body);
      expect(result.runtimeContext).toContain(body);
      // BYTE-PROOF: the two fields contain identical body content (the leak)
      expect(result.runtimeContext).toBe(result.prompt);
    });

    it("BUG: when removeLastPromptOccurrence returns empty string, fallback\n      duplicates entire effectivePrompt instead of yielding undefined runtimeContext", () => {
      // Construct effectivePrompt to be exactly transcriptPrompt with leading
      // whitespace — a one-byte difference forces the inequality check to fail
      // (so we don't hit the early return), yet removeLastPromptOccurrence
      // strips the prompt and returns nothing meaningful.
      const transcriptPrompt = "the body";
      const effectivePrompt = `\n${transcriptPrompt}`;

      const result = resolveRuntimeContextPromptParts({
        effectivePrompt,
        transcriptPrompt,
      });

      // EXPECTED (post-fix): no duplication — runtimeContext should be
      // undefined because there's no actual additional context to convey.
      // CURRENT (bug): runtimeContext is the full effectivePrompt, duplicating
      // the body that's already in `prompt`.
      expect(
        result.runtimeContext,
        "runtimeContext should be undefined when there is no real runtime\n           context beyond the prompt — currently it duplicates the prompt body",
      ).toBeUndefined();
    });

    it("BUG: with empty transcriptPrompt and matching effectivePrompt,\n      duplicates body via runtime-only event branch", () => {
      // When transcriptPrompt is "" (e.g. a runtime-only event), prompt becomes
      // OPENCLAW_RUNTIME_EVENT_USER_PROMPT marker and runtimeContext becomes the
      // event body. That's correct semantics. But check: when effectivePrompt
      // happens to be the same as the user-prompt-marker, no duplication should
      // arise. (defensive test against future fix regressions.)
      const result = resolveRuntimeContextPromptParts({
        effectivePrompt: "Continue the OpenClaw runtime event.",
        transcriptPrompt: "",
      });

      // No body to duplicate; runtimeContext should be the event content,
      // distinct from the marker prompt.
      expect(result.prompt).toBe("Continue the OpenClaw runtime event.");
      expect(result.runtimeOnly).toBe(true);
      expect(result.runtimeContext).toBe("Continue the OpenClaw runtime event.");
      // Note: this case IS a duplication too, but it's the documented
      // runtime-event shape, not the user-prompt body-leak shape.
    });

    it("PROOF that fix is needed: removeLastPromptOccurrence returns empty\n      when text and prompt are byte-identical", async () => {
      // We import the internal function via the module to assert the
      // current behavior the bug depends on. This is the substrate the
      // `||` fallback is gated on.
      // (re-import to access non-exported helper via test module side-channel
      //  if needed — for now just assert via resolveRuntimeContextPromptParts
      //  the empty-string return path)
      const result = resolveRuntimeContextPromptParts({
        effectivePrompt: "abc",
        transcriptPrompt: "abc ", // trailing space ≠ effectivePrompt
      });

      // transcriptPrompt.trim() === effectivePrompt → prompt = "abc"
      // removeLastPromptOccurrence("abc", "abc ") → null (prompt-with-space
      // not found in text), so runtimeContext = effectivePrompt.trim() = "abc"
      // → DUPLICATION even when the only difference is a trailing space.
      expect(result.prompt).toBe("abc");
      expect(
        result.runtimeContext,
        "runtimeContext should be undefined — it has no information beyond prompt",
      ).toBeUndefined();
    });
  });
});
