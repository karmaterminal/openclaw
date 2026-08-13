// #1229 fossils B + C — adoption guillotine disposition + session-scoped morphology.
//
// B: armStallWatchdog currently dead-letters via failClaim(..., "handler-timeout")
// and bypasses resolveIngressFailureDisposition / retry policy. Desired contract:
// a pre-adoption stall is a retryable ingress failure (release + attempts++ +
// backoff) unless configured policy already permits terminal dead-letter.
//
// C: one never-settling same-lane owner must not silently starve later same-lane
// work at attempts=0; unrelated lanes keep progressing; disposing the process-
// local drain releases ownership so a fresh drain can recover durable claims.
//
// Test-only. Expected RED on the current composite for the guillotine bypass
// (B) and for post-watchdog same-lane recoverability under current terminal
// failClaim (C's same-lane follow-up path after a terminal handler-timeout).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeOpenClawStateDatabaseForTest } from "../../state/openclaw-state-db.js";
import { createChannelIngressDrain } from "./ingress-drain.js";
import {
  createTestIngressQueue,
  type IngressDrainTestPayload as Payload,
  withTempState,
} from "./ingress-drain.test-helpers.js";

describe("fossil B: adoption guillotine uses canonical failure disposition (#1229)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    closeOpenClawStateDatabaseForTest();
  });

  it("routes pre-adoption stall through retry policy instead of terminal handler-timeout", async () => {
    await withTempState(async (stateDir) => {
      let clock = 50_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(
        "evt-stall",
        { text: "never adopts" },
        {
          laneKey: "lane-a",
          receivedAt: clock,
        },
      );

      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        adoptionStallTimeoutMs: 5_000,
        // Generous policy: first stall must release, not dead-letter.
        retryPolicy: {
          maxAttempts: 8,
          deadLetterMinAgeMs: 24 * 60 * 60 * 1_000,
          baseMs: 1_000,
          maxMs: 1_000,
        },
        dispatchClaimedEvent: async () => {
          // Never adopt, never return — pure claim→adoption stall.
          await new Promise(() => {});
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      clock += 5_000;
      await vi.advanceTimersByTimeAsync(5_000);
      await drain.waitForIdle();

      // Desired: retryable release with attempts incremented, not failed tombstone.
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      const pending = await queue.listPending({ limit: "all" });
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({
        id: "evt-stall",
        attempts: 1,
      });
      expect(pending[0]?.lastError).toEqual(expect.stringMatching(/handler-timeout|stalled/i));

      // After backoff the same durable row is claimable again.
      clock += 1_000;
      expect(await drain.drainOnce()).toEqual({ started: 1 });
      drain.dispose();
    });
  });

  it("only terminal-dead-letters a stall when retry policy permits", async () => {
    await withTempState(async (stateDir) => {
      let clock = 60_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(
        "evt-terminal",
        { text: "exhausted" },
        {
          laneKey: "lane-a",
          // Age already satisfies dead-letter min age once attempt floor is hit.
          receivedAt: clock - 24 * 60 * 60 * 1_000,
        },
      );

      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        adoptionStallTimeoutMs: 1_000,
        retryPolicy: {
          maxAttempts: 1,
          deadLetterMinAgeMs: 24 * 60 * 60 * 1_000,
          baseMs: 1_000,
          maxMs: 1_000,
        },
        dispatchClaimedEvent: async () => {
          await new Promise(() => {});
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      clock += 1_000;
      await vi.advanceTimersByTimeAsync(1_000);
      await drain.waitForIdle();

      // With policy floor met, terminal fail is allowed — but the reason must
      // still come from the canonical disposition owner (retry-limit-exceeded),
      // not a hard-coded handler-timeout bypass.
      const failed = await queue.listFailed?.({ limit: "all" });
      expect(failed).toHaveLength(1);
      expect(failed?.[0]).toMatchObject({
        id: "evt-terminal",
        reason: "retry-limit-exceeded",
      });
      drain.dispose();
    });
  });
});

describe("fossil C: session-scoped never-settling owner morphology (#1229)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    closeOpenClawStateDatabaseForTest();
  });

  it("distinguishes never-settling ownership from ordinary throw cleanup", async () => {
    await withTempState(async (stateDir) => {
      let clock = 70_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue("throws", { text: "boom" }, { laneKey: "lane-throw", receivedAt: clock });
      await queue.enqueue("hangs", { text: "hang" }, { laneKey: "lane-hang", receivedAt: clock });

      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        adoptionStallTimeoutMs: 5_000,
        retryPolicy: {
          baseMs: 1_000,
          maxMs: 1_000,
          maxAttempts: 8,
          deadLetterMinAgeMs: 86_400_000,
        },
        dispatchClaimedEvent: async (event) => {
          if (event.id === "throws") {
            throw new Error("ordinary handler failure");
          }
          // Never-settling await: no abort listener, no finally. Contrasts with throw path.
          await new Promise(() => {});
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 2 });
      // Do not waitForIdle while hangs is still active — its task never settles.
      await vi.waitFor(async () => {
        const pending = await queue.listPending({ limit: "all" });
        expect(pending.find((row) => row.id === "throws")).toMatchObject({
          attempts: 1,
          lastError: "ordinary handler failure",
        });
      });

      // Hang still claimed under process-local ownership (not yet watchdog).
      expect((await queue.listClaims()).map((c) => c.id)).toEqual(["hangs"]);
      expect(drain.activeLaneKeys().has("lane-hang")).toBe(true);
      expect(drain.activeLaneKeys().has("lane-throw")).toBe(false);

      clock += 5_000;
      await vi.advanceTimersByTimeAsync(5_000);
      // Guillotine removes hangs from activeByClaim even if the JS await is wedged.
      await vi.waitFor(() => expect(drain.activeLaneKeys().size).toBe(0));

      // Desired after stall: hang is also released retryably (not terminal fail).
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      const pending = await queue.listPending({ limit: "all" });
      expect(pending.map((row) => row.id).toSorted()).toEqual(["hangs", "throws"]);
      expect(pending.find((row) => row.id === "hangs")).toMatchObject({ attempts: 1 });
      drain.dispose();
    });
  });

  it("keeps unrelated session B healthy while lane A is owned, then recovers after dispose", async () => {
    await withTempState(async (stateDir) => {
      let clock = 80_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(
        "a1",
        { text: "lane A hang" },
        { laneKey: "session-a", receivedAt: clock },
      );

      let hangStarted = false;
      const bAdopted: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        adoptionStallTimeoutMs: 5_000,
        retryPolicy: { baseMs: 500, maxMs: 500, maxAttempts: 8, deadLetterMinAgeMs: 86_400_000 },
        dispatchClaimedEvent: async (event, lifecycle) => {
          if (event.id === "a1") {
            hangStarted = true;
            await new Promise(() => {});
          }
          bAdopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await vi.waitFor(() => expect(hangStarted).toBe(true));
      expect(drain.activeLaneKeys()).toEqual(new Set(["session-a"]));

      // Later same-lane work cannot start while A owns the lane (durable + process-local).
      await queue.enqueue(
        "a2",
        { text: "lane A follow-up" },
        {
          laneKey: "session-a",
          receivedAt: clock + 1,
        },
      );
      expect(await drain.drainOnce()).toEqual({ started: 0 });

      // Unrelated session B still admits and finishes (do not waitForIdle — A is wedged).
      await queue.enqueue(
        "b1",
        { text: "session B work" },
        {
          laneKey: "session-b",
          receivedAt: clock + 2,
        },
      );
      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await vi.waitFor(() => expect(bAdopted).toEqual(["b1"]));
      const bStatus = await queue.enqueue("b1", { text: "session B work" });
      expect(bStatus.kind).toBe("completed");

      // Watchdog boundary on A.
      clock += 5_000;
      await vi.advanceTimersByTimeAsync(5_000);
      await vi.waitFor(() => expect(drain.activeLaneKeys().has("session-a")).toBe(false));

      // Desired: A1 retryably released (not terminal handler-timeout), so A2 can
      // receive a visible disposition on the next drain rather than dying silent.
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      const pendingAfterWatchdog = await queue.listPending({ limit: "all" });
      expect(pendingAfterWatchdog.map((row) => row.id).toSorted()).toEqual(["a1", "a2"]);
      expect(pendingAfterWatchdog.find((row) => row.id === "a1")?.attempts).toBeGreaterThanOrEqual(
        1,
      );

      // Process-local reset: dispose then a fresh drain recovers durable rows.
      clock += 500;
      const progressed: string[] = [];
      drain.dispose();
      const drain2 = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        adoptionStallTimeoutMs: 60_000,
        dispatchClaimedEvent: async (event, lifecycle) => {
          progressed.push(event.id);
          await lifecycle.onAdopted();
        },
      });
      expect(await drain2.recoverStaleClaims()).toBeGreaterThanOrEqual(0);
      const started = await drain2.drainOnce();
      expect(started.started).toBeGreaterThanOrEqual(1);
      await drain2.waitForIdle();
      expect(progressed.length).toBeGreaterThanOrEqual(1);
      // Same-lane follow-up must not remain stuck forever behind a terminal fail.
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      drain2.dispose();
    });
  });

  it("process-local dispose releases lane ownership without erasing durable queue rows", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir, { now: () => 90_000 });
      await queue.enqueue("owned", { text: "x" }, { laneKey: "lane-x" });

      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => 90_000,
        dispatchClaimedEvent: async () => {
          await new Promise(() => {});
        },
      });
      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await vi.waitFor(() => expect(drain.activeLaneKeys().has("lane-x")).toBe(true));
      expect((await queue.listClaims()).map((c) => c.id)).toEqual(["owned"]);

      drain.dispose();
      expect(drain.activeLaneKeys().size).toBe(0);

      // Durable claim remains until another drain recovers it — dispose does not
      // complete/fail/release the SQLite row (process-local vs durable split).
      expect((await queue.listClaims()).map((c) => c.id)).toEqual(["owned"]);
      expect(await queue.listPending()).toEqual([]);

      const recovered: string[] = [];
      const drain2 = createChannelIngressDrain<Payload>({
        queue,
        now: () => 90_000,
        dispatchClaimedEvent: async (event, lifecycle) => {
          recovered.push(event.id);
          await lifecycle.onAdopted();
        },
      });
      expect(await drain2.recoverStaleClaims()).toBe(1);
      expect(await drain2.drainOnce()).toEqual({ started: 1 });
      await drain2.waitForIdle();
      expect(recovered).toEqual(["owned"]);
      drain2.dispose();
    });
  });
});
