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
 * **Scope (this PR).** Only `continue_work` is wired. Other primitives
 * (`continue_delegate`, `heartbeat`, lich-shape) remain `it.todo` in the
 * companion spec until the dispatch / heartbeat / compaction-release seams
 * have a comparable single-helper entry point we can drive synthetically.
 *
 * **Why a `declare function` was insufficient.** The prior scaffold pinned
 * `captureSwim` as a `declare function` to make the type-shape compile, with
 * a sentinel test asserting `typeof captureSwim === "undefined"`. That made
 * the suite green pre-wiring but never exercised the real
 * `emitContinuationWorkSpan` plumbing. This module replaces the placeholder
 * with a real implementation so the spec can flip its first todos.
 */

import {
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
      case "continue_delegate":
      case "heartbeat":
      case "lich": {
        // Reserved for follow-up PRs. We surface a clear error rather
        // than silently returning an empty result so the spec's
        // `it.todo` markers stay honest about what is wired.
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
