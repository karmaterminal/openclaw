/**
 * swim-37 harness :: emit-helper contract tests (live now)
 *
 * Tracks: karmaterminal/openclaw#324 (swim-37 harness)
 * Companion to: studies/swim-37/harness/swim-runner.test.ts
 *
 * **Why a sibling file.** `swim-runner.test.ts` is the integration target —
 * it asserts behavior of the full runtime through `captureSwim()` once the
 * runtime callsites are pinned by the harness. Until that integration shim
 * lands, several of its `it.todo`s are wireable RIGHT NOW at the level
 * below: the emit helpers themselves (chunks 3 / 4 / 5b / 5c / 6a / 6b /
 * 6c shipped to canonical2 in PRs #382-#401).
 *
 * This file:
 *   - exercises every Slice-2 emit helper through the InMemorySpanRecorder,
 *   - asserts the ATTRIBUTE CONTRACT each chunk's memo pinned (chain.id
 *     stamping, snapshot semantics, signal.kind enum, disabled.reason
 *     enum, fire.deferred_ms integer hygiene, compaction.id validity gate,
 *     queue.drain aggregate-only),
 *   - leaves no `it.todo` — every test runs and passes against the helper
 *     code as it exists on canonical2 today.
 *
 * **Boundary discipline.** This file does NOT import or drive
 * `agent-runner` / `pi-embedded-runner` / `subagent-announce` — those are
 * the runtime callsites that the integration tier (`swim-runner.test.ts`)
 * will exercise. We assert the helper-level contract only, so the morning
 * cohort can wire the runtime callsites against a known-good helper-level
 * pin instead of against undocumented expectation.
 *
 * **What runtime callsites still need.** The integration `it.todo`s in
 * `swim-runner.test.ts` (continue_work / continue_delegate / heartbeat /
 * lich-shape) need the `captureSwim()` shim that drives the production
 * runtime through a synthetic chain step and reads back the recorder's
 * spans. That shim is unblocked by this helper-level pin.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  emitContinuationCompactionReleasedSpan,
  emitContinuationDelegateFireSpan,
  emitContinuationDelegateSpan,
  emitContinuationDisabledSpan,
  emitContinuationQueueDrainSpan,
  emitContinuationWorkFireSpan,
  emitContinuationWorkSpan,
  resetContinuationTracer,
  setContinuationTracer,
} from "../../../src/infra/continuation-tracer.js";
import {
  createInMemorySpanRecorder,
  type InMemorySpanRecorder,
} from "./in-memory-span-recorder.js";

let recorder: InMemorySpanRecorder;

beforeEach(() => {
  recorder = createInMemorySpanRecorder();
  setContinuationTracer(recorder.tracer);
});

afterEach(() => {
  resetContinuationTracer();
});

// ─── continue_work (chunks 3 + 5c) ─────────────────────────────────────────

describe("swim-37 :: continue_work emit-helper contract", () => {
  it("emits exactly one continuation.work span per accepted dispatch", () => {
    emitContinuationWorkSpan({
      chainId: "01943f7a-1234-7abc-8def-000000000001",
      chainStepRemaining: 7,
      delayMs: 1500,
      reason: "swim-37 harness probe",
    });
    const spans = recorder.spansByName("continuation.work");
    expect(spans).toHaveLength(1);
    expect(spans[0]?.ended).toBe(true);
    expect(spans[0]?.status).toBe("OK");
  });

  it("stamps chain.id when provided; omits when undefined (substrate-disabled deploy)", () => {
    emitContinuationWorkSpan({
      chainId: "01943f7a-1234-7abc-8def-000000000002",
      chainStepRemaining: 4,
      delayMs: 0,
    });
    emitContinuationWorkSpan({
      chainId: undefined,
      chainStepRemaining: 4,
      delayMs: 0,
    });
    const spans = recorder.spansByName("continuation.work");
    expect(spans).toHaveLength(2);
    expect(spans[0]?.attributes["chain.id"]).toBe("01943f7a-1234-7abc-8def-000000000002");
    expect("chain.id" in (spans[1]?.attributes ?? {})).toBe(false);
  });

  it("clamps chain.step.remaining at zero (no negative emission)", () => {
    emitContinuationWorkSpan({
      chainId: "01943f7a-1234-7abc-8def-000000000003",
      chainStepRemaining: -2,
      delayMs: 0,
    });
    expect(recorder.spansByName("continuation.work")[0]?.attributes["chain.step.remaining"]).toBe(
      0,
    );
  });

  it("work.fire span carries chain.id + snapshot remaining + integer fire.deferred_ms (chunk 5c)", () => {
    emitContinuationWorkFireSpan({
      chainId: "01943f7a-1234-7abc-8def-000000000004",
      chainStepRemainingAtDispatch: 3,
      delayMs: 1500,
      // intentionally fractional — should be Math.floor'd to integer
      fireDeferredMs: 1502.973,
      reason: "fire-time probe",
    });
    const span = recorder.spansByName("continuation.work.fire")[0];
    expect(span).toBeDefined();
    expect(span?.attributes["chain.id"]).toBe("01943f7a-1234-7abc-8def-000000000004");
    expect(span?.attributes["chain.step.remaining"]).toBe(3);
    expect(span?.attributes["fire.deferred_ms"]).toBe(1502);
    expect(Number.isInteger(span?.attributes["fire.deferred_ms"])).toBe(true);
  });

  it("work.fire no-ops gracefully if chainId invariant violated (defense-in-depth)", () => {
    const logged: string[] = [];
    emitContinuationWorkFireSpan({
      // Intentionally violate the typed invariant via cast — sig says string,
      // helper has runtime guard for forward-compat.
      chainId: undefined as unknown as string,
      chainStepRemainingAtDispatch: 2,
      delayMs: 0,
      fireDeferredMs: 0,
      log: (msg) => logged.push(msg),
    });
    expect(recorder.spansByName("continuation.work.fire")).toHaveLength(0);
    expect(logged.some((m) => m.includes("chainId invariant violated"))).toBe(true);
  });
});

// ─── continue_delegate (chunks 3 + 5b) ─────────────────────────────────────

describe("swim-37 :: continue_delegate emit-helper contract", () => {
  it("dispatch span carries chain.id + delegate.delivery + delegate.mode (chunk 3)", () => {
    emitContinuationDelegateSpan({
      chainId: "01943f7a-1234-7abc-8def-000000000010",
      chainStepRemaining: 5,
      delayMs: 0,
      delivery: "immediate",
      delegateMode: "silent-wake",
    });
    const span = recorder.spansByName("continuation.delegate.dispatch")[0];
    expect(span).toBeDefined();
    expect(span?.attributes["chain.id"]).toBe("01943f7a-1234-7abc-8def-000000000010");
    expect(span?.attributes["delegate.delivery"]).toBe("immediate");
    expect(span?.attributes["delegate.mode"]).toBe("silent-wake");
  });

  it("delegate.fire span emits with snapshot chain.step.remaining_at_dispatch (chunk 5b)", () => {
    emitContinuationDelegateFireSpan({
      chainId: "01943f7a-1234-7abc-8def-000000000011",
      chainStepRemainingAtDispatch: 2,
      delegateMode: "normal",
      delayMs: 30000,
      // simulate dispatched at t=0, fire arrived at t=30_103ms
      fireDeferredMs: 30103,
    });
    const span = recorder.spansByName("continuation.delegate.fire")[0];
    expect(span).toBeDefined();
    expect(span?.attributes["chain.id"]).toBe("01943f7a-1234-7abc-8def-000000000011");
    expect(span?.attributes["chain.step.remaining"]).toBe(2);
    expect(span?.attributes["fire.deferred_ms"]).toBe(30103);
    // delegate.delivery is implicitly "timer" on the fire span (helper sets it)
    expect(span?.attributes["delegate.delivery"]).toBe("timer");
  });
});

// ─── continuation.disabled (chunk 4) ───────────────────────────────────────

describe("swim-37 :: continuation.disabled emit-helper contract", () => {
  it.each(["cap.chain", "cap.cost", "cap.delegates_per_turn", "reservation.missing"] as const)(
    "accepts disabled.reason=%s with continuation.disabled=true",
    (disabledReason) => {
      emitContinuationDisabledSpan({
        chainId: "01943f7a-1234-7abc-8def-000000000020",
        chainStepRemaining: 0,
        disabledReason,
        signalKind: "work",
      });
      const span = recorder.spansByName("continuation.disabled").at(-1);
      expect(span).toBeDefined();
      expect(span?.attributes["disabled.reason"]).toBe(disabledReason);
      expect(span?.attributes["continuation.disabled"]).toBe(true);
    },
  );

  it("carries signal.kind alongside disabled.reason (cross-axis pin)", () => {
    emitContinuationDisabledSpan({
      chainId: "01943f7a-1234-7abc-8def-000000000021",
      chainStepRemaining: 0,
      disabledReason: "cap.delegates_per_turn",
      signalKind: "delegate",
      delegateDelivery: "immediate",
      delegateMode: "silent-wake",
    });
    const span = recorder.spansByName("continuation.disabled")[0];
    expect(span?.attributes["signal.kind"]).toBe("delegate");
    expect(span?.attributes["delegate.delivery"]).toBe("immediate");
    expect(span?.attributes["delegate.mode"]).toBe("silent-wake");
  });
});

// ─── continuation.queue.drain (chunk 6a) ───────────────────────────────────

describe("swim-37 :: continuation.queue.drain emit-helper contract", () => {
  it("emits aggregate counts; NO chain.id (substrate queue is multi-chain)", () => {
    emitContinuationQueueDrainSpan({
      drainedCount: 7,
      drainedContinuationCount: 3,
    });
    const span = recorder.spansByName("continuation.queue.drain")[0];
    expect(span).toBeDefined();
    expect(span?.attributes["queue.drained_count"]).toBe(7);
    expect(span?.attributes["queue.drained_continuation_count"]).toBe(3);
    expect("chain.id" in (span?.attributes ?? {})).toBe(false);
  });

  it("emits even on empty drain (0 is presence-of-attempt, not absence-of-span)", () => {
    emitContinuationQueueDrainSpan({
      drainedCount: 0,
      drainedContinuationCount: 0,
    });
    const span = recorder.spansByName("continuation.queue.drain")[0];
    expect(span).toBeDefined();
    expect(span?.attributes["queue.drained_count"]).toBe(0);
    // No `continuation.disabled` sibling on empty drain — that family is
    // reserved for cap.*/reservation.missing rejections, NOT empty drains.
    expect(recorder.spansByName("continuation.disabled")).toHaveLength(0);
  });
});

// ─── continuation.compaction.released (chunk 6b/6c) ────────────────────────

describe("swim-37 :: continuation.compaction.released emit-helper contract", () => {
  it("emits with signal.kind='compaction-release' (4-value enum incl. release)", () => {
    emitContinuationCompactionReleasedSpan({
      releasedCount: 2,
      compactionId: 0,
    });
    const span = recorder.spansByName("continuation.compaction.released")[0];
    expect(span).toBeDefined();
    expect(span?.attributes["signal.kind"]).toBe("compaction-release");
    expect(span?.attributes["compaction.released"]).toBe(2);
    // compaction.id: 0 is ordinal-valid (not a falsy drop)
    expect(span?.attributes["compaction.id"]).toBe(0);
  });

  it("validate-and-drop-with-log: invalid compaction.id is dropped, not clamped or thrown", () => {
    const logged: string[] = [];
    emitContinuationCompactionReleasedSpan({
      releasedCount: 1,
      // intentionally invalid: not an integer
      compactionId: 3.7 as unknown as number,
      log: (msg) => logged.push(msg),
    });
    const span = recorder.spansByName("continuation.compaction.released")[0];
    expect(span).toBeDefined();
    // attribute dropped, span still emitted
    expect("compaction.id" in (span?.attributes ?? {})).toBe(false);
    expect(logged.some((m) => m.includes("invalid compaction.id"))).toBe(true);
  });

  it("omits compaction.id entirely when caller passes undefined (no log)", () => {
    const logged: string[] = [];
    emitContinuationCompactionReleasedSpan({
      releasedCount: 0,
      log: (msg) => logged.push(msg),
    });
    const span = recorder.spansByName("continuation.compaction.released")[0];
    expect(span).toBeDefined();
    expect("compaction.id" in (span?.attributes ?? {})).toBe(false);
    // undefined is not a violation — it's the "no compaction.id available"
    // shape, which differs from "caller supplied a bad value." No log fires.
    expect(logged).toHaveLength(0);
  });

  it("clamps releasedCount at zero (defensive against producer bugs)", () => {
    emitContinuationCompactionReleasedSpan({
      releasedCount: -3,
      compactionId: 1,
    });
    const span = recorder.spansByName("continuation.compaction.released")[0];
    expect(span?.attributes["compaction.released"]).toBe(0);
  });
});

// ─── cross-cutting: emit-failure must never throw to caller ────────────────

describe("swim-37 :: emit-failure isolation contract", () => {
  it("a tracer that throws on startSpan does not throw out of any helper", () => {
    const logged: string[] = [];
    setContinuationTracer({
      startSpan: () => {
        throw new Error("synthetic tracer failure");
      },
    });
    // Each helper must swallow its own emission failure and (when given a
    // log callback) report it — never throw to the caller's hot path.
    expect(() =>
      emitContinuationWorkSpan({
        chainId: "x",
        chainStepRemaining: 0,
        delayMs: 0,
        log: (msg) => logged.push(msg),
      }),
    ).not.toThrow();
    expect(() =>
      emitContinuationDelegateSpan({
        chainId: "x",
        chainStepRemaining: 0,
        delayMs: 0,
        delivery: "immediate",
        log: (msg) => logged.push(msg),
      }),
    ).not.toThrow();
    expect(() =>
      emitContinuationDisabledSpan({
        chainId: "x",
        chainStepRemaining: 0,
        disabledReason: "cap.chain",
        signalKind: "work",
        log: (msg) => logged.push(msg),
      }),
    ).not.toThrow();
    expect(() =>
      emitContinuationDelegateFireSpan({
        chainId: "x",
        chainStepRemainingAtDispatch: 0,
        delegateMode: "normal",
        delayMs: 0,
        fireDeferredMs: 0,
        log: (msg) => logged.push(msg),
      }),
    ).not.toThrow();
    expect(() =>
      emitContinuationWorkFireSpan({
        chainId: "x",
        chainStepRemainingAtDispatch: 0,
        delayMs: 0,
        fireDeferredMs: 0,
        log: (msg) => logged.push(msg),
      }),
    ).not.toThrow();
    expect(() =>
      emitContinuationQueueDrainSpan({
        drainedCount: 0,
        drainedContinuationCount: 0,
        log: (msg) => logged.push(msg),
      }),
    ).not.toThrow();
    expect(() =>
      emitContinuationCompactionReleasedSpan({
        releasedCount: 0,
        log: (msg) => logged.push(msg),
      }),
    ).not.toThrow();
    // Every helper that took a log callback should have reported its
    // failure. (7 helpers above, all with `log`.)
    expect(logged.length).toBe(7);
  });
});
