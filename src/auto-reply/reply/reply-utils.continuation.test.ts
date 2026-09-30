// Tests streaming suppression of split continuation directives (CONTINUE_WORK / CONTINUE_DELEGATE).
import { describe, expect, it } from "vitest";
import { createStreamingDirectiveAccumulator } from "./streaming-directives.js";

describe("createStreamingDirectiveAccumulator", () => {
  it("suppresses split bare CONTINUE_WORK prefixes in streaming chunks", () => {
    const accumulator = createStreamingDirectiveAccumulator();

    const first = accumulator.consume("Answer\nCONT");
    expect(first?.text).toBe("Answer\n");

    expect(accumulator.consume("INUE_WORK")).toBeNull();
    expect(accumulator.consume("", { final: true })).toBeNull();
  });

  it("suppresses split CONTINUE_DELEGATE directives until terminal parsing", () => {
    const accumulator = createStreamingDirectiveAccumulator();

    const first = accumulator.consume("Answer\n[[CONTINUE_DELE");
    expect(first?.text).toBe("Answer");

    expect(accumulator.consume("GATE: summarize queue]]")).toBeNull();
    expect(accumulator.consume("", { final: true })).toBeNull();
  });
});
