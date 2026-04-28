/**
 * Helper-tier contract pin for Slice-2 fire spans + release/drain spans.
 *
 * Tracks: karmaterminal/openclaw#324, #334.
 *
 * Layering: HELPER-TIER ONLY. Drives the emit-helpers in
 * `src/infra/continuation-tracer.ts` directly through the
 * `InMemorySpanRecorder` shim and asserts the recorded span CONTRACT.
 * Does not touch agent-runner / pi-embedded-runner / subagent-announce —
 * those runtime callsites are exercised through the integration tier in
 * `swim-runner.test.ts` (#405 captureSwim() shim).
 *
 * Companion to 🌊's `emit-helper-contract.test.ts` (PR #406) which pins
 * chunks 3/4/6c. This file covers chunks 5b (`continuation.delegate.fire`),
 * 5c (`continuation.work.fire`), 6a (`continuation.queue.drain`), and
 * 6b (`continuation.compaction.released`).
 *
 * Key contract pin: per 🩸's lane-clear note (msg 1498508045725204500),
 * the snapshot semantic for fire spans lives in the PARAMETER name
 * (`chainStepRemainingAtDispatch`) and the docs; the emitted attr stays
 * canonical `chain.step.remaining`. We negative-assert that the alternate
 * key `chain.step.remaining_at_dispatch` is NEVER present, so a future
 * helper change can't silently invent it.
 *
 * STDOUT-only / hermetic — no live OTLP collector, no BasicTracerProvider.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  emitContinuationCompactionReleasedSpan,
  emitContinuationDelegateFireSpan,
  emitContinuationQueueDrainSpan,
  emitContinuationWorkFireSpan,
  resetContinuationTracer,
  setContinuationTracer,
} from "../../../src/infra/continuation-tracer.js";
import {
  createInMemorySpanRecorder,
  type InMemorySpanRecorder,
} from "./in-memory-span-recorder.js";

describe("swim-37 helper-tier :: fire + release/drain contract pin", () => {
  let recorder: InMemorySpanRecorder;

  beforeEach(() => {
    recorder = createInMemorySpanRecorder();
    setContinuationTracer(recorder.tracer);
  });

  afterEach(() => {
    resetContinuationTracer();
  });

  describe("continuation.compaction.released (#334 Slice 2 chunk 6b / #397)", () => {
    it("emits exactly one span per release-seam call", () => {
      emitContinuationCompactionReleasedSpan({ releasedCount: 3 });

      const spans = recorder.spansByName("continuation.compaction.released");
      expect(spans).toHaveLength(1);
      expect(spans[0].ended).toBe(true);
      expect(spans[0].status).toBe("OK");
    });

    it("carries signal.kind='compaction-release' and integer compaction.released attr", () => {
      emitContinuationCompactionReleasedSpan({ releasedCount: 2 });

      const [span] = recorder.spansByName("continuation.compaction.released");
      expect(span.attributes["signal.kind"]).toBe("compaction-release");
      expect(span.attributes["compaction.released"]).toBe(2);
    });

    it("attaches compaction.id when valid (integer ≥ 0)", () => {
      emitContinuationCompactionReleasedSpan({ releasedCount: 1, compactionId: 7 });

      const [span] = recorder.spansByName("continuation.compaction.released");
      expect(span.attributes["compaction.id"]).toBe(7);
    });

    it("drops compaction.id and logs when invalid (negative / non-integer)", () => {
      // Validate-and-drop-with-log per chunk-6c §B + #401 follow-up:
      // invariant is producer-side, helper refuses to emit a lie but does
      // not throw. Log fires before construction so the validation path
      // stays visible if construction itself ever throws.
      const logged: string[] = [];
      emitContinuationCompactionReleasedSpan({
        releasedCount: 1,
        compactionId: -1,
        log: (m) => logged.push(m),
      });

      const [span] = recorder.spansByName("continuation.compaction.released");
      expect(span.attributes["compaction.id"]).toBeUndefined();
      expect(logged.some((m) => m.includes("invalid compaction.id"))).toBe(true);
    });
  });

  describe("continuation.queue.drain (#334 Slice 2 chunk 6a / #395)", () => {
    it("emits one span per drain with both count attrs as integers", () => {
      emitContinuationQueueDrainSpan({
        drainedCount: 5,
        drainedContinuationCount: 3,
      });

      const spans = recorder.spansByName("continuation.queue.drain");
      expect(spans).toHaveLength(1);
      expect(spans[0].attributes["queue.drained_count"]).toBe(5);
      expect(spans[0].attributes["queue.drained_continuation_count"]).toBe(3);
      expect(spans[0].ended).toBe(true);
    });

    it("caps continuation subset at total drained count (defense-in-depth)", () => {
      // Per 🩸's PR #395 byte-walk (msg 1498427153543335967): continuation
      // count must be ≤ total drained count even if a less-disciplined caller
      // violates the wire-site invariant. Helper enforces structurally.
      emitContinuationQueueDrainSpan({
        drainedCount: 2,
        drainedContinuationCount: 99,
      });

      const [span] = recorder.spansByName("continuation.queue.drain");
      expect(span.attributes["queue.drained_count"]).toBe(2);
      expect(span.attributes["queue.drained_continuation_count"]).toBe(2);
    });
  });

  describe("continuation.delegate.fire (#334 Slice 2 chunk 5b / #388)", () => {
    // Snapshot semantic lives in PARAMETER name + docs; emitted attr stays
    // canonical chain.step.remaining. Negative-assert the alternate key
    // chain.step.remaining_at_dispatch is absent so a future helper change
    // can't silently invent it (per 🩸 msg 1498508045725204500).
    it("emits continuation.delegate.fire with persisted chain.id + canonical attr names", () => {
      emitContinuationDelegateFireSpan({
        chainId: "chain-abc",
        chainStepRemainingAtDispatch: 3,
        delegateMode: "silent-wake",
        delayMs: 100,
        fireDeferredMs: 117,
      });

      const spans = recorder.spansByName("continuation.delegate.fire");
      expect(spans).toHaveLength(1);
      const [span] = spans;
      expect(span.attributes["chain.id"]).toBe("chain-abc");
      // Canonical attr name — NOT chain.step.remaining_at_dispatch.
      expect(span.attributes["chain.step.remaining"]).toBe(3);
      expect(span.attributes["chain.step.remaining_at_dispatch"]).toBeUndefined();
      expect(span.attributes["delegate.delivery"]).toBe("timer");
      expect(span.attributes["delegate.mode"]).toBe("silent-wake");
      expect(span.ended).toBe(true);
    });

    it("fire.deferred_ms is integer; drift = fire.deferred_ms - delay.ms", () => {
      emitContinuationDelegateFireSpan({
        chainId: "chain-xyz",
        chainStepRemainingAtDispatch: 1,
        delegateMode: "normal",
        delayMs: 100,
        fireDeferredMs: 142.7, // sub-ms input must floor to 142
      });

      const [span] = recorder.spansByName("continuation.delegate.fire");
      const fireDeferred = span.attributes["fire.deferred_ms"];
      const delay = span.attributes["delay.ms"];
      expect(Number.isInteger(fireDeferred)).toBe(true);
      expect(fireDeferred).toBe(142);
      expect(delay).toBe(100);
      // Drift formula from chunk 5b helper docstring.
      expect((fireDeferred as number) - (delay as number)).toBe(42);
    });

    it("truncates reason.preview at 80 chars when long; omits attr when reason absent", () => {
      const longReason = "a".repeat(200);
      emitContinuationDelegateFireSpan({
        chainId: "chain-1",
        chainStepRemainingAtDispatch: 0,
        delegateMode: "silent",
        delayMs: 0,
        fireDeferredMs: 0,
        reason: longReason,
      });
      emitContinuationDelegateFireSpan({
        chainId: "chain-2",
        chainStepRemainingAtDispatch: 0,
        delegateMode: "silent",
        delayMs: 0,
        fireDeferredMs: 0,
      });

      const spans = recorder.spansByName("continuation.delegate.fire");
      expect(spans).toHaveLength(2);
      expect(spans[0].attributes["reason.preview"]).toBe("a".repeat(80));
      expect(spans[1].attributes["reason.preview"]).toBeUndefined();
    });
  });

  describe("continuation.work.fire (#334 Slice 2 chunk 5c / #388)", () => {
    it("emits continuation.work.fire with canonical chain.step.remaining attr", () => {
      emitContinuationWorkFireSpan({
        chainId: "work-chain-1",
        chainStepRemainingAtDispatch: 5,
        delayMs: 250,
        fireDeferredMs: 251,
      });

      const spans = recorder.spansByName("continuation.work.fire");
      expect(spans).toHaveLength(1);
      const [span] = spans;
      expect(span.attributes["chain.id"]).toBe("work-chain-1");
      expect(span.attributes["chain.step.remaining"]).toBe(5);
      // Same canonical-attr-name pin as 5b. No invented snapshot key.
      expect(span.attributes["chain.step.remaining_at_dispatch"]).toBeUndefined();
      // Symmetric to 5b minus delegate.* attrs (no reservation seam at
      // bracket-work — see helper docstring).
      expect(span.attributes["delegate.delivery"]).toBeUndefined();
      expect(span.attributes["delegate.mode"]).toBeUndefined();
      expect(span.ended).toBe(true);
    });

    it("no sibling continuation.disabled span is emitted (chunk 5c scope)", () => {
      // Chunk 5c docstring pin: WORK-fire has NO fire-time divergence; single
      // span emit, no continuation.disabled sibling (unlike 5b's pairing).
      emitContinuationWorkFireSpan({
        chainId: "work-chain-2",
        chainStepRemainingAtDispatch: 2,
        delayMs: 0,
        fireDeferredMs: 3,
      });

      expect(recorder.spansByName("continuation.work.fire")).toHaveLength(1);
      expect(recorder.spansByName("continuation.disabled")).toHaveLength(0);
    });

    it("chainId invariant violation no-ops + logs without throwing", () => {
      // Defense-in-depth: invariant guarantees chainId at fire time, but a
      // future regression must not crash the timer callback.
      const logged: string[] = [];
      emitContinuationWorkFireSpan({
        // @ts-expect-error — deliberately violating the non-optional sig
        chainId: undefined,
        chainStepRemainingAtDispatch: 1,
        delayMs: 0,
        fireDeferredMs: 0,
        log: (m) => logged.push(m),
      });

      expect(recorder.spansByName("continuation.work.fire")).toHaveLength(0);
      expect(logged.some((m) => m.includes("chainId invariant violated"))).toBe(true);
    });
  });
});
