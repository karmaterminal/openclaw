// Ingress queue tests cover durable queueing for inbound channel messages.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expectDefined } from "@openclaw/normalization-core";
import type { Insertable } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executeSqliteQuerySync,
  executeSqliteQueryTakeFirstSync,
  getNodeSqliteKysely,
} from "../../infra/kysely-sync.js";
import type { DB as OpenClawStateKyselyDatabase } from "../../state/openclaw-state-db.generated.js";
import {
  closeOpenClawStateDatabaseForTest,
  openOpenClawStateDatabase,
} from "../../state/openclaw-state-db.js";
import { createChannelIngressQueue } from "./ingress-queue.js";

type ChannelIngressTestDatabase = Pick<OpenClawStateKyselyDatabase, "channel_ingress_events">;

function createTestIngressQueue<TPayload, TMetadata = unknown, TCompletedMetadata = unknown>(
  stateDir: string,
  options: Omit<
    Parameters<typeof createChannelIngressQueue>[0],
    "channelId" | "accountId" | "stateDir"
  > = {},
) {
  return createChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>({
    channelId: "test",
    accountId: "account",
    stateDir,
    ...options,
  });
}

async function withTempState<T>(fn: (stateDir: string) => Promise<T>): Promise<T> {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-ingress-queue-"));
  try {
    return await fn(stateDir);
  } finally {
    closeOpenClawStateDatabaseForTest();
    await fs.rm(stateDir, { recursive: true, force: true });
  }
}

describe("channel ingress queue", () => {
  afterEach(() => {
    closeOpenClawStateDatabaseForTest();
  });

  it("deduplicates pending and completed ingress events", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue<
        { text: string },
        { source: string },
        { handledBy: string }
      >(stateDir, { now: () => 100 });

      const accepted = await queue.enqueue(
        "event-1",
        { text: "first" },
        { metadata: { source: "fixture" }, receivedAt: 50 },
      );
      const pending = await queue.enqueue("event-1", { text: "duplicate" });
      await queue.complete("event-1", { metadata: { handledBy: "worker" }, completedAt: 150 });
      const completed = await queue.enqueue("event-1", { text: "late duplicate" });

      expect(accepted.kind).toBe("accepted");
      expect(pending.kind).toBe("pending");
      if (pending.kind !== "pending") {
        throw new Error(`Expected pending duplicate, got ${pending.kind}`);
      }
      expect(pending.record.payload).toEqual({ text: "first" });
      expect(completed).toEqual({
        kind: "completed",
        duplicate: true,
        record: {
          id: "event-1",
          channelId: "test",
          accountId: "account",
          queueName: JSON.stringify(["test", "account"]),
          completedAt: 150,
          metadata: { handledBy: "worker" },
        },
      });
      expect(await queue.listPending()).toEqual([]);

      expect(
        await queue.complete("missing-event", {
          metadata: { handledBy: "late-worker" },
          completedAt: 200,
        }),
      ).toBe(true);
      expect(await queue.enqueue("missing-event", { text: "late duplicate" })).toMatchObject({
        kind: "completed",
        duplicate: true,
        record: {
          id: "missing-event",
          completedAt: 200,
          metadata: { handledBy: "late-worker" },
        },
      });

      await queue.enqueue(" spaced-event ", { text: "spaced" });
      expect(await queue.complete(" spaced-event ", { completedAt: 250 })).toBe(true);
      expect(await queue.enqueue("spaced-event", { text: "duplicate" })).toMatchObject({
        kind: "completed",
        duplicate: true,
        record: { id: "spaced-event", completedAt: 250 },
      });
    });
  });

  it("keeps channel and account queue identities unambiguous", async () => {
    await withTempState(async (stateDir) => {
      const first = createChannelIngressQueue<{ text: string }>({
        channelId: "a",
        accountId: "b:c",
        stateDir,
      });
      const second = createChannelIngressQueue<{ text: string }>({
        channelId: "a:b",
        accountId: "c",
        stateDir,
      });

      expect(await first.enqueue("same-id", { text: "first" })).toMatchObject({
        kind: "accepted",
      });
      expect(await second.enqueue("same-id", { text: "second" })).toMatchObject({
        kind: "accepted",
      });

      await first.complete("same-id");

      expect(await first.enqueue("same-id", { text: "first duplicate" })).toMatchObject({
        kind: "completed",
      });
      expect(await second.enqueue("same-id", { text: "second duplicate" })).toMatchObject({
        kind: "pending",
        record: { payload: { text: "second" } },
      });
    });
  });

  it("can bound pending scans and prune stale pending rows", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1;
      const queue = createTestIngressQueue<{ index: number }>(stateDir, { now: () => clock++ });

      await queue.enqueue("0002", { index: 2 });
      await queue.enqueue("0001", { index: 1 });
      await queue.enqueue("0003", { index: 3 });

      expect(
        (await queue.listPending({ limit: 2, orderBy: "id" })).map((record) => record.id),
      ).toEqual(["0001", "0002"]);
      expect(await queue.prune({ pendingTtlMs: 3, pendingMaxEntries: 1, now: 7 })).toBe(2);
      expect((await queue.listPending({ limit: "all" })).map((record) => record.id)).toEqual([
        "0003",
      ]);
    });
  });

  it("does not prune protected rows while enforcing max-entry limits", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue<{ index: number }>(stateDir, { now: () => 10 });

      await queue.enqueue("z", { index: 1 });
      await queue.enqueue("a", { index: 2 });

      expect(await queue.prune({ pendingMaxEntries: 1, protectIds: ["a"] })).toBe(0);
      expect(
        (await queue.listPending({ limit: "all", orderBy: "id" })).map((row) => row.id),
      ).toEqual(["a", "z"]);
    });
  });

  it("prunes max-entry overflow across bounded batches", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1;
      const queue = createTestIngressQueue<{ index: number }>(stateDir, { now: () => clock++ });

      for (let index = 0; index < 520; index += 1) {
        await queue.enqueue(String(index).padStart(4, "0"), { index });
      }

      expect(await queue.prune({ pendingMaxEntries: 2 })).toBe(518);
      expect((await queue.listPending({ limit: "all" })).map((row) => row.id)).toEqual([
        "0518",
        "0519",
      ]);
    });
  });

  it("claims, releases, and skips blocked lanes", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1;
      const queue = createTestIngressQueue<{ text: string }>(stateDir, { now: () => clock++ });

      await queue.enqueue("a", { text: "blocked" }, { laneKey: "chat-1", receivedAt: 1 });
      await queue.enqueue("b", { text: "open" }, { laneKey: "chat-2", receivedAt: 2 });

      const claimed = await queue.claimNext({
        ownerId: "worker",
        blockedLaneKeys: ["chat-1"],
      });

      expect(claimed?.id).toBe("b");
      if (!claimed) {
        throw new Error("Expected a claimed ingress event");
      }
      expect(await queue.release(claimed, { lastError: "retry", releasedAt: 20 })).toBe(true);
      expect((await queue.listPending()).find((record) => record.id === "b")).toMatchObject({
        attempts: 1,
        lastAttemptAt: 20,
        lastError: "retry",
      });

      const reclaimed = await queue.claim("b", { ownerId: "replacement" });
      if (!reclaimed) {
        throw new Error("Expected the released ingress event to be claimable");
      }
      expect(await queue.release(reclaimed, { recordAttempt: false, releasedAt: 30 })).toBe(true);
      expect((await queue.listPending()).find((record) => record.id === "b")).toMatchObject({
        attempts: 1,
        lastAttemptAt: 20,
        lastError: "retry",
        updatedAt: 30,
      });
    });
  });

  it("claims next pending row by id when requested", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1;
      const queue = createTestIngressQueue<{ text: string }>(stateDir, { now: () => clock++ });

      await queue.enqueue("0002", { text: "second" }, { receivedAt: 1 });
      await queue.enqueue("0001", { text: "first" }, { receivedAt: 2 });

      const claimed = await queue.claimNext({
        ownerId: "worker",
        orderBy: "id",
      });

      expect(claimed?.id).toBe("0001");
    });
  });

  it("claims next only from candidate ids when provided", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1;
      const queue = createTestIngressQueue<{ text: string }>(stateDir, { now: () => clock++ });

      await queue.enqueue("a", { text: "outside snapshot" }, { receivedAt: 1 });
      await queue.enqueue("b", { text: "inside snapshot" }, { receivedAt: 2 });

      expect(
        await queue.claimNext({
          ownerId: "worker",
          candidateIds: ["b"],
        }),
      ).toMatchObject({ id: "b" });
      expect(await queue.claimNext({ candidateIds: [] })).toBeNull();
    });
  });

  it("derives missing lane keys before claiming next", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1;
      const queue = createTestIngressQueue<{ lane: string }>(stateDir, { now: () => clock++ });

      await queue.enqueue("a", { lane: "blocked" }, { receivedAt: 1 });
      await queue.enqueue("b", { lane: "open" }, { receivedAt: 2 });

      const claimed = await queue.claimNext({
        ownerId: "worker",
        blockedLaneKeys: ["blocked"],
        deriveLaneKey: (record) => record.payload.lane,
      });

      expect(claimed?.id).toBe("b");
      expect(claimed?.laneKey).toBe("open");
      expect(
        (await queue.listPending()).find((record) => record.id === "a")?.laneKey,
      ).toBeUndefined();
    });
  });

  it("preserves durable lanes when a channel derives ephemeral claim lanes", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1;
      const queue = createTestIngressQueue<{ text: string }>(stateDir, { now: () => clock++ });

      await queue.enqueue("message-1", { text: "debounced" }, { laneKey: "chat:123" });

      const claimed = await queue.claimNext({
        ownerId: "imessage-worker",
        deriveLaneKey: (record) => `${record.laneKey ?? "event"}:${record.id}`,
      });

      expect(claimed?.laneKey).toBe("chat:123");
      expect((await queue.listClaims())[0]?.laneKey).toBe("chat:123");
    });
  });

  it("reconciles opted-in persisted lanes before blocking and claiming", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1;
      const queue = createTestIngressQueue<{ lane: string }>(stateDir, { now: () => clock++ });

      await queue.enqueue(
        "a",
        { lane: "chat:123" },
        { laneKey: "chat:123:topic:7", receivedAt: 1 },
      );
      await queue.enqueue(
        "b",
        { lane: "chat:456" },
        { laneKey: "chat:456:topic:9", receivedAt: 2 },
      );

      const claimed = await queue.claimNext({
        ownerId: "worker",
        blockedLaneKeys: ["chat:123"],
        deriveLaneKey: (record) => record.payload.lane,
        reconcileStoredLaneKey: (_record, storedLaneKey, derivedLaneKey) =>
          storedLaneKey === `${derivedLaneKey}:topic:7` ||
          storedLaneKey === `${derivedLaneKey}:topic:9`,
      });

      expect(claimed?.id).toBe("b");
      expect(claimed?.laneKey).toBe("chat:456");
      expect((await queue.listClaims())[0]?.laneKey).toBe("chat:456");
      expect((await queue.listPending())[0]?.laneKey).toBe("chat:123:topic:7");
    });
  });

  it("blocks opted-in legacy candidate lanes using their canonical owner", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1;
      const queue = createTestIngressQueue<{ lane: string }>(stateDir, { now: () => clock++ });

      await queue.enqueue(
        "a",
        { lane: "chat:123" },
        { laneKey: "chat:123:topic:7", receivedAt: 1 },
      );
      await queue.enqueue(
        "b",
        { lane: "chat:123" },
        { laneKey: "chat:123:topic:8", receivedAt: 2 },
      );
      await queue.enqueue(
        "c",
        { lane: "chat:456" },
        { laneKey: "chat:456:topic:9", receivedAt: 3 },
      );
      await queue.claim("a", { ownerId: "sibling-worker" });

      const claimed = await queue.claimNext({
        ownerId: "worker",
        candidateIds: ["a", "b", "c"],
        orderBy: "id",
        deriveLaneKey: (record) => record.payload.lane,
        reconcileStoredLaneKey: (_record, storedLaneKey, derivedLaneKey) =>
          storedLaneKey.startsWith(`${derivedLaneKey}:topic:`),
      });

      expect(claimed?.id).toBe("c");
      expect(claimed?.laneKey).toBe("chat:456");
      expect((await queue.listClaims()).find((record) => record.id === "a")?.laneKey).toBe(
        "chat:123:topic:7",
      );
      expect((await queue.listPending())[0]?.laneKey).toBe("chat:123:topic:8");
    });
  });

  it("preserves persisted lanes when an owner rejects their reconciliation", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1;
      const queue = createTestIngressQueue<{ lane: string }>(stateDir, { now: () => clock++ });

      await queue.enqueue("a", { lane: "chat:123" }, { laneKey: "chat:999:topic:7" });

      const claimed = await queue.claimNext({
        ownerId: "worker",
        deriveLaneKey: (record) => record.payload.lane,
        reconcileStoredLaneKey: (_record, storedLaneKey, derivedLaneKey) =>
          storedLaneKey === `${derivedLaneKey}:topic:7`,
      });

      expect(claimed?.laneKey).toBe("chat:999:topic:7");
      expect((await queue.listClaims())[0]?.laneKey).toBe("chat:999:topic:7");
    });
  });

  it("blocks lanes claimed by candidate rows before claiming later candidates", async () => {
    await withTempState(async (stateDir) => {
      let clock = 1;
      const queue = createTestIngressQueue<{ lane: string }>(stateDir, { now: () => clock++ });

      await queue.enqueue("a", { lane: "chat-1" }, { receivedAt: 1 });
      await queue.enqueue("b", { lane: "chat-1" }, { receivedAt: 2 });
      await queue.enqueue("c", { lane: "chat-2" }, { receivedAt: 3 });
      await queue.claim("a", { ownerId: "sibling-worker" });

      const claimed = await queue.claimNext({
        ownerId: "worker",
        candidateIds: ["a", "b", "c"],
        orderBy: "id",
        deriveLaneKey: (record) => record.payload.lane,
      });

      expect(claimed?.id).toBe("c");
      expect(claimed?.laneKey).toBe("chat-2");
      const sameLanePending = (await queue.listPending()).find((record) => record.id === "b");
      expect(sameLanePending?.laneKey).toBeUndefined();
    });
  });

  it("requires claim tokens before mutating claimed rows", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue<{ text: string }>(stateDir, { now: () => 10 });

      await queue.enqueue("event-1", { text: "claimed" });
      const claimed = await queue.claim("event-1", { ownerId: "worker" });
      if (!claimed) {
        throw new Error("Expected a claimed ingress event");
      }

      expect(await queue.complete("event-1")).toBe(false);
      expect(await queue.release("event-1")).toBe(false);
      expect(await queue.fail("event-1", { reason: "stale-handler" })).toBe(false);
      expect(await queue.delete("event-1")).toBe(false);

      expect(await queue.complete(claimed, { completedAt: 20 })).toBe(true);
      const duplicate = await queue.enqueue("event-1", { text: "duplicate" });
      expect(duplicate.kind).toBe("completed");
    });
  });

  it("refreshes claimed rows only with the active claim token", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue<{ text: string }>(stateDir, { now: () => 10 });

      await queue.enqueue("event-1", { text: "claimed" });
      const claimed = await queue.claim("event-1", { ownerId: "worker" });
      if (!claimed) {
        throw new Error("Expected a claimed ingress event");
      }

      expect(await queue.refreshClaim?.(claimed, { refreshedAt: 20 })).toBe(true);
      expect(
        (await queue.listClaims()).map((claim) => ({
          id: claim.id,
          claimedAt: claim.claim.claimedAt,
          updatedAt: claim.updatedAt,
        })),
      ).toEqual([{ id: "event-1", claimedAt: 20, updatedAt: 20 }]);

      expect(
        await queue.refreshClaim?.(
          { id: "event-1", claim: { token: "wrong" } },
          {
            refreshedAt: 30,
          },
        ),
      ).toBe(false);
      expect((await queue.listClaims())[0]?.claim.claimedAt).toBe(20);
    });
  });

  it("does not let old claim tokens refresh recovered and reclaimed rows", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue<{ text: string }>(stateDir, { now: () => 10 });

      await queue.enqueue("event-1", { text: "claimed" });
      const oldClaim = await queue.claim("event-1", { ownerId: "worker-1" });
      if (!oldClaim) {
        throw new Error("Expected a claimed ingress event");
      }
      expect(await queue.recoverStaleClaims({ staleMs: 5, now: 20 })).toBe(1);
      const newClaim = await queue.claim("event-1", { ownerId: "worker-2" });
      if (!newClaim) {
        throw new Error("Expected reclaimed ingress event");
      }

      expect(await queue.refreshClaim?.(oldClaim, { refreshedAt: 30 })).toBe(false);
      expect(await queue.refreshClaim?.(newClaim, { refreshedAt: 40 })).toBe(true);
      expect((await queue.listClaims())[0]?.claim).toMatchObject({
        ownerId: "worker-2",
        claimedAt: 40,
      });
    });
  });

  it("does not recover a claim refreshed after stale recovery snapshots it", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue<{ text: string }>(stateDir, { now: () => 10 });

      await queue.enqueue("event-1", { text: "claimed" });
      const claimed = await queue.claim("event-1", { ownerId: "worker" });
      if (!claimed) {
        throw new Error("Expected a claimed ingress event");
      }

      expect(
        await queue.recoverStaleClaims({
          staleMs: 5,
          now: 20,
          shouldRecover: async (claim) => {
            expect(claim.id).toBe("event-1");
            expect(await queue.refreshClaim?.(claim, { refreshedAt: 20 })).toBe(true);
            return true;
          },
        }),
      ).toBe(0);
      expect((await queue.listPending()).map((record) => record.id)).toEqual([]);
      expect((await queue.listClaims())[0]?.claim).toMatchObject({
        ownerId: "worker",
        claimedAt: 20,
      });
    });
  });

  it("recovers stale claims and prunes completed or failed rows", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue<{ text: string }>(stateDir, { now: () => 10 });

      await queue.enqueue("old", { text: "old" });
      await queue.enqueue("keep", { text: "keep" });
      const old = await queue.claim("old", { ownerId: "worker" });
      const keep = await queue.claim("keep", { ownerId: "worker" });
      if (!keep) {
        throw new Error("Expected a claimed ingress event");
      }

      expect(
        await queue.recoverStaleClaims({
          staleMs: 5,
          now: 20,
          shouldRecover: (claim) => claim.id === old?.id,
        }),
      ).toBe(1);
      expect((await queue.listPending()).map((record) => record.id)).toEqual(["old"]);
      expect((await queue.listClaims()).map((record) => record.id)).toEqual(["keep"]);

      await queue.complete("old", { completedAt: 25 });
      await queue.fail(keep, { reason: "poison", message: "bad", failedAt: 25 });
      await queue.enqueue("retry", { text: "retry" });
      await queue.release("retry", { lastError: "stale retry text", releasedAt: 26 });
      await queue.complete("retry", { completedAt: 27 });

      const database = openOpenClawStateDatabase({
        env: { OPENCLAW_STATE_DIR: stateDir },
      });
      const kysely = getNodeSqliteKysely<ChannelIngressTestDatabase>(database.db);
      const rows = executeSqliteQuerySync(
        database.db,
        kysely
          .selectFrom("channel_ingress_events")
          .select(["event_id", "payload_json", "metadata_json", "last_attempt_at", "last_error"])
          .where("event_id", "in", ["old", "keep", "retry"])
          .orderBy("event_id", "asc"),
      ).rows;
      expect(rows).toEqual([
        {
          event_id: "keep",
          last_attempt_at: null,
          last_error: "bad",
          metadata_json: null,
          payload_json: JSON.stringify({ text: "keep" }),
        },
        {
          event_id: "old",
          last_attempt_at: null,
          last_error: null,
          metadata_json: null,
          payload_json: "null",
        },
        {
          event_id: "retry",
          last_attempt_at: null,
          last_error: null,
          metadata_json: null,
          payload_json: "null",
        },
      ]);

      expect(await queue.prune({ completedTtlMs: 10, failedTtlMs: 10, now: 40 })).toBe(3);
      expect(await queue.listPending()).toEqual([]);
      expect(await queue.listClaims()).toEqual([]);
    });
  });

  it.each([
    {
      name: "cap 0 clears non-protected completed rows",
      cap: 0,
      delivered: ["d1", "d2"],
      suppressed: ["s1"],
      protectIds: [] as string[],
      expectProtected: [] as string[],
      expectDuplicate: [] as string[],
      expectMissing: ["d1", "d2", "s1"],
      maxNonProtectedDelivered: 0,
      maxNonProtectedSuppressed: 0,
    },
    {
      name: "cap 0 keeps protected rows above the cap",
      cap: 0,
      delivered: ["d1"],
      suppressed: ["s-protect"],
      protectIds: ["s-protect"],
      expectProtected: ["s-protect"],
      expectDuplicate: ["s-protect"],
      expectMissing: ["d1"],
      maxNonProtectedDelivered: 0,
      maxNonProtectedSuppressed: 0,
    },
    {
      name: "cap 1 delivered-only keeps newest delivered full class capacity",
      cap: 1,
      delivered: ["d-old", "d-new"],
      suppressed: [] as string[],
      protectIds: [] as string[],
      expectProtected: [] as string[],
      expectDuplicate: ["d-new"],
      expectMissing: ["d-old"],
      maxNonProtectedDelivered: 1,
      maxNonProtectedSuppressed: 0,
    },
    {
      name: "cap 1 suppression-only keeps newest suppression full class capacity",
      cap: 1,
      delivered: [] as string[],
      suppressed: ["s-old", "s-new"],
      protectIds: [] as string[],
      expectProtected: [] as string[],
      expectDuplicate: ["s-new"],
      expectMissing: ["s-old"],
      maxNonProtectedDelivered: 0,
      maxNonProtectedSuppressed: 1,
    },
    {
      name: "cap 1 mixed keeps newest of each independent class",
      cap: 1,
      delivered: ["d-mid"],
      suppressed: ["s-newest"],
      protectIds: [] as string[],
      expectProtected: [] as string[],
      // Independent budgets: suppression cannot evict the delivered guard.
      expectDuplicate: ["d-mid", "s-newest"],
      expectMissing: [] as string[],
      maxNonProtectedDelivered: 1,
      maxNonProtectedSuppressed: 1,
    },
    {
      name: "cap 1 mixed with suppression overflow still protects delivered",
      cap: 1,
      delivered: ["d-guard"],
      suppressed: ["s-old", "s-new"],
      protectIds: [] as string[],
      expectProtected: [] as string[],
      expectDuplicate: ["d-guard", "s-new"],
      expectMissing: ["s-old"],
      maxNonProtectedDelivered: 1,
      maxNonProtectedSuppressed: 1,
    },
    {
      name: "cap 1 protected plus delivered keeps both classes",
      cap: 1,
      delivered: ["d-new"],
      suppressed: ["s-protect"],
      protectIds: ["s-protect"],
      expectProtected: ["s-protect"],
      expectDuplicate: ["s-protect", "d-new"],
      expectMissing: [] as string[],
      maxNonProtectedDelivered: 1,
      maxNonProtectedSuppressed: 0,
    },
    {
      name: "cap 1 protected above cap still retains all protected and class budget",
      cap: 1,
      delivered: ["d-new"],
      suppressed: ["s-p1", "s-p2", "s-extra"],
      protectIds: ["s-p1", "s-p2"],
      expectProtected: ["s-p1", "s-p2"],
      expectDuplicate: ["s-p1", "s-p2", "d-new", "s-extra"],
      expectMissing: [] as string[],
      maxNonProtectedDelivered: 1,
      maxNonProtectedSuppressed: 1,
    },
    {
      name: "cap 2 delivered-only keeps newest two full class capacity",
      cap: 2,
      delivered: ["d1", "d2", "d3"],
      suppressed: [] as string[],
      protectIds: [] as string[],
      expectProtected: [] as string[],
      expectDuplicate: ["d2", "d3"],
      expectMissing: ["d1"],
      maxNonProtectedDelivered: 2,
      maxNonProtectedSuppressed: 0,
    },
    {
      name: "cap 2 suppression-only keeps newest two full class capacity",
      cap: 2,
      delivered: [] as string[],
      suppressed: ["s1", "s2", "s3"],
      protectIds: [] as string[],
      expectProtected: [] as string[],
      expectDuplicate: ["s2", "s3"],
      expectMissing: ["s1"],
      maxNonProtectedDelivered: 0,
      maxNonProtectedSuppressed: 2,
    },
    {
      name: "cap 2 mixed keeps full independent budgets for both classes",
      cap: 2,
      delivered: ["d-old", "d-mid", "d-new"],
      suppressed: ["s-old", "s-mid", "s-new"],
      protectIds: [] as string[],
      expectProtected: [] as string[],
      expectDuplicate: ["d-mid", "d-new", "s-mid", "s-new"],
      expectMissing: ["d-old", "s-old"],
      maxNonProtectedDelivered: 2,
      maxNonProtectedSuppressed: 2,
    },
    {
      name: "cap 2 protects oldest suppressed without reducing delivered class budget",
      cap: 2,
      delivered: ["d-a", "d-b", "d-c"],
      suppressed: ["s-protect", "s-new", "s-extra"],
      protectIds: ["s-protect"],
      expectProtected: ["s-protect"],
      expectDuplicate: ["s-protect", "s-new", "s-extra", "d-b", "d-c"],
      expectMissing: ["d-a"],
      maxNonProtectedDelivered: 2,
      maxNonProtectedSuppressed: 2,
    },
    {
      name: "cap 2 protected count above class still retains protected and delivered budget",
      cap: 2,
      delivered: ["d-new"],
      suppressed: ["s-p1", "s-p2", "s-p3"],
      protectIds: ["s-p1", "s-p2", "s-p3"],
      expectProtected: ["s-p1", "s-p2", "s-p3"],
      expectDuplicate: ["s-p1", "s-p2", "s-p3", "d-new"],
      expectMissing: [] as string[],
      maxNonProtectedDelivered: 1,
      maxNonProtectedSuppressed: 0,
    },
  ])(
    "completed retention contract: $name",
    async ({
      cap,
      delivered,
      suppressed,
      protectIds,
      expectProtected,
      expectDuplicate,
      expectMissing,
      maxNonProtectedDelivered,
      maxNonProtectedSuppressed,
    }) => {
      await withTempState(async (stateDir) => {
        let tick = 1;
        const queue = createTestIngressQueue<
          { text: string },
          unknown,
          { ingressDisposition?: string; reason?: string; message?: string }
        >(stateDir, { now: () => tick });

        for (const id of delivered) {
          tick += 1;
          await queue.enqueue(id, { text: id }, { receivedAt: tick });
          const claim = await queue.claim(id, { ownerId: "worker" });
          expect(claim).not.toBeNull();
          if (claim) {
            tick += 1;
            expect(await queue.complete(claim, { completedAt: tick })).toBe(true);
          }
        }
        for (const id of suppressed) {
          tick += 1;
          await queue.enqueue(id, { text: id }, { receivedAt: tick });
          tick += 1;
          expect(
            await queue.complete(id, {
              completedAt: tick,
              metadata: {
                ingressDisposition: "suppressed",
                reason: "stale",
                message: "stale",
              },
            }),
          ).toBe(true);
        }

        tick += 1;
        await queue.prune({
          completedMaxEntries: cap,
          protectIds,
          now: tick,
        });

        const database = openOpenClawStateDatabase({
          env: { OPENCLAW_STATE_DIR: stateDir },
        });
        const kysely = getNodeSqliteKysely<ChannelIngressTestDatabase>(database.db);
        const completedRows = executeSqliteQuerySync(
          database.db,
          kysely
            .selectFrom("channel_ingress_events")
            .select(["event_id", "completed_metadata_json"])
            .where("status", "=", "completed"),
        ).rows as Array<{ event_id: string; completed_metadata_json: string | null }>;
        const completedIds = new Set(completedRows.map((row) => row.event_id));
        const isSuppressed = (metadataJson: string | null): boolean => {
          if (!metadataJson) {
            return false;
          }
          try {
            const parsed = JSON.parse(metadataJson) as { ingressDisposition?: unknown };
            return parsed?.ingressDisposition === "suppressed";
          } catch {
            return false;
          }
        };
        const nonProtectedDelivered = completedRows.filter(
          (row) => !protectIds.includes(row.event_id) && !isSuppressed(row.completed_metadata_json),
        ).length;
        const nonProtectedSuppressed = completedRows.filter(
          (row) => !protectIds.includes(row.event_id) && isSuppressed(row.completed_metadata_json),
        ).length;
        expect(nonProtectedDelivered).toBeLessThanOrEqual(maxNonProtectedDelivered);
        expect(nonProtectedSuppressed).toBeLessThanOrEqual(maxNonProtectedSuppressed);
        for (const id of expectProtected) {
          expect(completedIds.has(id)).toBe(true);
        }
        for (const id of expectDuplicate) {
          const replay = await queue.enqueue(id, { text: "probe" });
          expect(replay).toMatchObject({ kind: "completed", duplicate: true });
        }
        for (const id of expectMissing) {
          expect(completedIds.has(id)).toBe(false);
        }
      });
    },
  );

  it.each([
    { cap: 0, keepDelivered: false, keepSuppressedNewest: false },
    { cap: 1, keepDelivered: true, keepSuppressedNewest: true },
    { cap: 2, keepDelivered: true, keepSuppressedNewest: true },
  ])(
    "suppression overflow never reduces delivered replay guards at cap $cap",
    async ({ cap, keepDelivered, keepSuppressedNewest }) => {
      await withTempState(async (stateDir) => {
        let tick = 1;
        const queue = createTestIngressQueue<
          { text: string },
          unknown,
          { ingressDisposition?: string; reason?: string; message?: string }
        >(stateDir, { now: () => tick });

        // One delivered replay guard, then many newer suppressions.
        tick += 1;
        await queue.enqueue("delivered-guard", { text: "delivered" }, { receivedAt: tick });
        const claim = await queue.claim("delivered-guard", { ownerId: "worker" });
        expect(claim).not.toBeNull();
        if (claim) {
          tick += 1;
          expect(await queue.complete(claim, { completedAt: tick })).toBe(true);
        }
        for (const id of ["s-old", "s-mid", "s-new"]) {
          tick += 1;
          await queue.enqueue(id, { text: id }, { receivedAt: tick });
          tick += 1;
          expect(
            await queue.complete(id, {
              completedAt: tick,
              metadata: {
                ingressDisposition: "suppressed",
                reason: "stale",
                message: "stale",
              },
            }),
          ).toBe(true);
        }

        tick += 1;
        await queue.prune({ completedMaxEntries: cap, now: tick });

        const deliveredReplay = await queue.enqueue("delivered-guard", { text: "probe" });
        if (keepDelivered) {
          expect(deliveredReplay).toMatchObject({ kind: "completed", duplicate: true });
        } else {
          expect(deliveredReplay.kind).not.toBe("completed");
        }

        const newestSuppressedReplay = await queue.enqueue("s-new", { text: "probe" });
        if (keepSuppressedNewest && cap > 0) {
          expect(newestSuppressedReplay).toMatchObject({ kind: "completed", duplicate: true });
        } else if (cap === 0) {
          expect(newestSuppressedReplay.kind).not.toBe("completed");
        }

        // Older suppressions beyond the independent class budget are eligible to drop.
        if (cap === 1) {
          const oldSuppressed = await queue.enqueue("s-old", { text: "probe" });
          expect(oldSuppressed.kind).not.toBe("completed");
        }
      });
    },
  );

  it("completed retention breaks equal-timestamp ties by event_id desc", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue<
        { text: string },
        unknown,
        { ingressDisposition?: string; reason?: string; message?: string }
      >(stateDir, { now: () => 1 });
      // Same completedAt; lexicographically larger event_id must win the single seat.
      for (const id of ["tie-a", "tie-c", "tie-b"]) {
        await queue.enqueue(id, { text: id }, { receivedAt: 1 });
        expect(
          await queue.complete(id, {
            completedAt: 50,
            metadata: {
              ingressDisposition: "suppressed",
              reason: "stale",
              message: "stale",
            },
          }),
        ).toBe(true);
      }
      await queue.prune({ completedMaxEntries: 1, now: 100 });
      const replayC = await queue.enqueue("tie-c", { text: "probe" });
      const replayB = await queue.enqueue("tie-b", { text: "probe" });
      const replayA = await queue.enqueue("tie-a", { text: "probe" });
      expect(replayC).toMatchObject({ kind: "completed", duplicate: true });
      expect(replayB.kind).not.toBe("completed");
      expect(replayA.kind).not.toBe("completed");
    });
  });

  it("generation fence rejects ABA complete/fail after resubmit and non-attempt release", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue<{ text: string }>(stateDir, { now: () => 100 });
      await queue.enqueue("gen-resubmit", { text: "x" }, { receivedAt: 100 });
      const [snapshot] = await queue.listPending();
      expect(snapshot?.generation).toBe(1);
      const staleFence = {
        generation: snapshot!.generation,
        receivedAt: snapshot!.receivedAt,
        updatedAt: snapshot!.updatedAt,
      };

      expect(await queue.fail("gen-resubmit", { reason: "operator", message: "drop" })).toBe(true);
      // Recreate the original timestamp/attempt tuple on purpose.
      const resubmit = await queue.resubmit?.("gen-resubmit", { resubmittedAt: 100 });
      expect(resubmit).toMatchObject({ kind: "resubmitted" });
      const [afterResubmit] = await queue.listPending();
      expect(afterResubmit).toMatchObject({
        id: "gen-resubmit",
        receivedAt: 100,
        updatedAt: 100,
        attempts: 0,
      });
      expect(afterResubmit!.generation).toBeGreaterThan(staleFence.generation);
      expect(
        await queue.complete("gen-resubmit", {
          expectedPending: staleFence,
        }),
      ).toBe(false);
      expect(
        await queue.fail("gen-resubmit", {
          reason: "stale",
          message: "stale",
          expectedPending: staleFence,
        }),
      ).toBe(false);
      expect((await queue.listPending()).map((row) => row.id)).toEqual(["gen-resubmit"]);

      // Claim + non-attempting release can recycle timestamps/attempts; generation must still move.
      const releaseFence = {
        generation: afterResubmit!.generation,
        receivedAt: afterResubmit!.receivedAt,
        updatedAt: afterResubmit!.updatedAt,
      };
      const claim = await queue.claim("gen-resubmit", { ownerId: "worker" });
      expect(claim).not.toBeNull();
      if (!claim) {
        throw new Error("expected claim");
      }
      expect(
        await queue.release(claim, { recordAttempt: false, releasedAt: afterResubmit!.updatedAt }),
      ).toBe(true);
      const [afterRelease] = await queue.listPending();
      expect(afterRelease).toMatchObject({
        id: "gen-resubmit",
        receivedAt: 100,
        updatedAt: 100,
        attempts: 0,
      });
      expect(afterRelease!.generation).toBeGreaterThan(releaseFence.generation);
      expect(await queue.complete("gen-resubmit", { expectedPending: releaseFence })).toBe(false);
      expect(
        await queue.fail("gen-resubmit", {
          reason: "stale",
          expectedPending: releaseFence,
        }),
      ).toBe(false);
    });
  });

  it("stale recovery bumps generation so pre-claim disposition snapshots lose complete/fail", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue<{ text: string }>(stateDir, { now: () => 1_000 });
      await queue.enqueue("gen-recover", { text: "x" }, { receivedAt: 1_000 });
      const [snapshot] = await queue.listPending();
      expect(snapshot?.generation).toBe(1);
      const preClaimFence = {
        generation: snapshot!.generation,
        receivedAt: snapshot!.receivedAt,
        updatedAt: snapshot!.updatedAt,
      };

      const claim = await queue.claim("gen-recover", { ownerId: "stale-owner" });
      expect(claim).not.toBeNull();
      if (!claim) {
        throw new Error("expected claim");
      }
      // Snapshot taken before/around claim still carries the pre-recovery generation.
      expect(preClaimFence.generation).toBe(snapshot!.generation);

      expect(await queue.recoverStaleClaims({ staleMs: 0, now: 1_500 })).toBe(1);
      const [recovered] = await queue.listPending();
      expect(recovered?.id).toBe("gen-recover");
      expect(recovered!.generation).toBeGreaterThan(preClaimFence.generation);

      expect(
        await queue.complete("gen-recover", {
          expectedPending: preClaimFence,
        }),
      ).toBe(false);
      expect(
        await queue.fail("gen-recover", {
          reason: "stale",
          message: "stale disposition after recover",
          expectedPending: preClaimFence,
        }),
      ).toBe(false);
      expect((await queue.listPending()).map((row) => row.id)).toEqual(["gen-recover"]);
      expect((await queue.listPending())[0]?.generation).toBe(recovered!.generation);
    });
  });

  it("delete/prune/re-enqueue never reuses generation fences for stale complete/fail", async () => {
    await withTempState(async (stateDir) => {
      const { openOpenClawStateDatabase } = await import("../../state/openclaw-state-db.js");
      const queue = createTestIngressQueue<{ text: string }>(stateDir, { now: () => 50 });
      await queue.enqueue("aba-id", { text: "first" }, { receivedAt: 10, laneKey: "lane:a" });
      const [first] = await queue.listPending();
      expect(first?.generation).toBe(1);
      const staleFence = {
        generation: first!.generation,
        receivedAt: first!.receivedAt,
        updatedAt: first!.updatedAt,
      };

      expect(await queue.delete("aba-id")).toBe(true);
      const re = await queue.enqueue(
        "aba-id",
        { text: "second" },
        { receivedAt: 10, laneKey: "lane:a" },
      );
      expect(re).toMatchObject({ kind: "accepted", duplicate: false });
      const [second] = await queue.listPending();
      expect(second!.generation).toBeGreaterThan(staleFence.generation);
      expect(
        await queue.complete("aba-id", {
          expectedPending: staleFence,
          metadata: { ingressDisposition: "suppressed", reason: "stale", message: "stale" },
        }),
      ).toBe(false);
      expect(
        await queue.fail("aba-id", {
          reason: "stale",
          message: "stale",
          expectedPending: staleFence,
        }),
      ).toBe(false);
      expect((await queue.listPending()).map((row) => row.id)).toEqual(["aba-id"]);
      expect((await queue.listPending())[0]?.generation).toBe(second!.generation);

      // Prune the live row, re-enqueue same id — fence must still advance.
      const liveFence = {
        generation: second!.generation,
        receivedAt: second!.receivedAt,
        updatedAt: second!.updatedAt,
      };
      expect(await queue.prune({ pendingMaxEntries: 0, now: 100 })).toBeGreaterThan(0);
      {
        const { DatabaseSync } = await import("node:sqlite");
        const { resolveOpenClawStateSqlitePath } =
          await import("../../state/openclaw-state-db.paths.js");
        const dbPath = resolveOpenClawStateSqlitePath({ OPENCLAW_STATE_DIR: stateDir });
        const inspect = new DatabaseSync(dbPath, { readOnly: true });
        try {
          const orphanGens = inspect
            .prepare(
              "SELECT COUNT(*) AS n FROM channel_ingress_event_generations WHERE queue_name LIKE ?",
            )
            .get("%test%") as { n: number };
          expect(Number(orphanGens.n)).toBe(0);
        } finally {
          inspect.close();
        }
      }
      const third = await queue.enqueue(
        "aba-id",
        { text: "third" },
        { receivedAt: 10, laneKey: "lane:a" },
      );
      expect(third).toMatchObject({ kind: "accepted" });
      const [afterPrune] = await queue.listPending();
      expect(afterPrune!.generation).toBeGreaterThan(liveFence.generation);
      expect(await queue.complete("aba-id", { expectedPending: liveFence })).toBe(false);
      expect(await queue.fail("aba-id", { reason: "stale", expectedPending: liveFence })).toBe(
        false,
      );
    });
  });

  it("bounds generation side-table orphans after unique-id prune churn", async () => {
    await withTempState(async (stateDir) => {
      const { openOpenClawStateDatabase } = await import("../../state/openclaw-state-db.js");
      const queue = createTestIngressQueue<{ text: string }>(stateDir, { now: () => 1 });
      for (let i = 0; i < 8; i += 1) {
        await queue.enqueue(`id-${i}`, { text: String(i) }, { receivedAt: i });
      }
      expect(await queue.prune({ pendingMaxEntries: 2, now: 100 })).toBeGreaterThan(0);
      {
        const { DatabaseSync } = await import("node:sqlite");
        const { resolveOpenClawStateSqlitePath } =
          await import("../../state/openclaw-state-db.paths.js");
        const dbPath = resolveOpenClawStateSqlitePath({ OPENCLAW_STATE_DIR: stateDir });
        const inspect = new DatabaseSync(dbPath, { readOnly: true });
        try {
          const events = inspect
            .prepare("SELECT COUNT(*) AS n FROM channel_ingress_events")
            .get() as { n: number };
          const gens = inspect
            .prepare("SELECT COUNT(*) AS n FROM channel_ingress_event_generations")
            .get() as { n: number };
          expect(Number(events.n)).toBe(2);
          expect(Number(gens.n)).toBe(2);
          const counter = inspect
            .prepare("SELECT next_generation AS n FROM channel_ingress_generation_counters")
            .get() as { n: number } | undefined;
          expect(Number(counter?.n ?? 0)).toBeGreaterThanOrEqual(8);
        } finally {
          inspect.close();
        }
      }
      // Re-enqueue a pruned id — allocator continues past prior values.
      const again = await queue.enqueue("id-0", { text: "again" }, { receivedAt: 0 });
      expect(again).toMatchObject({ kind: "accepted" });
      const [row] = await queue.listPending({ limit: "all" });
      const matching = (await queue.listPending({ limit: "all" })).find((r) => r.id === "id-0");
      expect(matching!.generation).toBeGreaterThan(8);
      void row;
    });
  });

  it("pending settlement refuses when a same-lane claim appears after the disposition snapshot", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue<{ text: string }>(stateDir, { now: () => 1_000 });
      await queue.enqueue("head", { text: "h" }, { laneKey: "lane:x", receivedAt: 1 });
      await queue.enqueue("tail", { text: "t" }, { laneKey: "lane:x", receivedAt: 2 });
      const [tail] = (await queue.listPending({ limit: "all" })).filter((r) => r.id === "tail");
      const fence = {
        generation: tail!.generation,
        receivedAt: tail!.receivedAt,
        updatedAt: tail!.updatedAt,
      };
      const headClaim = await queue.claim("head", { ownerId: "peer" });
      expect(headClaim).not.toBeNull();
      expect(
        await queue.complete("tail", {
          expectedPending: fence,
          metadata: { ingressDisposition: "suppressed", reason: "stale", message: "stale" },
        }),
      ).toBe(false);
      expect((await queue.listPending({ limit: "all" })).map((r) => r.id)).toEqual(["tail"]);
      expect((await queue.listClaims()).map((c) => c.id)).toEqual(["head"]);
    });
  });

  it("claimNext always fences raw live same-lane claims including non-candidate and corrupt heads", async () => {
    await withTempState(async (stateDir) => {
      const queue = createTestIngressQueue<{ text: string }>(stateDir, { now: () => 1_000 });
      const laneKey = "lane:peer";
      const otherLane = "lane:other";
      await queue.enqueue("head", { text: "h" }, { laneKey, receivedAt: 1 });
      await queue.enqueue("tail", { text: "t" }, { laneKey, receivedAt: 2 });
      await queue.enqueue("other", { text: "o" }, { laneKey: otherLane, receivedAt: 3 });

      // Peer holds head outside the later claimNext candidate set (TOCTOU: drain
      // listClaims can miss non-candidate / corrupt live claims).
      const headClaim = await queue.claim("head", { ownerId: "peer" });
      expect(headClaim).not.toBeNull();

      const claimed = await queue.claimNext({
        ownerId: "drainer",
        candidateIds: ["tail", "other"],
        blockedLaneKeys: [],
      });
      // Same-lane tail must stay pending; unrelated lane advances.
      expect(claimed?.id).toBe("other");
      expect((await queue.listPending({ limit: "all" })).map((r) => r.id)).toEqual(["tail"]);
      expect((await queue.listClaims()).map((c) => c.id).toSorted()).toEqual(["head", "other"]);

      // Corrupt live claim (payload decode fails → listClaims omits it) still fences.
      const { DatabaseSync } = await import("node:sqlite");
      const { resolveOpenClawStateSqlitePath } =
        await import("../../state/openclaw-state-db.paths.js");
      const dbPath = resolveOpenClawStateSqlitePath({ OPENCLAW_STATE_DIR: stateDir });
      closeOpenClawStateDatabaseForTest();
      const db = new DatabaseSync(dbPath);
      try {
        db.prepare(
          `UPDATE channel_ingress_events
           SET status = 'pending', claim_owner = NULL, claim_token = NULL
           WHERE event_id = 'head'`,
        ).run();
        db.prepare(
          `UPDATE channel_ingress_events
           SET status = 'claimed',
               claim_owner = 'corrupt-peer',
               claim_token = 'tok',
               payload_json = '{corrupt'
           WHERE event_id = 'head'`,
        ).run();
      } finally {
        db.close();
      }
      // Re-open queue against mutated DB.
      const queue2 = createTestIngressQueue<{ text: string }>(stateDir, { now: () => 1_000 });
      expect((await queue2.listClaims()).map((c) => c.id)).toEqual(["other"]);
      const claimedAfterCorrupt = await queue2.claimNext({
        ownerId: "drainer-2",
        candidateIds: ["tail"],
        blockedLaneKeys: [],
      });
      expect(claimedAfterCorrupt).toBeNull();
      expect((await queue2.listPending({ limit: "all" })).map((r) => r.id)).toEqual(["tail"]);
    });
  });

  it("bounds generation counters to a singleton across queue-name churn", async () => {
    await withTempState(async (stateDir) => {
      const { resolveOpenClawStateSqlitePath } =
        await import("../../state/openclaw-state-db.paths.js");
      const { DatabaseSync } = await import("node:sqlite");
      // Many distinct queue scopes (plugin/account churn).
      for (let i = 0; i < 12; i += 1) {
        const q = createChannelIngressQueue<{ text: string }>({
          channelId: `churn-${i}`,
          accountId: `acct-${i}`,
          stateDir,
          now: () => i + 1,
        });
        await q.enqueue(`evt-${i}`, { text: String(i) }, { receivedAt: i });
      }
      closeOpenClawStateDatabaseForTest();
      const dbPath = resolveOpenClawStateSqlitePath({ OPENCLAW_STATE_DIR: stateDir });
      const inspect = new DatabaseSync(dbPath, { readOnly: true });
      try {
        const counterRows = inspect
          .prepare("SELECT COUNT(*) AS n FROM channel_ingress_generation_counters")
          .get() as { n: number };
        expect(Number(counterRows.n)).toBe(1);
        const highWater = inspect
          .prepare("SELECT next_generation AS n FROM channel_ingress_generation_counters")
          .get() as { n: number };
        expect(Number(highWater.n)).toBeGreaterThanOrEqual(12);
        const genRows = inspect
          .prepare("SELECT COUNT(*) AS n FROM channel_ingress_event_generations")
          .get() as { n: number };
        expect(Number(genRows.n)).toBe(12);
      } finally {
        inspect.close();
      }
      // Delete via one queue then re-enqueue under a fresh name — never-reuse holds.
      const first = createChannelIngressQueue<{ text: string }>({
        channelId: "churn-0",
        accountId: "acct-0",
        stateDir,
        now: () => 100,
      });
      expect(await first.delete("evt-0")).toBe(true);
      const fresh = createChannelIngressQueue<{ text: string }>({
        channelId: "brand-new-scope",
        accountId: "brand-new",
        stateDir,
        now: () => 200,
      });
      await fresh.enqueue("fresh", { text: "x" }, { receivedAt: 200 });
      const [row] = await fresh.listPending();
      expect(row!.generation).toBeGreaterThan(12);
      closeOpenClawStateDatabaseForTest();
      const inspect2 = new DatabaseSync(dbPath, { readOnly: true });
      try {
        const counterRows = inspect2
          .prepare("SELECT COUNT(*) AS n FROM channel_ingress_generation_counters")
          .get() as { n: number };
        expect(Number(counterRows.n)).toBe(1);
      } finally {
        inspect2.close();
      }
    });
  });

  describe("corrupt JSON resilience", () => {
    function insertCorruptRow(
      stateDir: string,
      queueName: string,
      eventId: string,
      overrides: Partial<{
        payload_json: string;
        metadata_json: string | null;
        completed_metadata_json: string | null;
        status: string;
        claim_token: string;
        claim_owner: string;
        claimed_at: number;
        completed_at: number;
      }>,
    ) {
      const { db } = openOpenClawStateDatabase({
        env: { OPENCLAW_STATE_DIR: stateDir },
      });
      const kysely = getNodeSqliteKysely<ChannelIngressTestDatabase>(db);
      const claimValue = overrides.claim_token ?? null;
      executeSqliteQuerySync(
        db,
        kysely.insertInto("channel_ingress_events").values({
          queue_name: queueName,
          event_id: eventId,
          channel_id: "test",
          account_id: "account",
          status: overrides.status ?? "pending",
          lane_key: null,
          payload_json: overrides.payload_json ?? "null",
          metadata_json: overrides.metadata_json ?? null,
          completed_metadata_json: overrides.completed_metadata_json ?? null,
          received_at: 100,
          updated_at: 200,
          attempts: 0,
          claim_token: claimValue,
          claim_owner: overrides.claim_owner ?? null,
          claimed_at: overrides.claimed_at ?? null,
          completed_at: overrides.completed_at ?? null,
        } as Insertable<OpenClawStateKyselyDatabase["channel_ingress_events"]>),
      );
    }

    it("reconciles a corrupt pending row during listPending and returns valid neighbors", async () => {
      await withTempState(async (stateDir) => {
        const queue = createTestIngressQueue<{ text: string }>(stateDir);

        await queue.enqueue("good-1", { text: "hello" });
        insertCorruptRow(stateDir, '["test","account"]', "bad-1", {
          payload_json: "{corrupt: true, >>>NOT JSON<<<",
        });
        await queue.enqueue("good-2", { text: "world" });

        const pending = await queue.listPending();
        expect(pending).toHaveLength(2);
        expect(pending.map((r) => r.id).toSorted()).toEqual(["good-1", "good-2"]);
        const failed = await queue.listFailed?.({ limit: "all" });
        expect(failed?.map((row) => row.id)).toEqual(["bad-1"]);
        expect(failed?.[0]?.reason).toBe("corrupt_payload");
      });
    });

    it("bounds listPending SQL selection by limit including corrupt rows and zero", async () => {
      await withTempState(async (stateDir) => {
        const { instrumentPendingListSql } = await import("./ingress-drain.test-helpers.js");
        // Open the cached DB before instrumentation wraps prepare.
        const queue = createTestIngressQueue<{ text: string }>(stateDir);
        const sql = instrumentPendingListSql(stateDir);
        for (let index = 0; index < 120; index += 1) {
          insertCorruptRow(
            stateDir,
            '["test","account"]',
            `bad-${index.toString().padStart(3, "0")}`,
            { payload_json: "{corrupt" },
          );
        }
        await queue.enqueue("good-second", { text: "visible" }, { receivedAt: 10_000 });

        sql.reset();
        expect(await queue.listPending({ limit: 0 })).toEqual([]);
        expect(sql.selectCalls()).toBe(0);
        expect(sql.selectedRows()).toBe(0);

        sql.reset();
        const pending = await queue.listPending({ limit: 4 });
        // Corrupt prefix consumes the row budget; do not walk the full 100-row page.
        expect(pending).toEqual([]);
        expect(sql.selectedRows()).toBe(4);
        expect(sql.selectedRows()).toBeLessThanOrEqual(4);
      });
    });

    it("repeated bounded listPending reconciles a corrupt prefix until valid work appears", async () => {
      await withTempState(async (stateDir) => {
        const queue = createTestIngressQueue<{ text: string }>(stateDir);
        for (let index = 0; index < 5; index += 1) {
          insertCorruptRow(stateDir, '["test","account"]', `bad-${index}`, {
            payload_json: "{corrupt",
          });
        }
        await queue.enqueue("good-tail", { text: "reachable" }, { receivedAt: 10_000 });

        const startLimit = 2;
        let sawGood = false;
        for (let pump = 0; pump < 5; pump += 1) {
          const pending = await queue.listPending({ limit: startLimit });
          if (pending.some((row) => row.id === "good-tail")) {
            sawGood = true;
            break;
          }
          expect(pending.length).toBeLessThanOrEqual(startLimit);
        }
        expect(sawGood).toBe(true);
        expect((await queue.listFailed?.({ limit: "all" }))?.length).toBe(5);
      });
    });

    it("uses the queue JSON contract when listing deeply nested payloads", async () => {
      await withTempState(async (stateDir) => {
        const queue = createTestIngressQueue<unknown>(stateDir);
        const nestedJson = `${"[".repeat(1001)}0${"]".repeat(1001)}`;
        const payload = JSON.parse(nestedJson);

        await queue.enqueue("deep", payload);

        await expect(queue.listPending({ limit: 1 })).resolves.toMatchObject([{ id: "deep" }]);
      });
    });

    it("skips corrupt metadata_json in listPending", async () => {
      await withTempState(async (stateDir) => {
        const queue = createTestIngressQueue<{ text: string }, { source: string }>(stateDir);

        await queue.enqueue("ev-1", { text: "ok" }, { metadata: { source: "good" } });
        insertCorruptRow(stateDir, '["test","account"]', "ev-bad-meta", {
          payload_json: JSON.stringify({ text: "has corrupt metadata" }),
          metadata_json: "{broken",
        });

        const pending = await queue.listPending();
        const bad = pending.find((r) => r.id === "ev-bad-meta");
        expect(bad).not.toBeNull();
        expect(bad!.metadata).toBeUndefined();
      });
    });

    it("skips a claimed row with corrupt payload_json in listClaims", async () => {
      await withTempState(async (stateDir) => {
        const queue = createTestIngressQueue<{ text: string }>(stateDir);

        await queue.enqueue("claim-ok", { text: "ok" });
        insertCorruptRow(stateDir, '["test","account"]', "claim-bad", {
          payload_json: "{{{broken",
          status: "claimed",
          claim_token: "test-token-placeholder",
          claim_owner: "worker",
          claimed_at: 200,
        });

        // Verify that listClaims skips the corrupt claimed row.
        const initialClaims = await queue.listClaims();
        expect(initialClaims.some((c) => c.id === "claim-bad")).toBe(false);

        // The valid enqueued row can still be claimed.
        const claimResult = await queue.claim("claim-ok");
        expect(claimResult).not.toBeNull();

        const allClaims = await queue.listClaims();
        expect(allClaims.some((c) => c.id === "claim-bad")).toBe(false);
      });
    });

    it("skips corrupt completed_metadata_json during duplicate detection", async () => {
      await withTempState(async (stateDir) => {
        const queue = createTestIngressQueue<{ text: string }, unknown, { handler: string }>(
          stateDir,
        );

        await queue.enqueue("comp-1", { text: "first" });
        await queue.complete("comp-1", { metadata: { handler: "worker" }, completedAt: 150 });

        // Corrupt the completed_metadata_json
        const { db } = openOpenClawStateDatabase({
          env: { OPENCLAW_STATE_DIR: stateDir },
        });
        db.prepare(
          `UPDATE channel_ingress_events
             SET completed_metadata_json = ?
           WHERE queue_name = ? AND event_id = ?`,
        ).run("not valid json", '["test","account"]', "comp-1");

        // Duplicate detection should still work (metadata just omitted)
        const dup = await queue.enqueue("comp-1", { text: "late" });
        expect(dup.kind).toBe("completed");
        if (dup.kind === "completed") {
          expect(dup.record.metadata).toBeUndefined();
        }
      });
    });

    it("claimNext skips a corrupt first pending row without lane derivation", async () => {
      await withTempState(async (stateDir) => {
        const queue = createTestIngressQueue<{ text: string }>(stateDir);

        // Insert the bad row first so it sorts before the good row.
        const earlyTime = 10;
        insertCorruptRow(stateDir, '["test","account"]', "bad-claim", {
          payload_json: "{corrupt",
        });
        // Override the bad row's received_at to be earlier.
        {
          const { db } = openOpenClawStateDatabase({
            env: { OPENCLAW_STATE_DIR: stateDir },
          });
          db.prepare(
            `UPDATE channel_ingress_events SET received_at = ? WHERE queue_name = ? AND event_id = ?`,
          ).run(earlyTime, '["test","account"]', "bad-claim");
        }
        await queue.enqueue("good-1", { text: "hello" }, { receivedAt: earlyTime + 10 });

        const claimed = await queue.claimNext();
        expect(claimed).not.toBeNull();
        expect(claimed!.id).toBe("good-1");

        const database = openOpenClawStateDatabase({ env: { OPENCLAW_STATE_DIR: stateDir } });
        const failed = executeSqliteQueryTakeFirstSync(
          database.db,
          getNodeSqliteKysely<ChannelIngressTestDatabase>(database.db)
            .selectFrom("channel_ingress_events")
            .select(["status", "failed_reason", "payload_json"])
            .where("queue_name", "=", '["test","account"]')
            .where("event_id", "=", "bad-claim"),
        );
        expect(failed).toEqual({
          status: "failed",
          failed_reason: "corrupt_payload",
          payload_json: "null",
        });
      });
    });

    it("makes durable progress when a corrupt prefix fills the claim scan limit", async () => {
      await withTempState(async (stateDir) => {
        const queue = createTestIngressQueue<{ text: string }>(stateDir);
        insertCorruptRow(stateDir, '["test","account"]', "bad-first", {
          payload_json: "{corrupt",
        });
        await queue.enqueue("good-second", { text: "claimable" }, { receivedAt: 300 });

        await expect(queue.claimNext({ scanLimit: 1 })).resolves.toMatchObject({
          id: "good-second",
          payload: { text: "claimable" },
        });
      });
    });

    it("bounds corrupt reconciliation work per claimNext call", async () => {
      await withTempState(async (stateDir) => {
        const queueName = '["test","account"]';
        const queue = createTestIngressQueue<{ text: string }>(stateDir);
        for (let index = 0; index < 101; index += 1) {
          insertCorruptRow(stateDir, queueName, `bad-${index.toString().padStart(3, "0")}`, {
            payload_json: "{corrupt",
          });
        }

        await expect(queue.claimNext({ scanLimit: 200 })).resolves.toBeNull();

        const database = openOpenClawStateDatabase({ env: { OPENCLAW_STATE_DIR: stateDir } });
        const counts = executeSqliteQuerySync(
          database.db,
          getNodeSqliteKysely<ChannelIngressTestDatabase>(database.db)
            .selectFrom("channel_ingress_events")
            .select(["status"])
            .where("queue_name", "=", queueName),
        ).rows;
        expect(counts.filter((row) => row.status === "failed")).toHaveLength(100);
        expect(counts.filter((row) => row.status === "pending")).toHaveLength(1);

        await expect(queue.claimNext({ scanLimit: 200 })).resolves.toBeNull();
        expect(await queue.listPending({ limit: "all" })).toEqual([]);
      });
    });

    it("claim returns null for a corrupt pending row", async () => {
      await withTempState(async (stateDir) => {
        const queue = createTestIngressQueue<{ text: string }>(stateDir);

        await queue.enqueue("good-1", { text: "hello" });
        insertCorruptRow(stateDir, '["test","account"]', "bad-direct", {
          payload_json: "{corrupt",
        });

        // The corrupt row should not be claimable.
        const badClaim = await queue.claim("bad-direct");
        expect(badClaim).toBeNull();

        // The good row should still be claimable.
        const goodClaim = await queue.claim("good-1");
        expect(goodClaim).not.toBeNull();
        expect(goodClaim!.payload.text).toBe("hello");

        const database = openOpenClawStateDatabase({ env: { OPENCLAW_STATE_DIR: stateDir } });
        const failed = executeSqliteQueryTakeFirstSync(
          database.db,
          getNodeSqliteKysely<ChannelIngressTestDatabase>(database.db)
            .selectFrom("channel_ingress_events")
            .select(["status", "failed_reason"])
            .where("queue_name", "=", '["test","account"]')
            .where("event_id", "=", "bad-direct"),
        );
        expect(failed).toEqual({ status: "failed", failed_reason: "corrupt_payload" });
      });
    });

    it("handles valid JSON null payload correctly", async () => {
      await withTempState(async (stateDir) => {
        const queue = createTestIngressQueue<null>(stateDir);

        // Valid JSON null should parse as null, not be treated as corrupt.
        await queue.enqueue("null-ok", null);
        const pending = await queue.listPending();
        expect(pending).toHaveLength(1);
        expect(expectDefined(pending[0], "pending[0] test invariant").payload).toBeNull();
      });
    });

    it("tombstones a corrupt pending row on duplicate enqueue", async () => {
      await withTempState(async (stateDir) => {
        const queue = createTestIngressQueue<{ text: string }>(stateDir);

        insertCorruptRow(stateDir, '["test","account"]', "dup-bad", {
          payload_json: "{corrupt",
        });

        const result = await queue.enqueue("dup-bad", { text: "late" });
        expect(result.kind).toBe("failed");
        if (result.kind === "failed") {
          expect(result.duplicate).toBe(true);
          expect(result.record.reason).toBe("corrupt_payload");
        }

        // Verify the corrupt row was actually tombstoned in the DB.
        const { db } = openOpenClawStateDatabase({
          env: { OPENCLAW_STATE_DIR: stateDir },
        });
        const row = executeSqliteQuerySync(
          db,
          getNodeSqliteKysely<ChannelIngressTestDatabase>(db)
            .selectFrom("channel_ingress_events")
            .select(["status", "failed_reason", "payload_json", "claim_token", "claimed_at"])
            .where("queue_name", "=", '["test","account"]')
            .where("event_id", "=", "dup-bad"),
        ).rows[0];
        expect(row?.status).toBe("failed");
        expect(row?.failed_reason).toBe("corrupt_payload");
        expect(row?.payload_json).toBe("null");
        expect(row?.claim_token).toBeNull();
        expect(row?.claimed_at).toBeNull();
      });
    });

    it("does not tombstone a corrupt actively claimed row on duplicate enqueue", async () => {
      await withTempState(async (stateDir) => {
        const queue = createTestIngressQueue<{ text: string }>(stateDir);
        insertCorruptRow(stateDir, '["test","account"]', "dup-claimed-bad", {
          payload_json: "{corrupt",
          status: "claimed",
          claim_token: "test-token-placeholder",
          claim_owner: "active-worker",
          claimed_at: 200,
        });

        await expect(queue.enqueue("dup-claimed-bad", { text: "late" })).rejects.toThrow(
          "Corrupt payload_json in claimed channel ingress event",
        );

        const { db } = openOpenClawStateDatabase({
          env: { OPENCLAW_STATE_DIR: stateDir },
        });
        const row = executeSqliteQueryTakeFirstSync(
          db,
          getNodeSqliteKysely<ChannelIngressTestDatabase>(db)
            .selectFrom("channel_ingress_events")
            .select(["status", "payload_json", "claim_token", "claim_owner", "claimed_at"])
            .where("queue_name", "=", '["test","account"]')
            .where("event_id", "=", "dup-claimed-bad"),
        );
        expect(row).toEqual({
          status: "claimed",
          payload_json: "{corrupt",
          claim_token: "test-token-placeholder",
          claim_owner: "active-worker",
          claimed_at: 200,
        });
      });
    });

    it("tombstones corrupt claimed rows during stale recovery", async () => {
      await withTempState(async (stateDir) => {
        const queue = createTestIngressQueue<{ text: string }>(stateDir);

        const oldTime = 10;
        insertCorruptRow(stateDir, '["test","account"]', "stale-bad", {
          payload_json: "{corrupt",
          status: "claimed",
          claim_token: "test-token-placeholder",
          claim_owner: "worker",
          claimed_at: oldTime,
        });

        const recovered = await queue.recoverStaleClaims({
          staleMs: Date.now() - oldTime,
        });
        expect(recovered).toBe(1);

        // The corrupt claimed row should now be tombstoned as failed.
        const { db } = openOpenClawStateDatabase({
          env: { OPENCLAW_STATE_DIR: stateDir },
        });
        const row = executeSqliteQuerySync(
          db,
          getNodeSqliteKysely<ChannelIngressTestDatabase>(db)
            .selectFrom("channel_ingress_events")
            .select(["status", "failed_reason", "payload_json", "claim_token", "claimed_at"])
            .where("queue_name", "=", '["test","account"]')
            .where("event_id", "=", "stale-bad"),
        ).rows[0];
        expect(row?.status).toBe("failed");
        expect(row?.failed_reason).toBe("corrupt_payload");
        expect(row?.payload_json).toBe("null");
        expect(row?.claim_token).toBeNull();
        expect(row?.claimed_at).toBeNull();
        await expect(queue.recoverStaleClaims({ staleMs: Date.now() - oldTime })).resolves.toBe(0);
      });
    });

    it("does not bypass recovery policy for a corrupt stale claim", async () => {
      await withTempState(async (stateDir) => {
        const queue = createTestIngressQueue<{ text: string }>(stateDir);
        insertCorruptRow(stateDir, '["test","account"]', "stale-policy-bad", {
          payload_json: "{corrupt",
          status: "claimed",
          claim_token: "test-token-placeholder",
          claim_owner: "active-worker",
          claimed_at: 10,
        });
        const shouldRecover = vi.fn(() => true);
        const shouldRecoverCorrupt = vi.fn(() => false);

        await expect(
          queue.recoverStaleClaims({
            staleMs: 10,
            now: 20,
            shouldRecover,
            shouldRecoverCorrupt,
          }),
        ).resolves.toBe(0);
        expect(shouldRecover).not.toHaveBeenCalled();
        expect(shouldRecoverCorrupt).toHaveBeenCalledWith({
          id: "stale-policy-bad",
          channelId: "test",
          accountId: "account",
          queueName: '["test","account"]',
          reason: "corrupt_payload",
          claim: {
            token: "test-token-placeholder",
            ownerId: "active-worker",
            claimedAt: 10,
          },
        });

        const { db } = openOpenClawStateDatabase({
          env: { OPENCLAW_STATE_DIR: stateDir },
        });
        const row = executeSqliteQueryTakeFirstSync(
          db,
          getNodeSqliteKysely<ChannelIngressTestDatabase>(db)
            .selectFrom("channel_ingress_events")
            .select(["status", "payload_json", "claim_token", "claim_owner", "claimed_at"])
            .where("queue_name", "=", '["test","account"]')
            .where("event_id", "=", "stale-policy-bad"),
        );
        expect(row).toEqual({
          status: "claimed",
          payload_json: "{corrupt",
          claim_token: "test-token-placeholder",
          claim_owner: "active-worker",
          claimed_at: 10,
        });

        await expect(
          queue.recoverStaleClaims({
            staleMs: 10,
            now: 20,
            shouldRecover,
            shouldRecoverCorrupt: () => true,
          }),
        ).resolves.toBe(1);
        const failed = executeSqliteQueryTakeFirstSync(
          db,
          getNodeSqliteKysely<ChannelIngressTestDatabase>(db)
            .selectFrom("channel_ingress_events")
            .select(["status", "failed_reason"])
            .where("queue_name", "=", '["test","account"]')
            .where("event_id", "=", "stale-policy-bad"),
        );
        expect(failed).toEqual({ status: "failed", failed_reason: "corrupt_payload" });
      });
    });
  });
});
