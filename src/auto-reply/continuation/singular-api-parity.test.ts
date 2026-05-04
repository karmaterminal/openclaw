import { describe, expect, it, vi } from "vitest";
import {
  enqueueContinuationReturnDeliveries,
  hasContinuationDelegateTargeting,
  resolveContinuationReturnTargetSessionKeys,
} from "./targeting.js";

// Issue #580 Finding 1 discriminator (silas-seat 🌫️ workorder).
//
// Cohort byte-pin from cael-host (5-rung) reported 0
// `[continuation:targeted-return] Delivered to ... from ...` log lines for
// `continue_delegate({ targetSessionKey: "X", mode: "silent-wake" })` fires
// across cael / elliott / ronan / silas (4 hosts) on canonical f39b8c9751.
// silas-host saw the line fire on a 2-element plural-API fire only.
//
// Two readings remained open after 🌊's discriminator probe substantively
// confirmed the plural-API substrate works end-to-end:
//
//   (A) singular-API IS broken at runtime field-propagation between
//       subagent-registry-run-manager.ts:431 (register-time persist) and
//       subagent-registry-lifecycle.ts:688 (announce-time read), or some
//       upstream layer drops `targetSessionKey` only for the one-key shape.
//
//   (B) singular-API works fine on canonical; cohort grep was wrong-observable
//       (windowing / log-target / journal-namespace miss).
//
// Static walk on canonical (f39b8c9751) showed every layer carries
// `continuationTargetSessionKey` and `continuationTargetSessionKeys`
// symmetrically, and `resolveContinuationReturnTargetSessionKeys` concatenates
// `[singular?, ...plural]`. So the static evidence pointed to (B), but a
// live-chain regression test was missing — hence cohort had no test-side proof
// when the cohort grep returned empty.
//
// This file pins parity at three layers without mocking the seam under test:
//
//   1. PURE: `hasContinuationDelegateTargeting` accepts the singular shape.
//   2. PURE: `resolveContinuationReturnTargetSessionKeys` produces identical
//      output for `{ targetSessionKey: "X" }` and `{ targetSessionKeys: ["X"] }`.
//   3. LIVE: real `enqueueContinuationReturnDeliveries` with leaf-IO mocked
//      via the `deps` injection point — proves the announce-time call shape
//      with `targetSessionKeys: ["X"]` (which is what the resolver returns
//      for singular input) reaches `enqueueSessionDelivery({ sessionKey: "X" })`.
//
// If any of these flips to failure on a future canonical, the fix surface is
// the field-loss point and the cohort's (A) reading is back on the table.

describe("singular-API parity: hasContinuationDelegateTargeting", () => {
  it("returns true for singular targetSessionKey", () => {
    expect(hasContinuationDelegateTargeting({ targetSessionKey: "agent:main:main" })).toBe(true);
  });

  it("returns true for plural targetSessionKeys with one entry (parity with singular)", () => {
    expect(hasContinuationDelegateTargeting({ targetSessionKeys: ["agent:main:main"] })).toBe(true);
  });

  it("returns true for fanoutMode without explicit keys", () => {
    expect(hasContinuationDelegateTargeting({ fanoutMode: "tree" })).toBe(true);
  });

  it("returns false for empty targeting", () => {
    expect(hasContinuationDelegateTargeting({})).toBe(false);
  });

  it("returns false for blank singular targetSessionKey (whitespace-only is normalized away)", () => {
    expect(hasContinuationDelegateTargeting({ targetSessionKey: "   " })).toBe(false);
  });
});

describe("singular-API parity: resolveContinuationReturnTargetSessionKeys", () => {
  const defaultSessionKey = "agent:main:dispatcher";

  it("singular targetSessionKey produces the same list as plural targetSessionKeys with one element", () => {
    const fromSingular = resolveContinuationReturnTargetSessionKeys({
      defaultSessionKey,
      targetSessionKey: "agent:main:recipient",
    });
    const fromPlural = resolveContinuationReturnTargetSessionKeys({
      defaultSessionKey,
      targetSessionKeys: ["agent:main:recipient"],
    });
    expect(fromSingular).toEqual(["agent:main:recipient"]);
    expect(fromSingular).toEqual(fromPlural);
  });

  it("singular and plural compose: targetSessionKey + targetSessionKeys produce union (singular first)", () => {
    const resolved = resolveContinuationReturnTargetSessionKeys({
      defaultSessionKey,
      targetSessionKey: "agent:main:alpha",
      targetSessionKeys: ["agent:main:beta", "agent:main:gamma"],
    });
    expect(resolved).toEqual(["agent:main:alpha", "agent:main:beta", "agent:main:gamma"]);
  });

  it("falls back to defaultSessionKey when no targeting fields are present", () => {
    const resolved = resolveContinuationReturnTargetSessionKeys({ defaultSessionKey });
    expect(resolved).toEqual([defaultSessionKey]);
  });

  it("ignores duplicate keys across singular and plural inputs", () => {
    const resolved = resolveContinuationReturnTargetSessionKeys({
      defaultSessionKey,
      targetSessionKey: "agent:main:dupe",
      targetSessionKeys: ["agent:main:dupe", "agent:main:other"],
    });
    expect(resolved).toEqual(["agent:main:dupe", "agent:main:other"]);
  });
});

describe("singular-API parity: enqueueContinuationReturnDeliveries (live targeting module)", () => {
  it("delivers to the resolver-derived recipient list when caller threaded singular via the resolver", async () => {
    // Mirrors what subagent-announce.ts:1230-1251 does on canonical:
    //   1. Resolve the recipient list via resolveContinuationReturnTargetSessionKeys
    //      from `params.continuationTargetSessionKey` (singular) plus other axes.
    //   2. Pass that resolved list as `targetSessionKeys` to
    //      enqueueContinuationReturnDeliveries.
    //
    // The seam under test is the live targeting module: the resolver MUST
    // produce a one-element list from singular input, AND the delivery
    // function MUST call enqueueSessionDelivery once per resolved key.
    const resolved = resolveContinuationReturnTargetSessionKeys({
      defaultSessionKey: "agent:main:dispatcher",
      targetSessionKey: "agent:main:recipient",
    });
    expect(resolved).toEqual(["agent:main:recipient"]);

    const enqueueSessionDelivery = vi.fn(async () => "delivery-1");
    const ackSessionDelivery = vi.fn(async () => undefined);
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();

    const result = await enqueueContinuationReturnDeliveries(
      {
        targetSessionKeys: resolved,
        text: "[continuation:enrichment-return] Delegate completed: probe",
        idempotencyKeyBase: "continuation-return:test-singular",
        wakeRecipients: true,
        childRunId: "run-singular-probe",
      },
      {
        enqueueSessionDelivery,
        ackSessionDelivery,
        enqueueSystemEvent,
        requestHeartbeatNow,
      },
    );

    expect(result).toEqual({
      enqueued: 1,
      delivered: 1,
      deliveryIds: ["delivery-1"],
    });
    expect(enqueueSessionDelivery).toHaveBeenCalledTimes(1);
    expect(enqueueSessionDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "systemEvent",
        sessionKey: "agent:main:recipient",
        text: "[continuation:enrichment-return] Delegate completed: probe",
      }),
      undefined,
    );
    expect(enqueueSystemEvent).toHaveBeenCalledWith(
      "[continuation:enrichment-return] Delegate completed: probe",
      expect.objectContaining({ sessionKey: "agent:main:recipient" }),
    );
    expect(requestHeartbeatNow).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "agent:main:recipient",
        reason: "delegate-return",
        parentRunId: "run-singular-probe",
      }),
    );
    expect(ackSessionDelivery).toHaveBeenCalledWith("delivery-1", undefined);
  });

  it("singular and plural produce byte-identical leaf-delivery sequences for the same one-key recipient", async () => {
    // Twin probes with identical recipient. The cohort observation that
    // singular fired 0 log lines while plural fired must NOT correspond to
    // any divergence in the live targeting module; this twin proves it.
    const recipient = "agent:main:recipient";

    async function runProbe(
      targeting: { targetSessionKey: string } | { targetSessionKeys: string[] },
    ): Promise<Array<{ sessionKey: string; text: string }>> {
      const calls: Array<{ sessionKey: string; text: string }> = [];
      const enqueueSessionDelivery = vi.fn(async (record: { sessionKey: string }) => {
        // The targeting module always passes `kind: "systemEvent"` records,
        // which carry `text`. Narrow at the call site rather than re-typing
        // the broader `QueuedSessionDeliveryPayload` union here.
        const systemEvent = record as { sessionKey: string; text: string };
        calls.push({ sessionKey: systemEvent.sessionKey, text: systemEvent.text });
        return `delivery-${calls.length}`;
      });
      const ackSessionDelivery = vi.fn(async () => undefined);
      const enqueueSystemEvent = vi.fn();
      const requestHeartbeatNow = vi.fn();

      const resolved = resolveContinuationReturnTargetSessionKeys({
        defaultSessionKey: "agent:main:dispatcher",
        ...targeting,
      });
      await enqueueContinuationReturnDeliveries(
        {
          targetSessionKeys: resolved,
          text: "[continuation:enrichment-return] twin",
          idempotencyKeyBase: "continuation-return:twin",
          wakeRecipients: true,
        },
        {
          enqueueSessionDelivery,
          ackSessionDelivery,
          enqueueSystemEvent,
          requestHeartbeatNow,
        },
      );
      return calls;
    }

    const fromSingular = await runProbe({ targetSessionKey: recipient });
    const fromPlural = await runProbe({ targetSessionKeys: [recipient] });

    expect(fromSingular).toEqual([
      { sessionKey: recipient, text: "[continuation:enrichment-return] twin" },
    ]);
    expect(fromSingular).toEqual(fromPlural);
  });
});
