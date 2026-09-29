import { describe, expect, it } from "vitest";
import {
  CONTINUATION_CHILD_RUN_ID_PREFIX,
  formatContinuationChildRunId,
  isContinuationReservedRunId,
  parseContinuationChildRunId,
} from "./continuation-run-key.js";

describe("continuation child run key (RFC §5.4.4, Q2)", () => {
  it("formats continuation:<recordId>:<attemptId>", () => {
    expect(formatContinuationChildRunId("rec-1", 1)).toBe("continuation:rec-1:1");
    expect(formatContinuationChildRunId("rec-1", 12)).toBe("continuation:rec-1:12");
  });

  it("is deterministic per (recordId, attemptId) and distinct across attempts", () => {
    expect(formatContinuationChildRunId("rec-1", 2)).toBe(formatContinuationChildRunId("rec-1", 2));
    expect(formatContinuationChildRunId("rec-1", 2)).not.toBe(
      formatContinuationChildRunId("rec-1", 3),
    );
  });

  it("round-trips, including record ids that contain ':'", () => {
    for (const [recordId, attemptId] of [
      ["rec-1", 1],
      ["0b8a2f1e-7c2d-4c4e-9a51-3f7f2c1d9e00", 7],
      ["a:b:c", 3],
    ] as const) {
      const runId = formatContinuationChildRunId(recordId, attemptId);
      expect(parseContinuationChildRunId(runId)).toEqual({ recordId, attemptId });
    }
  });

  it("rejects invalid record and attempt ids at format time", () => {
    expect(() => formatContinuationChildRunId("", 1)).toThrow();
    expect(() => formatContinuationChildRunId("has space", 1)).toThrow();
    expect(() => formatContinuationChildRunId(" pad", 1)).toThrow();
    expect(() => formatContinuationChildRunId("rec", 0)).toThrow();
    expect(() => formatContinuationChildRunId("rec", -1)).toThrow();
    expect(() => formatContinuationChildRunId("rec", 1.5)).toThrow();
    expect(() => formatContinuationChildRunId("rec", Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });

  it("parses nothing outside the namespace or with a malformed attempt", () => {
    for (const runId of [
      "swarm_abc",
      "continuation:",
      "continuation:rec",
      "continuation::1",
      "continuation:rec:0",
      "continuation:rec:01",
      "continuation:rec:x",
      "continuation:rec:1.5",
      "continuation:has space:1",
    ]) {
      expect(parseContinuationChildRunId(runId)).toBeUndefined();
    }
  });

  it("reserves the namespace", () => {
    expect(CONTINUATION_CHILD_RUN_ID_PREFIX).toBe("continuation:");
    expect(isContinuationReservedRunId("continuation:rec:1")).toBe(true);
    expect(isContinuationReservedRunId("continuation:anything")).toBe(true);
    expect(isContinuationReservedRunId("swarm_abc")).toBe(false);
    expect(isContinuationReservedRunId("Continuation:rec:1")).toBe(false);
  });
});
