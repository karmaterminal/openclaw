// Pending-disposition drain tests cover multi-drain CAS fencing, work limits,
// same-lane retained-head fencing, intentional complete settlement, and observer isolation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeOpenClawStateDatabaseForTest } from "../../state/openclaw-state-db.js";
import type {
  ChannelIngressPendingDisposition,
  ChannelIngressPendingDispositionContext,
} from "./ingress-drain-pending-disposition.js";
import { createChannelIngressDrain } from "./ingress-drain.js";
import {
  createTestIngressQueue,
  type IngressDrainTestPayload as Payload,
  withTempState,
} from "./ingress-drain.test-helpers.js";
import type { ChannelIngressQueueRecord } from "./ingress-queue.js";
import { countFailedChannelIngressQueueEntries } from "./ingress-queue.js";

const STALE_AMBIENT_PENDING_MS = 15 * 60 * 1_000;

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
    kind: "complete",
    reason: "stale-ambient-backlog",
    message: `stale ambient backlog ${event.id} on ${context.laneKey}`,
  };
}

async function expectCompletedTombstone(
  queue: ReturnType<typeof createTestIngressQueue>,
  id: string,
): Promise<void> {
  const replay = await queue.enqueue(id, { text: "replay probe", kind: "ambient" });
  expect(replay).toMatchObject({ kind: "completed", duplicate: true });
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

      const complete = queue.complete.bind(queue);
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
      queue.complete = vi.fn(async (...args: Parameters<typeof queue.complete>) => {
        if (!raceInjected && args[0] === "stale-ambient") {
          raceInjected = true;
          expect(await siblingDrain.drainOnce()).toEqual({ started: 1 });
          await siblingDrain.waitForIdle();
          return false;
        }
        return await complete(...args);
      });

      const adopted: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        // Snapshot load is startLimit-bounded; include the unrelated lane so it
        // remains claimable in the same pass while the raced lane stays fenced.
        startLimit: 3,
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
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      await expectCompletedTombstone(queue, "stale-ambient");
      siblingDrain.dispose();
      drain.dispose();
    });
  });

  it("bounds total pending-disposition work by startLimit on the first drain", async () => {
    await withTempState(async (stateDir) => {
      const laneKey = "channel:discord-room";
      const clock = STALE_AMBIENT_PENDING_MS + 1;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      const staleIds = Array.from({ length: 12 }, (_, index) => `stale-${index}`);
      for (const [index, id] of staleIds.entries()) {
        await queue.enqueue(
          id,
          { text: `old ambient ${index}`, kind: "ambient" },
          // Far below the stale threshold so every backlog row is eligible.
          { laneKey, receivedAt: index },
        );
      }
      await queue.enqueue(
        "fresh-addressed",
        { text: "@openclaw now", kind: "addressed" },
        { laneKey, receivedAt: clock },
      );

      let examined = 0;
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock + STALE_AMBIENT_PENDING_MS + 1,
        startLimit: 3,
        resolvePendingDisposition: (event, context) => {
          examined += 1;
          return resolveStaleAmbientPendingDisposition(event, context);
        },
        dispatchClaimedEvent: async (event, lifecycle) => {
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 0 });
      await drain.waitForIdle();
      // startLimit examinations/settlements; no claim budget remains; unexamined
      // same-lane tail stays fenced for this pass.
      expect(examined).toBe(3);
      expect((await queue.listPending({ limit: "all" })).map((event) => event.id)).toEqual([
        ...staleIds.slice(3),
        "fresh-addressed",
      ]);
      drain.dispose();
    });
  });

  it("does not load or visit a large pending tail beyond startLimit", async () => {
    await withTempState(async (stateDir) => {
      const laneKey = "channel:discord-room";
      const clock = STALE_AMBIENT_PENDING_MS + 1;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      const staleIds = Array.from({ length: 80 }, (_, index) => `stale-tail-${index}`);
      for (const [index, id] of staleIds.entries()) {
        await queue.enqueue(
          id,
          { text: `old ambient ${index}`, kind: "ambient" },
          { laneKey, receivedAt: index },
        );
      }
      await queue.enqueue(
        "fresh-addressed",
        { text: "@openclaw now", kind: "addressed" },
        { laneKey, receivedAt: clock },
      );

      const listCalls: Array<{ limit: number | "all" | undefined; returned: number }> = [];
      const originalListPending = queue.listPending.bind(queue);
      queue.listPending = async (options) => {
        const rows = await originalListPending(options);
        listCalls.push({ limit: options?.limit, returned: rows.length });
        return rows;
      };

      let examined = 0;
      const seenIds: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock + STALE_AMBIENT_PENDING_MS + 1,
        startLimit: 4,
        resolvePendingDisposition: (event, context) => {
          examined += 1;
          seenIds.push(event.id);
          return resolveStaleAmbientPendingDisposition(event, context);
        },
        dispatchClaimedEvent: async (event, lifecycle) => {
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 0 });
      await drain.waitForIdle();

      const dispositionListCalls = listCalls.filter((call) => call.limit !== "all");
      expect(dispositionListCalls.length).toBeGreaterThanOrEqual(1);
      expect(dispositionListCalls[0]?.limit).toBe(4);
      expect(dispositionListCalls[0]?.returned).toBe(4);
      // Large tail must never be loaded into the disposition snapshot or visited
      // by the resolver under the admission lock.
      expect(examined).toBe(4);
      expect(seenIds).toEqual(staleIds.slice(0, 4));
      expect(seenIds).not.toContain("fresh-addressed");
      expect(seenIds.some((id) => id.endsWith("50"))).toBe(false);
      expect((await queue.listPending({ limit: "all" })).map((event) => event.id)).toEqual([
        ...staleIds.slice(4),
        "fresh-addressed",
      ]);
      drain.dispose();
    });
  });

  it("settles a 12-row stale backlog plus fresh mention in one drain without repumps", async () => {
    await withTempState(async (stateDir) => {
      const laneKey = "channel:discord-room";
      const clock = STALE_AMBIENT_PENDING_MS + 1;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      const staleIds = Array.from({ length: 12 }, (_, index) => `stale-${index}`);
      for (const [index, id] of staleIds.entries()) {
        await queue.enqueue(
          id,
          { text: `old ambient ${index}`, kind: "ambient" },
          { laneKey, receivedAt: index },
        );
      }
      await queue.enqueue(
        "fresh-addressed",
        { text: "@openclaw now", kind: "addressed" },
        { laneKey, receivedAt: clock },
      );

      let pumps = 0;
      const adopted: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock + STALE_AMBIENT_PENDING_MS + 1,
        startLimit: 32,
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });
      const drainOnce = drain.drainOnce.bind(drain);
      drain.drainOnce = async (...args) => {
        pumps += 1;
        return await drainOnce(...args);
      };

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(pumps).toBe(1);
      expect(adopted).toEqual(["fresh-addressed"]);
      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      expect(countFailedChannelIngressQueueEntries(stateDir)).toEqual([]);
      for (const id of staleIds) {
        await expectCompletedTombstone(queue, id);
      }
      drain.dispose();
    });
  });

  it("fences a later predicted drop behind a retained retry-delayed same-lane head", async () => {
    await withTempState(async (stateDir) => {
      const laneKey = "channel:discord-room";
      const clock = STALE_AMBIENT_PENDING_MS + 1;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      // Head is addressed (resolver returns null) and retry-delayed.
      await queue.enqueue(
        "retrying-head",
        { text: "@openclaw earlier", kind: "addressed" },
        { laneKey, receivedAt: 0 },
      );
      const head = await queue.claim("retrying-head", { ownerId: "prior" });
      expect(head).not.toBeNull();
      if (head) {
        await queue.release(head, {
          recordAttempt: true,
          lastError: "transient",
          releasedAt: clock,
        });
      }
      await queue.enqueue(
        "later-stale-ambient",
        { text: "old chatter", kind: "ambient" },
        // Strictly after the head so snapshot order keeps the retained head first.
        { laneKey, receivedAt: 1 },
      );
      await queue.enqueue(
        "other-lane",
        { text: "unrelated", kind: "addressed" },
        { laneKey: "channel:other", receivedAt: clock },
      );

      const adopted: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        startLimit: 8,
        retryPolicy: { baseMs: 60_000, maxMs: 60_000 },
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
        "retrying-head",
        "later-stale-ambient",
      ]);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      drain.dispose();
    });
  });

  it("isolates throwing committed-disposition observers after CAS success", async () => {
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
        { text: "@openclaw now", kind: "addressed" },
        { laneKey, receivedAt: clock },
      );

      const logs: string[] = [];
      const adopted: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        startLimit: 4,
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        onPendingDispositionCommitted: () => {
          throw new Error("runtime.log exploded");
        },
        onLog: (message) => logs.push(message),
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["fresh-addressed"]);
      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      await expectCompletedTombstone(queue, "stale-ambient");
      expect(logs.some((line) => line.includes("pending disposition observer failed"))).toBe(true);
      drain.dispose();
    });
  });

  it("continues drain after observer and log sink both throw post-CAS", async () => {
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
        { text: "@openclaw now", kind: "addressed" },
        { laneKey, receivedAt: clock },
      );

      const adopted: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        startLimit: 4,
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        onPendingDispositionCommitted: () => {
          throw new Error("observer exploded");
        },
        onLog: () => {
          throw new Error("log sink exploded");
        },
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      // Durable CAS + later same-pass claim must survive the double throw.
      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["fresh-addressed"]);
      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      await expectCompletedTombstone(queue, "stale-ambient");
      drain.dispose();
    });
  });

  it("keeps intentional completes out of failed health and preserves partitioned completed replay guards under cap churn", async () => {
    await withTempState(async (stateDir) => {
      const clock = STALE_AMBIENT_PENDING_MS + 1;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      // Cap=4 → delivered partition=2, suppressed partition=2.
      const completedMaxEntries = 4;

      // Fill the delivered partition (and overflow) with replay guards.
      for (const [index, id] of [
        "delivered-a",
        "delivered-b",
        "delivered-c",
        "delivered-d",
      ].entries()) {
        await queue.enqueue(id, { text: id, kind: "addressed" }, { receivedAt: index + 1 });
        const claim = await queue.claim(id, { ownerId: "worker" });
        expect(claim).not.toBeNull();
        if (claim) {
          expect(await queue.complete(claim, { completedAt: index + 10 })).toBe(true);
        }
      }

      // Add intentional suppressions via pending disposition (not fail/dead-letter).
      const laneKey = "channel:churn";
      for (let index = 0; index < 8; index += 1) {
        await queue.enqueue(
          `drop-${index}`,
          { text: `ambient ${index}`, kind: "ambient" },
          { laneKey, receivedAt: index },
        );
      }
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock + STALE_AMBIENT_PENDING_MS + 1,
        startLimit: 32,
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        dispatchClaimedEvent: async (event, lifecycle) => {
          await lifecycle.onAdopted();
        },
      });
      expect(await drain.drainOnce()).toEqual({ started: 0 });
      await drain.waitForIdle();
      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      expect(countFailedChannelIngressQueueEntries(stateDir)).toEqual([]);

      await queue.prune({ completedMaxEntries, now: clock + 100 });

      // Newest delivered partition members remain duplicate-protected.
      for (const id of ["delivered-c", "delivered-d"]) {
        const replay = await queue.enqueue(id, { text: "probe", kind: "addressed" });
        expect(replay).toMatchObject({ kind: "completed", duplicate: true });
      }
      // Newest suppression tombstones also remain duplicate-protected under the
      // partitioned cap (not returned to failed/dead-letter health).
      for (const id of ["drop-6", "drop-7"]) {
        const replay = await queue.enqueue(id, { text: "probe", kind: "ambient" });
        expect(replay).toMatchObject({ kind: "completed", duplicate: true });
      }
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      expect(countFailedChannelIngressQueueEntries(stateDir)).toEqual([]);
      drain.dispose();
    });
  });
});
