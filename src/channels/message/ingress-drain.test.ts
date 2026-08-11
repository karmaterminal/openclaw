// Durable ingress drain contract tests for lifecycle reliability invariants.
import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeOpenClawStateDatabaseForTest,
  openOpenClawStateDatabase,
} from "../../state/openclaw-state-db.js";
import type { ChannelIngressDispatchLifecycle } from "./ingress-drain-state.js";
import {
  bindIngressLifecycleToReplyOptions,
  createChannelIngressDrain,
  DEFAULT_INGRESS_ADOPTION_STALL_MS,
  isIngressAdoptionLostError,
} from "./ingress-drain.js";
import {
  createTestIngressQueue,
  type IngressDrainTestPayload as Payload,
  withTempState,
} from "./ingress-drain.test-helpers.js";

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
      const drain = createChannelIngressDrain({
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
      const drain = createChannelIngressDrain({ queue, dispatchClaimedEvent: dispatch });

      expect(await drain.drainOnce()).toEqual({ started: 1, settled: expect.any(Number) });
      await drain.waitForIdle();
      expect(await drain.drainOnce()).toEqual({ started: 0, settled: expect.any(Number) });
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

      const drain = createChannelIngressDrain({
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

      const drain = createChannelIngressDrain({
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
        const drain = createChannelIngressDrain({
          queue,
          ...(occupancy === "release" ? { deferredLaneOccupancy: occupancy } : {}),
          dispatchClaimedEvent: async (_event, lifecycle) => {
            lifecycles.push(lifecycle);
            return { kind: "deferred" };
          },
        });
        expect(await drain.drainOnce()).toEqual({ started: 1, settled: expect.any(Number) });
        await vi.waitFor(() => expect(lifecycles).toHaveLength(1));
        expect(drain.activeLaneKeys().has("shared")).toBe(occupancy === "hold");

        await queue.enqueue("second", { text: "second" }, { laneKey: "shared" });
        expect(await drain.drainOnce()).toEqual({
          started: occupancy === "hold" ? 0 : 1,
          settled: expect.any(Number),
        });
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
      const drain = createChannelIngressDrain({
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
      const drain = createChannelIngressDrain({
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
      expect(await drain.drainOnce()).toEqual({ started: 0, settled: expect.any(Number) });
      clock += 1_000;
      expect(await drain.drainOnce()).toEqual({ started: 1, settled: expect.any(Number) });
      drain.dispose();
    });
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir, { now: () => 10_000 });
      await queue.enqueue("non-retryable", { text: "x" }, { laneKey: "one", receivedAt: 1 });
      await queue.enqueue("retry-limit", { text: "x" }, { laneKey: "two", receivedAt: 1 });
      const lifecycles = new Map<string, ChannelIngressDispatchLifecycle>();
      const drain = createChannelIngressDrain({
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

      expect(await drain.drainOnce()).toEqual({ started: 2, settled: expect.any(Number) });
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
      const first = createChannelIngressDrain({
        queue,
        deferredLaneOccupancy: "release",
        dispatchClaimedEvent: async (_event, lifecycle) => {
          lifecycle.abortSignal.addEventListener("abort", () => {
            aborted = true;
          });
          return { kind: "deferred" };
        },
      });
      const second = createChannelIngressDrain({
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
      const drain = createChannelIngressDrain({
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

      const drain = createChannelIngressDrain({
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
      const drain = createChannelIngressDrain({
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

      const drain = createChannelIngressDrain({
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

      const drain = createChannelIngressDrain({
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

      const drain = createChannelIngressDrain({
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

      const drain = createChannelIngressDrain({
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

      const drain = createChannelIngressDrain({
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

  it("bindIngressLifecycleToReplyOptions returns only turnAdoptionLifecycle", async () => {
    const abort = new AbortController();
    const calls: string[] = [];
    const bound = bindIngressLifecycleToReplyOptions({
      abortSignal: abort.signal,
      onAdoptionFinalizing: () => {
        calls.push("finalizing");
      },
      onFailed: () => {
        calls.push("failed");
      },
      onAdopted: () => {
        calls.push("adopted");
      },
      onDeferred: () => {
        calls.push("deferred");
      },
      onAbandoned: () => {
        calls.push("abandoned");
      },
    });
    expect(bound.turnAdoptionLifecycle.abortSignal).toBe(abort.signal);
    expect(bound.turnAdoptionLifecycle.admission).toBe("exclusive");
    expect("onFailed" in bound.turnAdoptionLifecycle).toBe(false);
    expect("onAdopted" in bound).toBe(false);
    expect(Object.keys(bound)).toEqual(["turnAdoptionLifecycle"]);
    bound.turnAdoptionLifecycle.onDeferred();
    await bound.turnAdoptionLifecycle.onAbandoned();
    expect(calls).toEqual(["deferred", "abandoned"]);
    calls.length = 0;
    bound.turnAdoptionLifecycle.onDeferred();
    await bound.turnAdoptionLifecycle.onAdopted();
    expect(calls).toEqual(["deferred", "adopted"]);
  });

  it("refreshes active claims on claimLeaseMs/3 while deferred", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue("evt-refresh", { text: "x" }, { laneKey: "l1" });

      const refreshClaim = vi.fn(async () => true);
      queue.refreshClaim = refreshClaim;

      const lifecycleCaptures: ChannelIngressDispatchLifecycle[] = [];

      const claimLeaseMs = 3_000;
      const drain = createChannelIngressDrain({
        queue,
        now: () => clock,
        claimLeaseMs,
        dispatchClaimedEvent: async (_event, lifecycle) => {
          lifecycleCaptures.push(lifecycle);
          return { kind: "deferred" };
        },
      });

      await drain.drainOnce();
      await vi.waitFor(() => {
        expect(lifecycleCaptures).toHaveLength(1);
      });
      const lifecycleRef = expectDefined(lifecycleCaptures[0], "heartbeat lifecycle");
      expect(refreshClaim).not.toHaveBeenCalled();

      clock += 1_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(refreshClaim).toHaveBeenCalledTimes(1);
      expect(refreshClaim).toHaveBeenCalledWith(expect.anything(), { refreshedAt: clock });

      clock += 1_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(refreshClaim).toHaveBeenCalledTimes(2);

      await lifecycleRef.onAdopted();
      await drain.waitForIdle();
      const callsAfterAdopt = refreshClaim.mock.calls.length;
      clock += 5_000;
      await vi.advanceTimersByTimeAsync(5_000);
      expect(refreshClaim).toHaveBeenCalledTimes(callsAfterAdopt);
      drain.dispose();
    });
  });

  it("throws IngressAdoptionLostError when onAdopted races supersede", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("old", { text: "old" }, { laneKey: "shared" });

      const lifecycles: ChannelIngressDispatchLifecycle[] = [];
      let releaseOld!: () => void;
      const oldHold = new Promise<void>((resolve) => {
        releaseOld = resolve;
      });
      let lateAdoptError: unknown;

      const drain = createChannelIngressDrain({
        queue,
        shouldSupersedePending: () => true,
        dispatchClaimedEvent: async (event, lifecycle) => {
          if (event.id === "old") {
            lifecycles.push(lifecycle);
            await oldHold;
            try {
              await lifecycle.onAdopted();
            } catch (err) {
              lateAdoptError = err;
              throw err;
            }
            return;
          }
          await lifecycle.onAdopted();
        },
      });

      await drain.drainOnce();
      await queue.enqueue("new", { text: "new" }, { laneKey: "shared" });
      await drain.drainOnce();
      releaseOld();
      await drain.waitForIdle();

      expect(isIngressAdoptionLostError(lateAdoptError)).toBe(true);
      expect(isIngressAdoptionLostError(lateAdoptError) && lateAdoptError.code).toBe("superseded");
      drain.dispose();
    });
  });

  it("retries tombstone complete failures then commits", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("evt-tombstone", { text: "x" }, { laneKey: "l1" });

      let completeAttempts = 0;
      const originalComplete = queue.complete.bind(queue);
      queue.complete = async (claim) => {
        completeAttempts += 1;
        if (completeAttempts <= 2) {
          throw new Error(`transient complete failure ${completeAttempts}`);
        }
        return await originalComplete(claim);
      };

      const logs: string[] = [];
      const drain = createChannelIngressDrain({
        queue,
        onLog: (message) => logs.push(message),
        dispatchClaimedEvent: async (_event, lifecycle) => {
          await lifecycle.onAdopted();
        },
      });

      const idle = drain.waitForIdle();
      await drain.drainOnce();
      // Advance through two backoff sleeps (1s, 2s with base 1000).
      await vi.advanceTimersByTimeAsync(5_000);
      await idle;
      expect(completeAttempts).toBe(3);
      expect(logs.some((line) => line.includes("tombstone retry"))).toBe(true);
      const again = await queue.enqueue("evt-tombstone", { text: "x" });
      expect(again.kind).toBe("completed");
      drain.dispose();
    });
  });

  it("holds claim ownership when tombstone complete keeps failing", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("evt-wedge", { text: "x" }, { laneKey: "l1" });

      queue.complete = async () => {
        throw new Error("persistent complete failure");
      };

      const logs: string[] = [];
      const drain = createChannelIngressDrain({
        queue,
        onLog: (message) => logs.push(message),
        dispatchClaimedEvent: async (_event, lifecycle) => {
          await lifecycle.onAdopted();
        },
      });

      const idle = drain.waitForIdle();
      await drain.drainOnce();
      // Exhaust bounded tombstone retries (sum of exponential backoff).
      // 8 = module-private INGRESS_TOMBSTONE_RETRY_MAX_ATTEMPTS (drain tombstone retry bound).
      for (let i = 0; i < 8; i += 1) {
        await vi.advanceTimersByTimeAsync(180_000);
      }
      await idle;
      expect(logs.some((line) => line.includes("holding claim"))).toBe(true);
      // Claim still held — not released for replay of an already-executed turn.
      const claims = await queue.listClaims();
      expect(claims.map((claim) => claim.id)).toContain("evt-wedge");
      // Active lane still blocks re-claim of the same event.
      expect(drain.activeLaneKeys().has("l1")).toBe(true);
      drain.dispose();
    });
  });

  it("does not steal live peer-drain claims; recovers after owner abort", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("evt-peer", { text: "x" }, { laneKey: "l1" });

      let releaseFirst!: () => void;
      const firstHold = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      const firstDispatches: string[] = [];
      const secondDispatches: string[] = [];
      const firstAbort = new AbortController();

      const first = createChannelIngressDrain({
        queue,
        abortSignal: firstAbort.signal,
        dispatchClaimedEvent: async (event, lifecycle) => {
          firstDispatches.push(event.id);
          await firstHold;
          await lifecycle.onAdopted();
        },
      });
      const second = createChannelIngressDrain({
        queue,
        dispatchClaimedEvent: async (event, lifecycle) => {
          secondDispatches.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      await first.drainOnce();
      expect(firstDispatches).toEqual(["evt-peer"]);

      // Live peer must not steal the in-flight claim.
      const stealAttempt = await second.recoverStaleClaims();
      expect(stealAttempt).toBe(0);
      await second.drainOnce();
      expect(secondDispatches).toEqual([]);

      firstAbort.abort();
      // Aborted owners retire before an uncooperative handler returns, allowing
      // the replacement drain to recover under the claim-token fence.
      const recovered = await second.recoverStaleClaims();
      expect(recovered).toBeGreaterThanOrEqual(1);
      await second.drainOnce();
      await second.waitForIdle();
      expect(secondDispatches).toEqual(["evt-peer"]);
      releaseFirst();
      await first.waitForIdle();
      first.dispose();
      second.dispose();
    });
  });

  it("throws IngressAdoptionLostError when complete returns false (lease reclaimed)", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("evt-reclaim", { text: "x" }, { laneKey: "l1", receivedAt: 1 });
      await queue.enqueue("evt-tail", { text: "tail" }, { laneKey: "l1", receivedAt: 2 });

      // Simulate peer reclaim of the head token: first complete loses CAS once.
      const originalComplete = queue.complete.bind(queue);
      let rejectNextComplete = true;
      queue.complete = async (idOrClaim, options) => {
        const id = typeof idOrClaim === "string" ? idOrClaim : idOrClaim.id;
        if (rejectNextComplete && id === "evt-reclaim") {
          rejectNextComplete = false;
          return false;
        }
        return await originalComplete(idOrClaim, options);
      };

      let adoptError: unknown;
      const first = createChannelIngressDrain({
        queue,
        ownerId: "first-owner",
        startLimit: 1,
        dispatchClaimedEvent: async (_event, lifecycle) => {
          try {
            await lifecycle.onAdopted();
          } catch (err) {
            adoptError = err;
            throw err;
          }
        },
      });

      await first.drainOnce();
      await first.waitForIdle();
      expect(isIngressAdoptionLostError(adoptError)).toBe(true);
      expect(isIngressAdoptionLostError(adoptError) && adoptError.code).toBe("reclaimed");
      // Definitive token loss retires local ownership so the lane is not wedged.
      expect(first.activeLaneKeys().has("l1")).toBe(false);
      expect((await queue.listClaims()).map((claim) => claim.id)).toEqual(["evt-reclaim"]);
      // startLimit=1 leaves the same-lane tail pending under the fenced head claim.
      expect((await queue.listPending({ limit: "all" })).map((event) => event.id)).toEqual([
        "evt-tail",
      ]);

      first.dispose();
      const secondDispatches: string[] = [];
      const second = createChannelIngressDrain({
        queue,
        ownerId: "second-owner",
        startLimit: 4,
        dispatchClaimedEvent: async (event, lifecycle) => {
          secondDispatches.push(event.id);
          await lifecycle.onAdopted();
        },
      });
      // Peer fencing while first was active already covered above (claim stayed first-owned).
      const recovered = await second.recoverStaleClaims();
      expect(recovered).toBeGreaterThanOrEqual(1);
      await second.drainOnce();
      await second.waitForIdle();
      // Same-lane tail waits for the recovered head to settle, then progresses once.
      await second.drainOnce();
      await second.waitForIdle();
      expect(secondDispatches).toEqual(["evt-reclaim", "evt-tail"]);
      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      expect(await queue.listClaims()).toEqual([]);
      for (const id of ["evt-reclaim", "evt-tail"]) {
        const replay = await queue.enqueue(id, { text: "probe" });
        expect(replay).toMatchObject({ kind: "completed", duplicate: true });
      }
      second.dispose();
    });
  });

  it("steer-style swallowed adoption loss still frees the lane before heartbeat", async () => {
    await withTempState(async (stateDir) => {
      // claimLeaseMs far larger than the test window so progress cannot rely on heartbeat.
      const claimLeaseMs = 10 * 60 * 1000;
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("evt-head", { text: "head" }, { laneKey: "lane-steer", receivedAt: 1 });
      await queue.enqueue("evt-tail", { text: "tail" }, { laneKey: "lane-steer", receivedAt: 2 });

      const originalComplete = queue.complete.bind(queue);
      let rejectHeadComplete = true;
      queue.complete = async (idOrClaim, options) => {
        const id = typeof idOrClaim === "string" ? idOrClaim : idOrClaim.id;
        if (rejectHeadComplete && id === "evt-head") {
          rejectHeadComplete = false;
          // Peer already won the durable race and tombstoned the head under a
          // different claim token before this owner's complete CAS ran.
          const database = openOpenClawStateDatabase({
            env: { OPENCLAW_STATE_DIR: stateDir },
          });
          database.db
            .prepare(
              `UPDATE channel_ingress_events
               SET status = 'completed',
                   completed_at = 1,
                   payload_json = 'null',
                   metadata_json = NULL,
                   claim_token = NULL,
                   claim_owner = NULL,
                   claimed_at = NULL,
                   updated_at = 1
               WHERE event_id = ? AND status = 'claimed'`,
            )
            .run("evt-head");
          return false;
        }
        return await originalComplete(idOrClaim, options);
      };

      const dispatches: string[] = [];
      const drain = createChannelIngressDrain({
        queue,
        ownerId: "steer-owner",
        startLimit: 4,
        claimLeaseMs,
        // No timers advanced — lane free must not depend on lease refresh reclaim.
        dispatchClaimedEvent: async (event, lifecycle) => {
          dispatches.push(event.id);
          // Production steer path: catch adoption loss and return completed/stop
          // without rethrowing into outer drain cleanup.
          try {
            await lifecycle.onAdopted();
          } catch (error) {
            if (isIngressAdoptionLostError(error)) {
              return { kind: "completed" };
            }
            throw error;
          }
          return { kind: "completed" };
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1, settled: expect.any(Number) });
      await drain.waitForIdle();
      expect(dispatches).toEqual(["evt-head"]);
      // Lifecycle owner must have retired the lane despite the swallowed error.
      expect(drain.activeLaneKeys().has("lane-steer")).toBe(false);
      expect((await queue.listClaims()).map((claim) => claim.id)).toEqual([]);
      expect((await queue.listPending({ limit: "all" })).map((event) => event.id)).toEqual([
        "evt-tail",
      ]);

      // Immediate same-lane progress on the next pump (no heartbeat/timer advance).
      expect(await drain.drainOnce()).toEqual({ started: 1, settled: expect.any(Number) });
      await drain.waitForIdle();
      expect(dispatches).toEqual(["evt-head", "evt-tail"]);
      expect(drain.activeLaneKeys().size).toBe(0);
      drain.dispose();
    });
  });

  it("real peer recovery fences stale owner callbacks and progresses same-lane tail after settlement", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue("evt-head", { text: "head" }, { laneKey: "l1", receivedAt: 1 });
      await queue.enqueue("evt-tail", { text: "tail" }, { laneKey: "l1", receivedAt: 2 });

      let firstClaimed!: { id: string; claim: { token: string } };
      let releaseFirstDispatch!: () => void;
      const firstDispatchHold = new Promise<void>((resolve) => {
        releaseFirstDispatch = resolve;
      });

      const first = createChannelIngressDrain({
        queue,
        ownerId: "first-owner",
        startLimit: 1,
        claimLeaseMs: 1_000,
        now: () => clock,
        dispatchClaimedEvent: async (event, _lifecycle) => {
          firstClaimed = event;
          // Stay in dispatching without adopting so recovery can reclaim the lease.
          await firstDispatchHold;
          return { kind: "deferred" };
        },
      });
      await first.drainOnce();
      // Allow deferred registration to settle.
      await vi.waitFor(async () => {
        expect((await queue.listClaims()).map((claim) => claim.id)).toEqual(["evt-head"]);
      });
      expect(firstClaimed.id).toBe("evt-head");
      expect((await queue.listPending({ limit: "all" })).map((row) => row.id)).toEqual([
        "evt-tail",
      ]);

      // Expire the first owner's lease while it is still claimed, then peer-recover.
      clock += 5_000;
      // Retire live local ownership so recovery is not fenced by the first instance.
      first.dispose();
      releaseFirstDispatch();
      await first.waitForIdle();

      const peerDispatches: string[] = [];
      let releasePeerSettle!: () => void;
      const peerSettleHold = new Promise<void>((resolve) => {
        releasePeerSettle = resolve;
      });
      const peer = createChannelIngressDrain({
        queue,
        ownerId: "peer-owner",
        startLimit: 4,
        claimLeaseMs: 1_000,
        now: () => clock,
        dispatchClaimedEvent: async (event, lifecycle) => {
          peerDispatches.push(event.id);
          if (event.id === "evt-head") {
            await peerSettleHold;
          }
          await lifecycle.onAdopted();
        },
      });
      // Claim may already be pending if dispose released it; either path yields peer ownership.
      await peer.recoverStaleClaims();
      await peer.drainOnce();
      expect(peerDispatches).toEqual(["evt-head"]);
      const peerClaims = await queue.listClaims();
      expect(peerClaims).toHaveLength(1);
      expect(peerClaims[0]?.claim.token).not.toBe(firstClaimed.claim.token);

      // Stale first-owner callbacks must not mutate peer-owned durable state.
      expect(await queue.refreshClaim?.(firstClaimed)).toBe(false);
      expect(await queue.complete(firstClaimed)).toBe(false);
      expect(await queue.release(firstClaimed, { recordAttempt: false })).toBe(false);
      expect(await queue.fail(firstClaimed, { reason: "stale-owner" })).toBe(false);
      expect((await queue.listClaims())[0]?.claim.token).toBe(peerClaims[0]?.claim.token);
      expect((await queue.listPending({ limit: "all" })).map((row) => row.id)).toEqual([
        "evt-tail",
      ]);

      // Peer settles the head; same-lane tail progresses only after that settlement.
      releasePeerSettle();
      await peer.waitForIdle();
      expect(peerDispatches).toEqual(["evt-head"]);
      await peer.drainOnce();
      await peer.waitForIdle();
      expect(peerDispatches).toEqual(["evt-head", "evt-tail"]);
      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      expect(await queue.listClaims()).toEqual([]);
      peer.dispose();
    });
  });

  it("exports default adoption stall matching Telegram product default", () => {
    expect(DEFAULT_INGRESS_ADOPTION_STALL_MS).toBe(5 * 60 * 1000);
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
      const drain = createChannelIngressDrain({
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
      const drain = createChannelIngressDrain({
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

      const drain = createChannelIngressDrain({
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
