import { describe, expect, it } from "vitest";
import {
  isContinuationSignalPrefix,
  parseContinuationSignal,
  stripContinuationSignal,
} from "./continuation-tokens.js";

describe("parseContinuationSignal", () => {
  it("parses bare CONTINUE_WORK", () => {
    const signal = parseContinuationSignal("Here is my reply.\n\nCONTINUE_WORK");
    expect(signal).toEqual({ kind: "work", delaySeconds: undefined });
  });

  it("parses CONTINUE_WORK with delay", () => {
    const signal = parseContinuationSignal("Done for now. CONTINUE_WORK:30");
    expect(signal).toEqual({ kind: "work", delaySeconds: 30 });
  });

  it("parses CONTINUE_WORK:0", () => {
    const signal = parseContinuationSignal("CONTINUE_WORK:0");
    expect(signal).toEqual({ kind: "work", delaySeconds: 0 });
  });

  it("parses CONTINUE_WORK alone (entire message)", () => {
    const signal = parseContinuationSignal("CONTINUE_WORK");
    expect(signal).toEqual({ kind: "work", delaySeconds: undefined });
  });

  it("parses [[CONTINUE_DELEGATE: task]]", () => {
    const signal = parseContinuationSignal(
      "Here is the PR summary.\n\n[[CONTINUE_DELEGATE: verify the test suite passes]]",
    );
    expect(signal).toEqual({
      kind: "delegate",
      task: "verify the test suite passes",
      delaySeconds: undefined,
    });
  });

  it("parses [[CONTINUE_DELEGATE: task +10s]]", () => {
    const signal = parseContinuationSignal(
      "Review complete.\n\n[[CONTINUE_DELEGATE: check CI status +10s]]",
    );
    expect(signal).toEqual({
      kind: "delegate",
      task: "check CI status",
      delaySeconds: 10,
    });
  });

  it("returns undefined for non-continuation text", () => {
    expect(parseContinuationSignal("Just a normal reply.")).toBeUndefined();
    expect(parseContinuationSignal("")).toBeUndefined();
    expect(parseContinuationSignal("DONE")).toBeUndefined();
  });

  it("does not match CONTINUE_WORK in the middle of text", () => {
    expect(
      parseContinuationSignal("I should CONTINUE_WORK on this later, but not now."),
    ).toBeUndefined();
  });

  it("handles whitespace around CONTINUE_WORK", () => {
    const signal = parseContinuationSignal("Reply text   CONTINUE_WORK   ");
    expect(signal).toEqual({ kind: "work", delaySeconds: undefined });
  });
});

describe("stripContinuationSignal", () => {
  it("strips CONTINUE_WORK from end", () => {
    expect(stripContinuationSignal("Reply text\n\nCONTINUE_WORK")).toBe("Reply text");
  });

  it("strips CONTINUE_WORK:30 from end", () => {
    expect(stripContinuationSignal("Done. CONTINUE_WORK:30")).toBe("Done.");
  });

  it("strips [[CONTINUE_DELEGATE: ...]]", () => {
    expect(
      stripContinuationSignal("Summary here.\n\n[[CONTINUE_DELEGATE: check tests +10s]]"),
    ).toBe("Summary here.");
  });

  it("returns empty string when entire message is the signal", () => {
    expect(stripContinuationSignal("CONTINUE_WORK")).toBe("");
  });

  it("leaves non-continuation text unchanged", () => {
    expect(stripContinuationSignal("Just a normal reply.")).toBe("Just a normal reply.");
  });

  it("handles empty string", () => {
    expect(stripContinuationSignal("")).toBe("");
  });
});

describe("isContinuationSignalPrefix", () => {
  it("recognizes partial CONTINUE prefix", () => {
    expect(isContinuationSignalPrefix("CONTINUE")).toBe(true);
    expect(isContinuationSignalPrefix("CONTINUE_")).toBe(true);
    expect(isContinuationSignalPrefix("CONTINUE_WO")).toBe(true);
    expect(isContinuationSignalPrefix("CONTINUE_WORK")).toBe(true);
  });

  it("rejects non-prefix text", () => {
    expect(isContinuationSignalPrefix("Hello")).toBe(false);
    expect(isContinuationSignalPrefix("DONE")).toBe(false);
    expect(isContinuationSignalPrefix("")).toBe(false);
  });

  it("rejects text with non-alpha characters", () => {
    expect(isContinuationSignalPrefix("CONTINUE 123")).toBe(false);
  });
});
