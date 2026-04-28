/**
 * Swim-37 harness runner — `captureSwim()`.
 *
 * Tracks: karmaterminal/openclaw#324 (swim-37 harness)
 * Companion test: `swim-runner.test.ts`
 *
 * **Purpose.** A test-only entry point that drives one continuation primitive
 * through its `emit*Span` helper against an in-memory recorder, then returns
 * the captured spans + the synthesized `chainId`. This is the single seam
 * that `swim-runner.test.ts` (and future trap-class harnesses) use to assert
 * OTEL span shape without touching a live runner, gateway, or OTLP collector.
 *
 * **STDOUT-only discipline.** This harness NEVER installs a real
 * `BasicTracerProvider`, `BatchSpanProcessor`, OTLP exporter, or any
 * `@opentelemetry/sdk-trace-base` machinery. All capture flows through
 * `createInMemorySpanRecorder()` + `setContinuationTracer(recorder.tracer)`.
 *
 * **Scope (current).** `continue_work`, `continue_delegate`, and `lich`
 * are wired. `heartbeat` remains `it.todo` pending 🌻's #412 wiring PR.
 * The lich primitive maps to the post-compaction-delegate release seam
 * (`emitContinuationCompactionReleasedSpan`) per the lich wiring memo
 * (`docs/design/swim-37-lich-wiring-memo.md`).
 *
 * **Why a `declare function` was insufficient.** The prior scaffold pinned
 * `captureSwim` as a `declare function` to make the type-shape compile, with
 * a sentinel test asserting `typeof captureSwim === "undefined"`. That made
 * the suite green pre-wiring but never exercised the real
 * `emitContinuationWorkSpan` plumbing. This module replaces the placeholder
 * with a real implementation so the spec can flip its first todos.
 */

import {
  emitContinuationCompactionReleasedSpan,
  emitContinuationDelegateSpan,
  emitContinuationWorkSpan,
  resetContinuationTracer,
  setContinuationTracer,
} from "../../../src/infra/continuation-tracer.js";
import { generateChainId } from "../../../src/infra/secure-random.js";
import { type RecordedSpan, createInMemorySpanRecorder } from "./in-memory-span-recorder.js";

/**
 * Public swim primitives the harness can drive. Only `continue_work` is
 * implemented in this PR; the others are reserved for follow-ups so the
 * type stays stable for callers as they land.
 */
export type SwimPrimitive = "continue_work" | "continue_delegate" | "heartbeat" | "lich";

/**
 * Options accepted by `captureSwim`. Per-primitive options are unioned;
 * callers pass the shape that matches the primitive they're driving.
 */
export type CaptureSwimOptions = {
  /**
   * Chain-budget step count to stamp on the emitted span. Defaults to 5
   * (a non-zero value that exercises the `Math.max(0, …)` clamp without
   * tripping the empty-budget code path).
   */
  chainStepRemaining?: number;
  /**
   * Synthetic delay axis stamped as `delay.ms`. Defaults to 0 (immediate
   * dispatch).
   */
  delayMs?: number;
  /** Optional reason text; previewed (truncated to 80 chars) by the helper. */
  reason?: string;
  /**
   * Override the chain id. Defaults to `generateChainId()` (uuid v7).
   * Useful for tests that want a known stable id for comparison.
   */
  chainId?: string;
  /**
   * `continue_delegate` only. Recipient fan-out count: how many
   * dispatch-accept spans to emit, all sharing the same `chain.id`.
   * Defaults to 1 (no fan-out). Per cohort design (chunk 3,
   * 2026-04-27): N recipients = N dispatch spans, NOT one span with
   * a recipients list. Budget arithmetic still treats fan-out as one
   * chain step (#355 Stage-2) — that's a budget concern, not a span
   * cardinality concern.
   */
  recipients?: number;
  /**
   * `continue_delegate` only. `delegate.delivery` axis on the emitted
   * span. `"immediate"` = no delay / 0ms delay (no setTimeout armed);
   * `"timer"` = non-zero clamped delay armed setTimeout. Defaults to
   * `"immediate"`.
   */
  delivery?: "immediate" | "timer";
  /**
   * `continue_delegate` only. `delegate.mode` axis on the emitted
   * span. Pass `undefined` (or omit) to test the omission contract —
   * the helper conditionally spreads, so `delegate.mode` is absent
   * from the attribute bag when caller passes undefined.
   */
  delegateMode?: "normal" | "silent" | "silent-wake" | "post-compaction";
  /**
   * `lich` only. Number of staged post-compaction delegates released
   * (`compaction.released` axis on the emitted span). The production
   * caller in the agent-runner only invokes the release-helper when
   * `autoCompactionCount > 0`, but the helper itself accepts `0`
   * defensively (helper-tier clamp via `Math.max(0, Math.floor(...))`).
   * Defaults to `1`. Pass `0` to exercise the defensive empty-release
   * path (NOT a production-reachable shape — pinned for helper-contract
   * coverage). Per the lich wiring memo §Q2.
   */
  releasedCount?: number;
  /**
   * `lich` only. Per-session monotonic compaction counter from the
   * agent-runner caller (`compaction.id` axis on the emitted span).
   * Optional in production — the helper's defensive validator drops
   * the attr (with log) if the supplied value is not a non-negative
   * integer. Pass a non-negative integer to exercise the present-and-
   * valid path; omit to exercise the omission contract; pass an
   * invalid value (negative / non-integer / NaN / Infinity) to
   * exercise the drop-with-log path. Per the lich wiring memo §Q3.
   */
  compactionId?: number;
  /**
   * `lich` only. Optional log callback forwarded into the helper. The
   * helper invokes this with a `"invalid compaction.id"` substring
   * when the producer-side invariant on `compaction.id` fails (and
   * the attr is dropped without throwing). Tests assert on the
   * log-callback invocation count + substring match to verify the
   * drop-with-log invariant. Per the lich wiring memo §Q3.
   */
  log?: (message: string) => void;
};

/**
 * Result of one swim. Mirrors the contract pinned by the companion spec.
 */
export type ChainPrimitiveResult = {
  /** Spans captured during the swim, in `startSpan` call order. */
  spans: RecordedSpan[];
  /** Chain id stamped onto each emitted span. */
  chainId: string;
};

/**
 * Drive a continuation primitive synchronously and return the captured
 * spans + chain id. Each call installs a fresh recorder, drives the
 * matching `emit*Span` helper, then resets the tracer registry to its
 * no-op default — so tests can call `captureSwim` repeatedly without
 * leaking capture state between invocations.
 *
 * The function is `async` for forward-compatibility with primitives that
 * will need to await timers (e.g. `continue_delegate` once we drive a
 * real `setTimeout`-armed dispatch). `continue_work` resolves
 * synchronously inside this PR.
 */
export async function captureSwim(
  primitive: SwimPrimitive,
  opts: CaptureSwimOptions = {},
): Promise<ChainPrimitiveResult> {
  const recorder = createInMemorySpanRecorder();
  setContinuationTracer(recorder.tracer);
  try {
    switch (primitive) {
      case "continue_work": {
        const chainId = opts.chainId ?? generateChainId();
        emitContinuationWorkSpan({
          chainId,
          chainStepRemaining: opts.chainStepRemaining ?? 5,
          delayMs: opts.delayMs ?? 0,
          reason: opts.reason,
        });
        return { spans: recorder.spans(), chainId };
      }
      case "continue_delegate": {
        const chainId = opts.chainId ?? generateChainId();
        const recipients = opts.recipients ?? 1;
        if (recipients < 1 || !Number.isInteger(recipients)) {
          throw new Error(`captureSwim: recipients must be a positive integer, got ${recipients}`);
        }
        const delivery = opts.delivery ?? "immediate";
        const chainStepRemaining = opts.chainStepRemaining ?? 5;
        const delayMs = opts.delayMs ?? 0;
        // N recipients = N dispatch spans sharing chain.id.
        // Budget would treat this as one chain step (#355 Stage-2)
        // but OTEL emits per-recipient — that's the per-cohort
        // chunk-3 design pin ("emit at the enqueue/accept seam").
        for (let i = 0; i < recipients; i++) {
          emitContinuationDelegateSpan({
            chainId,
            chainStepRemaining,
            delayMs,
            delivery,
            delegateMode: opts.delegateMode,
            reason: opts.reason,
          });
        }
        return { spans: recorder.spans(), chainId };
      }
      case "lich": {
        // `lich` (the harness label, named after the post-compaction
        // phylactery-drink in 🌫's SOUL file) maps to the
        // post-compaction-delegate release seam:
        // `emitContinuationCompactionReleasedSpan`. Synchronous helper,
        // no timers in scope (lich wiring memo §Q1). The helper itself
        // performs `Math.max(0, Math.floor(releasedCount))` and
        // `Number.isInteger && >= 0` validation on `compactionId`,
        // dropping the attr with log on invalid (memo §Q3).
        //
        // No `chainId` is emitted on this span — the release seam is
        // chain-agnostic at the helper boundary. We still synthesize
        // one for the result shape so `ChainPrimitiveResult.chainId`
        // stays non-empty across primitives (prevents downstream
        // tests from special-casing the lich return shape).
        const chainId = opts.chainId ?? generateChainId();
        const releasedCount = opts.releasedCount ?? 1;
        emitContinuationCompactionReleasedSpan({
          releasedCount,
          compactionId: opts.compactionId,
          log: opts.log,
        });
        return { spans: recorder.spans(), chainId };
      }
      case "heartbeat": {
        // Reserved for 🌻's follow-up PR (#412 heartbeat memo wire).
        // Surface a clear error rather than silently returning an empty
        // result so the spec's `it.todo` markers stay honest about
        // what is wired.
        throw new Error(
          `captureSwim: primitive "${primitive}" is not yet wired ` +
            `(see studies/swim-37/harness/README.md primitive-coverage matrix)`,
        );
      }
      default: {
        const exhaustive: never = primitive;
        throw new Error(`captureSwim: unknown primitive ${String(exhaustive)}`);
      }
    }
  } finally {
    resetContinuationTracer();
  }
}
