import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetCotFrameRegexCacheForTests, hasCotFramePrefix } from "./cot-frame.js";

const NAMES_ENV = "OPENCLAW_COT_FRAME_AGENT_NAMES";
const GLYPHS_ENV = "OPENCLAW_COT_FRAME_AGENT_GLYPHS";

function setEnv(name: string, glyphs?: string): void {
  process.env[NAMES_ENV] = name;
  if (glyphs !== undefined) {
    process.env[GLYPHS_ENV] = glyphs;
  } else {
    delete process.env[GLYPHS_ENV];
  }
  __resetCotFrameRegexCacheForTests();
}

function clearEnv(): void {
  delete process.env[NAMES_ENV];
  delete process.env[GLYPHS_ENV];
  __resetCotFrameRegexCacheForTests();
}

describe("hasCotFramePrefix", () => {
  beforeEach(() => {
    clearEnv();
  });

  afterEach(() => {
    clearEnv();
  });

  describe("with empty / unconfigured allow-list (default)", () => {
    it("returns false for any input when no agent names configured", () => {
      expect(hasCotFramePrefix("[anything] body")).toBe(false);
      expect(hasCotFramePrefix("[some-agent] body")).toBe(false);
      expect(hasCotFramePrefix("")).toBe(false);
    });
  });

  describe("with configured allow-list", () => {
    it("matches a bare bracketed name", () => {
      setEnv("agent-a");
      expect(hasCotFramePrefix("[agent-a] thinking out loud")).toBe(true);
    });

    it("matches a multi-word optional prefix", () => {
      setEnv("agent-a");
      expect(hasCotFramePrefix("[some prefix - agent-a] more thinking")).toBe(true);
    });

    it("matches all configured names", () => {
      setEnv("agent-a,agent-b,agent-c");
      expect(hasCotFramePrefix("[agent-a] x")).toBe(true);
      expect(hasCotFramePrefix("[agent-b] x")).toBe(true);
      expect(hasCotFramePrefix("[agent-c] x")).toBe(true);
    });

    it("matches glyph-suffixed frames with VS16", () => {
      setEnv("agent-a", "🟦");
      expect(hasCotFramePrefix("[agent-a 🟦] x")).toBe(true);
      expect(hasCotFramePrefix("[agent-a 🟦\uFE0F] x")).toBe(true);
    });

    it("matches glyph-suffixed frames without VS16", () => {
      setEnv("agent-a", "🟦");
      expect(hasCotFramePrefix("[agent-a 🟦] no-vs16")).toBe(true);
    });

    it("is case-insensitive on the agent name", () => {
      setEnv("agent-a");
      expect(hasCotFramePrefix("[AGENT-A] x")).toBe(true);
      expect(hasCotFramePrefix("[Agent-A] x")).toBe(true);
    });

    it("matches with zero whitespace after closing bracket", () => {
      setEnv("agent-a");
      expect(hasCotFramePrefix("[agent-a]leak")).toBe(true);
    });

    it("matches with leading whitespace before the frame", () => {
      setEnv("agent-a");
      expect(hasCotFramePrefix("   [agent-a] indented thinking")).toBe(true);
      expect(hasCotFramePrefix("\n[agent-a] after newline")).toBe(true);
    });

    it("matches only-prefix-no-body", () => {
      setEnv("agent-a");
      expect(hasCotFramePrefix("[agent-a]")).toBe(true);
      expect(hasCotFramePrefix("[agent-a] ")).toBe(true);
    });

    it("rejects normal replies", () => {
      setEnv("agent-a");
      expect(hasCotFramePrefix("Normal user reply")).toBe(false);
    });

    it("rejects body-pure replies that start with a glyph", () => {
      setEnv("agent-a", "🟦");
      expect(hasCotFramePrefix("🟦 body-pure reply")).toBe(false);
    });

    it("rejects frames that are not at the start", () => {
      setEnv("agent-a");
      expect(hasCotFramePrefix("Some text [agent-a] not-at-start")).toBe(false);
    });

    it("does not flag [user] / [system] / [assistant] (common English)", () => {
      setEnv("agent-a");
      expect(hasCotFramePrefix("[user] reported a bug")).toBe(false);
      expect(hasCotFramePrefix("[system] ready")).toBe(false);
      expect(hasCotFramePrefix("[assistant] replied")).toBe(false);
    });

    it("does not flag unrelated bracketed tokens", () => {
      setEnv("agent-a");
      expect(hasCotFramePrefix("[info] starting")).toBe(false);
      expect(hasCotFramePrefix("[todo] fix later")).toBe(false);
    });

    it("does not flag partial name matches", () => {
      setEnv("agent-a");
      expect(hasCotFramePrefix("[agent-along] tooling")).toBe(false);
      expect(hasCotFramePrefix("[agent-afoo] reply")).toBe(false);
    });
  });
});
