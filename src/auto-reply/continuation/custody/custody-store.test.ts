// Custody store behavior through the real shared-state worker: one worker
// command is one commit, the hot-path projection follows committed facts, and
// payload files follow the scrubbing commit.
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../../test/helpers/temp-dir.js";
import * as workerAdmission from "../../../infra/sqlite-worker-operation-admission.js";
import {
  closeOpenClawStateDatabaseAsync,
  openOpenClawStateDatabase,
} from "../../../state/openclaw-state-db.js";
import {
  loadContinuationCustodyPayload,
  storeContinuationCustodyPayload,
} from "./custody-payload-store.js";
import {
  readContinuationLiveWork,
  resetContinuationCustodyProjection,
} from "./custody-projection.js";
import {
  claimContinuationSpawnAttempt,
  createContinuationRecord,
  deleteContinuationRecord,
  electContinuationWork,
  failContinuationRecord,
  hydrateContinuationCustody,
  listContinuationRecords,
  resolveContinuationCustodyDatabasePath,
  updateContinuationRecords,
  type ContinuationElectionPlan,
} from "./custody-store.js";
import type { ContinuationRecord, NewContinuationRecord } from "./custody-store.types.js";

const OWNER = "agent:main:custody-owner";
const ATTACHMENT_A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ATTACHMENT_B = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const tempDirs = useAutoCleanupTempDirTracker((cleanup) =>
  afterEach(async () => {
    vi.restoreAllMocks();
    resetContinuationCustodyProjection();
    await closeOpenClawStateDatabaseAsync();
    cleanup();
  }),
);

function storeOptions() {
  return { env: { ...process.env, OPENCLAW_STATE_DIR: tempDirs.make("continuation-custody-") } };
}

type Options = ReturnType<typeof storeOptions>;

function work(recordId: string, createdAt = 1_000): NewContinuationRecord {
  return {
    recordId,
    kind: "work",
    ownerSessionKey: OWNER,
    status: "queued",
    createdAt,
    stateJson: JSON.stringify({ kind: "work", idleRetry: { trigger: "reply-run-ended" } }),
  };
}

function delegate(recordId: string, attachmentId?: string): NewContinuationRecord {
  return {
    recordId,
    kind: "delegate",
    ownerSessionKey: OWNER,
    status: "queued",
    createdAt: 1_000,
    stateJson: JSON.stringify({ kind: "delegate", task: "synthetic task", attachmentCount: 1 }),
    ...(attachmentId ? { attachmentId } : {}),
  };
}

/** Supersede every live parked record, as C's replaceParkedWork election does. */
function replaceParked(newId: string) {
  return (live: readonly ContinuationRecord[]): ContinuationElectionPlan => ({
    supersede: live.map((record) => ({
      recordId: record.recordId,
      expectedRevision: record.revision,
      phase: `superseded: ${newId}`,
      stateJson: JSON.stringify({ kind: "work", turnGrantedAt: 2_000 }),
    })),
    create: { ...work(newId, 2_000), kind: "work" },
  });
}

async function liveWork(options: Options) {
  return (
    await listContinuationRecords(
      { ownerSessionKey: OWNER, statuses: ["queued", "running"] },
      options,
    )
  ).map((record) => record.recordId);
}

function projected(options: Options) {
  return readContinuationLiveWork(resolveContinuationCustodyDatabasePath(options), OWNER);
}

function injectInsertFault(options: Options, recordId: string): () => void {
  const { db } = openOpenClawStateDatabase(options);
  db.exec(`
    CREATE TRIGGER inject_custody_fault BEFORE INSERT ON continuation_records
    WHEN NEW.record_id = '${recordId}'
    BEGIN SELECT RAISE(ABORT, 'injected custody fault'); END;
  `);
  return () => db.exec("DROP TRIGGER inject_custody_fault");
}

describe("owner-conditioned election through the state worker", () => {
  it("commits supersede and create together or not at all", async () => {
    const options = storeOptions();
    await createContinuationRecord(work("parked"), options);
    await hydrateContinuationCustody(options);
    const clearFault = injectInsertFault(options, "elected");

    await expect(
      electContinuationWork(
        { ownerSessionKey: OWNER, now: () => 2_000, plan: replaceParked("elected") },
        options,
      ),
    ).rejects.toThrow("injected custody fault");
    // Exactly the pre-state: the parked prior is still the only live obligation.
    expect(await liveWork(options)).toEqual(["parked"]);
    const [parked] = await listContinuationRecords({ recordIds: ["parked"] }, options);
    expect(parked).toMatchObject({ status: "queued", revision: 0 });
    // The failed write's outcome is unknown to the projection until a committed fact arrives.
    expect(projected(options)).toEqual({ state: "unknown" });

    clearFault();
    const elected = await electContinuationWork(
      { ownerSessionKey: OWNER, now: () => 2_000, plan: replaceParked("elected") },
      options,
    );
    expect(elected).toMatchObject({
      outcome: "elected",
      superseded: [{ recordId: "parked", status: "succeeded", phase: "superseded: elected" }],
    });
    expect(await liveWork(options)).toEqual(["elected"]);
    expect(projected(options)).toMatchObject({
      state: "known",
      records: [{ recordId: "elected", status: "queued" }],
    });
  });

  it("rolls back every write when the commit grant is refused", async () => {
    const options = storeOptions();
    await createContinuationRecord(work("parked"), options);
    const createAdmission = workerAdmission.createSqliteWorkerOperationAdmission;
    // An election is two commands: the owner snapshot list, then the election.
    // Refuse only the second command's commit. The kernel writes before its
    // commit request, which custody-store.worker.test.ts proves directly.
    let commits = 0;
    let electionReachedCommit = false;
    vi.spyOn(workerAdmission, "createSqliteWorkerOperationAdmission").mockImplementation(
      (admit, attachment) =>
        createAdmission((request, grant) => {
          if (request.stage === "commit" && ++commits === 2) {
            electionReachedCommit = true;
            throw new Error("synthetic commit refusal");
          }
          return admit(request, grant);
        }, attachment),
    );

    await expect(
      electContinuationWork(
        { ownerSessionKey: OWNER, now: () => 2_000, plan: replaceParked("elected") },
        options,
      ),
    ).rejects.toThrow("synthetic commit refusal");
    expect(electionReachedCommit).toBe(true);
    expect(await liveWork(options)).toEqual(["parked"]);
    const [parked] = await listContinuationRecords({ recordIds: ["parked"] }, options);
    expect(parked).toMatchObject({ status: "queued", revision: 0 });
    expect((await listContinuationRecords({}, options)).map((record) => record.recordId)).toEqual([
      "parked",
    ]);
  });

  it("replans once when the owner's live set changes between snapshot and commit", async () => {
    const options = storeOptions();
    await createContinuationRecord(work("parked"), options);
    let plans = 0;
    const result = await electContinuationWork(
      {
        ownerSessionKey: OWNER,
        now: () => 2_000,
        plan: (live) => {
          plans += 1;
          if (plans === 1) {
            // A racing election commits after this snapshot was taken.
            openOpenClawStateDatabase(options)
              .db.prepare(
                `INSERT INTO continuation_records
                   (record_id, kind, owner_session_key, revision, status, created_at, updated_at, state_json)
                 VALUES ('racer', 'work', ?, 0, 'queued', 1500, 1500, '{}')`,
              )
              .run(OWNER);
          }
          return replaceParked("elected")(live);
        },
      },
      options,
    );

    expect(plans).toBe(2);
    expect(result).toMatchObject({ outcome: "elected" });
    expect(await liveWork(options)).toEqual(["elected"]);
  });

  it("returns the planner's rejection without writing", async () => {
    const options = storeOptions();
    await createContinuationRecord(work("parked"), options);
    const result = await electContinuationWork(
      { ownerSessionKey: OWNER, now: () => 2_000, plan: () => ({ rejected: "capped" as const }) },
      options,
    );
    expect(result).toEqual({ outcome: "rejected", rejection: "capped" });
    expect(await liveWork(options)).toEqual(["parked"]);
  });
});

describe("list-by-owner and the hot-path projection", () => {
  it("keeps incremental commits, hydration and list-by-owner on the same live set", async () => {
    const options = storeOptions();
    const databasePath = resolveContinuationCustodyDatabasePath(options);
    expect(projected(options)).toEqual({ state: "unknown" });
    await hydrateContinuationCustody(options);
    expect(projected(options)).toEqual({ state: "known", records: [] });

    await createContinuationRecord(work("parked"), options);
    await createContinuationRecord(delegate("delegate-a"), options);
    await createContinuationRecord(delegate("delegate-b"), options);
    await electContinuationWork(
      { ownerSessionKey: OWNER, now: () => 2_000, plan: replaceParked("elected") },
      options,
    );
    const claimed = await claimContinuationSpawnAttempt(
      { recordId: "delegate-a", ownerSessionKey: OWNER, expectedRevision: 0, now: 2_100 },
      options,
    );
    expect(claimed.outcome).toBe("claimed");
    await updateContinuationRecords(
      [
        {
          recordId: "delegate-b",
          ownerSessionKey: OWNER,
          expectedRevision: 0,
          patch: { status: "cancelled", cancelRequestedAt: 2_200 },
        },
      ],
      { now: 2_200 },
      options,
    );

    const listed = await listContinuationRecords(
      { ownerSessionKey: OWNER, statuses: ["queued", "running"] },
      options,
    );
    const incremental = readContinuationLiveWork(databasePath, OWNER);
    resetContinuationCustodyProjection(databasePath);
    await hydrateContinuationCustody(options);
    const hydrated = readContinuationLiveWork(databasePath, OWNER);

    const facts = listed.map((record) => ({
      recordId: record.recordId,
      kind: record.kind,
      status: record.status,
      revision: record.revision,
      cancelRequested: false,
      createdAt: record.createdAt,
      ...(record.dueAt !== undefined ? { dueAt: record.dueAt } : {}),
    }));
    expect(facts.map((fact) => [fact.recordId, fact.status])).toEqual([
      ["delegate-a", "running"],
      ["elected", "queued"],
    ]);
    expect(incremental).toEqual({ state: "known", records: facts });
    expect(hydrated).toEqual(incremental);
    expect(readContinuationLiveWork(databasePath, OWNER, ["work"])).toEqual({
      state: "known",
      records: [facts[1]],
    });
  });
});

describe("payload custody and scrub", () => {
  function payloadFile(options: Options, attachmentId: string) {
    return path.join(
      options.env.OPENCLAW_STATE_DIR,
      "attachments",
      "continuation-custody",
      attachmentId,
      "payload.json",
    );
  }

  const attachments = [{ name: "notes.txt", content: "synthetic" }];

  it("writes the payload before the record and releases it with the terminal commit", async () => {
    const options = storeOptions();
    await createContinuationRecord(delegate("delegate-a", ATTACHMENT_A), {
      ...options,
      payload: { attachments },
    });
    expect(
      await loadContinuationCustodyPayload(
        ATTACHMENT_A,
        { recordId: "delegate-a", ownerKey: OWNER },
        options.env,
      ),
    ).toMatchObject({ recordId: "delegate-a", attachments });
    // The binding is checked: another record cannot read it.
    expect(
      await loadContinuationCustodyPayload(
        ATTACHMENT_A,
        { recordId: "delegate-b", ownerKey: OWNER },
        options.env,
      ),
    ).toBeUndefined();

    const failed = await failContinuationRecord(
      {
        recordId: "delegate-a",
        ownerSessionKey: OWNER,
        expectedRevision: 0,
        now: 2_000,
        failureReason: "spawn-interrupted",
        terminalNoticePending: "delegate-spawn-interrupted",
      },
      options,
    );
    expect(failed).toMatchObject({
      outcome: "applied",
      releasedAttachments: [{ recordId: "delegate-a", attachmentId: ATTACHMENT_A }],
    });
    const [record] = await listContinuationRecords({ recordIds: ["delegate-a"] }, options);
    expect(record?.attachmentId).toBeUndefined();
    expect(record?.terminalNoticePending).toBe("delegate-spawn-interrupted");
    expect(fs.existsSync(payloadFile(options, ATTACHMENT_A))).toBe(false);
  });

  it("never releases a payload bound to another record", async () => {
    const options = storeOptions();
    await createContinuationRecord(delegate("delegate-a", ATTACHMENT_A), options);
    // The file under this attachment ID belongs to another record.
    await storeContinuationCustodyPayload(
      { attachmentId: ATTACHMENT_A, recordId: "delegate-other", ownerKey: OWNER, attachments },
      options.env,
    );

    await deleteContinuationRecord(
      { recordId: "delegate-a", ownerSessionKey: OWNER, expectedRevision: 0 },
      options,
    );
    expect(fs.existsSync(payloadFile(options, ATTACHMENT_A))).toBe(true);
    expect(await listContinuationRecords({}, options)).toEqual([]);
  });

  it("keeps the committed record's payload when a create is retried with the same attachment", async () => {
    const options = storeOptions();
    const create = () =>
      createContinuationRecord(delegate("delegate-a", ATTACHMENT_A), {
        ...options,
        payload: { attachments },
      });
    // The first create committed even if its caller never saw the reply; the retry meets it.
    expect((await create()).outcome).toBe("created");
    expect(await create()).toMatchObject({ outcome: "exists", recordId: "delegate-a" });

    const [record] = await listContinuationRecords({ recordIds: ["delegate-a"] }, options);
    expect(record?.attachmentId).toBe(ATTACHMENT_A);
    expect(
      await loadContinuationCustodyPayload(
        ATTACHMENT_A,
        { recordId: "delegate-a", ownerKey: OWNER },
        options.env,
      ),
    ).toMatchObject({ recordId: "delegate-a", attachments });
  });

  it("refuses a duplicate create that brings different bytes for the committed attachment", async () => {
    const options = storeOptions();
    await createContinuationRecord(delegate("delegate-a", ATTACHMENT_A), {
      ...options,
      payload: { attachments },
    });
    const committed = fs.readFileSync(payloadFile(options, ATTACHMENT_A));

    const duplicate = await createContinuationRecord(delegate("delegate-a", ATTACHMENT_A), {
      ...options,
      payload: { attachments: [{ name: "notes.txt", content: "replacement" }] },
    });
    // The committed record's bytes are write-once; the retry is refused, not applied.
    expect(fs.readFileSync(payloadFile(options, ATTACHMENT_A))).toEqual(committed);
    expect(duplicate).toEqual({
      outcome: "payload_conflict",
      recordId: "delegate-a",
      attachmentId: ATTACHMENT_A,
    });
    const [record] = await listContinuationRecords({ recordIds: ["delegate-a"] }, options);
    expect(record).toMatchObject({ revision: 0, attachmentId: ATTACHMENT_A });
    expect(
      await loadContinuationCustodyPayload(
        ATTACHMENT_A,
        { recordId: "delegate-a", ownerKey: OWNER },
        options.env,
      ),
    ).toMatchObject({ attachments });
  });

  it("keeps the first payload across a thrown create, so only a byte-identical retry commits", async () => {
    const options = storeOptions();
    const create = (content: string) =>
      createContinuationRecord(delegate("delegate-a", ATTACHMENT_A), {
        ...options,
        payload: { attachments: [{ name: "notes.txt", content }] },
      });
    // The trigger needs the first-use table, which the first committed create makes.
    await createContinuationRecord(work("seed"), options);
    const clearFault = injectInsertFault(options, "delegate-a");
    await expect(create("synthetic")).rejects.toThrow("injected custody fault");
    clearFault();
    const written = fs.readFileSync(payloadFile(options, ATTACHMENT_A));

    expect(await create("replacement")).toMatchObject({ outcome: "payload_conflict" });
    expect(fs.readFileSync(payloadFile(options, ATTACHMENT_A))).toEqual(written);
    expect((await listContinuationRecords({}, options)).map((record) => record.recordId)).toEqual([
      "seed",
    ]);

    expect(await create("synthetic")).toMatchObject({ outcome: "created" });
    expect(
      await loadContinuationCustodyPayload(
        ATTACHMENT_A,
        { recordId: "delegate-a", ownerKey: OWNER },
        options.env,
      ),
    ).toMatchObject({ attachments: [{ name: "notes.txt", content: "synthetic" }] });
  });

  it.each([
    { name: "another record", recordId: "delegate-b", ownerSessionKey: OWNER },
    { name: "another owner", recordId: "delegate-a", ownerSessionKey: "agent:main:someone-else" },
  ])("fails an attachment ID collision with $name and keeps the original bytes", async (clash) => {
    const options = storeOptions();
    await createContinuationRecord(delegate("delegate-a", ATTACHMENT_A), {
      ...options,
      payload: { attachments },
    });
    const committed = fs.readFileSync(payloadFile(options, ATTACHMENT_A));

    const collision = await createContinuationRecord(
      { ...delegate(clash.recordId, ATTACHMENT_A), ownerSessionKey: clash.ownerSessionKey },
      { ...options, payload: { attachments } },
    );
    expect(fs.readFileSync(payloadFile(options, ATTACHMENT_A))).toEqual(committed);
    expect(collision).toEqual({
      outcome: "payload_conflict",
      recordId: clash.recordId,
      attachmentId: ATTACHMENT_A,
    });
    // Nothing committed for the colliding create, and the owner still reads its payload.
    expect((await listContinuationRecords({}, options)).map((record) => record.recordId)).toEqual([
      "delegate-a",
    ]);
    expect(
      await loadContinuationCustodyPayload(
        ATTACHMENT_A,
        { recordId: "delegate-a", ownerKey: OWNER },
        options.env,
      ),
    ).toMatchObject({ attachments });
  });

  it("releases its own payload when the record ID already exists", async () => {
    const options = storeOptions();
    await createContinuationRecord(delegate("delegate-a"), options);
    const duplicate = await createContinuationRecord(delegate("delegate-a", ATTACHMENT_B), {
      ...options,
      payload: { attachments },
    });
    expect(duplicate).toEqual({ outcome: "exists", recordId: "delegate-a" });
    expect(fs.existsSync(payloadFile(options, ATTACHMENT_B))).toBe(false);
  });
});
