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
import { type ChainPrimitiveResult, captureClassify, captureSwim } from "./swim-runner.js";

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
    it("rebase bot classifies synthetic squash-rebased commit as DROP (not PICK)", async () => {
      const { classifyRebasePick } = await import("./rebase-classifier.ts");
      // Synthetic: commit subject already mentions PR #70595 in the base
      // CHANGELOG — i.e. the work landed on base via a squash-rebase, and
      // the candidate pick would re-apply it. Discovery channel:
      // changelog-grep PR-token. Memo anchor: 7ee46a3ab9 (#70595).
      const verdict = classifyRebasePick({
        subject: "feat(foo): add bar (#70595)",
        commitBody: "feat(foo): add bar (#70595)\n\nLong description.",
        baseChangelog: "# Changelog\n\n## v2026.4.24\n\n- feat(foo): add bar (#70595)\n",
        isAncestorOf: () => false,
      });
      expect(verdict.verdict).toBe("DROP");
      expect(verdict.channel).toBe("changelog-grep:pr");
      expect(verdict.evidence.changelogPrHit).toBeDefined();
    });
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

  describe("lich-shape (post-compaction delegate release)", () => {
    // Wired against `emitContinuationCompactionReleasedSpan` per the lich
    // wiring memo (`docs/design/swim-37-lich-wiring-memo.md`). 8 live tests
    // covering Q2 (releasedCount: empty + non-empty) × Q3 (compaction.id:
    // present-and-valid + omitted + invalid across -1/1.5/NaN/Infinity).
    //
    // STDOUT-only discipline preserved: in-memory recorder, try/finally
    // tracer reset, no real BasicTracerProvider/OTLP machinery.

    it("emits continuation.compaction.released span with releasedCount=1 and compaction.id=7", async () => {
      const result = await captureSwim("lich", { releasedCount: 1, compactionId: 7 });
      expect(result.spans).toHaveLength(1);
      const span = result.spans[0]!;
      expect(span.name).toBe("continuation.compaction.released");
      expect(span.attributes["signal.kind"]).toBe("compaction-release");
      expect(span.attributes["compaction.released"]).toBe(1);
      expect(span.attributes["compaction.id"]).toBe(7);
      // Negative-assert pins per 🌊's #414 review (msg `1498536746265215046`):
      // release-seam is chain-agnostic at the helper boundary. The Options
      // type already prevents callers from supplying chain.id, but pinning
      // attribute absence guards against future drift toward conflating
      // release-seam lifecycle with continuation-chain lifecycle. Same
      // family-resemblance discipline as #410/#411/#412/#413.
      expect(span.attributes["chain.id"]).toBeUndefined();
      expect("chain.id" in span.attributes).toBe(false);
      expect(span.attributes["chain.step.remaining"]).toBeUndefined();
      expect(span.attributes["disabled.reason"]).toBeUndefined();
    });

    it("emits releasedCount=3 + compaction.id=42 (multi-release production-typical)", async () => {
      const result = await captureSwim("lich", { releasedCount: 3, compactionId: 42 });
      expect(result.spans).toHaveLength(1);
      const attrs = result.spans[0]!.attributes;
      expect(attrs["compaction.released"]).toBe(3);
      expect(attrs["compaction.id"]).toBe(42);
    });

    it("defensive: releasedCount=0 emits with compaction.released=0 (helper accepts but caller never invokes)", async () => {
      // Per memo §Q2: production caller guards with `autoCompactionCount > 0`,
      // so this shape is NOT production-reachable. Pinned for helper-tier
      // contract coverage — the helper's `Math.max(0, Math.floor(...))` clamp
      // is real even if the caller's guard makes it unreachable in production.
      const result = await captureSwim("lich", { releasedCount: 0, compactionId: 1 });
      expect(result.spans).toHaveLength(1);
      expect(result.spans[0]!.attributes["compaction.released"]).toBe(0);
      expect(result.spans[0]!.attributes["compaction.id"]).toBe(1);
    });

    it("omits compaction.id attribute when compactionId is omitted (omission contract)", async () => {
      const result = await captureSwim("lich", { releasedCount: 2 });
      expect(result.spans).toHaveLength(1);
      const attrs = result.spans[0]!.attributes;
      expect(attrs["compaction.released"]).toBe(2);
      expect(attrs["compaction.id"]).toBeUndefined();
      expect("compaction.id" in attrs).toBe(false);
    });

    it("drops compaction.id (with log) when compactionId is negative (-1)", async () => {
      const messages: string[] = [];
      const result = await captureSwim("lich", {
        releasedCount: 1,
        compactionId: -1,
        log: (m) => messages.push(m),
      });
      expect(result.spans).toHaveLength(1);
      expect(result.spans[0]!.attributes["compaction.id"]).toBeUndefined();
      expect(messages.some((m) => m.includes("invalid compaction.id"))).toBe(true);
    });

    it("drops compaction.id (with log) when compactionId is non-integer (1.5)", async () => {
      const messages: string[] = [];
      const result = await captureSwim("lich", {
        releasedCount: 1,
        compactionId: 1.5,
        log: (m) => messages.push(m),
      });
      expect(result.spans[0]!.attributes["compaction.id"]).toBeUndefined();
      expect(messages.some((m) => m.includes("invalid compaction.id"))).toBe(true);
    });

    it("drops compaction.id (with log) when compactionId is NaN (🌊 #411 review defense parity)", async () => {
      const messages: string[] = [];
      const result = await captureSwim("lich", {
        releasedCount: 1,
        compactionId: Number.NaN,
        log: (m) => messages.push(m),
      });
      expect(result.spans[0]!.attributes["compaction.id"]).toBeUndefined();
      expect(messages.some((m) => m.includes("invalid compaction.id"))).toBe(true);
    });

    it("drops compaction.id (with log) when compactionId is Infinity (🌊 #411 review defense parity)", async () => {
      const messages: string[] = [];
      const result = await captureSwim("lich", {
        releasedCount: 1,
        compactionId: Number.POSITIVE_INFINITY,
        log: (m) => messages.push(m),
      });
      expect(result.spans[0]!.attributes["compaction.id"]).toBeUndefined();
      expect(messages.some((m) => m.includes("invalid compaction.id"))).toBe(true);
    });
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
    // `lich` was wired in this PR — covered by its own describe block above.
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

describe("swim-37 harness :: rebase.classify primitive (live now)", () => {
  // Wired against `emitRebaseClassifySpan` per the rebase.classify
  // span-emission memo (`docs/design/swim-37-classifier-span-memo.md`).
  // Cohort sign-off 2026-04-27: Q1=Option B (separate `captureClassify`
  // entry point), Q2/Q2.5=in-PR helper at `src/rebase/tracer.ts`,
  // Q3=6-row matrix + truncation + validation describes, Q4=emit PICK
  // normally (matrix PICK row stays `it.todo` until a PICK-producing
  // channel lands).
  //
  // STDOUT-only discipline preserved: in-memory recorder, try/finally
  // tracer reset, no real BasicTracerProvider/OTLP machinery.

  describe("per-channel verdict matrix (memo §Q3)", () => {
    it("channel='changelog-grep:pr' → DROP with evidence.changelog.pr_token", async () => {
      const result = await captureClassify({
        verdict: "DROP",
        channel: "changelog-grep:pr",
        pickSha: "abc123def456789",
        evidence: { changelogPrToken: "#70595" },
      });
      expect(result.spans).toHaveLength(1);
      const span = result.spans[0]!;
      expect(span.name).toBe("rebase.classify");
      expect(span.attributes["signal.kind"]).toBe("rebase-classify");
      expect(span.attributes["verdict"]).toBe("DROP");
      expect(span.attributes["discovery.channel"]).toBe("changelog-grep:pr");
      expect(span.attributes["pick.sha"]).toBe("abc123def456");
      expect(span.attributes["evidence.changelog.pr_token"]).toBe("#70595");
      // Other channels' evidence absent (per-channel-isolation discipline).
      expect(span.attributes["evidence.changelog.subject_match_count"]).toBeUndefined();
      expect(span.attributes["evidence.cherry_pick.source_sha"]).toBeUndefined();
      expect(span.attributes["evidence.conflict.bin"]).toBeUndefined();
      expect(span.attributes["needs.conflict_content_inspection"]).toBeUndefined();
    });

    it("channel='changelog-grep:subject' → DROP with evidence.changelog.subject_match_count", async () => {
      const result = await captureClassify({
        verdict: "DROP",
        channel: "changelog-grep:subject",
        pickSha: "feedface1234abcd",
        evidence: { changelogSubjectMatchCount: 3 },
      });
      const attrs = result.spans[0]!.attributes;
      expect(attrs["verdict"]).toBe("DROP");
      expect(attrs["discovery.channel"]).toBe("changelog-grep:subject");
      expect(attrs["evidence.changelog.subject_match_count"]).toBe(3);
      expect(attrs["evidence.changelog.pr_token"]).toBeUndefined();
      expect(attrs["evidence.cherry_pick.source_sha"]).toBeUndefined();
      expect(attrs["evidence.conflict.bin"]).toBeUndefined();
    });

    it("channel='cherry-pick-provenance' → DROP with evidence.cherry_pick.source_sha (helper truncates)", async () => {
      const result = await captureClassify({
        verdict: "DROP",
        channel: "cherry-pick-provenance",
        pickSha: "deadbeefcafebabe9999",
        evidence: { cherryPickSourceSha: "01234567890abcdef0123" },
      });
      const attrs = result.spans[0]!.attributes;
      expect(attrs["verdict"]).toBe("DROP");
      expect(attrs["discovery.channel"]).toBe("cherry-pick-provenance");
      expect(attrs["pick.sha"]).toBe("deadbeefcafe");
      expect(attrs["evidence.cherry_pick.source_sha"]).toBe("01234567890a");
      expect(attrs["evidence.changelog.pr_token"]).toBeUndefined();
      expect(attrs["evidence.changelog.subject_match_count"]).toBeUndefined();
      expect(attrs["evidence.conflict.bin"]).toBeUndefined();
    });

    it("channel='conflict-content' (DROP, callback invoked) → evidence.conflict.bin present", async () => {
      const result = await captureClassify({
        verdict: "DROP",
        channel: "conflict-content",
        pickSha: "112233445566",
        evidence: { conflictBin: "test-harness" },
      });
      const attrs = result.spans[0]!.attributes;
      expect(attrs["verdict"]).toBe("DROP");
      expect(attrs["discovery.channel"]).toBe("conflict-content");
      expect(attrs["evidence.conflict.bin"]).toBe("test-harness");
      expect(attrs["evidence.changelog.pr_token"]).toBeUndefined();
      expect(attrs["evidence.changelog.subject_match_count"]).toBeUndefined();
      expect(attrs["evidence.cherry_pick.source_sha"]).toBeUndefined();
    });

    it("channel='none' (REVIEW, no callback) → needs.conflict_content_inspection=true", async () => {
      // Back-compat path from #408 — caller didn't supply `conflictContent`
      // callback so the rubric never ran. Memo §2: the only path where
      // `needs.conflict_content_inspection` is present.
      const result = await captureClassify({
        verdict: "REVIEW",
        channel: "none",
        pickSha: "aaaaaaaaaaaa",
        evidence: { needsConflictContentInspection: true },
      });
      const attrs = result.spans[0]!.attributes;
      expect(attrs["verdict"]).toBe("REVIEW");
      expect(attrs["discovery.channel"]).toBe("none");
      expect(attrs["needs.conflict_content_inspection"]).toBe(true);
      expect(attrs["evidence.conflict.bin"]).toBeUndefined();
    });

    it("channel='none' (REVIEW, callback invoked, returned bin='none') → evidence.conflict.bin='none' present", async () => {
      // Per 🌫's #413 review nit folded into memo §2: bin='none' is a
      // real value (rubric ran but found no signal), distinct from
      // attr-absent (rubric never ran). This row is the load-bearing
      // proof.
      const result = await captureClassify({
        verdict: "REVIEW",
        channel: "none",
        pickSha: "bbbbbbbbbbbb",
        evidence: { conflictBin: "none" },
      });
      const attrs = result.spans[0]!.attributes;
      expect(attrs["verdict"]).toBe("REVIEW");
      expect(attrs["discovery.channel"]).toBe("none");
      expect(attrs["evidence.conflict.bin"]).toBe("none");
      // bin='none' ≠ attr-absent — the `in` check is the load-bearing pin.
      expect("evidence.conflict.bin" in attrs).toBe(true);
      expect(attrs["needs.conflict_content_inspection"]).toBeUndefined();
    });

    it.todo(
      "channel=<future> → PICK with evidence (memo §Q4: emits normally; un-producible by §1 substrate today)",
    );
  });

  describe("pick.sha truncation invariant", () => {
    // Pinning the 12-char truncation explicitly per memo §Q3 (separate
    // describe because it's about a derived attribute, not an input axis).

    it("truncates 40-char full SHA to 12-char prefix", async () => {
      const fullSha = "a".repeat(40);
      const result = await captureClassify({
        verdict: "DROP",
        channel: "changelog-grep:pr",
        pickSha: fullSha,
        evidence: { changelogPrToken: "#1" },
      });
      expect(result.spans[0]!.attributes["pick.sha"]).toBe("a".repeat(12));
    });

    it("passes 12-char SHA through unchanged", async () => {
      const result = await captureClassify({
        verdict: "DROP",
        channel: "changelog-grep:pr",
        pickSha: "123456789abc",
        evidence: { changelogPrToken: "#1" },
      });
      expect(result.spans[0]!.attributes["pick.sha"]).toBe("123456789abc");
    });

    it("passes short-but-valid (7-char) SHA through unchanged (helper does not pad)", async () => {
      // Honest about being short rather than pretending. The 7-char
      // boundary is git's minimum unambiguous prefix per memo §3; the
      // captureClassify boundary throws on <7, but valid 7-11 char SHAs
      // pass through to the helper without padding (same discipline as
      // how `emitContinuationCompactionReleasedSpan` doesn't fabricate
      // missing compaction.id).
      const result = await captureClassify({
        verdict: "DROP",
        channel: "changelog-grep:pr",
        pickSha: "abc1234",
        evidence: { changelogPrToken: "#1" },
      });
      expect(result.spans[0]!.attributes["pick.sha"]).toBe("abc1234");
    });
  });

  describe("input validation (memo §3 throw-on-bad-input)", () => {
    // Memo §3 specs synchronous throw-on-bad-input matching #405/#411/#412
    // family-resemblance. Enforced at the harness boundary (mirrors
    // captureSwim's `recipients` invariant at swim-runner.ts:180); the
    // production helper stays drop-with-log so producer errors don't
    // propagate to the rebase-bot caller.

    it("throws when verdict is not in the canonical enum", async () => {
      await expect(
        captureClassify({
          // @ts-expect-error — runtime check belt-and-braces over TS narrowing
          verdict: "BOGUS",
          channel: "changelog-grep:pr",
          pickSha: "abc1234",
          evidence: { changelogPrToken: "#1" },
        }),
      ).rejects.toThrow(/verdict must be one of/);
    });

    it("throws when channel is not in the canonical enum", async () => {
      await expect(
        captureClassify({
          verdict: "DROP",
          // @ts-expect-error — runtime check belt-and-braces over TS narrowing
          channel: "made-up-channel",
          pickSha: "abc1234",
          evidence: { changelogPrToken: "#1" },
        }),
      ).rejects.toThrow(/channel must be one of/);
    });

    it("throws when pickSha is shorter than 7 hex chars (memo §3 git-prefix-min)", async () => {
      await expect(
        captureClassify({
          verdict: "DROP",
          channel: "changelog-grep:pr",
          pickSha: "abc123",
          evidence: { changelogPrToken: "#1" },
        }),
      ).rejects.toThrow(/at least 7 hex chars/);
    });

    it("throws when pickSha contains non-hex characters", async () => {
      await expect(
        captureClassify({
          verdict: "DROP",
          channel: "changelog-grep:pr",
          pickSha: "NOTHEXXX",
          evidence: { changelogPrToken: "#1" },
        }),
      ).rejects.toThrow(/lowercase hex/);
    });
  });

  describe("negative-assert pins (memo §2)", () => {
    // These attributes MUST NOT appear on rebase.classify spans. Same
    // family-resemblance discipline as #410/#411/#412/#414/#415: defends
    // future drift toward conflating rebase-bot lifecycle with
    // continuation lifecycle. The `captureClassify` Options shape
    // already enforces this at the type system level (no `chainId`,
    // `compactionId`, etc. params), but runtime pinning is
    // belt-and-braces — if a future maintainer adds those params back
    // to the Options or helper, this test fails before the contract
    // drifts.

    it("chain.id MUST be absent on rebase.classify spans", async () => {
      const result = await captureClassify({
        verdict: "DROP",
        channel: "changelog-grep:pr",
        pickSha: "abc1234",
        evidence: { changelogPrToken: "#1" },
      });
      const attrs = result.spans[0]!.attributes;
      expect(attrs["chain.id"]).toBeUndefined();
      expect("chain.id" in attrs).toBe(false);
    });

    it("chain.step.remaining MUST be absent on rebase.classify spans", async () => {
      const result = await captureClassify({
        verdict: "DROP",
        channel: "changelog-grep:pr",
        pickSha: "abc1234",
        evidence: { changelogPrToken: "#1" },
      });
      const attrs = result.spans[0]!.attributes;
      expect(attrs["chain.step.remaining"]).toBeUndefined();
      expect("chain.step.remaining" in attrs).toBe(false);
    });

    it("disabled.reason MUST be absent on rebase.classify spans (DROP ≠ disabled)", async () => {
      // DROP is a verdict, not a continuation-disabled signal. Pinning
      // absence prevents copy-paste of `continuation.disabled` shape
      // onto this helper.
      const result = await captureClassify({
        verdict: "DROP",
        channel: "cherry-pick-provenance",
        pickSha: "abc1234",
        evidence: { cherryPickSourceSha: "def4567" },
      });
      const attrs = result.spans[0]!.attributes;
      expect(attrs["disabled.reason"]).toBeUndefined();
      expect("disabled.reason" in attrs).toBe(false);
    });
  });

  describe("isolation contract (mirrors captureSwim() repeated-call discipline)", () => {
    it("repeated captureClassify() calls do not leak capture state", async () => {
      const r1 = await captureClassify({
        verdict: "DROP",
        channel: "changelog-grep:pr",
        pickSha: "f1450123456",
        evidence: { changelogPrToken: "#1" },
      });
      const r2 = await captureClassify({
        verdict: "REVIEW",
        channel: "none",
        pickSha: "5ec0d123456",
        evidence: { needsConflictContentInspection: true },
      });
      expect(r1.spans).toHaveLength(1);
      expect(r2.spans).toHaveLength(1);
      expect(r1.spans[0]!.attributes["pick.sha"]).toBe("f1450123456");
      expect(r2.spans[0]!.attributes["pick.sha"]).toBe("5ec0d123456");
    });
  });
});
