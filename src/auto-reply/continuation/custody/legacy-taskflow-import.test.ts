// RFC §9.2.2 item 5 (legacy import) and Q3/Q6/Q7 at the real owner boundary:
// the Doctor transform runs against a real state database, and faults are
// injected with SQLite triggers so the production transaction fails between
// its own writes.
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../../test/helpers/temp-dir.js";
import { deriveContinuationDelegateChildSessionKeyFromParent } from "../../../agents/subagent-continuation-ids.js";
import { executeSqliteQuerySync } from "../../../infra/kysely-sync.js";
import { closeOpenClawStateDatabaseAsync } from "../../../state/openclaw-state-db.js";
import { listContinuationRecordsInDatabase } from "./custody-store.worker.js";
import { inlineImportAttachmentId } from "./legacy-taskflow-import-plan.js";
import { migrateContinuationTaskFlowCustody } from "./legacy-taskflow-import.js";
import {
  OWNER_A,
  OWNER_B,
  SECRET_BYTES,
  SECRET_REASON,
  SECRET_TASK,
  delegateState,
  dumpState,
  inlineAttachments,
  kysely,
  newRootPayloadPath,
  postCompactionState,
  readFlow,
  readQueue,
  readReceipts,
  seedFlow,
  seedPreCutoverEntry,
  seedSubagentRun,
  spawnInterruptedNotices,
  workState,
  write,
  writeLegacyPayload,
  type Options,
} from "./legacy-taskflow-import.test-support.js";
import {
  detectContinuationTaskFlowCustodyImport,
  listContinuationOwnersAwaitingImport,
} from "./legacy-taskflow-source.js";

const NOW = 50_000;
const ATTACHMENT_ID = "0b6f5d7e-8c1a-4b2f-9e3d-5a6b7c8d9e0f";

const tempDirs = useAutoCleanupTempDirTracker((cleanup) =>
  afterEach(async () => {
    await closeOpenClawStateDatabaseAsync();
    cleanup();
  }),
);

function stateOptions(): Options {
  return { env: { ...process.env, OPENCLAW_STATE_DIR: tempDirs.make("continuation-import-") } };
}

function run(options: Options) {
  return migrateContinuationTaskFlowCustody({ env: options.env, now: () => NOW });
}

function records(options: Options, ownerSessionKey?: string) {
  return write(options, (db) =>
    listContinuationRecordsInDatabase(db, ownerSessionKey ? { ownerSessionKey } : {}),
  );
}

function record(options: Options, recordId: string) {
  return records(options).find((entry) => entry.recordId === recordId);
}

/** Faults the owner transaction on its Nth receipt insert, after earlier writes ran. */
function failReceiptInsert(options: Options, sourceKeySuffix: string) {
  write(options, (db) => {
    db.exec(`CREATE TRIGGER fail_import_receipt BEFORE INSERT ON migration_sources
      WHEN NEW.source_key LIKE '%${sourceKeySuffix}'
      BEGIN SELECT RAISE(ABORT, 'injected import fault'); END`);
  });
}

function clearFault(options: Options) {
  write(options, (db) => db.exec("DROP TRIGGER fail_import_receipt"));
}

describe("continuation TaskFlow custody import", () => {
  it("imports each legacy state as the RFC table rules and fences every imported live source", async () => {
    const options = stateOptions();
    seedFlow(options, {
      flowId: "work-queued",
      status: "queued",
      state: workState({ recoveryDueAt: 1_800 }),
      chainId: "chain-1",
    });
    seedFlow(options, {
      flowId: "work-delivered",
      status: "running",
      state: workState({ succeeded: { point: "optimal", durability: "durable" } }),
    });
    seedFlow(options, {
      flowId: "work-owes-notice",
      status: "failed",
      state: workState({ terminalNoticePending: "retry-exhausted" }),
      endedAt: 2_500,
      blockedSummary: "retry exhausted",
    });
    seedFlow(options, {
      flowId: "work-done",
      status: "succeeded",
      state: workState(),
      endedAt: 2_500,
    });
    seedFlow(options, {
      flowId: "delegate-file",
      controller: "delegate",
      status: "queued",
      state: delegateState({ attachmentId: ATTACHMENT_ID, attachmentCount: 1 }),
      createdAt: 1_234,
    });
    const legacyFile = writeLegacyPayload(options, {
      attachmentId: ATTACHMENT_ID,
      flowId: "delegate-file",
    });
    seedFlow(options, {
      flowId: "staged-awaiting",
      controller: "post-compaction",
      status: "running",
      state: postCompactionState({ releasedAt: 1_900, awaitingNextCompaction: true }),
    });
    seedFlow(options, {
      flowId: "fenced",
      controller: "delegate",
      status: "queued",
      state: delegateState(),
      cancelRequestedAt: 1_700,
    });
    seedFlow(options, {
      flowId: "corrupt",
      controller: "delegate",
      status: "queued",
      state: { kind: "nope" },
    });
    seedFlow(options, {
      flowId: "not-ours",
      controller: "other",
      status: "queued",
      state: { any: true },
    });
    const foreignBefore = readFlow(options, "not-ours");

    const result = await run(options);

    expect(result.warnings).toEqual([]);
    expect(record(options, "work-queued")).toMatchObject({
      kind: "work",
      status: "queued",
      revision: 3,
      createdAt: 1_000,
      updatedAt: 2_000,
      dueAt: 1_800,
      chainId: "chain-1",
    });
    expect(JSON.parse(record(options, "work-delivered")!.stateJson).succeeded).toEqual({
      point: "optimal",
      durability: "durable",
    });
    expect(record(options, "work-owes-notice")).toMatchObject({
      status: "failed",
      terminalNoticePending: "retry-exhausted",
    });
    expect(record(options, "work-done")).toBeUndefined();
    expect(record(options, "delegate-file")).toMatchObject({
      status: "queued",
      createdAt: 1_234,
      dueAt: 1_234 + 250,
      attachmentId: ATTACHMENT_ID,
    });
    // Copy-first: the new root holds the payload bound to record_id = flow_id; the legacy file is gone.
    const copied = JSON.parse(fs.readFileSync(newRootPayloadPath(options, ATTACHMENT_ID), "utf8"));
    expect(copied).toMatchObject({ recordId: "delegate-file", ownerKey: OWNER_A });
    expect(fs.existsSync(legacyFile)).toBe(false);
    expect(record(options, "staged-awaiting")).toMatchObject({ status: "running" });
    expect(record(options, "fenced")).toMatchObject({
      status: "cancelled",
      cancelRequestedAt: 1_700,
    });
    expect(record(options, "corrupt")).toMatchObject({
      status: "failed",
      failureReason: "corrupt-legacy-state",
    });

    // Q7: every imported non-terminal source row is fenced; an existing fence keeps its time.
    for (const flowId of [
      "work-queued",
      "work-delivered",
      "delegate-file",
      "staged-awaiting",
      "corrupt",
    ]) {
      expect(readFlow(options, flowId)?.cancel_requested_at).toBe(NOW);
    }
    expect(readFlow(options, "fenced")?.cancel_requested_at).toBe(1_700);
    expect(readFlow(options, "work-owes-notice")?.cancel_requested_at).toBeNull();
    expect(readFlow(options, "not-ours")).toEqual(foreignBefore);

    const dispositions = Object.fromEntries(
      readReceipts(options).map((row) => [row.source_key, JSON.parse(row.report_json).disposition]),
    );
    expect(dispositions).toMatchObject({
      "continuation-taskflow-custody-import:flow:work-done": "retired-terminal",
      "continuation-taskflow-custody-import:flow:work-queued": "imported",
    });
    expect(Object.keys(dispositions).some((key) => key.includes("not-ours"))).toBe(false);
  });

  it("Q6 scrubs inline bytes, writes them to the new root and receipts only structure", async () => {
    const options = stateOptions();
    seedFlow(options, {
      flowId: "inline",
      controller: "delegate",
      status: "queued",
      state: delegateState({ attachments: inlineAttachments(), attachmentCount: 1 }),
    });

    await run(options);

    const attachmentId = inlineImportAttachmentId("inline");
    const imported = record(options, "inline")!;
    expect(imported.attachmentId).toBe(attachmentId);
    expect(JSON.parse(imported.stateJson)).not.toHaveProperty("attachments");
    expect(fs.readFileSync(newRootPayloadPath(options, attachmentId), "utf8")).toContain(
      SECRET_BYTES,
    );
    const source = readFlow(options, "inline")!;
    expect(source.state_json).not.toContain(SECRET_BYTES);
    expect(JSON.parse(source.state_json!).attachments).toEqual([
      { name: "notes.txt", content: "", encoding: "utf8" },
    ]);
    expect(source.cancel_requested_at).toBe(NOW);
    const report = JSON.parse(readReceipts(options)[0]!.report_json);
    expect(report).toMatchObject({ disposition: "imported", scrubbedCount: 1, fenced: true });
    expect(report.scrubbedSha256).toHaveLength(1);
  });

  it("Q3 terminalizes a legacy running delegate with exactly one notice and never re-spawns", async () => {
    const options = stateOptions();
    seedFlow(options, {
      flowId: "claimed",
      controller: "delegate",
      status: "running",
      state: delegateState({ childSessionKey: undefined }),
      updatedAt: 3_000,
    });

    await run(options);

    expect(record(options, "claimed")).toMatchObject({
      status: "failed",
      failureReason: "spawn-interrupted",
      spawnAttempts: [],
    });
    expect(JSON.parse(record(options, "claimed")!.stateJson).legacyClaim).toEqual({
      sourceUpdatedAt: 3_000,
    });
    const notices = spawnInterruptedNotices(options);
    expect(notices).toHaveLength(1);
    expect(JSON.parse(notices[0]!.entry_json)).toMatchObject({
      sessionKey: OWNER_A,
      idempotencyKey: "continuation-spawn-interrupted:record:claimed",
    });
    expect(readFlow(options, "claimed")?.cancel_requested_at).toBe(NOW);
    // No spawn happened: the only registry rows are none.
    expect(
      write(
        options,
        (db) => executeSqliteQuerySync(db, kysely(db).selectFrom("subagent_runs").selectAll()).rows,
      ),
    ).toEqual([]);
  });

  it("adopts a legacy running delegate admitted under its owner and fails a foreign-owned one", async () => {
    const options = stateOptions();
    const claimed = delegateState({ childSessionKey: undefined });
    seedFlow(options, {
      flowId: "delegate-admitted",
      controller: "delegate",
      status: "running",
      state: claimed,
    });
    seedSubagentRun(options, {
      runId: "continuation-delegate-admitted",
      childSessionKey: deriveContinuationDelegateChildSessionKeyFromParent(
        OWNER_A,
        "delegate-admitted",
      ),
      requester: OWNER_A,
    });
    seedFlow(options, {
      flowId: "delegate-collision",
      controller: "delegate",
      status: "running",
      state: claimed,
    });
    seedSubagentRun(options, {
      runId: "foreign-delegate-run",
      childSessionKey: deriveContinuationDelegateChildSessionKeyFromParent(
        OWNER_A,
        "delegate-collision",
      ),
      requester: OWNER_B,
    });

    await run(options);

    expect(record(options, "delegate-admitted")).toMatchObject({
      status: "succeeded",
      handoff: {
        target: "subagent_runs",
        childRunId: "continuation-delegate-admitted",
        childSessionKey: deriveContinuationDelegateChildSessionKeyFromParent(
          OWNER_A,
          "delegate-admitted",
        ),
      },
    });
    expect(record(options, "delegate-collision")).toMatchObject({
      status: "failed",
      failureReason: "spawn-interrupted",
    });
    // The admitted child needs no interruption notice; the collision gets exactly one.
    expect(
      spawnInterruptedNotices(options).map(
        (row): string => JSON.parse(row.entry_json).idempotencyKey,
      ),
    ).toEqual(["continuation-spawn-interrupted:record:delegate-collision"]);
    const receipts = readReceipts(options);
    expect(
      JSON.parse(
        receipts.find((row) => row.source_key.endsWith(":delegate-admitted"))!.report_json,
      ),
    ).toMatchObject({ handoff: "subagent_runs", interruptedNotice: false });
    expect(
      JSON.parse(
        receipts.find((row) => row.source_key.endsWith(":delegate-collision"))!.report_json,
      ),
    ).toMatchObject({ registryCollision: true, interruptedNotice: true });
  });

  it("settles legacy post-compaction claims by C-byte proof or terminalizes them (fold 2)", async () => {
    const options = stateOptions();
    const claimed = postCompactionState({ releasedAt: 1_900 });
    seedFlow(options, {
      flowId: "pc-queued-entry",
      controller: "post-compaction",
      status: "running",
      state: claimed,
    });
    const entryId = seedPreCutoverEntry(options, { sourceFlowId: "pc-queued-entry" });
    seedFlow(options, {
      flowId: "pc-admitted",
      controller: "post-compaction",
      status: "running",
      state: claimed,
    });
    seedSubagentRun(options, {
      runId: "continuation-delegate-legacy",
      childSessionKey: deriveContinuationDelegateChildSessionKeyFromParent(OWNER_A, "pc-admitted"),
      requester: OWNER_A,
    });
    seedFlow(options, {
      flowId: "pc-collision",
      controller: "post-compaction",
      status: "running",
      state: claimed,
    });
    seedSubagentRun(options, {
      runId: "foreign-run",
      childSessionKey: deriveContinuationDelegateChildSessionKeyFromParent(OWNER_A, "pc-collision"),
      requester: OWNER_B,
    });
    seedFlow(options, {
      flowId: "pc-unproven",
      controller: "post-compaction",
      status: "running",
      state: claimed,
    });

    await run(options);

    expect(record(options, "pc-queued-entry")).toMatchObject({
      status: "succeeded",
      handoff: { target: "session_delivery_queue", queueEntryId: entryId },
    });
    expect(record(options, "pc-admitted")).toMatchObject({
      status: "succeeded",
      handoff: { target: "subagent_runs", childRunId: "continuation-delegate-legacy" },
    });
    expect(record(options, "pc-collision")).toMatchObject({
      status: "failed",
      failureReason: "spawn-interrupted",
    });
    expect(record(options, "pc-unproven")).toMatchObject({
      status: "failed",
      failureReason: "spawn-interrupted",
    });
    const keys = spawnInterruptedNotices(options)
      .map((row): string => JSON.parse(row.entry_json).idempotencyKey)
      .toSorted((a, b) => a.localeCompare(b));
    // One notice per unresolved claim: the collision, the unproven row, and the queued entry.
    expect(keys).toEqual([
      `continuation-spawn-interrupted:queue-entry:${entryId}`,
      "continuation-spawn-interrupted:record:pc-collision",
      "continuation-spawn-interrupted:record:pc-unproven",
    ]);
    const collisionReport = readReceipts(options).find((row) =>
      row.source_key.endsWith(":pc-collision"),
    );
    expect(JSON.parse(collisionReport!.report_json)).toMatchObject({ registryCollision: true });
  });

  it("terminalizes every pre-cutover queue entry without a spawn, except affirmative C-byte proof", async () => {
    const options = stateOptions();
    const unproven = seedPreCutoverEntry(options, { sequence: 1 });
    const admitted = seedPreCutoverEntry(options, { sequence: 2, sourceFlowId: "admitted-flow" });
    seedSubagentRun(options, {
      runId: "run-admitted",
      childSessionKey: deriveContinuationDelegateChildSessionKeyFromParent(
        OWNER_A,
        "admitted-flow",
      ),
      requester: OWNER_A,
    });
    const recorded = seedPreCutoverEntry(options, {
      sequence: 3,
      extra: { settlementOutcome: "recovered" },
    });
    const postCutover = seedPreCutoverEntry(options, {
      sequence: 4,
      extra: { childRunId: "continuation:r:1" },
    });
    const before = new Map(readQueue(options).map((row) => [row.id, row]));

    await run(options);

    const after = new Map(readQueue(options).map((row) => [row.id, row]));
    expect(after.get(unproven)).toMatchObject({ status: "failed" });
    const settled = JSON.parse(after.get(unproven)!.entry_json);
    expect(settled).toMatchObject({ id: unproven, idempotencyKey: expect.any(String) });
    expect(after.get(unproven)!.entry_json).not.toContain(SECRET_BYTES);
    expect(after.get(unproven)!.entry_json).not.toContain(SECRET_TASK);
    expect(after.get(admitted)).toMatchObject({ status: "completed" });
    expect(after.get(recorded)).toEqual(before.get(recorded));
    expect(after.get(postCutover)).toEqual(before.get(postCutover));
    expect(
      spawnInterruptedNotices(options).map((row) => JSON.parse(row.entry_json).idempotencyKey),
    ).toEqual([`continuation-spawn-interrupted:queue-entry:${unproven}`]);
    const report = JSON.parse(
      readReceipts(options).find((row) => row.source_key.endsWith(`:queue-entry:${unproven}`))!
        .report_json,
    );
    expect(report).toMatchObject({
      disposition: "interrupted-pre-cutover-entry",
      attachmentCount: 1,
    });
  });

  it("is idempotent: a re-run changes no byte and keeps every notice single", async () => {
    const options = stateOptions();
    seedFlow(options, { flowId: "work-queued", status: "queued", state: workState() });
    seedFlow(options, {
      flowId: "claimed",
      controller: "delegate",
      status: "running",
      state: delegateState(),
    });
    seedPreCutoverEntry(options);

    await run(options);
    const first = dumpState(options);
    const second = await run(options);

    expect(second.changes).toEqual([]);
    expect(dumpState(options)).toEqual(first);
    expect(spawnInterruptedNotices(options)).toHaveLength(2);
    expect(detectContinuationTaskFlowCustodyImport({ env: options.env }).hasLegacy).toBe(false);
  });

  it("a crash inside an owner transaction leaves that owner wholly un-imported and retries to one notice", async () => {
    const options = stateOptions();
    seedFlow(options, { flowId: "a-work", status: "queued", state: workState() });
    seedFlow(options, {
      flowId: "a-inline",
      controller: "delegate",
      status: "running",
      state: delegateState({ attachments: inlineAttachments(), attachmentCount: 1 }),
    });
    seedFlow(options, {
      flowId: "b-work",
      owner: OWNER_B,
      status: "queued",
      state: workState({ sessionKey: OWNER_B }),
    });
    const entryId = seedPreCutoverEntry(options);
    const before = dumpState(options);
    // Fault on OWNER_A's last receipt: its records, scrub, fence and notices already ran.
    failReceiptInsert(options, `:queue-entry:${entryId}`);

    const failed = await run(options);

    expect(failed.warnings.join("\n")).toContain("injected import fault");
    expect(failed.warnings.join("\n")).toContain("waiting on legacy import");
    const afterCrash = dumpState(options);
    expect(afterCrash.flowRuns.filter((row) => row.owner_key === OWNER_A)).toEqual(
      before.flowRuns.filter((row) => row.owner_key === OWNER_A),
    );
    expect(afterCrash.queue).toEqual(before.queue);
    expect(records(options, OWNER_A)).toEqual([]);
    expect(readReceipts(options).some((row) => row.source_key.includes(":a-"))).toBe(false);
    // Per-owner atomicity: the other owner committed independently.
    expect(record(options, "b-work")).toMatchObject({ status: "queued" });
    expect(write(options, (db) => listContinuationOwnersAwaitingImport(db))).toEqual([OWNER_A]);

    clearFault(options);
    await run(options);

    expect(record(options, "a-work")).toMatchObject({ status: "queued" });
    expect(record(options, "a-inline")).toMatchObject({ status: "failed" });
    expect(spawnInterruptedNotices(options)).toHaveLength(2);
    expect(readFlow(options, "a-inline")?.state_json).not.toContain(SECRET_BYTES);
    expect(write(options, (db) => listContinuationOwnersAwaitingImport(db))).toEqual([]);
  });

  it("treats the committed receipt as authoritative after retention pruned the record", async () => {
    const options = stateOptions();
    seedFlow(options, { flowId: "work-queued", status: "queued", state: workState() });
    await run(options);
    write(options, (db) =>
      executeSqliteQuerySync(
        db,
        kysely(db).deleteFrom("continuation_records").where("record_id", "=", "work-queued"),
      ),
    );
    const sourceBefore = readFlow(options, "work-queued");

    await run(options);

    expect(record(options, "work-queued")).toBeUndefined();
    expect(readFlow(options, "work-queued")).toEqual(sourceBefore);
  });

  it("imports a rollback-era work row that would be a second live election as one conflict notice", async () => {
    const options = stateOptions();
    seedFlow(options, { flowId: "live", status: "queued", state: workState() });
    await run(options);
    // A C-era build rolled back to creates new work for the same owner.
    seedFlow(options, {
      flowId: "rollback-row",
      status: "queued",
      state: workState(),
      createdAt: 9_000,
    });

    const result = await run(options);

    expect(record(options, "rollback-row")).toMatchObject({
      status: "failed",
      terminalNoticePending: "rollback-election-conflict",
    });
    expect(result.warnings.join("\n")).toContain("rollback");
    expect(records(options, OWNER_A).filter((entry) => entry.status === "queued")).toHaveLength(1);
  });

  it("leaves a scrubbed row without a receipt untouched as a structural anomaly", async () => {
    const options = stateOptions();
    seedFlow(options, {
      flowId: "anomaly",
      controller: "delegate",
      status: "queued",
      state: delegateState({ attachments: [{ name: "a", content: "" }], attachmentCount: 1 }),
    });
    const before = readFlow(options, "anomaly");

    const result = await run(options);

    expect(result.warnings.join("\n")).toContain("no import receipt");
    expect(readFlow(options, "anomaly")).toEqual(before);
    expect(record(options, "anomaly")).toBeUndefined();
  });

  it("never writes content into receipts", async () => {
    const options = stateOptions();
    seedFlow(options, {
      flowId: "inline",
      controller: "delegate",
      status: "running",
      state: delegateState({ attachments: inlineAttachments(), attachmentCount: 1 }),
    });
    seedFlow(options, { flowId: "work", status: "queued", state: workState() });
    seedFlow(options, {
      flowId: "done",
      status: "failed",
      state: workState(),
      blockedSummary: SECRET_REASON,
    });
    seedPreCutoverEntry(options);

    await run(options);

    const receiptBytes = JSON.stringify(
      write(options, (db) => ({
        sources: executeSqliteQuerySync(db, kysely(db).selectFrom("migration_sources").selectAll())
          .rows,
        runs: executeSqliteQuerySync(db, kysely(db).selectFrom("migration_runs").selectAll()).rows,
      })),
    );
    expect(receiptBytes).toContain("continuation-taskflow-custody-import");
    for (const secret of [SECRET_TASK, SECRET_BYTES, SECRET_REASON, OWNER_A]) {
      expect(receiptBytes).not.toContain(secret);
    }
  });

  it("fails the owner on a payload-copy I/O error, keeping the source bytes and the legacy file", async () => {
    const options = stateOptions();
    seedFlow(options, {
      flowId: "delegate-file",
      controller: "delegate",
      status: "queued",
      state: delegateState({ attachmentId: ATTACHMENT_ID, attachmentCount: 1 }),
    });
    const legacyFile = writeLegacyPayload(options, {
      attachmentId: ATTACHMENT_ID,
      flowId: "delegate-file",
    });
    seedFlow(options, {
      flowId: "inline",
      controller: "delegate",
      status: "queued",
      state: delegateState({ attachments: inlineAttachments(), attachmentCount: 1 }),
    });
    const before = dumpState(options);
    // The new payload root cannot be created: a file sits where the directory goes.
    const attachmentsDir = path.join(options.env.OPENCLAW_STATE_DIR!, "attachments");
    fs.writeFileSync(path.join(attachmentsDir, "continuation-custody"), "blocked");

    const result = await run(options);

    expect(result.warnings.join("\n")).toContain("will be retried");
    expect(records(options)).toEqual([]);
    expect(dumpState(options).flowRuns).toEqual(before.flowRuns);
    expect(fs.readFileSync(legacyFile, "utf8")).toContain(SECRET_BYTES);

    fs.rmSync(path.join(attachmentsDir, "continuation-custody"));
    await run(options);

    expect(record(options, "delegate-file")).toMatchObject({ status: "queued" });
    expect(fs.existsSync(legacyFile)).toBe(false);
    expect(readFlow(options, "inline")?.state_json).not.toContain(SECRET_BYTES);
  });

  it("keeps the legacy file when the store rejects its bytes, and imports the reference as C would", async () => {
    const options = stateOptions();
    seedFlow(options, {
      flowId: "delegate-file",
      controller: "delegate",
      status: "queued",
      state: delegateState({ attachmentId: ATTACHMENT_ID, attachmentCount: 1 }),
    });
    const legacyFile = writeLegacyPayload(options, {
      attachmentId: ATTACHMENT_ID,
      flowId: "delegate-file",
      attachAs: { mountPath: "../escape" },
    });

    await run(options);

    expect(record(options, "delegate-file")).toMatchObject({ attachmentId: ATTACHMENT_ID });
    expect(JSON.parse(readReceipts(options)[0]!.report_json)).toMatchObject({
      payload: "missing",
      legacyRelease: false,
    });
    expect(fs.existsSync(legacyFile)).toBe(true);
  });

  it("retries a legacy delete that a crash after the commit left behind", async () => {
    const options = stateOptions();
    seedFlow(options, {
      flowId: "delegate-file",
      controller: "delegate",
      status: "queued",
      state: delegateState({ attachmentId: ATTACHMENT_ID, attachmentCount: 1 }),
    });
    writeLegacyPayload(options, { attachmentId: ATTACHMENT_ID, flowId: "delegate-file" });
    await run(options);
    const committed = dumpState(options);
    // The process died between the commit and the delete: the bound file is back.
    const legacyFile = writeLegacyPayload(options, {
      attachmentId: ATTACHMENT_ID,
      flowId: "delegate-file",
    });
    expect(detectContinuationTaskFlowCustodyImport({ env: options.env }).hasLegacy).toBe(true);

    await run(options);

    expect(fs.existsSync(legacyFile)).toBe(false);
    expect(dumpState(options)).toEqual(committed);
    expect(detectContinuationTaskFlowCustodyImport({ env: options.env }).hasLegacy).toBe(false);
  });
});
