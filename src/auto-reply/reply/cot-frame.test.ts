import { describe, expect, it } from "vitest";
import { hasCotFramePrefix } from "./cot-frame.js";

describe("hasCotFramePrefix (#269)", () => {
  describe("matches bracketed speaker frames", () => {
    it("matches bare [cael]", () => {
      expect(hasCotFramePrefix("[cael] thinking out loud")).toBe(true);
    });

    it("matches [the dandelion cult - cael]", () => {
      expect(hasCotFramePrefix("[the dandelion cult - cael] more thinking")).toBe(true);
    });

    it("matches all prince names", () => {
      expect(hasCotFramePrefix("[silas] narration")).toBe(true);
      expect(hasCotFramePrefix("[ronan] narration")).toBe(true);
      expect(hasCotFramePrefix("[elliott] narration")).toBe(true);
    });

    it("matches glyph-suffixed frames with VS16", () => {
      expect(hasCotFramePrefix("[ronan 🌊] glyph-prefixed")).toBe(true);
      expect(hasCotFramePrefix("[silas 🌫️] misty")).toBe(true);
      expect(hasCotFramePrefix("[cael 🩸] blooded")).toBe(true);
      expect(hasCotFramePrefix("[elliott 🌻] sunflower")).toBe(true);
    });

    it("matches glyph-suffixed frames without VS16", () => {
      expect(hasCotFramePrefix("[silas 🌫] no-vs16")).toBe(true);
      expect(hasCotFramePrefix("[ronan 🌊] no-vs16")).toBe(true);
      expect(hasCotFramePrefix("[cael 🩸] no-vs16")).toBe(true);
      expect(hasCotFramePrefix("[elliott 🌻] no-vs16")).toBe(true);
    });

    it("is case-insensitive on the speaker name", () => {
      expect(hasCotFramePrefix("[CAEL] thinking")).toBe(true);
      expect(hasCotFramePrefix("[Ronan] thinking")).toBe(true);
      expect(hasCotFramePrefix("[THE DANDELION CULT - silas] thinking")).toBe(true);
    });

    it("matches with zero whitespace after closing bracket", () => {
      expect(hasCotFramePrefix("[cael]leak")).toBe(true);
    });

    it("matches with leading whitespace before the frame", () => {
      expect(hasCotFramePrefix("   [cael] indented thinking")).toBe(true);
      expect(hasCotFramePrefix("\n[ronan] after newline")).toBe(true);
    });

    it("matches only-prefix-no-body", () => {
      expect(hasCotFramePrefix("[cael]")).toBe(true);
      expect(hasCotFramePrefix("[cael] ")).toBe(true);
    });
  });

  describe("rejects non-CoT-frame text", () => {
    it("rejects empty string", () => {
      expect(hasCotFramePrefix("")).toBe(false);
    });

    it("rejects normal replies", () => {
      expect(hasCotFramePrefix("Normal user reply")).toBe(false);
    });

    it("rejects body-pure replies that start with a glyph", () => {
      expect(hasCotFramePrefix("🩸 figs — body-pure reply")).toBe(false);
    });

    it("rejects frames that are not at the start", () => {
      expect(hasCotFramePrefix("Some text [cael] not-at-start")).toBe(false);
    });

    it("does not flag [user] / [system] / [assistant] (common English)", () => {
      expect(hasCotFramePrefix("[user] reported a bug")).toBe(false);
      expect(hasCotFramePrefix("[system] ready")).toBe(false);
      expect(hasCotFramePrefix("[assistant] replied")).toBe(false);
    });

    it("does not flag unrelated bracketed tokens", () => {
      expect(hasCotFramePrefix("[info] starting")).toBe(false);
      expect(hasCotFramePrefix("[todo] fix later")).toBe(false);
    });

    it("does not flag partial name matches", () => {
      expect(hasCotFramePrefix("[caeling] tooling")).toBe(false);
      expect(hasCotFramePrefix("[caelfoo] reply")).toBe(false);
    });
  });
});
