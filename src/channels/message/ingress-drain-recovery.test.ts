import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeOpenClawStateDatabaseForTest } from "../../state/openclaw-state-db.js";
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
import {
  DEFAULT_INGRESS_RETRY_DEAD_LETTER_MIN_AGE_MS,
  DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS,
} from "./ingress-retry-policy.js";

describe("channel ingress drain recovery boundaries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    closeOpenClawStateDatabaseForTest();
  });

  it("dead-letter needs both attempt floor and age (releases when age insufficient)", async () => {
    await withTempState(async (stateDir) => {
      const receivedAt = 100;
      let clock = receivedAt;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue("poison", { text: "x" }, { laneKey: "l", receivedAt });

      // Burn attempts without aging past the gate.
      for (let i = 0; i < DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS; i += 1) {
        clock += 1;
        const drain = createChannelIngressDrain<Payload>({
          queue,
          now: () => clock,
          retryPolicy: {
            maxAttempts: DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS,
            deadLetterMinAgeMs: DEFAULT_INGRESS_RETRY_DEAD_LETTER_MIN_AGE_MS,
            baseMs: 0,
            maxMs: 0,
          },
          dispatchClaimedEvent: async () => {
            throw new Error("still broken");
          },
        });
        await drain.drainOnce();
        await drain.waitForIdle();
        drain.dispose();
      }

      const pending = await queue.listPending({ limit: "all" });
      expect(pending).toHaveLength(1);
      expect(pending[0]?.attempts).toBeGreaterThanOrEqual(DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS);

      // Age past the gate → next failure dead-letters.
      clock = receivedAt + DEFAULT_INGRESS_RETRY_DEAD_LETTER_MIN_AGE_MS;
      const finalDrain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        retryPolicy: {
          maxAttempts: DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS,
          deadLetterMinAgeMs: DEFAULT_INGRESS_RETRY_DEAD_LETTER_MIN_AGE_MS,
          baseMs: 0,
          maxMs: 0,
        },
        dispatchClaimedEvent: async () => {
          throw new Error("still broken");
        },
      });
      await finalDrain.drainOnce();
      await finalDrain.waitForIdle();
      const status = await queue.enqueue("poison", { text: "x" });
      expect(status.kind).toBe("failed");
      if (status.kind === "failed") {
        expect(status.record.reason).toBe("retry-limit-exceeded");
      }
      finalDrain.dispose();
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
      const drain = createChannelIngressDrain<Payload>({
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

      const drain = createChannelIngressDrain<Payload>({
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
      const drain = createChannelIngressDrain<Payload>({
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
      const drain = createChannelIngressDrain<Payload>({
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

      const first = createChannelIngressDrain<Payload>({
        queue,
        abortSignal: firstAbort.signal,
        dispatchClaimedEvent: async (event, lifecycle) => {
          firstDispatches.push(event.id);
          await firstHold;
          await lifecycle.onAdopted();
        },
      });
      const second = createChannelIngressDrain<Payload>({
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
      await queue.enqueue("evt-reclaim", { text: "x" }, { laneKey: "l1" });

      queue.complete = async () => false;

      let adoptError: unknown;
      const drain = createChannelIngressDrain<Payload>({
        queue,
        dispatchClaimedEvent: async (_event, lifecycle) => {
          try {
            await lifecycle.onAdopted();
          } catch (err) {
            adoptError = err;
            throw err;
          }
        },
      });

      await drain.drainOnce();
      await drain.waitForIdle();
      expect(isIngressAdoptionLostError(adoptError)).toBe(true);
      expect(isIngressAdoptionLostError(adoptError) && adoptError.code).toBe("reclaimed");
      // Claim remains held — not settled as a false success.
      expect(drain.activeLaneKeys().has("l1")).toBe(true);
      drain.dispose();
    });
  });

  it("exports default adoption stall matching Telegram product default", () => {
    expect(DEFAULT_INGRESS_ADOPTION_STALL_MS).toBe(5 * 60 * 1000);
  });
});
