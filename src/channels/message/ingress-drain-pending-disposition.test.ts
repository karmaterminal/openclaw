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

  it("bounds SQLite listPending rows/pages by startLimit including corrupt rows and zero", async () => {
    await withTempState(async (stateDir) => {
      const laneKey = "channel:discord-room";
      const clock = STALE_AMBIENT_PENDING_MS + 1;
      const pages: Array<{ requested: number; selected: number }> = [];
      const queue = createTestIngressQueue(stateDir, {
        now: () => clock,
        onListPendingPage: (page) => pages.push(page),
      });

      // >100 rows so an unbounded 100-row page walker would over-read.
      for (let index = 0; index < 120; index += 1) {
        await queue.enqueue(
          `stale-${index.toString().padStart(3, "0")}`,
          { text: `old ambient ${index}`, kind: "ambient" },
          { laneKey, receivedAt: index },
        );
      }

      // startLimit 0 must not open a SQL page.
      pages.length = 0;
      const zeroDrain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock + STALE_AMBIENT_PENDING_MS + 1,
        startLimit: 0,
        resolvePendingDisposition: resolveStaleAmbientPendingDisposition,
        dispatchClaimedEvent: async (_event, lifecycle) => {
          await lifecycle.onAdopted();
        },
      });
      expect(await zeroDrain.drainOnce()).toEqual({ started: 0 });
      expect(pages).toEqual([]);
      zeroDrain.dispose();

      pages.length = 0;
      let examined = 0;
      const drain = createChannelIngressDrain<Payload>({
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
      expect(await drain.drainOnce()).toEqual({ started: 0 });
      await drain.waitForIdle();
      expect(examined).toBe(4);
      expect(pages.reduce((sum, page) => sum + page.selected, 0)).toBe(4);
      expect(pages.every((page) => page.requested <= 4)).toBe(true);
      expect(pages.reduce((sum, page) => sum + page.requested, 0)).toBeLessThanOrEqual(4);
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
      const drain = createChannelIngressDrain<Payload>({
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
      expect(await drainPromise).toEqual({ started: 0 });
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

  it("rejects incompatible completed-metadata types for complete dispositions at compile time", () => {
    type IncompatibleCompletedMetadata = { deliveredBy: string };
    type Options = import("./ingress-drain.js").CreateChannelIngressDrainOptions<
      Payload,
      unknown,
      IncompatibleCompletedMetadata
    >;
    type ResolveField = Options extends { resolvePendingDisposition?: infer R } ? R : never;
    // Incompatible metadata collapses the resolver field to `never`.
    type AcceptsResolver = ResolveField extends never
      ? true
      : [ResolveField] extends [never]
        ? true
        : ResolveField extends (...args: never) => unknown
          ? false
          : true;
    const rejectsResolver: AcceptsResolver = true;
    expect(rejectsResolver).toBe(true);

    type CompatibleOptions = import("./ingress-drain.js").CreateChannelIngressDrainOptions<
      Payload,
      unknown,
      import("./ingress-drain-pending-disposition.js").ChannelIngressSuppressedCompletionMetadata
    >;
    type CompatibleResolve = NonNullable<CompatibleOptions["resolvePendingDisposition"]>;
    type AcceptsCompatible = CompatibleResolve extends (...args: never) => unknown ? true : false;
    const acceptsCompatible: AcceptsCompatible = true;
    expect(acceptsCompatible).toBe(true);
  });
});
