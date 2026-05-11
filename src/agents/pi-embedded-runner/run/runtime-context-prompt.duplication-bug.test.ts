import { describe, expect, it } from "vitest";
import { resolveRuntimeContextPromptParts } from "./runtime-context-prompt.js";

/**
 * Regression test for the substrate-leak bug 🩸 source-walked 2026-05-11.
 *
 * Bug: `runtime-context-prompt.ts:60-62` falls back via `||` to
 * `params.effectivePrompt.trim()` when `removeLastPromptOccurrence` returns
 * an empty string (transcript-prompt matches the effective-prompt with
 * nothing extra-to-extract). Result: `runtimeContext` becomes a full
 * duplicate of `prompt`, both get sent — the user-role message AND the
 * `openclaw.runtime-context` custom_message contain the same body. Per turn,
 * the model's context window receives the same body twice.
 */
describe("runtime context prompt — body-duplication bug (substrate-leak)", () => {
  it("does NOT duplicate the body when transcriptPrompt differs from effectivePrompt only by trailing whitespace", () => {
    // Real-world shape: prompt-builder adds trailing newline to effectivePrompt
    // but transcriptPrompt is the bare text. Strict equality at the early-return
    // fails, so we fall through — but no extra context means no runtimeContext.
    const result = resolveRuntimeContextPromptParts({
      effectivePrompt: "visible ask\n",
      transcriptPrompt: "visible ask",
    });

    expect(result.prompt).toBe("visible ask");
    // Post-fix: no duplication — runtimeContext is undefined when there's
    // nothing extra to extract.
    expect(result.runtimeContext).toBeUndefined();
  });

  it("does NOT duplicate the body when transcriptPrompt is inside effectivePrompt with only whitespace wrapper", () => {
    // removeLastPromptOccurrence finds the substring at index 1, before=" "
    // trims to "", after="" → joined "" → extracted is empty → undefined.
    const transcriptPrompt = "visible ask";
    const result = resolveRuntimeContextPromptParts({
      effectivePrompt: ` ${transcriptPrompt}`,
      transcriptPrompt,
    });

    expect(result.prompt).toBe("visible ask");
    // Post-fix: no duplication.
    expect(result.runtimeContext).toBeUndefined();
  });

  it("CORRECTLY does not duplicate when there is genuine extra context", () => {
    // Sanity: when there IS extra wrapper context, the function returns it
    // correctly (not duplicate of prompt).
    const result = resolveRuntimeContextPromptParts({
      effectivePrompt: "extra prefix\n\nvisible ask\n\nextra suffix",
      transcriptPrompt: "visible ask",
    });
    expect(result.prompt).toBe("visible ask");
    expect(result.runtimeContext).toBe("extra prefix\n\nextra suffix");
    expect(result.runtimeContext).not.toBe(result.prompt);
  });

  it("CORRECTLY returns undefined runtimeContext when transcript === effective (early return)", () => {
    // Sanity: identical strings hit the early return and produce no
    // runtimeContext, no duplication.
    const result = resolveRuntimeContextPromptParts({
      effectivePrompt: "visible ask",
      transcriptPrompt: "visible ask",
    });
    expect(result.prompt).toBe("visible ask");
    expect(result.runtimeContext).toBeUndefined();
  });

  it("PRESERVES fallback when transcriptPrompt is NOT a substring of effectivePrompt (codex P2 catch on #642)", () => {
    // Real-world shape from src/auto-reply/reply/prompt-prelude.ts:38-47:
    //   queued effectivePrompt = [mediaNote, mediaReplyHint, queueBodyBase].join("\n\n")
    //   transcriptPrompt        = [mediaNote, transcriptBody].join("\n\n")
    // transcriptPrompt is NOT a contiguous substring of effectivePrompt because
    // mediaReplyHint sits between mediaNote and the body in the queued shape.
    // removeLastPromptOccurrence returns null. Old code (pre-#640-fix) fell back
    // to params.effectivePrompt.trim() to preserve the media-reply-hint as
    // runtime context. The naive fix would drop that. The proper fix
    // distinguishes null (not-found) from empty (found-but-empty).
    const transcriptPrompt = ["media note", "transcript body"].join("\n");
    const effectivePrompt = ["media note", "media reply hint", "transcript body"].join("\n");

    const result = resolveRuntimeContextPromptParts({
      effectivePrompt,
      transcriptPrompt,
    });

    expect(result.prompt).toBe("media note\ntranscript body");
    // The fallback is preserved when transcript is not a substring — the
    // model still receives the media-reply-hint substrate as runtime context.
    expect(result.runtimeContext).toBeDefined();
    expect(result.runtimeContext).toContain("media reply hint");
  });

  it("PRESERVES fallback when transcriptPrompt has trailing whitespace not in effectivePrompt (cohort byte-walk by 🌊)", () => {
    // Minimal-repro of the null-substring branch: prompt-with-trailing-space
    // is NOT a substring of the shorter effective text. removeLastPromptOccurrence
    // returns null — NOT empty — so the three-way distinction at
    // runtime-context-prompt.ts:102-106 must hit the null-fallback branch and
    // return effectivePrompt.trim(), not undefined.
    //
    // 🌊 Ronan flagged at #sprites-of-thornfield 07:35 PDT that PR #641's
    // closed-branch test 4 had encoded `expect undefined` for this shape —
    // wrong-direction post-#642-fix. Locking the correct contract here.
    const result = resolveRuntimeContextPromptParts({
      effectivePrompt: "abc",
      transcriptPrompt: "abc ",
    });

    expect(result.prompt).toBe("abc");
    // null branch: removeLastPromptOccurrence returned null → fallback to
    // effectivePrompt.trim() = "abc". NOT undefined (which would be the
    // empty-extracted branch behavior).
    expect(result.runtimeContext).toBe("abc");
  });
});
