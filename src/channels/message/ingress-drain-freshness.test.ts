// Durable ingress freshness tests cover lane eligibility and pending disposition races.
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeOpenClawStateDatabaseForTest } from "../../state/openclaw-state-db.js";
import { createChannelIngressDrain } from "./ingress-drain.js";
import {
  createTestIngressQueue,
  type IngressDrainTestPayload as Payload,
  withTempState,
} from "./ingress-drain.test-helpers.js";

type ChannelIngressDispatchLifecycle = Parameters<
  Parameters<typeof createChannelIngressDrain>[0]["dispatchClaimedEvent"]
>[1];

describe("channel ingress freshness", () => {
  afterEach(() => {
    closeOpenClawStateDatabaseForTest();
  });

  it("dispatches an eligible head when only the same-lane tail is retry-delayed", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir, { now: () => 100 });
      await queue.enqueue("head", { text: "head" }, { laneKey: "shared", receivedAt: 1 });
      await queue.enqueue("tail", { text: "tail" }, { laneKey: "shared", receivedAt: 2 });
      const tail = await queue.claim("tail", { ownerId: "retry-worker" });
      if (!tail) {
        throw new Error("Expected the delayed tail claim");
      }
      await queue.release(tail, { lastError: "retry", releasedAt: 100 });

      const dispatched: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => 100,
        retryPolicy: { baseMs: 1_000, maxMs: 1_000, maxAttempts: 8, deadLetterMinAgeMs: 0 },
        dispatchClaimedEvent: async (event, lifecycle) => {
          dispatched.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      await drain.drainOnce();
      await drain.waitForIdle();

      expect(dispatched).toEqual(["head"]);
      expect(await queue.listPending({ limit: "all" })).toMatchObject([{ id: "tail" }]);
      drain.dispose();
    });
  });

  it("fails a stale head and then dispatches the same-lane tail", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir, { now: () => 10_000 });
      await queue.enqueue("stale", { text: "stale" }, { laneKey: "shared", receivedAt: 1 });
      await queue.enqueue("fresh", { text: "fresh" }, { laneKey: "shared", receivedAt: 2 });
      const receipts: string[] = [];
      const dispatched: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => 10_000,
        dispatchClaimedEvent: async (event, lifecycle) => {
          dispatched.push(event.id);
          await lifecycle.onAdopted();
        },
        resolvePendingDisposition: (event) =>
          event.id === "stale"
            ? {
                kind: "fail",
                reason: "stale-ambient-backlog",
                message: "stale ingress row",
              }
            : null,
        onPendingDispositionCommitted: (_event, disposition) => {
          receipts.push(disposition.reason);
        },
      });

      await drain.drainOnce();
      await drain.waitForIdle();

      expect(dispatched).toEqual(["fresh"]);
      expect(receipts).toEqual(["stale-ambient-backlog"]);
      expect(await queue.listFailed?.({ limit: "all" })).toMatchObject([
        { id: "stale", reason: "stale-ambient-backlog" },
      ]);
      drain.dispose();
    });
  });

  it("fences a pending-disposition CAS loss until the next drain pass", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir, { now: () => 10_000 });
      await queue.enqueue("stale", { text: "stale" }, { laneKey: "shared", receivedAt: 1 });
      await queue.enqueue("fresh", { text: "fresh" }, { laneKey: "shared", receivedAt: 2 });
      const originalFail = queue.fail.bind(queue);
      let failCalls = 0;
      queue.fail = async (...args) => {
        failCalls += 1;
        if (failCalls === 1) {
          return false;
        }
        return await originalFail(...args);
      };
      const dispatched: string[] = [];
      const dispatch = vi.fn(
        async (event: { id: string }, lifecycle: ChannelIngressDispatchLifecycle) => {
          dispatched.push(event.id);
          await lifecycle.onAdopted();
        },
      );
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => 10_000,
        dispatchClaimedEvent: dispatch,
        resolvePendingDisposition: (event) =>
          event.id === "stale"
            ? { kind: "fail", reason: "stale-ambient-backlog", message: "stale ingress row" }
            : null,
      });

      await drain.drainOnce();
      await drain.waitForIdle();
      expect(dispatched).toEqual([]);
      expect(await queue.listPending({ limit: "all" })).toMatchObject([
        { id: "stale" },
        { id: "fresh" },
      ]);

      await drain.drainOnce();
      await drain.waitForIdle();
      expect(dispatched).toEqual(["fresh"]);
      expect(dispatch).toHaveBeenCalledOnce();
      drain.dispose();
    });
  });
});
