import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setRuntimeConfigSnapshot } from "../../config/config.js";

// Logger mock for corrupt-payload breadcrumb assertions.
// Mirrors the shape used in sibling delegate-dispatch.test.ts so log.warn
// emissions land in `loggerRecords` for inspection.
const loggerRecords: Array<{ level: string; message: string }> = [];
vi.mock("../../logging/subsystem.js", () => {
  const record =
    (level: string) =>
    (message: string): void => {
      loggerRecords.push({ level, message });
    };
  const logger = {
    subsystem: "test",
    isEnabled: () => true,
    trace: record("trace"),
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
    fatal: record("fatal"),
    raw: record("raw"),
    child: () => logger,
  };
  return {
    createSubsystemLogger: () => logger,
  };
});

import { createContinuationRecord, updateContinuationRecords } from "./custody/custody-store.js";
import type { ContinuationRecord, ContinuationRecordPatch } from "./custody/custody-store.types.js";
import {
  custodyStateForTest,
  listCustodyRecordsForTest,
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import {
  claimStagedPostCompactionDelegates,
  consumeStagedPostCompactionDelegates as consumeSessionPostCompactionDelegates,
  listRecoverableStagedPostCompactionDelegates,
  releaseStagedPostCompactionDelegateToQueue,
  requeueReleasedPostCompactionDelegate as requeueSessionPostCompactionDelegate,
  stagePostCompactionCustodyDelegate,
  stagePostCompactionDelegate as stageSessionPostCompactionDelegate,
  stagedPostCompactionDelegateCount,
  toSessionPostCompactionDelegate,
} from "./delegate-store-post-compaction.js";
import {
  consumePendingDelegates,
  enqueuePendingDelegate,
  listPendingDelegateSessionKeysForRecovery,
  resetDelegateStoreForTests,
  revalidatePendingDelegateForSpawn,
} from "./delegate-store.js";
import { cancelSessionContinuations } from "./session-reset.js";
import type { PendingContinuationDelegate } from "./types.js";

const VALID_TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
const custody = useContinuationCustodyTestState();

function payloadTreeFor(record: ContinuationRecord): string {
  expect(typeof record.attachmentId).toBe("string");
  return path.join(
    custody.stateDir(),
    "attachments",
    "continuation-custody",
    record.attachmentId as string,
  );
}

async function readRecord(recordId: string | undefined): Promise<ContinuationRecord> {
  return expectDefined(
    await readCustodyRecordForTest(expectDefined(recordId, "record id")),
    "custody record",
  );
}

async function onlyRecordFor(sessionKey: string): Promise<ContinuationRecord> {
  const records = await listCustodyRecordsForTest({ ownerSessionKey: sessionKey });
  expect(records).toHaveLength(1);
  return expectDefined(records.at(0), "custody record");
}

/** Seed a record exactly as a legacy import or corrupt writer could have left it. */
async function queueRawRecord(
  sessionKey: string,
  state: unknown,
  kind: "delegate" | "post_compaction" = "delegate",
): Promise<string> {
  const recordId = crypto.randomUUID();
  const created = await createContinuationRecord({
    recordId,
    kind,
    ownerSessionKey: sessionKey,
    status: "queued",
    phase:
      kind === "delegate"
        ? "Queued for continuation dispatch"
        : "Staged for release after compaction",
    createdAt: Date.now(),
    stateJson: JSON.stringify(state),
  });
  expect(created.outcome).toBe("created");
  return recordId;
}

/** A concurrent writer committing against the record's current revision. */
async function writeConcurrently(recordId: string, patch: ContinuationRecordPatch): Promise<void> {
  const current = await readRecord(recordId);
  const result = await updateContinuationRecords(
    [
      {
        recordId,
        ownerSessionKey: current.ownerSessionKey,
        expectedRevision: current.revision,
        patch,
      },
    ],
    { now: Date.now() },
  );
  expect(result.outcome).toBe("applied");
}

async function releaseToQueue(sessionKey: string, delegate: PendingContinuationDelegate) {
  return await releaseStagedPostCompactionDelegateToQueue({
    sessionKey,
    delegate: toSessionPostCompactionDelegate(delegate),
    sequence: 0,
  });
}

beforeEach(() => {
  setRuntimeConfigSnapshot({
    tools: { sessions_spawn: { attachments: { enabled: true } } },
  });
  loggerRecords.length = 0;
  resetDelegateStoreForTests();
});

afterEach(() => {
  resetDelegateStoreForTests();
  vi.useRealTimers();
});

describe("post-compaction delegate staging", () => {
  it("stages and consumes post-compaction delegates", async () => {
    await stagePostCompactionCustodyDelegate("session-1", {
      task: "rehydrate state",
      stagedAt: 1000,
    });

    expect(stagedPostCompactionDelegateCount("session-1")).toBe(1);
    const delegates = await claimStagedPostCompactionDelegates("session-1");
    expect(delegates).toHaveLength(1);
    const delegate = expectDefined(delegates.at(0), "delegate");
    expect(delegate.task).toBe("rehydrate state");
    expect(delegate.mode).toBe("post-compaction");
    expect(stagedPostCompactionDelegateCount("session-1")).toBe(0);
  });

  it("does not claim or recover cancel-requested post-compaction delegates; reset releases their payloads", async () => {
    const queuedSessionKey = "session-cancel-requested-post-compaction-queued";
    const runningSessionKey = "session-cancel-requested-post-compaction-running";
    await stagePostCompactionCustodyDelegate(queuedSessionKey, {
      task: "queued must not spawn",
      stagedAt: 1_000,
      attachments: [{ name: "queued.md", content: "QUEUED_CANCEL_SECRET" }],
      attachAs: { mountPath: "handoff" },
    });
    const queuedRecord = await onlyRecordFor(queuedSessionKey);
    await writeConcurrently(queuedRecord.recordId, { cancelRequestedAt: Date.now() });

    await stagePostCompactionCustodyDelegate(runningSessionKey, {
      task: "running must not recover",
      stagedAt: 2_000,
      attachments: [{ name: "running.md", content: "RUNNING_CANCEL_SECRET" }],
      attachAs: { mountPath: "handoff" },
    });
    const runningDelegate = expectDefined(
      (await claimStagedPostCompactionDelegates(runningSessionKey)).at(0),
      "running delegate",
    );
    await writeConcurrently(runningDelegate.flowId!, { cancelRequestedAt: Date.now() });

    expect(await claimStagedPostCompactionDelegates(queuedSessionKey)).toEqual([]);
    expect(await listRecoverableStagedPostCompactionDelegates()).toEqual([]);
    const fencedQueued = await readRecord(queuedRecord.recordId);
    const fencedRunning = await readRecord(runningDelegate.flowId);
    expect(fencedQueued.status).toBe("queued");
    expect(fencedRunning.status).toBe("running");
    const payloadTrees: string[] = [];
    for (const record of [fencedQueued, fencedRunning]) {
      expect(record.cancelRequestedAt).toBeDefined();
      expect(custodyStateForTest(record)).not.toHaveProperty("attachments");
      expect(custodyStateForTest(record)).not.toHaveProperty("attachAs");
      expect(record.stateJson).not.toContain("CANCEL_SECRET");
      payloadTrees.push(payloadTreeFor(record));
    }

    // The fence alone never drives either record; reset terminalizes them and
    // the same commit releases their payloads (RFC §5.4.4 "Reset at any boundary").
    await cancelSessionContinuations(queuedSessionKey);
    await cancelSessionContinuations(runningSessionKey);
    for (const recordId of [queuedRecord.recordId, runningDelegate.flowId]) {
      const cancelled = await readRecord(recordId);
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.attachmentId).toBeUndefined();
    }
    for (const tree of payloadTrees) {
      expect(fs.existsSync(tree)).toBe(false);
    }
  });

  it("fails a post-compaction source cancelled after claim at the pre-spawn fence", async () => {
    const sessionKey = "post-compaction-cancelled-after-claim";
    const secret = "POST_COMPACTION_CANCELLED_AFTER_CLAIM_SECRET";
    await stagePostCompactionCustodyDelegate(sessionKey, {
      task: "must not spawn after cancellation",
      stagedAt: Date.now(),
      attachments: [{ name: "private.md", content: secret }],
      attachAs: { mountPath: "handoff" },
    });
    const delegate = expectDefined(
      (await claimStagedPostCompactionDelegates(sessionKey)).at(0),
      "claimed post-compaction delegate",
    );
    const payloadTree = payloadTreeFor(await readRecord(delegate.flowId));
    expect(fs.existsSync(payloadTree)).toBe(true);
    await writeConcurrently(delegate.flowId!, { cancelRequestedAt: Date.now() });

    expect(await revalidatePendingDelegateForSpawn(delegate, "post-compaction")).toMatchObject({
      allowed: false,
      reason: "cancelled",
    });
    const failed = await readRecord(delegate.flowId);
    expect(failed.status).toBe("failed");
    expect(custodyStateForTest(failed)).not.toHaveProperty("attachments");
    expect(custodyStateForTest(failed)).not.toHaveProperty("attachAs");
    expect(failed.stateJson).not.toContain(secret);
    expect(failed.attachmentId).toBeUndefined();
    expect(fs.existsSync(payloadTree)).toBe(false);
  });

  it("rejects one-sided source metadata at the pre-spawn fence", async () => {
    for (const delegate of [
      { task: "missing expected revision", flowId: "source-flow" },
      { task: "missing source flow", expectedRevision: 7 },
    ]) {
      expect(await revalidatePendingDelegateForSpawn(delegate, "post-compaction")).toEqual({
        allowed: false,
        reason: "stale",
        summary: "Continuation delegate source metadata is incomplete before spawn.",
      });
    }
    expect(
      await revalidatePendingDelegateForSpawn({ task: "unmanaged delegate" }, "post-compaction"),
    ).toEqual({ allowed: true });
  });

  it("accepts the source record handed off by the post-compaction release", async () => {
    const sessionKey = "post-compaction-durable-handoff-revision";
    await stagePostCompactionCustodyDelegate(sessionKey, {
      task: "spawn from the durable handoff",
      stagedAt: Date.now(),
    });
    const delegate = expectDefined(
      (await claimStagedPostCompactionDelegates(sessionKey)).at(0),
      "claimed post-compaction delegate",
    );

    expect(await releaseToQueue(sessionKey, delegate)).toMatchObject({ released: true });
    expect(await revalidatePendingDelegateForSpawn(delegate, "post-compaction")).toEqual({
      allowed: true,
    });
  });

  it("preserves firstArmedAt across post-compaction custody storage", async () => {
    await stagePostCompactionCustodyDelegate("session-1", {
      task: "old shard",
      stagedAt: 20_000,
      firstArmedAt: 10_000,
    });

    const delegates = await claimStagedPostCompactionDelegates("session-1");
    expect(delegates[0]).toMatchObject({
      task: "old shard",
      mode: "post-compaction",
      firstArmedAt: 10_000,
    });
  });

  it("preserves targeting across post-compaction custody storage", async () => {
    await stagePostCompactionCustodyDelegate("session-1", {
      task: "targeted compaction shard",
      stagedAt: 20_000,
      targetSessionKeys: ["agent:main:root", "agent:main:sibling"],
    });

    expect((await claimStagedPostCompactionDelegates("session-1"))[0]).toMatchObject({
      task: "targeted compaction shard",
      mode: "post-compaction",
      targetSessionKeys: ["agent:main:root", "agent:main:sibling"],
      recipientAuthorityBinding: {
        version: 1,
        selection: "selected",
        recipients: [
          {
            sessionKey: "agent:main:root",
            authority: expect.objectContaining({ state: "bound", epoch: expect.any(String) }),
          },
          {
            sessionKey: "agent:main:sibling",
            authority: expect.objectContaining({ state: "bound", epoch: expect.any(String) }),
          },
        ],
      },
    });
  });

  it("preserves traceparent across post-compaction custody storage", async () => {
    await stagePostCompactionCustodyDelegate("session-1", {
      task: "traced compaction shard",
      stagedAt: 20_000,
      traceparent: VALID_TRACEPARENT,
    });

    expect((await claimStagedPostCompactionDelegates("session-1"))[0]).toMatchObject({
      task: "traced compaction shard",
      mode: "post-compaction",
      traceparent: VALID_TRACEPARENT,
    });
  });

  it("does not mix regular and post-compaction delegates", async () => {
    await enqueuePendingDelegate("session-1", { task: "regular" });
    await stagePostCompactionCustodyDelegate("session-1", {
      task: "post-compact",
      stagedAt: 1000,
    });

    const regular = await consumePendingDelegates("session-1");
    const postCompact = await claimStagedPostCompactionDelegates("session-1");
    expect(regular).toHaveLength(1);
    expect(expectDefined(regular.at(0), "regular delegate").task).toBe("regular");
    expect(postCompact).toHaveLength(1);
    expect(expectDefined(postCompact.at(0), "post-compaction delegate").task).toBe("post-compact");
  });
});

describe("session post-compaction delegate contract", () => {
  it("persists the exact record kind and JSON projection", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(25_000);

    await stageSessionPostCompactionDelegate("session-adapter-json", {
      task: "rehydrate exact state",
      createdAt: 20_000,
      firstArmedAt: 10_000,
      silent: true,
      silentWake: true,
      targetSessionKey: "agent:main:root",
      traceparent: VALID_TRACEPARENT,
      traceparentProvenance: "internal",
      model: "github-copilot/claude-sonnet-4.6",
    });

    const record = await onlyRecordFor("session-adapter-json");
    expect(record.kind).toBe("post_compaction");
    expect(record.status).toBe("queued");
    expect(record.revision).toBe(0);
    expect(record.createdAt).toBe(25_000);
    expect(record.dueAt).toBeUndefined();
    expect(custodyStateForTest(record)).toEqual({
      kind: "continuation_delegate",
      task: "rehydrate exact state",
      postCompaction: true,
      firstArmedAt: 10_000,
      targetSessionKey: "agent:main:root",
      recipientAuthorityBinding: {
        version: 1,
        selection: "selected",
        recipients: [
          {
            sessionKey: "agent:main:root",
            authority: expect.objectContaining({ state: "bound", epoch: expect.any(String) }),
          },
        ],
      },
      traceparent: VALID_TRACEPARENT,
      traceparentProvenance: "internal",
      model: "github-copilot/claude-sonnet-4.6",
    });
  });

  it("claims in stage order and returns the session adapter flags and revision handles", async () => {
    for (const [task, createdAt] of [
      ["first", 100],
      ["second", 200],
      ["third", 300],
    ] as const) {
      await stageSessionPostCompactionDelegate("session-adapter-order", {
        task,
        createdAt,
        silent: false,
        silentWake: false,
      });
    }

    const claimed = await consumeSessionPostCompactionDelegates("session-adapter-order");
    expect(claimed.map((delegate) => delegate.task)).toEqual(["first", "second", "third"]);
    expect(claimed).toEqual(
      claimed.map((delegate, index) =>
        expect.objectContaining({
          task: ["first", "second", "third"][index],
          createdAt: [100, 200, 300][index],
          firstArmedAt: [100, 200, 300][index],
          silent: true,
          silentWake: true,
          flowId: expect.any(String),
          expectedRevision: 1,
        }),
      ),
    );
    expect(await consumeSessionPostCompactionDelegates("session-adapter-order")).toEqual([]);
  });

  it("requeues only the expected revision and clears release-only state", async () => {
    await stageSessionPostCompactionDelegate("session-adapter-requeue", {
      task: "next compaction",
      createdAt: 100,
    });
    const delegate = expectDefined(
      (
        await consumeSessionPostCompactionDelegates("session-adapter-requeue", {
          claimFor: "next-seam-persist",
        })
      ).at(0),
      "claimed session delegate",
    );
    expect(custodyStateForTest(await readRecord(delegate.flowId))).toMatchObject({
      awaitingNextCompaction: true,
      releasedAt: expect.any(Number),
    });

    expect(await requeueSessionPostCompactionDelegate(delegate)).toBe("requeued");
    const requeued = await readRecord(delegate.flowId);
    expect(requeued.status).toBe("queued");
    expect(requeued.revision).toBe(2);
    expect(custodyStateForTest(requeued)).not.toHaveProperty("releasedAt");
    expect(custodyStateForTest(requeued)).not.toHaveProperty("awaitingNextCompaction");

    const rereleased = expectDefined(
      (await consumeSessionPostCompactionDelegates("session-adapter-requeue")).at(0),
      "re-released delegate",
    );
    expect(rereleased.expectedRevision).toBe(3);
    expect(await requeueSessionPostCompactionDelegate(delegate)).toBe("authoritative");
  });

  it("releases exactly the claimed record into the session queue as a permanent handoff", async () => {
    const sessionKey = "session-adapter-release";
    await stageSessionPostCompactionDelegate(sessionKey, {
      task: "first",
      createdAt: 100,
      attachments: [{ name: "handoff.txt", content: "HANDOFF_SECRET" }],
      attachAs: { mountPath: "handoff" },
    });
    await stageSessionPostCompactionDelegate(sessionKey, {
      task: "second",
      createdAt: 200,
    });
    const claimed = await consumeSessionPostCompactionDelegates(sessionKey);
    const first = expectDefined(claimed.at(0), "first claim");
    const second = expectDefined(claimed.at(1), "second claim");
    const firstPayload = payloadTreeFor(await readRecord(first.flowId));

    const released = await releaseStagedPostCompactionDelegateToQueue({
      sessionKey,
      delegate: first,
      sequence: 0,
    });
    if (!released.released) {
      throw new Error(`expected the first claim to release: ${released.reason}`);
    }
    const handedOff = await readRecord(first.flowId);
    expect(handedOff).toMatchObject({
      status: "succeeded",
      handoff: {
        target: "session_delivery_queue",
        queueEntryId: released.entryId,
        handedOffAt: expect.any(Number),
      },
    });
    expect(handedOff.attachmentId).toBeUndefined();
    expect(custodyStateForTest(handedOff)).not.toHaveProperty("attachments");
    expect(custodyStateForTest(handedOff)).not.toHaveProperty("attachAs");
    expect(fs.existsSync(firstPayload)).toBe(false);
    expect((await readRecord(second.flowId)).status).toBe("running");
    // A replayed release of the same claim cannot enqueue it twice.
    expect(
      await releaseStagedPostCompactionDelegateToQueue({
        sessionKey,
        delegate: first,
        sequence: 0,
      }),
    ).toMatchObject({ released: false });
    expect(
      await releaseStagedPostCompactionDelegateToQueue({
        sessionKey,
        delegate: second,
        sequence: 1,
      }),
    ).toMatchObject({ released: true });
  });
});

/* ------------------------------------------------------------------- */
/*  consume-paths corrupt-payload contract:                            */
/*    Schema-drift / corrupt stateJson on a custody record MUST fail   */
/*    the record + emit a tagged breadcrumb so the wedge-shape         */
/*    (decode-null + silent-continue accumulating in queue) cannot     */
/*    regress. Failing at consume-paths is the canonical wedge cure:   */
/*    corrupt records fail instead of silently accumulating.           */
/* ------------------------------------------------------------------- */

describe("consume-paths corrupt-payload breadcrumbs", () => {
  it("fails a pending delegate row with corrupt stateJson + emits the [continuation:delegate-decode-failed] breadcrumb", async () => {
    const flowId = await queueRawRecord("session-453a", { not_a_real_field: "corrupt" });
    const result = await consumePendingDelegates("session-453a");

    // No delegates returned — corrupt payload didn't decode to a valid one.
    expect(result).toEqual([]);

    // The corrupt record failed — it's no longer queued.
    expect((await readRecord(flowId)).status).toBe("failed");

    // Breadcrumb emitted at warn level with the canonical tag + flowId + session.
    const warns = loggerRecords.filter((r) => r.level === "warn");
    expect(
      warns.some(
        (r) =>
          r.message.includes("[continuation:delegate-decode-failed]") &&
          r.message.includes(`flowId=${flowId}`) &&
          r.message.includes("session=session-453a"),
      ),
    ).toBe(true);
  });

  it("fails a post-compaction delegate row with corrupt stateJson + emits the [continuation:post-compaction-decode-failed] breadcrumb", async () => {
    const flowId = await queueRawRecord(
      "session-453b",
      { not_a_real_field: "corrupt-post-compaction" },
      "post_compaction",
    );

    const result = await claimStagedPostCompactionDelegates("session-453b");

    // No delegates returned — corrupt payload didn't decode.
    expect(result).toEqual([]);

    // The corrupt record failed — it's no longer queued.
    expect((await readRecord(flowId)).status).toBe("failed");

    // Post-compaction breadcrumb tag fired.
    const warns = loggerRecords.filter((r) => r.level === "warn");
    expect(
      warns.some(
        (r) =>
          r.message.includes("[continuation:post-compaction-decode-failed]") &&
          r.message.includes(`flowId=${flowId}`) &&
          r.message.includes("session=session-453b"),
      ),
    ).toBe(true);
  });

  it("summarizes corrupt attachment-bearing state without logging attachment content", async () => {
    const attachmentContent = "CORRUPT_ATTACHMENT_CONTENT_MUST_NOT_LOG";
    const maliciousKey = "ATTACKER_CONTROLLED_KEY_MUST_NOT_LOG";
    const flowId = await queueRawRecord("session-redacted", {
      kind: "continuation_delegate",
      attachments: [{ name: "secret.txt", content: attachmentContent }],
      [maliciousKey]: true,
    });

    expect(await consumePendingDelegates("session-redacted")).toEqual([]);
    const warningText = loggerRecords
      .filter((record) => record.level === "warn")
      .map((record) => record.message)
      .join("\n");
    expect(warningText).toContain("stateType=object keyCount=3");
    expect(warningText).not.toContain(attachmentContent);
    expect(warningText).not.toContain(maliciousKey);
    expect(custodyStateForTest(await readRecord(flowId))).not.toHaveProperty("attachments");
  });

  it("terminalizes a malformed legacy attachment row without replaying or retaining content", async () => {
    const secret = "LEGACY_MALFORMED_ATTACHMENT_SECRET";
    const flowId = await queueRawRecord("session-legacy-attachment", {
      kind: "continuation_delegate",
      task: "legacy malformed attachment",
      attachments: [{ name: "../brief.md", content: secret }],
    });

    expect(await consumePendingDelegates("session-legacy-attachment")).toEqual([]);
    const failed = await readRecord(flowId);
    expect(failed.status).toBe("failed");
    expect(failed.stateJson).not.toContain(secret);
  });

  it("terminalizes malformed attachment state while enumerating startup recovery owners", async () => {
    const secret = "RECOVERY_OWNER_ENUMERATION_ATTACHMENT_SECRET";
    const flowId = await queueRawRecord("session-missing-owner", {
      kind: "continuation_delegate",
      task: "malformed before owner lookup",
      attachments: [{ name: "../brief.md", content: secret }],
    });

    expect(await listPendingDelegateSessionKeysForRecovery()).toEqual([]);
    const failed = await readRecord(flowId);
    expect(failed.status).toBe("failed");
    expect(failed.stateJson).not.toContain(secret);
  });

  it("fails multiple corrupt rows in a single consume call without aborting later valid ones", async () => {
    const corruptId1 = await queueRawRecord("session-453c", { bad_shape: 1 });
    await enqueuePendingDelegate("session-453c", { task: "valid task" });
    const corruptId2 = await queueRawRecord("session-453c", { bad_shape: 2 });

    const result = await consumePendingDelegates("session-453c");

    // Only the valid delegate returned.
    expect(result).toHaveLength(1);
    expect(expectDefined(result.at(0), "valid delegate").task).toBe("valid task");

    // Both corrupt records failed.
    expect((await readRecord(corruptId1)).status).toBe("failed");
    expect((await readRecord(corruptId2)).status).toBe("failed");

    // Both corrupt-row breadcrumbs emitted.
    const decodeFailedWarns = loggerRecords.filter(
      (r) => r.level === "warn" && r.message.includes("[continuation:delegate-decode-failed]"),
    );
    expect(decodeFailedWarns.length).toBe(2);
  });

  it("does NOT emit breadcrumbs when consume runs against an empty queue (clean session)", async () => {
    const result = await consumePendingDelegates("session-453d-empty");
    expect(result).toEqual([]);
    const decodeFailedWarns = loggerRecords.filter(
      (r) => r.level === "warn" && r.message.includes("[continuation:delegate-decode-failed]"),
    );
    expect(decodeFailedWarns).toEqual([]);
  });

  it("does NOT emit breadcrumbs when consume runs against well-formed payloads (regression-resistance for valid path)", async () => {
    await enqueuePendingDelegate("session-453e", { task: "clean task 1" });
    await enqueuePendingDelegate("session-453e", { task: "clean task 2" });

    const result = await consumePendingDelegates("session-453e");
    expect(result).toHaveLength(2);

    // Zero decode-failed breadcrumbs on the happy path — verifies the
    // breadcrumb is failure-only, not always-on.
    const decodeFailedWarns = loggerRecords.filter(
      (r) => r.level === "warn" && r.message.includes("[continuation:delegate-decode-failed]"),
    );
    expect(decodeFailedWarns).toEqual([]);
  });
});
