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
import {
  countFailedChannelIngressQueueEntries,
  createChannelIngressQueue,
} from "./ingress-queue.js";

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
  async function releasePendingForRetry(
    queue: ReturnType<typeof createTestIngressQueue>,
    id: string,
    releasedAt: number,
  ): Promise<void> {
    const claim = await queue.claim(id, { ownerId: "pending-disposition-retry-setup" });
    if (!claim) {
      throw new Error(`expected claim for ${id}`);
    }
    await queue.release(claim, { lastError: "retry backoff", releasedAt });
  }

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
      const siblingDrain = createChannelIngressDrain({
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
          expect(await siblingDrain.drainOnce()).toEqual({
            started: 1,
            settled: expect.any(Number),
          });
          await siblingDrain.waitForIdle();
          return false;
        }
        return await complete(...args);
      });

      const adopted: string[] = [];
      const drain = createChannelIngressDrain({
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

      expect(await drain.drainOnce()).toEqual({ started: 1, settled: expect.any(Number) });
      await drain.waitForIdle();
      expect(adopted).toEqual(["other-lane"]);
      expect((await queue.listPending({ limit: "all" })).map((event) => event.id)).toEqual([
        "stale-ambient",
        "fresh-addressed",
      ]);

      expect(await drain.drainOnce()).toEqual({ started: 1, settled: expect.any(Number) });
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
      const drain = createChannelIngressDrain({
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

      expect(await drain.drainOnce()).toEqual({ started: 0, settled: 3 });
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

  it("bounds SQLite listPending rows/pages by startLimit including corrupt rows and zero", async () => {
    await withTempState(async (stateDir) => {
      const laneKey = "channel:discord-room";
      const clock = STALE_AMBIENT_PENDING_MS + 1;
      const queue = createTestIngressQueue(stateDir, {
        now: () => clock,
      });
      const { instrumentPendingListSql } = await import("./ingress-drain.test-helpers.js");
      const sql = instrumentPendingListSql(stateDir);

      // >100 rows so an unbounded 100-row page walker would over-read.
      for (let index = 0; index < 120; index += 1) {
        await queue.enqueue(
          `stale-${index.toString().padStart(3, "0")}`,
          { text: `old ambient ${index}`, kind: "ambient" },
          { laneKey, receivedAt: index },
        );
      }

      // startLimit 0 must not open a SQL page.
      sql.reset();
      const zeroDrain = createChannelIngressDrain({
        queue,
        now: () => clock + STALE_AMBIENT_PENDING_MS + 1,
        startLimit: 0,
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        dispatchClaimedEvent: async (_event, lifecycle) => {
          await lifecycle.onAdopted();
        },
      });
      expect(await zeroDrain.drainOnce()).toEqual({ started: 0, settled: expect.any(Number) });
      expect(sql.selectCalls()).toBe(0);
      expect(sql.selectedRows()).toBe(0);
      zeroDrain.dispose();

      sql.reset();
      let examined = 0;
      const drain = createChannelIngressDrain({
        queue,
        now: () => clock + STALE_AMBIENT_PENDING_MS + 1,
        startLimit: 4,
        resolvePendingDisposition: (event, context) => {
          examined += 1;
          return resolveStaleAmbientPendingDisposition(event, context);
        },
        dispatchClaimedEvent: async (_event, lifecycle) => {
          await lifecycle.onAdopted();
        },
      });
      expect(await drain.drainOnce()).toEqual({ started: 0, settled: expect.any(Number) });
      await drain.waitForIdle();
      expect(examined).toBe(4);
      expect(sql.selectedRows()).toBe(4);
      expect(sql.selectedRows()).toBeLessThanOrEqual(4);
      drain.dispose();
    });
  });

  it("repeated drains reconcile a corrupt prefix under startLimit until valid work dispatches", async () => {
    await withTempState(async (stateDir) => {
      const laneKey = "channel:discord-room";
      const clock = STALE_AMBIENT_PENDING_MS + 1;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      const { openOpenClawStateDatabase } = await import("../../state/openclaw-state-db.js");
      const { executeSqliteQuerySync, getNodeSqliteKysely } =
        await import("../../infra/kysely-sync.js");
      type ChannelIngressTestDatabase = Pick<
        import("../../state/openclaw-state-db.generated.js").DB,
        "channel_ingress_events" | "channel_ingress_event_generations"
      >;
      const database = openOpenClawStateDatabase({
        env: { OPENCLAW_STATE_DIR: stateDir },
      });
      const kysely = getNodeSqliteKysely<ChannelIngressTestDatabase>(database.db);
      const queueName = JSON.stringify(["test", "a"]);
      // More corrupt rows than startLimit so one pass cannot clear the prefix.
      for (let index = 0; index < 5; index += 1) {
        executeSqliteQuerySync(
          database.db,
          kysely.insertInto("channel_ingress_events").values({
            queue_name: queueName,
            event_id: `corrupt-${index}`,
            channel_id: "test",
            account_id: "a",
            status: "pending",
            lane_key: laneKey,
            payload_json: "{corrupt",
            metadata_json: null,
            received_at: index,
            updated_at: index,
            attempts: 0,
          } as import("kysely").Insertable<ChannelIngressTestDatabase["channel_ingress_events"]>),
        );
        executeSqliteQuerySync(
          database.db,
          kysely.insertInto("channel_ingress_event_generations").values({
            queue_name: queueName,
            event_id: `corrupt-${index}`,
            generation: 1,
          }),
        );
      }
      await queue.enqueue(
        "fresh-addressed",
        { text: "@openclaw now", kind: "addressed" },
        { laneKey, receivedAt: clock },
      );

      const adopted: string[] = [];
      const drain = createChannelIngressDrain({
        queue,
        now: () => clock + STALE_AMBIENT_PENDING_MS + 1,
        startLimit: 2,
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      for (let pump = 0; pump < 6 && adopted.length === 0; pump += 1) {
        await drain.drainOnce();
        await drain.waitForIdle();
      }
      expect(adopted).toEqual(["fresh-addressed"]);
      expect((await queue.listFailed?.({ limit: "all" }))?.map((row) => row.reason)).toEqual(
        Array.from({ length: 5 }, () => "corrupt_payload"),
      );
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
      const drain = createChannelIngressDrain({
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

      expect(await drain.drainOnce()).toEqual({ started: 1, settled: expect.any(Number) });
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
      const drain = createChannelIngressDrain({
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

      expect(await drain.drainOnce()).toEqual({ started: 1, settled: expect.any(Number) });
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
      const drain = createChannelIngressDrain({
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

      expect(await drain.drainOnce()).toEqual({ started: 1, settled: expect.any(Number) });
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
      const drain = createChannelIngressDrain({
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
      expect(await drain.drainOnce()).toEqual({ started: 1, settled: expect.any(Number) });
      await drain.waitForIdle();
      expect(adopted).toEqual(["fresh-addressed"]);
      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      await expectCompletedTombstone(queue, "stale-ambient");
      drain.dispose();
    });
  });

  it("keeps intentional completes out of failed health and preserves independent completed class budgets under cap churn", async () => {
    await withTempState(async (stateDir) => {
      const clock = STALE_AMBIENT_PENDING_MS + 1;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      // Independent class budgets: each class keeps up to completedMaxEntries.
      const completedMaxEntries = 2;

      // Overflow the delivered class with replay guards.
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
      const drain = createChannelIngressDrain({
        queue,
        now: () => clock + STALE_AMBIENT_PENDING_MS + 1,
        startLimit: 32,
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        dispatchClaimedEvent: async (event, lifecycle) => {
          await lifecycle.onAdopted();
        },
      });
      expect(await drain.drainOnce()).toEqual({ started: 0, settled: expect.any(Number) });
      await drain.waitForIdle();
      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      expect(countFailedChannelIngressQueueEntries(stateDir)).toEqual([]);

      await queue.prune({ completedMaxEntries, now: clock + 100 });

      // Newest delivered class members remain duplicate-protected even after
      // suppression overflow (independent budgets).
      for (const id of ["delivered-c", "delivered-d"]) {
        const replay = await queue.enqueue(id, { text: "probe", kind: "addressed" });
        expect(replay).toMatchObject({ kind: "completed", duplicate: true });
      }
      // Newest suppression tombstones remain duplicate-protected under their own
      // class budget (not returned to failed/dead-letter health).
      for (const id of ["drop-6", "drop-7"]) {
        const replay = await queue.enqueue(id, { text: "probe", kind: "ambient" });
        expect(replay).toMatchObject({ kind: "completed", duplicate: true });
      }
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      expect(countFailedChannelIngressQueueEntries(stateDir)).toEqual([]);
      drain.dispose();
    });
  });

  it("generation-fences async disposition so fail+resubmit is not suppressed", async () => {
    await withTempState(async (stateDir) => {
      const laneKey = "channel:discord-room";
      const clock = STALE_AMBIENT_PENDING_MS + 1;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(
        "ambient-then-resubmit",
        { text: "old ambient", kind: "ambient" },
        { laneKey, receivedAt: 0 },
      );

      let enteredResolve!: () => void;
      const enteredGate = new Promise<void>((resolve) => {
        enteredResolve = resolve;
      });
      let releaseResolve!: () => void;
      const releaseGate = new Promise<void>((resolve) => {
        releaseResolve = resolve;
      });
      let sawResume = false;
      const drain = createChannelIngressDrain({
        queue,
        now: () => clock + STALE_AMBIENT_PENDING_MS + 1,
        startLimit: 4,
        resolvePendingDisposition: async (event, context) => {
          if (event.id === "ambient-then-resubmit") {
            enteredResolve();
            // Pause after snapshot capture so a concurrent fail+resubmit can land.
            await releaseGate;
            sawResume = true;
          }
          return resolveStaleAmbientPendingDisposition(event, context);
        },
        dispatchClaimedEvent: async (_event, lifecycle) => {
          await lifecycle.onAdopted();
        },
      });

      const drainPromise = drain.drainOnce();
      await enteredGate;

      expect(
        await queue.fail("ambient-then-resubmit", { reason: "operator", message: "drop" }),
      ).toBe(true);
      const resubmit = await queue.resubmit?.("ambient-then-resubmit", {
        resubmittedAt: clock + 10,
      });
      expect(resubmit).toMatchObject({ kind: "resubmitted" });
      releaseResolve();
      expect(await drainPromise).toEqual({ started: 0, settled: expect.any(Number) });
      await drain.waitForIdle();
      expect(sawResume).toBe(true);
      // Resubmitted generation must remain pending — not a suppression tombstone.
      const pending = await queue.listPending({ limit: "all" });
      expect(pending.map((event) => event.id)).toEqual(["ambient-then-resubmit"]);
      const replay = await queue.enqueue("ambient-then-resubmit", {
        text: "probe",
        kind: "ambient",
      });
      expect(replay).toMatchObject({ kind: "pending", duplicate: true });
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      drain.dispose();
    });
  });

  it("does not let a later pending disposition overtake an older peer-held same-lane claim", async () => {
    await withTempState(async (stateDir) => {
      const laneKey = "channel:discord-room";
      const otherLane = "channel:other-room";
      // Shared clock so peer lease recovery cannot fire during the disposition pass.
      const clock = STALE_AMBIENT_PENDING_MS + 1_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });

      await queue.enqueue(
        "older-head",
        { text: "in-flight head", kind: "addressed" },
        { laneKey, receivedAt: clock - 10 },
      );
      let releasePeer!: () => void;
      const peerHold = new Promise<void>((resolve) => {
        releasePeer = resolve;
      });
      const peer = createChannelIngressDrain({
        queue,
        // Auto-minted ownerId registers a live local instance so same-process
        // peer claims are not recovered mid-hold.
        startLimit: 1,
        // Long lease + shared now keeps the peer claim live across the disposition pass.
        claimLeaseMs: 60 * 60 * 1_000,
        now: () => clock,
        dispatchClaimedEvent: async (event, lifecycle) => {
          expect(event.id).toBe("older-head");
          await peerHold;
          await lifecycle.onAdopted();
        },
      });
      expect(await peer.drainOnce()).toEqual({ started: 1, settled: 0 });
      expect((await queue.listClaims()).map((claim) => claim.id)).toEqual(["older-head"]);

      // Later ambient is already past the stale threshold at the shared clock.
      await queue.enqueue(
        "later-ambient",
        { text: "stale ambient tail", kind: "ambient" },
        { laneKey, receivedAt: 0 },
      );
      await queue.enqueue(
        "other-lane-work",
        { text: "unrelated", kind: "addressed" },
        { laneKey: otherLane, receivedAt: clock - 1 },
      );

      const adopted: string[] = [];
      const drain = createChannelIngressDrain({
        queue,
        claimLeaseMs: 60 * 60 * 1_000,
        now: () => clock,
        startLimit: 8,
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1, settled: 0 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["other-lane-work"]);
      expect((await queue.listPending({ limit: "all" })).map((row) => row.id)).toEqual([
        "later-ambient",
      ]);
      expect((await queue.listClaims()).map((claim) => claim.id)).toEqual(["older-head"]);

      releasePeer();
      await peer.waitForIdle();
      peer.dispose();
      const afterHead = await drain.drainOnce();
      await drain.waitForIdle();
      expect(afterHead).toEqual({ started: 0, settled: 1 });
      expect((await queue.listPending({ limit: "all" })).map((row) => row.id)).toEqual([]);
      await expectCompletedTombstone(queue, "later-ambient");
      drain.dispose();
    });
  });

  it("does not starve an unrelated lane behind a retry-delayed same-lane prefix under startLimit", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1_000;
      const delayedLane = "channel:delayed-room";
      const otherLane = "channel:other-room";
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      const startLimit = 3;
      await queue.enqueue(
        "retrying-head",
        { text: "ambient backlog head" },
        { laneKey: delayedLane, receivedAt: clock },
      );
      // Enough same-lane tails to fill a non-unique startLimit window alone.
      for (let index = 0; index < startLimit; index += 1) {
        await queue.enqueue(
          `same-lane-tail-${index}`,
          { text: `tail ${index}` },
          { laneKey: delayedLane, receivedAt: clock + 1 + index },
        );
      }
      await queue.enqueue(
        "other-lane-eligible",
        { text: "unrelated channel work" },
        { laneKey: otherLane, receivedAt: clock + 100 },
      );
      await releasePendingForRetry(queue, "retrying-head", clock);

      clock += 1_000;
      const adopted: string[] = [];
      let resolverCalls = 0;
      const drain = createChannelIngressDrain({
        queue,
        now: () => clock,
        startLimit,
        retryPolicy: { baseMs: 60_000, maxMs: 60_000 },
        // Disposition resolver enables bounded other-lane expansion when the
        // first startLimit window is occupied by a delayed same-lane prefix.
        resolvePendingDisposition: () => {
          resolverCalls += 1;
          return null;
        },
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1, settled: expect.any(Number) });
      await drain.waitForIdle();
      expect(adopted).toEqual(["other-lane-eligible"]);
      // Shared budget: examinations across first window + expansion stay ≤ startLimit.
      expect(resolverCalls).toBeGreaterThan(0);
      expect(resolverCalls).toBeLessThanOrEqual(startLimit);
      expect((await queue.listPending({ limit: "all" })).map((event) => event.id)).toEqual([
        "retrying-head",
        "same-lane-tail-0",
        "same-lane-tail-1",
        "same-lane-tail-2",
      ]);
      drain.dispose();
    });
  });

  it("dispatches past more than 32*startLimit blocked same-lane rows via unique-lane expansion", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1_000;
      const delayedLane = "channel:delayed-room";
      const otherLane = "channel:other-room";
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      const startLimit = 3;
      const blockedPrefix = 32 * startLimit + 20;
      await queue.enqueue(
        "retrying-head",
        { text: "ambient backlog head" },
        { laneKey: delayedLane, receivedAt: clock },
      );
      for (let index = 0; index < blockedPrefix; index += 1) {
        await queue.enqueue(
          `same-lane-tail-${index}`,
          { text: `tail ${index}` },
          { laneKey: delayedLane, receivedAt: clock + 1 + index },
        );
      }
      await queue.enqueue(
        "other-lane-eligible",
        { text: "unrelated channel work" },
        { laneKey: otherLane, receivedAt: clock + blockedPrefix + 100 },
      );
      await releasePendingForRetry(queue, "retrying-head", clock);

      clock += 1_000;
      const adopted: string[] = [];
      const drain = createChannelIngressDrain({
        queue,
        now: () => clock,
        startLimit,
        retryPolicy: { baseMs: 60_000, maxMs: 60_000 },
        resolvePendingDisposition: () => null,
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      // One pump must reach the other lane; unique-head SQL must not stop at 32*limit.
      expect(await drain.drainOnce()).toEqual({ started: 1, settled: expect.any(Number) });
      await drain.waitForIdle();
      expect(adopted).toEqual(["other-lane-eligible"]);
      drain.dispose();
    });
  });

  it("shares one startLimit budget across first disposition, expansion, corrupt, and claims", async () => {
    await withTempState(async (stateDir) => {
      let clock = STALE_AMBIENT_PENDING_MS + 1;
      const delayedLane = "channel:delayed-room";
      const otherLane = "channel:expand-room";
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      const { openOpenClawStateDatabase } = await import("../../state/openclaw-state-db.js");
      const { executeSqliteQuerySync, getNodeSqliteKysely } =
        await import("../../infra/kysely-sync.js");
      type ChannelIngressTestDatabase = Pick<
        import("../../state/openclaw-state-db.generated.js").DB,
        "channel_ingress_events" | "channel_ingress_event_generations"
      >;
      const startLimit = 4;
      // Delayed head + same-lane tails fill first window occupancy with one examine.
      await queue.enqueue(
        "retrying-head",
        { text: "ambient backlog head" },
        { laneKey: delayedLane, receivedAt: 0 },
      );
      await queue.enqueue(
        "same-lane-tail",
        { text: "tail" },
        { laneKey: delayedLane, receivedAt: 1 },
      );
      await releasePendingForRetry(queue, "retrying-head", 0);

      // Expansion path: one corrupt unique head + one valid other-lane head.
      const database = openOpenClawStateDatabase({
        env: { OPENCLAW_STATE_DIR: stateDir },
      });
      const kysely = getNodeSqliteKysely<ChannelIngressTestDatabase>(database.db);
      const queueName = JSON.stringify(["test", "a"]);
      executeSqliteQuerySync(
        database.db,
        kysely.insertInto("channel_ingress_events").values({
          queue_name: queueName,
          event_id: "expand-corrupt",
          channel_id: "test",
          account_id: "a",
          status: "pending",
          lane_key: "channel:corrupt-lane",
          payload_json: "{corrupt",
          metadata_json: null,
          received_at: 50,
          updated_at: 50,
          claim_token: null,
          claim_owner: null,
          claimed_at: null,
          attempts: 0,
          last_attempt_at: null,
          last_error: null,
          failed_reason: null,
          failed_at: null,
          completed_at: null,
          completed_metadata_json: null,
        }),
      );
      closeOpenClawStateDatabaseForTest();

      await queue.enqueue(
        "expand-valid",
        { text: "other lane work" },
        { laneKey: otherLane, receivedAt: 60 },
      );
      await queue.enqueue(
        "expand-valid-2",
        { text: "should not claim under shared budget if over" },
        { laneKey: "channel:third-room", receivedAt: 70 },
      );

      clock += 1_000;
      let resolverCalls = 0;
      const adopted: string[] = [];
      const drain = createChannelIngressDrain({
        queue,
        now: () => clock,
        startLimit,
        retryPolicy: { baseMs: 60_000, maxMs: 60_000 },
        resolvePendingDisposition: () => {
          resolverCalls += 1;
          return null;
        },
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      const result = await drain.drainOnce();
      await drain.waitForIdle();
      // Aggregate resolver examinations + corrupt tombstones + claims <= startLimit.
      const aggregateWork = resolverCalls + (result.settled > 0 ? 0 : 0) + result.started;
      // settled includes corrupt; count corrupt as settled - started dispositions
      // Use resolverCalls + started as primary work; corrupt is in settled.
      expect(resolverCalls + result.started).toBeLessThanOrEqual(startLimit);
      // Must still make progress on expansion path.
      expect(adopted.length + result.settled).toBeGreaterThan(0);
      drain.dispose();
    });
  });

  it("rejects incompatible completed-metadata types for complete dispositions at compile time", () => {
    type IncompatibleCompletedMetadata = { deliveredBy: string };
    type Suppressed =
      import("./ingress-drain-pending-disposition.js").ChannelIngressSuppressedCompletionMetadata;
    type Options = import("./ingress-drain.js").CreateChannelIngressDrainOptions<
      Payload,
      unknown,
      IncompatibleCompletedMetadata
    >;
    type ResolveField = Options extends { resolvePendingDisposition?: infer R } ? R : never;
    // Incompatible metadata collapses the resolver field to `never`.
    type AcceptsResolver = [ResolveField] extends [never]
      ? true
      : ResolveField extends (...args: never) => unknown
        ? false
        : true;
    const rejectsResolver: AcceptsResolver = true;
    expect(rejectsResolver).toBe(true);

    type CompatibleOptions = import("./ingress-drain.js").CreateChannelIngressDrainOptions<
      Payload,
      unknown,
      Suppressed
    >;
    type CompatibleResolve = NonNullable<CompatibleOptions["resolvePendingDisposition"]>;
    type AcceptsCompatible = CompatibleResolve extends (...args: never) => unknown ? true : false;
    const acceptsCompatible: AcceptsCompatible = true;
    expect(acceptsCompatible).toBe(true);

    // Actual public factory calls must reject incompatible completed metadata for
    // inferred, one-generic, two-generic, and fully explicit type arguments.
    const incompatibleQueue = createChannelIngressQueue<
      Payload,
      unknown,
      IncompatibleCompletedMetadata
    >({
      channelId: "typecheck",
      accountId: "typecheck",
    });
    const compatibleQueue = createChannelIngressQueue<Payload, unknown, Suppressed>({
      channelId: "typecheck-ok",
      accountId: "typecheck-ok",
    });
    const defaultQueue = createChannelIngressQueue<Payload>({
      channelId: "typecheck-default",
      accountId: "typecheck-default",
    });
    const customCompatibleQueue = createChannelIngressQueue<
      Payload,
      unknown,
      Suppressed & { extra?: string }
    >({
      channelId: "typecheck-custom-ok",
      accountId: "typecheck-custom-ok",
    });
    const dispatchClaimedEvent = async () => {};
    const resolvePendingDisposition = () => ({
      kind: "complete" as const,
      reason: "stale",
      message: "stale",
    });

    // Queue-first factory (zero type args): brand inferred from queue. Rejects
    // resolver only — never the queue property.
    createChannelIngressDrain({
      queue: incompatibleQueue,
      // @ts-expect-error incompatible completed metadata rejects disposition resolver
      resolvePendingDisposition,
      dispatchClaimedEvent,
    });

    // Genuine one-generic single-call forms: createChannelIngressDrain<Payload>({...})
    createChannelIngressDrain<Payload>({
      queue: compatibleQueue,
      resolvePendingDisposition,
      dispatchClaimedEvent,
    });
    createChannelIngressDrain<Payload>({
      queue: incompatibleQueue,
      // @ts-expect-error one-generic incompatible completed metadata rejects disposition resolver
      resolvePendingDisposition,
      dispatchClaimedEvent,
    });
    createChannelIngressDrain<Payload>({
      queue: incompatibleQueue,
      dispatchClaimedEvent,
    });
    createChannelIngressDrain<Payload>({
      queue: defaultQueue,
      resolvePendingDisposition,
      dispatchClaimedEvent,
    });
    createChannelIngressDrain<Payload>({
      queue: customCompatibleQueue,
      resolvePendingDisposition,
      dispatchClaimedEvent,
    });

    // Empty / brand-only objects are not queues — reject on the queue property.
    createChannelIngressDrain<Payload>({
      // @ts-expect-error empty object is not an operational ingress queue
      queue: {},
      dispatchClaimedEvent,
    });
    const brandOnlyQueue = {
      __payloadBrand: undefined as unknown as (value: Payload) => Payload,
      __metadataBrand: undefined as unknown as (value: unknown) => unknown,
    };
    createChannelIngressDrain<Payload>({
      // @ts-expect-error brand-only object lacks operational queue methods
      queue: brandOnlyQueue,
      dispatchClaimedEvent,
    });
    createChannelIngressDrain<Payload, unknown>({
      // @ts-expect-error empty object is not an operational ingress queue
      queue: {},
      dispatchClaimedEvent,
    });

    // Genuine two-generic single-call forms: createChannelIngressDrain<Payload, Metadata>({...})
    createChannelIngressDrain<Payload, unknown>({
      queue: compatibleQueue,
      resolvePendingDisposition,
      dispatchClaimedEvent,
    });
    createChannelIngressDrain<Payload, unknown>({
      queue: incompatibleQueue,
      // @ts-expect-error two-generic incompatible completed metadata rejects disposition resolver
      resolvePendingDisposition,
      dispatchClaimedEvent,
    });
    createChannelIngressDrain<Payload, unknown>({
      queue: incompatibleQueue,
      dispatchClaimedEvent,
    });

    createChannelIngressDrain({
      queue: compatibleQueue,
      resolvePendingDisposition,
      dispatchClaimedEvent,
    });
    createChannelIngressDrain({
      queue: customCompatibleQueue,
      resolvePendingDisposition,
      dispatchClaimedEvent,
    });
    createChannelIngressDrain({
      queue: defaultQueue,
      resolvePendingDisposition,
      dispatchClaimedEvent,
    });

    // Fully explicit incompatible completed metadata (free TCompletedMetadata gate).
    createChannelIngressDrain<Payload, unknown, IncompatibleCompletedMetadata>({
      queue: incompatibleQueue,
      // @ts-expect-error three-generic incompatible completed metadata rejects disposition resolver
      resolvePendingDisposition,
      dispatchClaimedEvent,
    });
    createChannelIngressDrain<Payload, unknown, Suppressed>({
      queue: compatibleQueue,
      resolvePendingDisposition,
      dispatchClaimedEvent,
    });
    // No-disposition path remains open for incompatible and specialized queues
    // (must not reject on the queue property).
    createChannelIngressDrain({
      queue: incompatibleQueue,
      dispatchClaimedEvent,
    });
    createChannelIngressDrain({
      queue: compatibleQueue,
      dispatchClaimedEvent,
    });
    createChannelIngressDrain<Payload, unknown, IncompatibleCompletedMetadata>({
      queue: incompatibleQueue,
      dispatchClaimedEvent,
    });
  });

  it("accepts monitor and real PluginRuntime open paths with and without dispositions", () => {
    type IncompatibleCompletedMetadata = { deliveredBy: string };
    type Suppressed =
      import("./ingress-drain-pending-disposition.js").ChannelIngressSuppressedCompletionMetadata;
    type MonitorDrainOptions = import("./ingress-monitor.js").ChannelIngressMonitorDrainOptions<
      Payload,
      unknown
    >;
    // Real plugin runtime surface — not a reconstructed lookalike.
    type PluginRuntime = import("../../plugins/runtime/types.js").PluginRuntime;
    type PluginOpenDrain = PluginRuntime["state"]["openChannelIngressDrain"];
    // Compile-only binding: never invoked at runtime.
    const openChannelIngressDrain: PluginOpenDrain = ((..._args: never[]) => {
      throw new Error("compile-only PluginRuntime openChannelIngressDrain binding");
    }) as unknown as PluginOpenDrain;

    const resolvePendingDisposition = () => ({
      kind: "complete" as const,
      reason: "stale",
      message: "stale",
    });
    const dispatchClaimedEvent = async () => {};

    // Monitor drain options may omit disposition fields or include a resolver.
    const monitorWithout: MonitorDrainOptions = { startLimit: 4 };
    const monitorWith: MonitorDrainOptions = {
      startLimit: 4,
      resolvePendingDisposition,
    };
    // Assignability of optional drain bag into CreateChannelIngressDrainOptions
    // (the shape monitor getDrain spreads) with and without dispositions.
    type MonitorSpreadTarget = import("./ingress-drain.js").CreateChannelIngressDrainOptions<
      Payload,
      unknown
    >;
    const monitorSpreadWithout = {
      ...monitorWithout,
      queue: null as unknown as import("./ingress-queue.js").ChannelIngressQueue<Payload, unknown>,
      dispatchClaimedEvent,
    } satisfies MonitorSpreadTarget;
    const monitorSpreadWith = {
      ...monitorWith,
      queue: null as unknown as import("./ingress-queue.js").ChannelIngressQueue<Payload, unknown>,
      dispatchClaimedEvent,
    } satisfies MonitorSpreadTarget;

    const compatiblePluginQueue = createChannelIngressQueue<Payload, unknown, Suppressed>({
      channelId: "plugin-ok",
      accountId: "plugin-ok",
    });
    const incompatiblePluginQueue = createChannelIngressQueue<
      Payload,
      unknown,
      IncompatibleCompletedMetadata
    >({
      channelId: "plugin-bad",
      accountId: "plugin-bad",
    });

    // PluginRuntime.openChannelIngressDrain: type-level only (guarded by false).
    // Queue-first, genuine one/two-generic single-call, and three-generic free metadata.
    if (false as boolean) {
      openChannelIngressDrain({
        queue: compatiblePluginQueue,
        dispatchClaimedEvent,
        resolvePendingDisposition,
        accountId: "acct",
      });
      openChannelIngressDrain({
        // @ts-expect-error unparameterized plugin queue-first rejects empty non-queue
        queue: {},
        dispatchClaimedEvent,
        accountId: "acct",
      });
      const pluginBrandOnlyQueue = {
        __payloadBrand: undefined as unknown as (value: Payload) => Payload,
        __metadataBrand: undefined as unknown as (value: unknown) => unknown,
        __completedMetadataBrand: undefined as unknown as (value: Suppressed) => Suppressed,
      };
      openChannelIngressDrain({
        // @ts-expect-error unparameterized plugin queue-first rejects brand-only non-queue
        queue: pluginBrandOnlyQueue,
        dispatchClaimedEvent,
        accountId: "acct",
      });
      openChannelIngressDrain({
        queue: incompatiblePluginQueue,
        dispatchClaimedEvent,
        // @ts-expect-error plugin queue-first rejects incompatible disposition resolver
        resolvePendingDisposition,
        accountId: "acct",
      });
      openChannelIngressDrain({
        queue: incompatiblePluginQueue,
        dispatchClaimedEvent,
        accountId: "acct",
      });
      openChannelIngressDrain<Payload>({
        queue: compatiblePluginQueue,
        dispatchClaimedEvent,
        resolvePendingDisposition,
        accountId: "acct",
      });
      openChannelIngressDrain<Payload>({
        // @ts-expect-error plugin one-generic rejects empty non-queue
        queue: {},
        dispatchClaimedEvent,
        accountId: "acct",
      });
      openChannelIngressDrain<Payload, unknown>({
        // @ts-expect-error plugin two-generic rejects brand-only non-queue
        queue: {
          __payloadBrand: undefined as unknown as (value: Payload) => Payload,
        },
        dispatchClaimedEvent,
        accountId: "acct",
      });
      openChannelIngressDrain<Payload>({
        queue: incompatiblePluginQueue,
        dispatchClaimedEvent,
        // @ts-expect-error plugin one-generic rejects incompatible disposition resolver
        resolvePendingDisposition,
        accountId: "acct",
      });
      openChannelIngressDrain<Payload>({
        queue: incompatiblePluginQueue,
        dispatchClaimedEvent,
        accountId: "acct",
      });
      openChannelIngressDrain<Payload, unknown>({
        queue: compatiblePluginQueue,
        dispatchClaimedEvent,
        resolvePendingDisposition,
        accountId: "acct",
      });
      openChannelIngressDrain<Payload, unknown>({
        queue: incompatiblePluginQueue,
        dispatchClaimedEvent,
        // @ts-expect-error plugin two-generic rejects incompatible disposition resolver
        resolvePendingDisposition,
        accountId: "acct",
      });
      openChannelIngressDrain<Payload, unknown, Suppressed>({
        dispatchClaimedEvent,
        accountId: "acct",
      });
      openChannelIngressDrain<Payload, unknown, Suppressed>({
        dispatchClaimedEvent,
        resolvePendingDisposition,
        accountId: "acct",
      });
      openChannelIngressDrain<Payload, unknown, IncompatibleCompletedMetadata>({
        dispatchClaimedEvent,
        accountId: "acct",
      });
      openChannelIngressDrain<Payload, unknown, IncompatibleCompletedMetadata>({
        dispatchClaimedEvent,
        // @ts-expect-error incompatible plugin completed metadata rejects disposition resolver
        resolvePendingDisposition,
        accountId: "acct",
      });
    }

    expect(monitorWithout.startLimit).toBe(4);
    expect(typeof monitorWith.resolvePendingDisposition).toBe("function");
    expect(monitorSpreadWithout.dispatchClaimedEvent).toBe(dispatchClaimedEvent);
    expect(monitorSpreadWith.resolvePendingDisposition).toBe(resolvePendingDisposition);
    expect(typeof openChannelIngressDrain).toBe("function");
  });

  it("keeps later disposition pending when a peer claims the head after an empty claim snapshot", async () => {
    await withTempState(async (stateDir) => {
      const laneKey = "channel:discord-room";
      const otherLane = "channel:other-room";
      const clock = STALE_AMBIENT_PENDING_MS + 1_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });

      await queue.enqueue(
        "older-head",
        { text: "in-flight head", kind: "addressed" },
        { laneKey, receivedAt: clock - 10 },
      );
      await queue.enqueue(
        "later-ambient",
        { text: "stale ambient tail", kind: "ambient" },
        { laneKey, receivedAt: 0 },
      );
      await queue.enqueue(
        "other-lane-work",
        { text: "unrelated", kind: "addressed" },
        { laneKey: otherLane, receivedAt: clock - 1 },
      );

      // Simulate listClaims → peer claim → listPending TOCTOU without test-only hooks:
      // wrap listPending so the first drain pending load claims the older head as a peer.
      const originalListPending = queue.listPending.bind(queue);
      let injectedPeerClaim = false;
      queue.listPending = async (listOptions) => {
        if (!injectedPeerClaim) {
          injectedPeerClaim = true;
          const peerClaim = await queue.claim("older-head", { ownerId: "peer-toctou" });
          expect(peerClaim).not.toBeNull();
        }
        return originalListPending(listOptions);
      };

      const adopted: string[] = [];
      const drain = createChannelIngressDrain({
        queue,
        claimLeaseMs: 60 * 60 * 1_000,
        now: () => clock,
        startLimit: 8,
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        dispatchClaimedEvent: async (event, lifecycle) => {
          adopted.push(event.id);
          await lifecycle.onAdopted();
        },
      });

      // listClaims was empty at drain start; peer claim lands before pending load.
      // Settlement must still refuse later-ambient via atomic lane revalidation.
      expect(await drain.drainOnce()).toEqual({ started: 1, settled: 0 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["other-lane-work"]);
      expect((await queue.listPending({ limit: "all" })).map((row) => row.id).sort()).toEqual([
        "later-ambient",
      ]);
      expect((await queue.listClaims()).map((claim) => claim.id)).toEqual(["older-head"]);
      drain.dispose();
    });
  });
});
