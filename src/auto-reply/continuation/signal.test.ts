import { describe, expect, it } from "vitest";
import { extractContinuationSignal } from "./signal.js";

describe("extractContinuationSignal", () => {
  it("returns null when disabled", () => {
    const result = extractContinuationSignal({
      payloads: [{ text: "reply\nCONTINUE_WORK" }],
      enabled: false,
    });
    expect(result.signal).toBeNull();
  });

  it("extracts bracket signal from last text payload", () => {
    const payloads = [{ text: "Here is my reply.\n\n[[CONTINUE_DELEGATE: check status]]" }];
    const result = extractContinuationSignal({
      payloads,
      enabled: true,
      sessionKey: "test",
    });
    expect(result.signal?.kind).toBe("delegate");
    expect(result.fromBracket).toBe(true);
    // Text should be stripped
    expect(payloads[0].text).toBe("Here is my reply.");
  });

  it("extracts CONTINUE_WORK from text", () => {
    const payloads = [{ text: "Done for now.\nCONTINUE_WORK:30" }];
    const result = extractContinuationSignal({
      payloads,
      enabled: true,
    });
    expect(result.signal).toEqual({ kind: "work", delayMs: 30_000 });
    expect(result.fromBracket).toBe(true);
  });

  it("falls back to tool-call request when no bracket signal", () => {
    const result = extractContinuationSignal({
      payloads: [{ text: "Normal reply." }],
      continueWorkRequest: { reason: "more to do", delaySeconds: 15 },
      enabled: true,
    });
    expect(result.signal).toEqual({ kind: "work", delayMs: 15_000 });
    expect(result.fromBracket).toBe(false);
    expect(result.workReason).toBe("more to do");
  });

  it("bracket signal takes precedence over tool-call request", () => {
    const payloads = [{ text: "reply\nCONTINUE_WORK:5" }];
    const result = extractContinuationSignal({
      payloads,
      continueWorkRequest: { reason: "tool", delaySeconds: 60 },
      enabled: true,
    });
    // Bracket wins
    expect(result.signal).toEqual({ kind: "work", delayMs: 5_000 });
    expect(result.fromBracket).toBe(true);
    expect(result.workReason).toBeUndefined();
  });

  // Swim-34 row A1a B-2: delegate bracket beats work tool-call AND preserves the bracket's kind.
  // Anchor: signal.ts:121-124 (merge expression) + row spec
  // swims/swim-34-formal-matrix/rows/A1a-signal-bracket-over-tool-precedence.md
  it("delegate bracket overrides work tool-call (kind preserved, fromBracket true, workReason undefined)", () => {
    const payloads = [{ text: "done [[CONTINUE_DELEGATE: investigate foo]]" }];
    const result = extractContinuationSignal({
      payloads,
      continueWorkRequest: { reason: "tool", delaySeconds: 5 },
      enabled: true,
    });
    expect(result.signal?.kind).toBe("delegate");
    if (result.signal?.kind === "delegate") {
      expect(result.signal.task).toBe("investigate foo");
    }
    expect(result.fromBracket).toBe(true);
    expect(result.workReason).toBeUndefined();
  });

  // Swim-34 row A1b — Signal extraction mutates payload text (strips bracket).
  // Row: swims/swim-34-formal-matrix/rows/A1b-signal-payload-mutation.md
  // Anchor: signal.ts:103-105 (lastTextPayload.text = result.text)
  describe("row A1b — payload text mutation", () => {
    it("B-1 work bracket mid-text: row asserts strip, but impl regex anchors to end-of-text — expect spec-impl gap", () => {
      // Row B-1 input verbatim. Per stripContinuationSignal regex (tokens.ts:283),
      // CONTINUE_WORK only matches at end-of-trimmed-text. parseContinuationSignal
      // is the same. So this input produces signal=null and no mutation.
      // Row spec implicitly assumes mid-text detection; impl does not provide it.
      const payloads = [{ text: "all done [[CONTINUE_WORK]] more context" }];
      const result = extractContinuationSignal({ payloads, enabled: true });
      // Documenting actual behaviour: no signal extracted, text unchanged.
      // (If row spec is the truth, this test would assert .not.toContain('[[CONTINUE_WORK]]')
      // and would FAIL — flagging spec/impl gap.)
      expect(result.signal).toBeNull();
      expect(payloads[0].text).toBe("all done [[CONTINUE_WORK]] more context");
    });

    it("B-2 delegate bracket at end strips token from payload text", () => {
      const payloads = [{ text: "handing off [[CONTINUE_DELEGATE:investigate bug #123]]" }];
      const result = extractContinuationSignal({ payloads, enabled: true });
      expect(result.signal?.kind).toBe("delegate");
      expect(payloads[0].text).not.toContain("[[CONTINUE_DELEGATE");
      expect(payloads[0].text).toBe("handing off");
    });

    it("B-3 no bracket → byte-identical text (no spurious mutation)", () => {
      const original = "plain text";
      const payloads = [{ text: original }];
      const result = extractContinuationSignal({ payloads, enabled: true });
      expect(result.signal).toBeNull();
      expect(payloads[0].text).toBe(original);
    });

    it("B-4 bracket in non-last text payload → backward scan no-mutation on first", () => {
      // Last text payload is payloads[1] (no bracket); backward scan stops there,
      // returns null, payloads[0] must not be mutated despite carrying a bracket.
      const firstOriginal = "first [[CONTINUE_WORK]]";
      const payloads = [{ text: firstOriginal }, { text: "second" }];
      const result = extractContinuationSignal({ payloads, enabled: true });
      expect(result.signal).toBeNull();
      expect(payloads[0].text).toBe(firstOriginal);
      expect(payloads[1].text).toBe("second");
    });
  });

  // Swim-34 row A1c — Signal extraction backward payload scan.
  // Row: swims/swim-34-formal-matrix/rows/A1c-signal-backward-payload-scan.md
  // Anchor: signal.ts:82-90 (backward scan loop) + coord BRIEF §10
  describe("row A1c — backward payload scan", () => {
    it("B-1 text then tool_use: scan walks past tool, finds bracket in text[0]", () => {
      const payloads = [
        { text: "handing [[CONTINUE_DELEGATE:investigate]]" },
        { tool_use: { name: "search" } } as { tool_use: { name: string }; text?: undefined },
      ];
      const result = extractContinuationSignal({ payloads, enabled: true });
      expect(result.signal?.kind).toBe("delegate");
      expect(result.fromBracket).toBe(true);
      if (result.signal?.kind === "delegate") {
        expect(result.signal.task).toBe("investigate");
      }
    });

    it("B-2 text(bracket), text(empty), tool_use: scan skips empty + tool, parses text[0]", () => {
      // Row spec writes 'done [[CONTINUE_WORK]]' but [[...]] syntax is delegate-only;
      // work signal is bare 'CONTINUE_WORK' at end-of-text (tokens.ts:253).
      // Using the valid work form to test the backward-scan invariant.
      const payloads = [
        { text: "done CONTINUE_WORK" },
        { text: "" },
        { tool_use: { name: "x" } } as { tool_use: { name: string }; text?: undefined },
      ];
      const result = extractContinuationSignal({ payloads, enabled: true });
      expect(result.signal?.kind).toBe("work");
      expect(result.fromBracket).toBe(true);
    });

    it("B-3 text(none), text(bracket), tool_use: scan parses text[1], leaves text[0] unmutated", () => {
      // Row spec writes '[[CONTINUE_WORK]]' but that's invalid (delegate-only bracket form);
      // valid work signal is bare 'CONTINUE_WORK'. Adjusted to test the actual backward-scan
      // invariant the row is reaching for.
      const text0Original = "first no signal";
      const payloads = [
        { text: text0Original },
        { text: "CONTINUE_WORK" },
        { tool_use: {} } as { tool_use: Record<string, never>; text?: undefined },
      ];
      const result = extractContinuationSignal({ payloads, enabled: true });
      expect(result.signal?.kind).toBe("work");
      expect(result.fromBracket).toBe(true);
      // A1b co-invariant: only the matched payload is mutated.
      expect(payloads[0].text).toBe(text0Original);
    });

    it("B-4 tool_use only: no text payload found, signal null", () => {
      const payloads = [{ tool_use: {} } as { tool_use: Record<string, never>; text?: undefined }];
      const result = extractContinuationSignal({ payloads, enabled: true });
      expect(result.signal).toBeNull();
      expect(result.fromBracket).toBe(false);
    });

    it("B-5 empty array: bracket-parse skipped, signal null", () => {
      const result = extractContinuationSignal({ payloads: [], enabled: true });
      expect(result.signal).toBeNull();
      expect(result.fromBracket).toBe(false);
    });
  });

  it("handles empty payloads", () => {
    const result = extractContinuationSignal({
      payloads: [],
      enabled: true,
    });
    expect(result.signal).toBeNull();
  });

  it("scans backward through payloads to find last text", () => {
    const payloads = [
      { text: "First reply with bracket\n[[CONTINUE_DELEGATE: old task]]" },
      { toolCall: true }, // non-text payload
      { text: "Latest reply\n[[CONTINUE_DELEGATE: real task]]" },
    ];
    const result = extractContinuationSignal({
      payloads,
      enabled: true,
    });
    expect(result.signal?.kind).toBe("delegate");
    if (result.signal?.kind === "delegate") {
      expect(result.signal.task).toBe("real task");
    }
  });
});
