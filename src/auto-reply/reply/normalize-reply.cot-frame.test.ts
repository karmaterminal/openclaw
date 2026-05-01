import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetCotFrameRegexCacheForTests } from "./cot-frame.js";
import { normalizeReplyPayload, type NormalizeReplySkipReason } from "./normalize-reply.js";

const NAMES_ENV = "OPENCLAW_COT_FRAME_AGENT_NAMES";
const GLYPHS_ENV = "OPENCLAW_COT_FRAME_AGENT_GLYPHS";

function collectSkip(reasons: NormalizeReplySkipReason[]) {
  return (reason: NormalizeReplySkipReason) => {
    reasons.push(reason);
  };
}

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

describe("normalizeReplyPayload CoT-frame suppression", () => {
  beforeEach(() => {
    configureAgents("agent-a,agent-b", "🟦,🟩");
  });

  afterEach(() => {
    clearAgents();
  });

  it("suppresses bare [agent-a] frames as silent", () => {
    const reasons: NormalizeReplySkipReason[] = [];
    const result = normalizeReplyPayload(
      { text: "[agent-a] thinking out loud" },
      { onSkip: collectSkip(reasons) },
    );
    expect(result).toBeNull();
    expect(reasons).toEqual(["silent"]);
  });

  it("suppresses frames with multi-word optional prefix as silent", () => {
    const reasons: NormalizeReplySkipReason[] = [];
    const result = normalizeReplyPayload(
      { text: "[some prefix - agent-b] fleet deploy done" },
      { onSkip: collectSkip(reasons) },
    );
    expect(result).toBeNull();
    expect(reasons).toEqual(["silent"]);
  });

  it("suppresses glyph-suffixed frames (with VS16) as silent", () => {
    const reasons: NormalizeReplySkipReason[] = [];
    const result = normalizeReplyPayload(
      { text: "[agent-a 🟦\uFE0F] glyphed narration" },
      { onSkip: collectSkip(reasons) },
    );
    expect(result).toBeNull();
    expect(reasons).toEqual(["silent"]);
  });

  it("suppresses glyph-suffixed frames (without VS16) as silent", () => {
    const reasons: NormalizeReplySkipReason[] = [];
    const result = normalizeReplyPayload(
      { text: "[agent-b 🟩] no-vs16 narration" },
      { onSkip: collectSkip(reasons) },
    );
    expect(result).toBeNull();
    expect(reasons).toEqual(["silent"]);
  });

  it("suppresses mixed-case frames as silent", () => {
    const reasons: NormalizeReplySkipReason[] = [];
    const result = normalizeReplyPayload(
      { text: "[AGENT-A] thinking" },
      { onSkip: collectSkip(reasons) },
    );
    expect(result).toBeNull();
    expect(reasons).toEqual(["silent"]);
  });

  it("suppresses zero-whitespace frames like [agent-a]leak as silent", () => {
    const reasons: NormalizeReplySkipReason[] = [];
    const result = normalizeReplyPayload(
      { text: "[agent-a]leak" },
      { onSkip: collectSkip(reasons) },
    );
    expect(result).toBeNull();
    expect(reasons).toEqual(["silent"]);
  });

  it("drops CoT-leaked text but keeps media when media is present", () => {
    const result = normalizeReplyPayload({
      text: "[agent-a] thinking out loud",
      mediaUrl: "https://example.com/img.png",
    });
    expect(result).not.toBeNull();
    expect(result!.text).toBe("");
    expect(result!.mediaUrl).toBe("https://example.com/img.png");
  });

  it("suppresses error-flagged CoT-frame payloads as silent too", () => {
    const reasons: NormalizeReplySkipReason[] = [];
    const result = normalizeReplyPayload(
      { text: "[agent-a] internal error narration", isError: true },
      { onSkip: collectSkip(reasons) },
    );
    expect(result).toBeNull();
    expect(reasons).toEqual(["silent"]);
  });

  it("passes through a normal user reply unchanged", () => {
    const result = normalizeReplyPayload({ text: "Normal user reply" });
    expect(result).not.toBeNull();
    expect(result!.text).toBe("Normal user reply");
  });

  it("passes through body-pure replies starting with a glyph", () => {
    const result = normalizeReplyPayload({ text: "🟦 body-pure reply" });
    expect(result).not.toBeNull();
    expect(result!.text).toBe("🟦 body-pure reply");
  });

  it("passes through [user] / [system] / [assistant] (not configured agent names)", () => {
    const userResult = normalizeReplyPayload({ text: "[user] reported a bug" });
    expect(userResult).not.toBeNull();
    expect(userResult!.text).toBe("[user] reported a bug");

    const systemResult = normalizeReplyPayload({ text: "[system] ready" });
    expect(systemResult).not.toBeNull();
    expect(systemResult!.text).toBe("[system] ready");

    const assistantResult = normalizeReplyPayload({ text: "[assistant] replied" });
    expect(assistantResult).not.toBeNull();
    expect(assistantResult!.text).toBe("[assistant] replied");
  });

  it("passes through frames that are not at the start", () => {
    const result = normalizeReplyPayload({ text: "Some text [agent-a] not-at-start" });
    expect(result).not.toBeNull();
    expect(result!.text).toBe("Some text [agent-a] not-at-start");
  });
});
