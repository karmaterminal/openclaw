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

describe("channel ingress drain stale backlog ordering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    closeOpenClawStateDatabaseForTest();
  });

  it("red: stale Discord ambient backlog is not adopted before a fresh addressed event", async () => {
    await withTempState(async (stateDir) => {
      const laneKey = "channel:discord-room";
      const thirteenHoursMs = 13 * 60 * 60 * 1_000;
      const clock = thirteenHoursMs;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(
        "stale-ambient",
        { text: "ambient room history", kind: "ambient" },
        { laneKey, receivedAt: clock - thirteenHoursMs },
      );
      await queue.enqueue(
        "fresh-addressed",
        { text: "@openclaw current diagnostic ask", kind: "addressed" },
        { laneKey, receivedAt: clock },
      );

      const adopted: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        startLimit: 1,
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["fresh-addressed"]);
      expect((await queue.listPending({ limit: "all" })).map((event) => event.id)).not.toContain(
        "fresh-addressed",
      );
      expect(await queue.listFailed?.({ limit: "all" })).toMatchObject([
        { id: "stale-ambient", reason: "stale-ambient-backlog" },
      ]);
      drain.dispose();
    });
  });

  it("active same-lane ownership still blocks while unrelated lanes progress", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("active", { text: "active" }, { laneKey: "shared", receivedAt: 1 });

      let releaseActive!: () => void;
      const activeGate = new Promise<void>((resolve) => {
        releaseActive = resolve;
      });
      const adopted: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          if (event.id === "active") {
            await activeGate;
          }
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await vi.waitFor(() => expect(adopted).toEqual(["active"]));
      await queue.enqueue("same-lane", { text: "same" }, { laneKey: "shared", receivedAt: 2 });
      expect(await drain.drainOnce()).toEqual({ started: 0 });

      await queue.enqueue("other-lane", { text: "other" }, { laneKey: "other", receivedAt: 3 });
      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await vi.waitFor(() => expect(adopted).toEqual(["active", "other-lane"]));

      releaseActive();
      await drain.waitForIdle();
      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["active", "other-lane", "same-lane"]);
      drain.dispose();
    });
  });

  it("stale addressed work is preserved instead of silently dispositioned", async () => {
    await withTempState(async (stateDir) => {
      const laneKey = "channel:discord-room";
      const clock = STALE_AMBIENT_PENDING_MS + 1;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(
        "stale-addressed",
        { text: "@openclaw old but direct", kind: "addressed" },
        { laneKey, receivedAt: 0 },
      );
      await queue.enqueue(
        "fresh-addressed",
        { text: "@openclaw current", kind: "addressed" },
        { laneKey, receivedAt: clock },
      );

      const adopted: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        startLimit: 1,
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["stale-addressed"]);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      expect((await queue.listPending({ limit: "all" })).map((event) => event.id)).toEqual([
        "fresh-addressed",
      ]);
      drain.dispose();
    });
  });

  it("fresh ambient same-lane FIFO remains stable", async () => {
    await withTempState(async (stateDir) => {
      const laneKey = "channel:discord-room";
      const clock = STALE_AMBIENT_PENDING_MS;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(
        "ambient-1",
        { text: "fresh room history 1", kind: "ambient" },
        { laneKey, receivedAt: 0 },
      );
      await queue.enqueue(
        "ambient-2",
        { text: "fresh room history 2", kind: "ambient" },
        { laneKey, receivedAt: 1 },
      );

      const adopted: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        startLimit: 1,
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["ambient-1"]);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      expect((await queue.listPending({ limit: "all" })).map((event) => event.id)).toEqual([
        "ambient-2",
      ]);
      drain.dispose();
    });
  });

  it("restart recovery dispositions stale ambient claims before fresh addressed work", async () => {
    await withTempState(async (stateDir) => {
      const laneKey = "channel:discord-room";
      const clock = STALE_AMBIENT_PENDING_MS + 1;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(
        "stale-ambient",
        { text: "old room history", kind: "ambient" },
        { laneKey, receivedAt: 0 },
      );
      const orphanClaim = await queue.claim("stale-ambient", { ownerId: "999:1:dead-owner" });
      expect(orphanClaim).not.toBeNull();
      await queue.enqueue(
        "fresh-addressed",
        { text: "@openclaw current", kind: "addressed" },
        { laneKey, receivedAt: clock },
      );

      const adopted: string[] = [];
      const firstDrain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });
      expect(await firstDrain.drainOnce()).toEqual({ started: 1 });
      await firstDrain.waitForIdle();
      firstDrain.dispose();

      const secondDrain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });
      expect(await secondDrain.drainOnce()).toEqual({ started: 0 });
      await secondDrain.waitForIdle();

      expect(adopted).toEqual(["fresh-addressed"]);
      expect(await queue.listFailed?.({ limit: "all" })).toMatchObject([
        { id: "stale-ambient", reason: "stale-ambient-backlog" },
      ]);
      await expect(
        queue.enqueue("stale-ambient", { text: "old room history", kind: "ambient" }),
      ).resolves.toMatchObject({ kind: "failed" });
      secondDrain.dispose();
    });
  });

  it("stale ambient disposition uses a strict clock boundary", async () => {
    for (const [ageMs, expected] of [
      [STALE_AMBIENT_PENDING_MS, { adopted: ["boundary-ambient"], failed: [] }],
      [
        STALE_AMBIENT_PENDING_MS + 1,
        { adopted: [], failed: [{ id: "boundary-ambient", reason: "stale-ambient-backlog" }] },
      ],
    ] as const) {
      await withTempState(async (stateDir) => {
        const queue = createTestIngressQueue(stateDir, { now: () => ageMs });
        await queue.enqueue(
          "boundary-ambient",
          { text: "boundary room history", kind: "ambient" },
          { laneKey: "channel:discord-room", receivedAt: 0 },
        );

        const adopted: string[] = [];
        const drain = createChannelIngressDrain<Payload>({
          queue,
          now: () => ageMs,
          resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
          dispatchClaimedEvent: async (event, lifecycle) => {
            adopted.push(event.id);
            await lifecycle.onAdopted();
          },
        });

        expect(await drain.drainOnce()).toEqual({
          started: expected.adopted.length,
        });
        await drain.waitForIdle();
        expect(adopted).toEqual(expected.adopted);
        expect(await queue.listFailed?.({ limit: "all" })).toMatchObject(expected.failed);
        drain.dispose();
      });
    }
  });
});
