/**
 * Swim-37 integration test harness — scaffold.
 *
 * Tracks: karmaterminal/openclaw#324
 * Trap-class taxonomy: cael/swim-37-trap-classes (tip 2adf17448ee)
 *   - studies/swim-37/traps/parallel-evolution-class.md
 *
 * Goal: drive each continuation primitive (continue_work / continue_delegate /
 * heartbeat / lich-shape) through a synthetic "swim" and assert the OTEL span
 * signature the chain produced. This first cut validates the SHAPE of the
 * harness; concrete primitive wiring lands once #366 (Slice 2 — continuation.*
 * spans) is merged.
 *
 * OTEL EXPORTER: STDOUT only. NEVER spin a real collector from this harness;
 * span assertions read structured JSON from a captured InMemoryExporter shim.
 *
 * STATUS: WIP. Several imports are placeholders pinned to module names that
 * Slice 2 (#366 / silas/334-otel-chain-correlation) is expected to introduce.
 * Where the real symbol does not yet exist, the test is `it.todo(...)` so the
 * suite stays green and the hookup TODO is visible in the test report.
 */

import { describe, expect, it } from "vitest";
import { type RecordedSpan } from "./in-memory-span-recorder.js";
import { type ChainPrimitiveResult, captureSwim } from "./swim-runner.js";

// Local alias retained for the contract-shape tests below; the canonical
// shape now lives in `./in-memory-span-recorder.ts`. Kept narrow so the
// shape-pin tests keep documenting the minimum surface a recorded span
// must expose, even if the recorder grows additional fields.
type SpanRecord = {
  name: string;
  attributes: Record<string, unknown>;
  traceId?: string;
  parentSpanId?: string;
};

// ─── TRAP-CLASS COVERAGE ────────────────────────────────────────────────────
//
// Trap-classes from cael/swim-37-trap-classes (2adf17448ee):
//
//   §1  parallel-evolution / cherry-false-negative
//        — synthetic upstream commit-pair with squash-rebase shape;
//          rebase agent classifies DROP (PICK is regression).
//   §3a integration-boundary type-shape drift
//        — clean mechanical rebase compiles per-file but `pnpm tsgo`
//          fails at type integration boundaries (e.g. shifted upstream
//          export shape).
//
// Continuation-primitive coverage (Slice 2 hookup point):
//   • continue_work        — chain.id stamped on continuation.work.span
//   • continue_delegate    — chain.id stamped + chain-budget decrement visible
//   • heartbeat            — heartbeat.span carries continuation.disabled=false
//                            when budget present; flips true when capped
//   • lich-shape           — post-compaction delegate retains chain.id across
//                            the compaction seam (#332 Item B)
//
// DEFERRED (left as it.todo until upstream lands):
//   • cherry-pick provenance grep harness (parallel-evolution §2)
//   • integration-boundary tsgo replay (§3a) — needs synthetic upstream pair
//   • fan-out non-conscription cap (#355 Stage-2)

describe("swim-37 harness :: trap-class coverage [scaffold]", () => {
  describe("trap §1 :: parallel-evolution / cherry-false-negative", () => {
    it.todo("rebase bot classifies synthetic squash-rebased commit as DROP (not PICK)");
    it.todo("CHANGELOG-byte-grep discovery channel emits drop-with-reason span");
  });

  describe("trap §3a :: integration-boundary type-shape drift", () => {
    it.todo("tsgo replay catches non-conflicted file that references shifted upstream type-shape");
  });
});

describe("swim-37 harness :: continuation primitives [scaffold]", () => {
  describe("continue_work", () => {
    it("emits continuation.work span with chain.id stamped (#366)", async () => {
      const result = await captureSwim("continue_work", {
        chainStepRemaining: 5,
        delayMs: 30,
      });
      expect(result.spans).toHaveLength(1);
      const [span] = result.spans;
      expect(span?.name).toBe("continuation.work");
      expect(span?.attributes["chain.id"]).toBe(result.chainId);
      // uuid v7 surface (8-4-4-4-12 hex with version nibble 7).
      expect(result.chainId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(span?.status).toBe("OK");
      expect(span?.ended).toBe(true);
    });
    it("span carries chain.step.remaining attribute", async () => {
      const result = await captureSwim("continue_work", {
        chainStepRemaining: 7,
        delayMs: 0,
      });
      const [span] = result.spans;
      expect(span?.attributes["chain.step.remaining"]).toBe(7);
      expect(span?.attributes["delay.ms"]).toBe(0);
    });
    // Chunk 5c (#388) — `continuation.work.fire` lands at bracket-work timer-
    // callback start. Symmetric to 5b's delegate.fire seam but scope-narrower:
    // no reservation system at this seam, so single span emit, no sibling.
    // chainId is closed-over from dispatch-time; chainStepRemainingAtDispatch
    // is a snapshot, not fire-time live state.
    it.todo(
      "emits continuation.work.fire span at timer callback with persisted chain.id (#388 chunk 5c)",
    );
    it.todo(
      "fire span carries chain.step.remaining_at_dispatch (snapshot, not live) attr (#388 chunk 5c)",
    );
    it.todo(
      "fire.deferred_ms attr present and integer; drift = fire.deferred_ms − delay.ms (#388 chunk 5c)",
    );
  });

  describe("continue_delegate", () => {
    // 8-cell matrix: delegate.mode x delegate.delivery (per memo Q3).
    const modes = ["normal", "silent", "silent-wake", "post-compaction"] as const;
    const deliveries = ["immediate", "timer"] as const;
    const matrix: Array<{
      mode: (typeof modes)[number];
      delivery: (typeof deliveries)[number];
    }> = [];
    for (const mode of modes) {
      for (const delivery of deliveries) {
        matrix.push({ mode, delivery });
      }
    }
    it.each(matrix)(
      "emits continuation.delegate.dispatch for mode=$mode delivery=$delivery",
      async ({ mode, delivery }) => {
        const result = await captureSwim("continue_delegate", {
          delegateMode: mode,
          delivery,
          delayMs: delivery === "timer" ? 30 : 0,
        });
        expect(result.spans).toHaveLength(1);
        const [span] = result.spans;
        expect(span?.name).toBe("continuation.delegate.dispatch");
        expect(span?.attributes["delegate.mode"]).toBe(mode);
        expect(span?.attributes["delegate.delivery"]).toBe(delivery);
        expect(span?.attributes["chain.id"]).toBe(result.chainId);
        expect(span?.status).toBe("OK");
        expect(span?.ended).toBe(true);
      },
    );
    it("omits delegate.mode attribute when caller passes undefined", async () => {
      const result = await captureSwim("continue_delegate", {
        delivery: "immediate",
      });
      expect(result.spans).toHaveLength(1);
      const [span] = result.spans;
      expect(span?.attributes).not.toHaveProperty("delegate.mode");
      expect(span?.attributes["delegate.delivery"]).toBe("immediate");
    });
    it("fan-out: N recipients emit N spans sharing chain.id", async () => {
      const result = await captureSwim("continue_delegate", {
        recipients: 3,
        delegateMode: "normal",
      });
      expect(result.spans).toHaveLength(3);
      for (const span of result.spans) {
        expect(span.name).toBe("continuation.delegate.dispatch");
        expect(span.attributes["chain.id"]).toBe(result.chainId);
      }
    });
    it("GAP-PIN: fan-out spans are currently NOT analytically distinct", async () => {
      // Per 🩸 caution on the wiring memo (msg 1498507232185286849):
      // N spans sharing chain.id risks collapsing into analytic mush at
      // scale unless the per-recipient distinction is visible in attrs.
      // Currently the production helper `emitContinuationDelegateSpan`
      // exposes no `recipient.index` axis — so all N spans in a fan-out
      // are byte-identical except for span-level identity (spanId).
      // This test PINS the gap so it shows up in code-review when the
      // production helper grows the axis. Flip the assertion to
      // `not.toEqual` once `recipient.index` lands.
      const result = await captureSwim("continue_delegate", {
        recipients: 2,
        delegateMode: "normal",
      });
      const [a, b] = result.spans;
      expect(a?.attributes).toEqual(b?.attributes);
    });
    it.todo(
      "recipient.index attr distinguishes per-recipient fan-out spans (🩸 caution; needs production helper axis)",
    );
    it("rejects non-positive or non-integer recipients", async () => {
      await expect(captureSwim("continue_delegate", { recipients: 0 })).rejects.toThrow(
        /positive integer/,
      );
      await expect(captureSwim("continue_delegate", { recipients: 1.5 })).rejects.toThrow(
        /positive integer/,
      );
    });
    it.todo("decrements chain-budget; ChainBudget.declineToCarry() observable on cap");
    it.todo("fan-out across N recipients consumes 1 chain step, not N (#355 Stage-2)");
    // Chunk 5b (#388) — `continuation.delegate.fire` lands at timer-callback
    // start, BEFORE `takeDelayedContinuationReservation`. Instrumentation-of-
    // status-quo only; no fire-time cap rechecks (chunk 5c will add the
    // WORK-fire seam separately). chainId is closed-over from dispatch-time;
    // chainStepRemainingAtDispatch is a snapshot, not fire-time live state.
    it.todo(
      "emits continuation.delegate.fire span at timer callback with persisted chain.id (#388 chunk 5b)",
    );
    it.todo(
      "fire span carries delegate.delivery + delegate.mode + chain.step.remaining_at_dispatch attrs (#388)",
    );
    it.todo(
      "reservation-missing path emits continuation.disabled with disabled.reason='reservation.missing' (#388)",
    );
  });

  describe("heartbeat", () => {
    it.todo("emits heartbeat span; continuation.disabled=false while budget remains");
    it.todo("continuation.disabled=true after declineToCarry fires (silenced-by-cap signal)");
  });

  describe("lich-shape (post-compaction delegate)", () => {
    it.todo("post-compaction delegate retains chain.id across compaction seam (#332 Item B)");
    it.todo("release-seam span signals continuation.compaction.released exactly once");
  });
});

describe("swim-37 harness :: shape contract (live now)", () => {
  // These tests assert the SHAPE we expect captureSwim() to return once #366
  // wires it. They are intentionally minimal — they pin the contract surface
  // before implementation lands so the morning cohort knows what to satisfy.

  it("captureSwim contract: result shape is { spans, chainId }", () => {
    // Pure type-shape assertion — no runtime call. This compiles iff the
    // declared signature stays stable.
    const _shape: ChainPrimitiveResult = {
      spans: [],
      chainId: "ulid-or-uuid-string",
    };
    expect(_shape.spans).toBeInstanceOf(Array);
    expect(typeof _shape.chainId).toBe("string");
  });

  it("SpanRecord contract: name + attributes + (optional) traceId/parentSpanId", () => {
    const _span: SpanRecord = {
      name: "continuation.work",
      attributes: { "chain.id": "test-chain", "chain.step.remaining": 5 },
    };
    expect(_span.name).toBe("continuation.work");
    expect(_span.attributes["chain.id"]).toBe("test-chain");
  });

  it("captureSwim() is wired for continue_work", async () => {
    expect(typeof captureSwim).toBe("function");
    const result = await captureSwim("continue_work");
    expect(result.spans).toHaveLength(1);
    expect(result.spans[0]?.name).toBe("continuation.work");
  });

  it("captureSwim() refuses primitives not yet wired", async () => {
    await expect(captureSwim("heartbeat")).rejects.toThrow(/not yet wired/);
    await expect(captureSwim("lich")).rejects.toThrow(/not yet wired/);
  });

  it("captureSwim() repeated calls do not leak capture state", async () => {
    const a = await captureSwim("continue_work");
    const b = await captureSwim("continue_work");
    expect(a.spans).toHaveLength(1);
    expect(b.spans).toHaveLength(1);
    expect(a.chainId).not.toBe(b.chainId);
  });

  // Pin the local SpanRecord alias still has a meaningful surface — the
  // recorder's RecordedSpan must be assignable to it.
  it("RecordedSpan is structurally a SpanRecord", () => {
    const recorded: RecordedSpan = {
      name: "continuation.work",
      attributes: { "chain.id": "x" },
      traceparent: undefined,
      status: "OK",
      statusMessage: undefined,
      exceptions: [],
      ended: true,
    };
    const asLocal: SpanRecord = recorded;
    expect(asLocal.name).toBe("continuation.work");
  });
});
