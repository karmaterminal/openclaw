import { describe, expect, it } from "vitest";
import { sanitizeUserFacingText, stripCotFramePrefix } from "./sanitize-user-facing-text.js";

describe("stripCotFramePrefix (#269)", () => {
  it("flags bare [name] CoT frames", () => {
    const result = stripCotFramePrefix("[cael] thinking out loud");
    expect(result.didStrip).toBe(true);
    expect(result.text).toBe("");
  });

  it("flags `[the dandelion cult - name]` CoT frames", () => {
    const result = stripCotFramePrefix("[the dandelion cult - cael] more thinking");
    expect(result.didStrip).toBe(true);
    expect(result.text).toBe("");
  });

  it("flags glyph-suffixed frames like `[ronan 🌊]`", () => {
    const result = stripCotFramePrefix("[ronan 🌊] glyph-prefixed");
    expect(result.didStrip).toBe(true);
    expect(result.text).toBe("");
  });

  it("is case-insensitive on the speaker name", () => {
    const result = stripCotFramePrefix("[CAEL] thinking");
    expect(result.didStrip).toBe(true);
    expect(result.text).toBe("");
  });

  it("leaves normal replies alone", () => {
    const result = stripCotFramePrefix("Normal user reply");
    expect(result.didStrip).toBe(false);
    expect(result.text).toBe("Normal user reply");
  });

  it("does not match body-pure replies that merely start with a glyph", () => {
    const result = stripCotFramePrefix("🩸 figs — body-pure reply");
    expect(result.didStrip).toBe(false);
    expect(result.text).toBe("🩸 figs — body-pure reply");
  });

  it("only strips when the frame is at the very start", () => {
    const result = stripCotFramePrefix("Some text [cael] not-at-start");
    expect(result.didStrip).toBe(false);
    expect(result.text).toBe("Some text [cael] not-at-start");
  });
});

describe("sanitizeUserFacingText CoT-frame integration (#269)", () => {
  it("returns empty for bare [name] CoT frame leaks", () => {
    expect(sanitizeUserFacingText("[cael] thinking out loud")).toBe("");
  });

  it("returns empty for `[the dandelion cult - name]` frames", () => {
    expect(sanitizeUserFacingText("[the dandelion cult - cael] more thinking")).toBe("");
  });

  it("returns empty for glyph-suffixed frames", () => {
    expect(sanitizeUserFacingText("[ronan 🌊] glyph-prefixed")).toBe("");
  });

  it("returns empty for mixed-case frames", () => {
    expect(sanitizeUserFacingText("[CAEL] thinking")).toBe("");
  });

  it("passes through a normal user reply unchanged", () => {
    expect(sanitizeUserFacingText("Normal user reply")).toBe("Normal user reply");
  });

  it("passes through body-pure replies that start with a glyph", () => {
    expect(sanitizeUserFacingText("🩸 figs — body-pure reply")).toBe("🩸 figs — body-pure reply");
  });

  it("passes through frames that are not at the start", () => {
    expect(sanitizeUserFacingText("Some text [cael] not-at-start")).toBe(
      "Some text [cael] not-at-start",
    );
  });
});
