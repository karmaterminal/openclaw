import { afterEach, describe, expect, it, vi } from "vitest";
import { closeOpenClawStateDatabaseForTest } from "../../state/openclaw-state-db.js";
import { createChannelIngressDrain } from "./ingress-drain.js";
import { createTestIngressQueue, withTempState } from "./ingress-drain.test-helpers.js";

describe("channel ingress pending disposition", () => {
  afterEach(() => {
    closeOpenClawStateDatabaseForTest();
  });

  it("settles policy rows before the candidate window binds them", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("stale", { text: "old ambient" }, { laneKey: "lane:a", receivedAt: 0 });
      await queue.enqueue(
        "current",
        { text: "current work" },
        { laneKey: "lane:a", receivedAt: 1 },
      );
      const adopted: string[] = [];
      // scanLimit 1 proves the stale row never occupies the candidate window:
      // without the disposition pass it would bind the lane and block "current".
      const drain = createChannelIngressDrain({
        queue,
        scanLimit: 1,
        startLimit: 1,
        now: () => 10,
        resolvePendingDisposition: (record) =>
          record.id === "stale"
            ? { kind: "fail", reason: "stale-ambient-backlog", message: "stale ambient row" }
            : null,
        dispatchClaimedEvent: async (claim, lifecycle) => {
          adopted.push(claim.id);
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["current"]);
      expect(await queue.listFailed?.({ limit: "all" })).toMatchObject([
        { id: "stale", reason: "stale-ambient-backlog" },
      ]);
      drain.dispose();
    });
  });

  it("keeps every pending row claimable when a channel provides no policy", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("old", { text: "channel-owned work" }, { receivedAt: 0 });
      const adopted: string[] = [];
      const drain = createChannelIngressDrain({
        queue,
        now: () => Number.MAX_SAFE_INTEGER,
        dispatchClaimedEvent: async (claim, lifecycle) => {
          adopted.push(claim.id);
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["old"]);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      drain.dispose();
    });
  });

  it("keeps a row claimable when the policy declines it", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("unreadable", { text: "malformed" }, { receivedAt: 0 });
      const adopted: string[] = [];
      const drain = createChannelIngressDrain({
        queue,
        now: () => 10,
        // Mirrors a channel codec that cannot read the stored bytes.
        resolvePendingDisposition: () => null,
        dispatchClaimedEvent: async (claim, lifecycle) => {
          adopted.push(claim.id);
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["unreadable"]);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      drain.dispose();
    });
  });

  it("fences a lost disposition compare-and-set without blocking unrelated lanes", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("raced", { text: "old ambient" }, { laneKey: "lane:a", receivedAt: 0 });
      await queue.enqueue(
        "same-lane",
        { text: "later ambient" },
        {
          laneKey: "lane:a",
          receivedAt: 1,
        },
      );
      await queue.enqueue(
        "other-lane",
        { text: "independent" },
        { laneKey: "lane:b", receivedAt: 2 },
      );
      const fail = queue.fail.bind(queue);
      // A concurrent claimer already owns "raced", so its fail() finds no pending row.
      const failSpy = vi.fn(async (...args: Parameters<typeof queue.fail>) =>
        args[0] === "raced" ? false : await fail(...args),
      );
      queue.fail = failSpy;
      const resolved: string[] = [];
      const adopted: string[] = [];
      const drain = createChannelIngressDrain({
        queue,
        now: () => 10,
        // Both lane:a rows are disposition-eligible; the head loses its CAS.
        resolvePendingDisposition: (record) => {
          resolved.push(record.id);
          return record.id === "other-lane"
            ? null
            : { kind: "fail", reason: "stale-ambient-backlog", message: "stale ambient row" };
        },
        dispatchClaimedEvent: async (claim, lifecycle) => {
          adopted.push(claim.id);
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["other-lane"]);
      // The fenced lane stops all further disposition work for this snapshot.
      expect(resolved).toEqual(["raced", "other-lane"]);
      expect(failSpy.mock.calls.map((call) => call[0])).toEqual(["raced"]);
      expect((await queue.listPending({ limit: "all" })).map((row) => row.id)).toEqual([
        "raced",
        "same-lane",
      ]);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      drain.dispose();
    });
  });

  it("holds a deferred row and its lane without failing or claiming it", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue(
        "hydrating",
        { text: "unclassifiable" },
        {
          laneKey: "lane:a",
          receivedAt: 0,
        },
      );
      await queue.enqueue(
        "same-lane",
        { text: "behind it" },
        {
          laneKey: "lane:a",
          receivedAt: 1,
        },
      );
      await queue.enqueue(
        "other-lane",
        { text: "independent" },
        {
          laneKey: "lane:b",
          receivedAt: 2,
        },
      );
      const resolved: string[] = [];
      const adopted: string[] = [];
      let hydrated = false;
      const drain = createChannelIngressDrain({
        queue,
        now: () => 10,
        resolvePendingDisposition: (record) => {
          resolved.push(record.id);
          if (record.id === "other-lane") {
            return null;
          }
          return hydrated
            ? { kind: "fail", reason: "stale-ambient-backlog", message: "stale ambient row" }
            : { kind: "defer" };
        },
        dispatchClaimedEvent: async (claim, lifecycle) => {
          adopted.push(claim.id);
          await lifecycle.onAdopted();
        },
      });

      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["other-lane"]);
      expect(resolved).toEqual(["hydrating", "other-lane"]);
      expect((await queue.listPending({ limit: "all" })).map((row) => row.id)).toEqual([
        "hydrating",
        "same-lane",
      ]);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);

      // Once the channel can classify the row, the next pass settles it.
      hydrated = true;
      expect(await drain.drainOnce()).toEqual({ started: 0 });
      await drain.waitForIdle();
      expect(adopted).toEqual(["other-lane"]);
      expect((await queue.listFailed?.({ limit: "all" }))?.map((row) => row.id)).toEqual([
        "hydrating",
        "same-lane",
      ]);
      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      drain.dispose();
    });
  });
});
