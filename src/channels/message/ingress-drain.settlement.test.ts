// Terminal settlement contract tests for durable ingress drain: how completion
// tombstones commit, and how a handled policy outcome differs from a dead
// letter. Split from `ingress-drain.test.ts` to keep both files within the repo
// max-lines budget; lifecycle/adoption invariants stay in the original.
import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeOpenClawStateDatabaseForTest } from "../../state/openclaw-state-db.js";
import type { ChannelIngressDispatchLifecycle } from "./ingress-drain-state.js";
import { createChannelIngressDrain } from "./ingress-drain.js";
import {
  createTestIngressQueue,
  type IngressDrainTestPayload as Payload,
  withTempState,
} from "./ingress-drain.test-helpers.js";
import { countFailedChannelIngressQueueEntries } from "./ingress-queue.js";

describe("channel ingress drain settlement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    closeOpenClawStateDatabaseForTest();
  });

  it("settles a channel-handled outcome as a completion the operator surfaces ignore", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir, { now: () => 10_000 });
      const fail = vi.spyOn(queue, "fail");
      await queue.enqueue("handled", { text: "x" }, { laneKey: "one", receivedAt: 1 });
      await queue.enqueue("dead-letter", { text: "x" }, { laneKey: "two", receivedAt: 1 });
      const lifecycles = new Map<string, ChannelIngressDispatchLifecycle>();
      const logs: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => 10_000,
        deferredLaneOccupancy: "release",
        onLog: (message) => logs.push(message),
        resolveNonRetryableFailure: (error) =>
          error instanceof Error && error.message === "policy drop"
            ? { reason: "channel-policy", message: error.message, settlement: "handled" }
            : { reason: "invalid-input", message: "fatal input" },
        dispatchClaimedEvent: async (event, lifecycle) => {
          lifecycles.set(event.id, lifecycle);
          return { kind: "deferred" };
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 2 });
      await vi.waitFor(() => expect(lifecycles.size).toBe(2));
      await expectDefined(
        expectDefined(lifecycles.get("handled"), "handled lifecycle").onFailed,
        "handled failure lifecycle",
      )(new Error("policy drop"));
      await expectDefined(
        expectDefined(lifecycles.get("dead-letter"), "dead-letter lifecycle").onFailed,
        "dead-letter failure lifecycle",
      )(new Error("broken"));

      // Only the genuine failure reaches the dead-letter surface that doctor and
      // delivery-queue health count; the handled outcome is a completed tombstone.
      expect(await queue.listFailed?.({ limit: "all" })).toMatchObject([
        { id: "dead-letter", reason: "invalid-input" },
      ]);
      expect(countFailedChannelIngressQueueEntries(stateDir)).toMatchObject([{ count: 1 }]);
      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      expect(fail.mock.calls.map(([idOrClaim]) => idOrClaim)).not.toContainEqual(
        expect.objectContaining({ id: "handled" }),
      );
      expect(logs.some((message) => message.includes("channel-policy"))).toBe(false);
      drain.dispose();
    });
  });

  it("holds the claim when a handled settlement's completion write keeps failing", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      const fail = vi.spyOn(queue, "fail");
      const release = vi.spyOn(queue, "release");
      await queue.enqueue("handled-wedged", { text: "x" }, { laneKey: "l1" });

      let completeAttempts = 0;
      queue.complete = async () => {
        completeAttempts += 1;
        throw new Error("durable tombstone unavailable");
      };

      const logs: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        onLog: (message) => logs.push(message),
        resolveNonRetryableFailure: (error) =>
          error instanceof Error && error.message === "policy drop"
            ? { reason: "channel-policy", message: error.message, settlement: "handled" }
            : null,
        // Reviewer's shape: a returned failed-retryable result settles while the
        // state is still pre-adoption, so the handled branch must fence itself.
        dispatchClaimedEvent: async () => ({
          kind: "failed-retryable" as const,
          error: new Error("policy drop"),
        }),
      });

      const idle = drain.waitForIdle();
      await drain.drainOnce();
      await vi.advanceTimersByTimeAsync(200_000);
      await idle;

      expect(completeAttempts).toBe(8);
      // A wedged tombstone must never convert a terminal policy drop into a
      // dead letter or a redelivery; the claim stays held for recovery.
      expect(fail).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      expect((await queue.listClaims()).map((claim) => claim.id)).toEqual(["handled-wedged"]);
      expect(logs.some((line) => line.includes("holding claim"))).toBe(true);
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
});
