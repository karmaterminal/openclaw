// Durable ingress drain contract tests for lifecycle reliability invariants.
import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeOpenClawStateDatabaseForTest } from "../../state/openclaw-state-db.js";
import type { ChannelIngressDispatchLifecycle } from "./ingress-drain-state.js";
import {
  bindIngressLifecycleToReplyOptions,
  createChannelIngressDrain,
  isIngressAdoptionLostError,
} from "./ingress-drain.js";
import {
  createTestIngressQueue,
  type IngressDrainTestPayload as Payload,
  withTempState,
} from "./ingress-drain.test-helpers.js";
import type { ChannelIngressQueueRecord } from "./ingress-queue.js";
import {
  DEFAULT_INGRESS_RETRY_DEAD_LETTER_MIN_AGE_MS,
  DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS,
} from "./ingress-retry-policy.js";

const STALE_AMBIENT_PENDING_MS = 15 * 60 * 1_000;

type ChannelIngressPendingDisposition = {
  kind: "fail";
  reason: string;
  message: string;
};

type ChannelIngressPendingDispositionContext = {
  laneKey: string;
  now: number;
};

function resolveStaleAmbientPendingDisposition(
  event: ChannelIngressQueueRecord<Payload>,
  context: ChannelIngressPendingDispositionContext,
): ChannelIngressPendingDisposition | null {
  if (event.payload.kind !== "ambient") {
    return null;
  }
  if (context.now - event.receivedAt <= STALE_AMBIENT_PENDING_MS) {
    return null;
  }
  return {
    kind: "fail",
    reason: "stale-ambient-backlog",
    message: `stale ambient backlog ${event.id} on ${context.laneKey}`,
  };
}

describe("channel ingress drain", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    closeOpenClawStateDatabaseForTest();
  });

  it("crash-window: lost claim is recovered and dispatched exactly once", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir, { now: () => 1_000 });
      await queue.enqueue("evt-1", { text: "hello" }, { laneKey: "lane-a" });
      const orphanClaim = await queue.claim("evt-1", { ownerId: "999:1:dead-owner" });
      expect(orphanClaim).not.toBeNull();

      const dispatches: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => 1_000,
        dispatchClaimedEvent: async (event, lifecycle) => {
          dispatches.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      const { started } = await drain.drainOnce();
      await drain.waitForIdle();
      expect(started).toBe(1);
      expect(dispatches).toEqual(["evt-1"]);

      // Tombstone: re-enqueue hits completed, never redispatches.
      const again = await queue.enqueue("evt-1", { text: "hello" });
      expect(again.kind).toBe("completed");
      const second = await drain.drainOnce();
      await drain.waitForIdle();
      expect(second.started).toBe(0);
      expect(dispatches).toEqual(["evt-1"]);
      drain.dispose();
    });
  });

  it("dispatches a resubmitted dead letter exactly once", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("evt-replay", { text: "recover" }, { laneKey: "lane-a" });
      const originalClaim = await queue.claim("evt-replay", { ownerId: "worker" });
      if (!originalClaim) {
        throw new Error("Expected a claimed ingress event");
      }
      await queue.fail(originalClaim, { reason: "handler-error", failedAt: 20 });
      if (!queue.resubmit) {
        throw new Error("Expected queue.resubmit");
      }
      await expect(queue.resubmit("evt-replay", { resubmittedAt: 30 })).resolves.toMatchObject({
        kind: "resubmitted",
        record: { attempts: 0, receivedAt: 30 },
      });

      const dispatch = vi.fn(
        async (_event: unknown, lifecycle: ChannelIngressDispatchLifecycle) => {
          await lifecycle.onAdopted();
        },
      );
      const drain = createChannelIngressDrain<Payload>({ queue, dispatchClaimedEvent: dispatch });

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(await drain.drainOnce()).toEqual({ started: 0 });
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0]?.[0]).toMatchObject({
        id: "evt-replay",
        payload: { text: "recover" },
        attempts: 0,
      });
      drain.dispose();
    });
  });

  it("complete-at-adoption: adoption tombstones; settle is not required", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("evt-adopt", { text: "x" }, { laneKey: "l1" });

      let settleResolve!: () => void;
      const settleGate = new Promise<void>((resolve) => {
        settleResolve = resolve;
      });

      const drain = createChannelIngressDrain<Payload>({
        queue,
        dispatchClaimedEvent: async (_event, lifecycle) => {
          await lifecycle.onAdopted();
          // Simulate a long-running turn after adoption.
          await settleGate;
        },
      });

      await drain.drainOnce();
      // Adoption already completed the claim before settle.
      await vi.waitFor(async () => {
        const pending = await queue.listPending();
        expect(pending).toEqual([]);
      });
      const claims = await queue.listClaims();
      expect(claims).toEqual([]);
      settleResolve();
      await drain.waitForIdle();
      drain.dispose();
    });
  });

  it("deferred holds claim without complete until adopted or abandoned", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("evt-def", { text: "x" }, { laneKey: "l1" });

      const capturedLifecycles: ChannelIngressDispatchLifecycle[] = [];

      const drain = createChannelIngressDrain<Payload>({
        queue,
        dispatchClaimedEvent: async (_event, lifecycle) => {
          capturedLifecycles.push(lifecycle);
          return { kind: "deferred" };
        },
      });

      await drain.drainOnce();
      await vi.waitFor(() => {
        expect(capturedLifecycles).toHaveLength(1);
      });
      expect(await queue.listClaims()).toHaveLength(1);
      expect(await queue.listPending()).toEqual([]);

      // Abandon releases for retry (attempts increment).
      await expectDefined(capturedLifecycles[0], "deferred lifecycle").onAbandoned();
      await drain.waitForIdle();
      await vi.waitFor(async () => {
        const pending = await queue.listPending();
        expect(pending).toHaveLength(1);
        expect(pending[0]?.attempts).toBeGreaterThanOrEqual(1);
      });
      drain.dispose();
    });
  });

  it("holds lanes by default and releases only opted-in deferred lanes", async () => {
    for (const occupancy of ["hold", "release"] as const) {
      await withTempState(async (stateDir) => {
        const queue = createTestIngressQueue(stateDir);
        await queue.enqueue("first", { text: "first" }, { laneKey: "shared" });
        const lifecycles: ChannelIngressDispatchLifecycle[] = [];
        const drain = createChannelIngressDrain<Payload>({
          queue,
          ...(occupancy === "release" ? { deferredLaneOccupancy: occupancy } : {}),
          dispatchClaimedEvent: async (_event, lifecycle) => {
            lifecycles.push(lifecycle);
            return { kind: "deferred" };
          },
        });
        expect(await drain.drainOnce()).toEqual({ started: 1 });
        await vi.waitFor(() => expect(lifecycles).toHaveLength(1));
        expect(drain.activeLaneKeys().has("shared")).toBe(occupancy === "hold");

        await queue.enqueue("second", { text: "second" }, { laneKey: "shared" });
        expect(await drain.drainOnce()).toEqual({ started: occupancy === "hold" ? 0 : 1 });
        await vi.waitFor(() => expect(lifecycles).toHaveLength(occupancy === "hold" ? 1 : 2));
        expect((await queue.listClaims()).map((claim) => claim.id).toSorted()).toEqual(
          occupancy === "hold" ? ["first"] : ["first", "second"],
        );
        drain.dispose();
      });
    }
  });

  it("keeps heartbeat and watchdog ownership after releasing a deferred lane", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue("released-stall", { text: "x" }, { laneKey: "shared" });
      const refreshClaim = vi.fn(async () => true);
      queue.refreshClaim = refreshClaim;
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        claimLeaseMs: 3_000,
        adoptionStallTimeoutMs: 2_000,
        deferredLaneOccupancy: "release",
        dispatchClaimedEvent: async () => ({ kind: "deferred" }),
      });

      await drain.drainOnce();
      await vi.waitFor(() => expect(drain.activeLaneKeys()).toEqual(new Set()));
      clock += 1_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(refreshClaim).toHaveBeenCalledTimes(1);

      clock += 1_000;
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(async () => expect(await queue.listFailed?.()).toHaveLength(1));
      const failed = await queue.listFailed?.();
      expect(failed?.[0]).toMatchObject({ id: "released-stall", reason: "handler-timeout" });
      drain.dispose();
    });
  });

  it("applies retry, non-retryable, and retry-limit policy to deferred failures", async () => {
    await withTempState(async (stateDir) => {
      let clock = 10_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue("late-failure", { text: "x" }, { laneKey: "shared", receivedAt: clock });
      const lifecycles: ChannelIngressDispatchLifecycle[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        deferredLaneOccupancy: "release",
        retryPolicy: { baseMs: 1_000, maxMs: 1_000 },
        dispatchClaimedEvent: async (_event, lifecycle) => {
          lifecycles.push(lifecycle);
          return { kind: "deferred" };
        },
      });

      await drain.drainOnce();
      await vi.waitFor(() => expect(lifecycles).toHaveLength(1));
      const onFailed = expectDefined(
        expectDefined(lifecycles[0], "deferred lifecycle").onFailed,
        "deferred failure lifecycle",
      );
      await onFailed(new Error("late provider failure"));

      expect(await queue.listPending({ limit: "all" })).toMatchObject([
        { id: "late-failure", attempts: 1, lastError: "late provider failure" },
      ]);
      expect(await drain.drainOnce()).toEqual({ started: 0 });
      clock += 1_000;
      expect(await drain.drainOnce()).toEqual({ started: 1 });
      drain.dispose();
    });
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir, { now: () => 10_000 });
      await queue.enqueue("non-retryable", { text: "x" }, { laneKey: "one", receivedAt: 1 });
      await queue.enqueue("retry-limit", { text: "x" }, { laneKey: "two", receivedAt: 1 });
      const lifecycles = new Map<string, ChannelIngressDispatchLifecycle>();
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => 10_000,
        deferredLaneOccupancy: "release",
        retryPolicy: { maxAttempts: 1, deadLetterMinAgeMs: 0 },
        resolveNonRetryableFailure: (error) =>
          error instanceof Error && error.message === "fatal input"
            ? { reason: "invalid-input", message: error.message }
            : null,
        dispatchClaimedEvent: async (event, lifecycle) => {
          lifecycles.set(event.id, lifecycle);
          return { kind: "deferred" };
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 2 });
      await vi.waitFor(() => expect(lifecycles.size).toBe(2));
      await expectDefined(
        expectDefined(lifecycles.get("non-retryable"), "non-retryable lifecycle").onFailed,
        "non-retryable failure lifecycle",
      )(new Error("fatal input"));
      await expectDefined(
        expectDefined(lifecycles.get("retry-limit"), "retry-limit lifecycle").onFailed,
        "retry-limit failure lifecycle",
      )(new Error("still broken"));

      expect(await queue.listFailed?.({ limit: "all" })).toMatchObject([
        { id: "non-retryable", reason: "invalid-input", message: "fatal input" },
        { id: "retry-limit", reason: "retry-limit-exceeded", message: "still broken" },
      ]);
      drain.dispose();
    });
  });

  it("protects and aborts released deferred claims until disposal", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("released", { text: "x" }, { laneKey: "shared" });
      let aborted = false;
      const first = createChannelIngressDrain<Payload>({
        queue,
        deferredLaneOccupancy: "release",
        dispatchClaimedEvent: async (_event, lifecycle) => {
          lifecycle.abortSignal.addEventListener("abort", () => {
            aborted = true;
          });
          return { kind: "deferred" };
        },
      });
      const second = createChannelIngressDrain<Payload>({
        queue,
        dispatchClaimedEvent: async () => ({ kind: "deferred" }),
      });

      await first.drainOnce();
      await vi.waitFor(() => expect(first.activeLaneKeys()).toEqual(new Set()));
      expect(await second.recoverStaleClaims()).toBe(0);

      first.dispose();
      expect(aborted).toBe(true);
      expect((await queue.listClaims()).map((claim) => claim.id)).toEqual(["released"]);
      expect(await second.recoverStaleClaims()).toBe(1);
      second.dispose();
    });
  });

  it("lets callers await an abandoned claim release", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("evt-await-abandon", { text: "x" }, { laneKey: "l1" });

      let finishRelease!: () => void;
      const releaseGate = new Promise<void>((resolve) => {
        finishRelease = resolve;
      });
      const release = vi.fn(async (...args: Parameters<typeof queue.release>) => {
        await releaseGate;
        return await queue.release(...args);
      });
      const capturedLifecycles: ChannelIngressDispatchLifecycle[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue: { ...queue, release },
        dispatchClaimedEvent: async (_event, lifecycle) => {
          capturedLifecycles.push(lifecycle);
          return { kind: "deferred" };
        },
      });

      await drain.drainOnce();
      await vi.waitFor(() => expect(capturedLifecycles).toHaveLength(1));

      let abandoned = false;
      const abandonment = Promise.resolve(
        expectDefined(capturedLifecycles[0], "deferred lifecycle").onAbandoned(),
      ).then(() => {
        abandoned = true;
      });
      await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(1));
      expect(abandoned).toBe(false);
      expect(await queue.listClaims()).toHaveLength(1);

      finishRelease();
      await abandonment;
      expect(abandoned).toBe(true);
      expect(await queue.listClaims()).toEqual([]);
      expect(await queue.listPending()).toHaveLength(1);
      drain.dispose();
    });
  });

  it("abandoned via turnAdoptionLifecycle releases claim with attempt increment", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("evt-q", { text: "x" }, { laneKey: "l1" });

      const drain = createChannelIngressDrain<Payload>({
        queue,
        dispatchClaimedEvent: async (_event, lifecycle) => {
          const bound = bindIngressLifecycleToReplyOptions(lifecycle);
          bound.turnAdoptionLifecycle.onDeferred();
          // Never admitted — abandon path releases claim.
          await bound.turnAdoptionLifecycle.onAbandoned();
          return { kind: "deferred" };
        },
      });

      await drain.drainOnce();
      await drain.waitForIdle();
      await vi.waitFor(async () => {
        const pending = await queue.listPending();
        expect(pending).toHaveLength(1);
        expect(pending[0]?.lastError).toBe("turn-abandoned");
      });
      drain.dispose();
    });
  });

  it("queued deferral→admission completes the claim exactly once via turnAdoptionLifecycle", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("evt-admit", { text: "x" }, { laneKey: "l1" });

      let adoptCount = 0;
      const drain = createChannelIngressDrain<Payload>({
        queue,
        dispatchClaimedEvent: async (_event, lifecycle) => {
          const bound = bindIngressLifecycleToReplyOptions(lifecycle);
          // Simulate queue enqueue (defer) then reply-lane admission (adopt).
          bound.turnAdoptionLifecycle.onDeferred();
          await bound.turnAdoptionLifecycle.onAdopted();
          adoptCount += 1;
          // Second adopt from lifecycle must be a no-op for the claim.
          await bound.turnAdoptionLifecycle.onAdopted();
          adoptCount += 1;
          return { kind: "deferred" };
        },
      });

      await drain.drainOnce();
      await drain.waitForIdle();
      expect(adoptCount).toBe(2);
      expect(await queue.listClaims()).toEqual([]);
      expect(await queue.listPending()).toEqual([]);
      const status = await queue.enqueue("evt-admit", { text: "x" });
      expect(status.kind).toBe("completed");
      // No re-dispatch on later drain.
      const second = await drain.drainOnce();
      expect(second.started).toBe(0);
      drain.dispose();
    });
  });

  it("watchdog only guillotines pre-adoption stalls with handler-timeout", async () => {
    await withTempState(async (stateDir) => {
      let clock = 10_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue("evt-stall", { text: "x" }, { laneKey: "l1" });

      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        adoptionStallTimeoutMs: 5_000,
        dispatchClaimedEvent: async () => {
          // Never adopt, never return — stall until watchdog.
          await new Promise(() => {});
        },
      });

      await drain.drainOnce();
      clock += 5_000;
      await vi.advanceTimersByTimeAsync(5_000);
      await drain.waitForIdle();

      // Failed tombstone, not pending retry.
      const reenqueue = await queue.enqueue("evt-stall", { text: "x" });
      expect(reenqueue.kind).toBe("failed");
      if (reenqueue.kind === "failed") {
        expect(reenqueue.record.reason).toBe("handler-timeout");
      }
      drain.dispose();
    });
  });

  it("watchdog guillotines deferred phase (timer not cleared by deferral)", async () => {
    await withTempState(async (stateDir) => {
      let clock = 30_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue("evt-def-stall", { text: "x" }, { laneKey: "l1" });

      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        adoptionStallTimeoutMs: 5_000,
        dispatchClaimedEvent: async (_event, lifecycle) => {
          lifecycle.onDeferred();
          // Stay deferred without adoption — watchdog must still fire.
          await new Promise(() => {});
        },
      });

      await drain.drainOnce();
      expect(await queue.listClaims()).toHaveLength(1);
      clock += 5_000;
      await vi.advanceTimersByTimeAsync(5_000);
      await drain.waitForIdle();

      const reenqueue = await queue.enqueue("evt-def-stall", { text: "x" });
      expect(reenqueue.kind).toBe("failed");
      if (reenqueue.kind === "failed") {
        expect(reenqueue.record.reason).toBe("handler-timeout");
      }
      drain.dispose();
    });
  });

  it("watchdog does not kill healthy long turns after adoption", async () => {
    await withTempState(async (stateDir) => {
      let clock = 20_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue("evt-long", { text: "x" }, { laneKey: "l1" });

      let settleResolve!: () => void;
      const settleGate = new Promise<void>((resolve) => {
        settleResolve = resolve;
      });

      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        adoptionStallTimeoutMs: 1_000,
        dispatchClaimedEvent: async (_event, lifecycle) => {
          await lifecycle.onAdopted();
          await settleGate;
        },
      });

      await drain.drainOnce();
      await vi.waitFor(async () => {
        expect(await queue.listClaims()).toEqual([]);
      });
      clock += 60_000;
      await vi.advanceTimersByTimeAsync(60_000);
      // Still only completed — not failed by watchdog.
      const status = await queue.enqueue("evt-long", { text: "x" });
      expect(status.kind).toBe("completed");
      settleResolve();
      await drain.waitForIdle();
      drain.dispose();
    });
  });

  it("supersede tombstones the superseded claim (never re-dispatches)", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("old", { text: "old" }, { laneKey: "shared" });

      const firstLifecycles: ChannelIngressDispatchLifecycle[] = [];
      let firstAdopted = false;
      const dispatches: string[] = [];
      let releaseFirst!: () => void;
      const firstHold = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      const drain = createChannelIngressDrain<Payload>({
        queue,
        shouldSupersedePending: (next, pending) => next.id === "new" && pending.id === "old",
        dispatchClaimedEvent: async (event, lifecycle) => {
          dispatches.push(event.id);
          if (event.id === "old") {
            firstLifecycles.push(lifecycle);
            await firstHold;
            if (lifecycle.abortSignal.aborted) {
              throw new Error("superseded");
            }
            firstAdopted = true;
            await lifecycle.onAdopted();
            return;
          }
          await lifecycle.onAdopted();
        },
      });

      await drain.drainOnce();
      expect(firstLifecycles).toHaveLength(1);
      const firstLifecycle = expectDefined(firstLifecycles[0], "first claimed lifecycle");
      expect(firstLifecycle.abortSignal.aborted).toBe(false);

      await queue.enqueue("new", { text: "new" }, { laneKey: "shared" });
      await drain.drainOnce();
      // Supersede should abort pre-adoption first claim and tombstone it.
      expect(firstLifecycle.abortSignal.aborted).toBe(true);
      releaseFirst();
      await drain.waitForIdle();
      expect(firstAdopted).toBe(false);

      // Superseded event is completed (tombstone), never requeued.
      const oldStatus = await queue.enqueue("old", { text: "old" });
      expect(oldStatus.kind).toBe("completed");
      // New event completed.
      const newStatus = await queue.enqueue("new", { text: "new" });
      expect(newStatus.kind).toBe("completed");

      // Later drain must not re-dispatch the superseded event.
      const third = await drain.drainOnce();
      await drain.waitForIdle();
      expect(third.started).toBe(0);
      expect(dispatches.filter((id) => id === "old")).toHaveLength(1);
      drain.dispose();
    });
  });

  it("does not supersede without predicate", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("a1", { text: "a" }, { laneKey: "lane" });

      let hold!: () => void;
      const gate = new Promise<void>((resolve) => {
        hold = resolve;
      });
      let aborted = false;

      const drain = createChannelIngressDrain<Payload>({
        queue,
        // no shouldSupersedePending
        dispatchClaimedEvent: async (event, lifecycle) => {
          if (event.id === "a1") {
            lifecycle.abortSignal.addEventListener("abort", () => {
              aborted = true;
            });
            await gate;
            await lifecycle.onAdopted();
            return;
          }
          await lifecycle.onAdopted();
        },
      });

      await drain.drainOnce();
      await queue.enqueue("a2", { text: "b" }, { laneKey: "lane" });
      const second = await drain.drainOnce();
      // Lane blocked by active first claim; second not started.
      expect(second.started).toBe(0);
      expect(aborted).toBe(false);
      hold();
      await drain.waitForIdle();
      drain.dispose();
    });
  });

  it("retry-delayed same-lane head blocks later work until eligible or dead-lettered", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1_000;
      const laneKey = "channel:discord-room";
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(
        "retrying-head",
        { text: "ambient backlog head" },
        { laneKey, receivedAt: clock },
      );

      const adopted: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        retryPolicy: {
          maxAttempts: DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS,
          deadLetterMinAgeMs: DEFAULT_INGRESS_RETRY_DEAD_LETTER_MIN_AGE_MS,
          baseMs: 60_000,
          maxMs: 60_000,
        },
        dispatchClaimedEvent: async (event, lifecycle) => {
          if (event.id === "retrying-head" && event.attempts === 0) {
            throw new Error("transient Discord recovery failure");
          }
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual([]);

      clock += 1_000;
      await queue.enqueue(
        "fresh-addressed",
        { text: "@openclaw current diagnostic ask" },
        { laneKey, receivedAt: clock },
      );
      await queue.enqueue(
        "other-lane",
        { text: "unrelated channel work" },
        { laneKey: "channel:other-room", receivedAt: clock + 1 },
      );

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["other-lane"]);
      expect((await queue.listPending({ limit: "all" })).map((event) => event.id)).toEqual([
        "retrying-head",
        "fresh-addressed",
      ]);

      clock += 60_000;
      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["other-lane", "retrying-head"]);
      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["other-lane", "retrying-head", "fresh-addressed"]);
      drain.dispose();
    });

    await withTempState(async (stateDir) => {
      let clock = STALE_AMBIENT_PENDING_MS + 1;
      const laneKey = "channel:discord-room";
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(
        "retrying-stale-head",
        { text: "old room history", kind: "ambient" },
        { laneKey, receivedAt: 0 },
      );
      const firstDrain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        retryPolicy: { baseMs: 60_000, maxMs: 60_000 },
        dispatchClaimedEvent: async () => {
          throw new Error("transient Discord recovery failure");
        },
      });
      expect(await firstDrain.drainOnce()).toEqual({ started: 1 });
      await firstDrain.waitForIdle();
      firstDrain.dispose();

      clock += 1_000;
      await queue.enqueue(
        "fresh-after-dead-letter",
        { text: "@openclaw current diagnostic ask", kind: "addressed" },
        { laneKey, receivedAt: clock },
      );
      const adopted: string[] = [];
      const secondDrain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        retryPolicy: { baseMs: 60_000, maxMs: 60_000 },
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      expect(await secondDrain.drainOnce()).toEqual({ started: 1 });
      await secondDrain.waitForIdle();
      expect(adopted).toEqual(["fresh-after-dead-letter"]);
      expect(await queue.listFailed?.({ limit: "all" })).toMatchObject([
        { id: "retrying-stale-head", reason: "stale-ambient-backlog" },
      ]);
      secondDrain.dispose();
    });
  });

  it("tombstone-fail after handler completed keeps ownership and never re-dispatches", async () => {
    // Failure window: dispatch returns completed (side effects ran) but complete()
    // write fails while phase was still dispatching — must not release for replay.
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("evt-completed-tombstone-fail", { text: "ran" }, { laneKey: "l1" });

      queue.complete = async () => {
        throw new Error("tombstone write failed after dispatch completed");
      };

      const dispatches: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        dispatchClaimedEvent: async (event) => {
          dispatches.push(event.id);
          // Implicit complete path: return completed without calling onAdopted.
          return { kind: "completed" };
        },
      });

      const idle = drain.waitForIdle();
      await drain.drainOnce();
      // 8 = module-private INGRESS_TOMBSTONE_RETRY_MAX_ATTEMPTS (drain tombstone retry bound).
      for (let i = 0; i < 8; i += 1) {
        await vi.advanceTimersByTimeAsync(180_000);
      }
      await idle;

      expect(dispatches).toEqual(["evt-completed-tombstone-fail"]);
      // Claim still held — not released for replay of already-executed work.
      const claims = await queue.listClaims();
      expect(claims.map((claim) => claim.id)).toContain("evt-completed-tombstone-fail");
      expect(drain.activeLaneKeys().has("l1")).toBe(true);

      // Later drain must not re-dispatch the same event.
      await drain.drainOnce();
      await drain.waitForIdle();
      expect(dispatches).toEqual(["evt-completed-tombstone-fail"]);
      drain.dispose();
    });
  });

  it("refreshClaim false aborts the handler mid-dispatch (lease reclaimed)", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue("evt-refresh-false", { text: "x" }, { laneKey: "l1" });

      const refreshClaim = vi.fn(async () => false);
      queue.refreshClaim = refreshClaim;

      let sawAbort = false;
      let lateAdoptError: unknown;
      let releaseDispatch!: () => void;
      const holdDispatch = new Promise<void>((resolve) => {
        releaseDispatch = resolve;
      });

      const claimLeaseMs = 3_000;
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        claimLeaseMs,
        dispatchClaimedEvent: async (_event, lifecycle) => {
          lifecycle.abortSignal.addEventListener(
            "abort",
            () => {
              sawAbort = true;
            },
            { once: true },
          );
          await holdDispatch;
          try {
            await lifecycle.onAdopted();
          } catch (err) {
            lateAdoptError = err;
            throw err;
          }
        },
      });

      await drain.drainOnce();
      clock += 1_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(refreshClaim).toHaveBeenCalled();
      await vi.waitFor(() => expect(sawAbort).toBe(true));

      releaseDispatch();
      await drain.waitForIdle();
      expect(isIngressAdoptionLostError(lateAdoptError)).toBe(true);
      expect(isIngressAdoptionLostError(lateAdoptError) && lateAdoptError.code).toBe("guillotined");
      drain.dispose();
    });
  });

  it("late supersede predicate does not kill an adopted turn", async () => {
    // Failure window: async shouldSupersedePending resolves after the pending
    // handler has already adopted — must revalidate and no-op.
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("old", { text: "old" }, { laneKey: "shared" });

      let releaseOld!: () => void;
      const oldHold = new Promise<void>((resolve) => {
        releaseOld = resolve;
      });
      let releasePredicate!: (value: boolean) => void;
      const predicateHold = new Promise<boolean>((resolve) => {
        releasePredicate = resolve;
      });
      let predicateStarted = false;
      let oldAdopted = false;
      let oldAborted = false;

      const drain = createChannelIngressDrain<Payload>({
        queue,
        shouldSupersedePending: async () => {
          predicateStarted = true;
          return await predicateHold;
        },
        dispatchClaimedEvent: async (event, lifecycle) => {
          if (event.id === "old") {
            lifecycle.abortSignal.addEventListener(
              "abort",
              () => {
                oldAborted = true;
              },
              { once: true },
            );
            await oldHold;
            await lifecycle.onAdopted();
            oldAdopted = true;
            return;
          }
          await lifecycle.onAdopted();
        },
      });

      await drain.drainOnce();
      await queue.enqueue("new", { text: "new" }, { laneKey: "shared" });
      const secondDrain = drain.drainOnce();
      await vi.waitFor(() => expect(predicateStarted).toBe(true));

      // Adopt while the supersede predicate is still pending.
      releaseOld();
      await vi.waitFor(() => expect(oldAdopted).toBe(true));
      releasePredicate(true);
      await secondDrain;
      await drain.waitForIdle();

      expect(oldAborted).toBe(false);
      const again = await queue.enqueue("old", { text: "old" });
      expect(again.kind).toBe("completed");
      drain.dispose();
    });
  });

  it("bindIngressLifecycleToReplyOptions marks exclusive admission", () => {
    const abort = new AbortController();
    const bound = bindIngressLifecycleToReplyOptions({
      abortSignal: abort.signal,
      onAdopted: async () => {},
      onDeferred: () => {},
      onAdoptionFinalizing: () => {},
      onFailed: () => {},
      onAbandoned: () => {},
    });
    expect(bound.turnAdoptionLifecycle.admission).toBe("exclusive");
  });
});
