// Pending-disposition drain tests cover multi-drain CAS fencing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeOpenClawStateDatabaseForTest } from "../../state/openclaw-state-db.js";
import { createChannelIngressDrain } from "./ingress-drain.js";
import {
  createTestIngressQueue,
  type IngressDrainTestPayload as Payload,
  withTempState,
} from "./ingress-drain.test-helpers.js";
import type { ChannelIngressQueueRecord } from "./ingress-queue.js";

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

describe("channel ingress pending disposition drain", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    closeOpenClawStateDatabaseForTest();
  });

  it("keeps a failed pending-disposition race lane-fenced while unrelated lanes progress", async () => {
    await withTempState(async (stateDir) => {
      const laneKey = "channel:discord-room";
      const clock = STALE_AMBIENT_PENDING_MS + 1;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(
        "stale-ambient",
        { text: "old room history", kind: "ambient" },
        { laneKey, receivedAt: 0 },
      );
      await queue.enqueue(
        "fresh-addressed",
        { text: "@openclaw current diagnostic ask", kind: "addressed" },
        { laneKey, receivedAt: clock },
      );
      await queue.enqueue(
        "other-lane",
        { text: "unrelated channel work", kind: "addressed" },
        { laneKey: "channel:other-room", receivedAt: clock + 1 },
      );

      const fail = queue.fail.bind(queue);
      let raceInjected = false;
      const siblingDrain = createChannelIngressDrain<Payload>({
        queue,
        ownerId: "sibling-drain",
        startLimit: 1,
        dispatchClaimedEvent: async () => ({
          kind: "failed-retryable",
          error: new Error("sibling released before disposition CAS"),
        }),
      });
      queue.fail = vi.fn(async (...args: Parameters<typeof queue.fail>) => {
        if (!raceInjected && args[0] === "stale-ambient") {
          raceInjected = true;
          expect(await siblingDrain.drainOnce()).toEqual({ started: 1 });
          await siblingDrain.waitForIdle();
          return false;
        }
        return await fail(...args);
      });

      const adopted: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        startLimit: 2,
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["other-lane"]);
      expect((await queue.listPending({ limit: "all" })).map((event) => event.id)).toEqual([
        "stale-ambient",
        "fresh-addressed",
      ]);

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["other-lane", "fresh-addressed"]);
      expect(await queue.listFailed?.({ limit: "all" })).toMatchObject([
        { id: "stale-ambient", reason: "stale-ambient-backlog" },
      ]);
      siblingDrain.dispose();
      drain.dispose();
    });
  });
});
