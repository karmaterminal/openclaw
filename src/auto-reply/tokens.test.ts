import { describe, it, expect } from "vitest";
import {
  isSilentReplyPrefixText,
  isSilentReplyText,
  parseContinuationSignal,
  startsWithSilentToken,
  stripContinuationSignal,
  stripLeadingSilentToken,
  stripSilentToken,
} from "./tokens.js";

describe("isSilentReplyText", () => {
  it("returns true for exact token", () => {
    expect(isSilentReplyText("NO_REPLY")).toBe(true);
  });

  it("returns true for token with surrounding whitespace", () => {
    expect(isSilentReplyText("  NO_REPLY  ")).toBe(true);
    expect(isSilentReplyText("\nNO_REPLY\n")).toBe(true);
  });

  it("returns true for mixed-case token", () => {
    expect(isSilentReplyText("no_reply")).toBe(true);
    expect(isSilentReplyText("  No_RePlY  ")).toBe(true);
  });

  it("returns false for undefined/empty", () => {
    expect(isSilentReplyText(undefined)).toBe(false);
    expect(isSilentReplyText("")).toBe(false);
  });

  it("returns false for substantive text ending with token (#19537)", () => {
    const text = "Here is a helpful response.\n\nNO_REPLY";
    expect(isSilentReplyText(text)).toBe(false);
  });

  it("returns false for substantive text starting with token", () => {
    const text = "NO_REPLY but here is more content";
    expect(isSilentReplyText(text)).toBe(false);
  });

  it("returns false for token embedded in text", () => {
    expect(isSilentReplyText("Please NO_REPLY to this")).toBe(false);
  });

  it("works with custom token", () => {
    expect(isSilentReplyText("HEARTBEAT_OK", "HEARTBEAT_OK")).toBe(true);
    expect(isSilentReplyText("Checked inbox. HEARTBEAT_OK", "HEARTBEAT_OK")).toBe(false);
  });
});

describe("stripSilentToken", () => {
  it("strips token from end of text", () => {
    expect(stripSilentToken("Done.\n\nNO_REPLY")).toBe("Done.");
  });

  it("does not strip token from start of text", () => {
    expect(stripSilentToken("NO_REPLY 👍")).toBe("NO_REPLY 👍");
  });

  it("strips token with emoji (#30916)", () => {
    expect(stripSilentToken("😄 NO_REPLY")).toBe("😄");
  });

  it("does not strip embedded token suffix without whitespace delimiter", () => {
    expect(stripSilentToken("interject.NO_REPLY")).toBe("interject.NO_REPLY");
  });

  it("strips only trailing occurrence", () => {
    expect(stripSilentToken("NO_REPLY ok NO_REPLY")).toBe("NO_REPLY ok");
  });

  it("returns empty string when only token remains", () => {
    expect(stripSilentToken("NO_REPLY")).toBe("");
    expect(stripSilentToken("  NO_REPLY  ")).toBe("");
  });

  it("strips token preceded by bold markdown formatting", () => {
    expect(stripSilentToken("**NO_REPLY")).toBe("");
    expect(stripSilentToken("some text **NO_REPLY")).toBe("some text");
    expect(stripSilentToken("reasoning**NO_REPLY")).toBe("reasoning");
  });

  it("works with custom token", () => {
    expect(stripSilentToken("done HEARTBEAT_OK", "HEARTBEAT_OK")).toBe("done");
  });
});

describe("stripLeadingSilentToken", () => {
  it("strips glued leading token text", () => {
    expect(stripLeadingSilentToken("NO_REPLYThe user is saying")).toBe("The user is saying");
  });
});

describe("startsWithSilentToken", () => {
  it("matches leading glued silent tokens case-insensitively", () => {
    expect(startsWithSilentToken("NO_REPLYThe user is saying")).toBe(true);
    expect(startsWithSilentToken("No_RePlYThe user is saying")).toBe(true);
    expect(startsWithSilentToken("no_replyThe user is saying")).toBe(true);
  });

  it("rejects separated substantive prefixes and exact-token-only text", () => {
    expect(startsWithSilentToken("NO_REPLY -- nope")).toBe(false);
    expect(startsWithSilentToken("NO_REPLY: explanation")).toBe(false);
    expect(startsWithSilentToken("NO_REPLY—note")).toBe(false);
    expect(startsWithSilentToken("NO_REPLY")).toBe(false);
    expect(startsWithSilentToken("  NO_REPLY  ")).toBe(false);
  });
});

describe("isSilentReplyPrefixText", () => {
  it("matches uppercase token lead fragments", () => {
    expect(isSilentReplyPrefixText("NO")).toBe(true);
    expect(isSilentReplyPrefixText("NO_")).toBe(true);
    expect(isSilentReplyPrefixText("NO_RE")).toBe(true);
    expect(isSilentReplyPrefixText("NO_REPLY")).toBe(true);
    expect(isSilentReplyPrefixText("  HEARTBEAT_", "HEARTBEAT_OK")).toBe(true);
  });

  it("rejects ambiguous natural-language prefixes", () => {
    expect(isSilentReplyPrefixText("N")).toBe(false);
    expect(isSilentReplyPrefixText("No")).toBe(false);
    expect(isSilentReplyPrefixText("no")).toBe(false);
    expect(isSilentReplyPrefixText("Hello")).toBe(false);
  });

  it("keeps underscore guard for non-NO_REPLY tokens", () => {
    expect(isSilentReplyPrefixText("HE", "HEARTBEAT_OK")).toBe(false);
    expect(isSilentReplyPrefixText("HEART", "HEARTBEAT_OK")).toBe(false);
    expect(isSilentReplyPrefixText("HEARTBEAT", "HEARTBEAT_OK")).toBe(false);
    expect(isSilentReplyPrefixText("HEARTBEAT_", "HEARTBEAT_OK")).toBe(true);
  });

  it("rejects non-prefixes and mixed characters", () => {
    expect(isSilentReplyPrefixText("NO_X")).toBe(false);
    expect(isSilentReplyPrefixText("NO_REPLY more")).toBe(false);
    expect(isSilentReplyPrefixText("NO-")).toBe(false);
  });
});

describe("parseContinuationSignal", () => {
  it("parses continue_work with delay", () => {
    expect(parseContinuationSignal("CONTINUE_WORK:45")).toEqual({
      kind: "work",
      delayMs: 45_000,
    });
  });

  it("parses bracket delegate delay and silent suffixes", () => {
    expect(
      parseContinuationSignal("[[CONTINUE_DELEGATE: inspect shard health +30s | silent]]"),
    ).toEqual({
      kind: "delegate",
      task: "inspect shard health",
      delayMs: 30_000,
      silent: true,
      silentWake: undefined,
    });

    expect(parseContinuationSignal("[[CONTINUE_DELEGATE: gather diffs | silent-wake]]")).toEqual({
      kind: "delegate",
      task: "gather diffs",
      delayMs: undefined,
      silent: undefined,
      silentWake: true,
    });

    expect(
      parseContinuationSignal("[[CONTINUE_DELEGATE: compact-safe audit | post-compaction]]"),
    ).toEqual({
      kind: "delegate",
      task: "compact-safe audit",
      delayMs: undefined,
      silent: true,
      silentWake: true,
      postCompaction: true,
    });
  });
});

describe("stripContinuationSignal", () => {
  it("removes the bracket delegate marker and returns the parsed signal", () => {
    expect(
      stripContinuationSignal(
        "Working...\n[[CONTINUE_DELEGATE: inspect shard health +30s | silent-wake]]",
      ),
    ).toEqual({
      text: "Working...",
      signal: {
        kind: "delegate",
        task: "inspect shard health",
        delayMs: 30_000,
        silent: undefined,
        silentWake: true,
      },
    });
  });
});
