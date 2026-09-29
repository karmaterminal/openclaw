// Store-level transaction proofs for the continuation custody worker kernel.
// Faults are injected with SQLite triggers inside the real state database, so
// the production write path runs unchanged and fails exactly between steps.
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../../test/helpers/temp-dir.js";
import {
  formatContinuationChildRunId,
  parseContinuationChildRunId,
} from "../../../shared/continuation-run-key.js";
import {
  closeOpenClawStateDatabaseAsync,
  openOpenClawStateDatabase,
  runOpenClawStateWriteTransaction,
} from "../../../state/openclaw-state-db.js";
import type {
  ContinuationElection,
  ContinuationRecord,
  NewContinuationRecord,
} from "./custody-store.types.js";
import {
  claimContinuationSpawnAttemptInDatabase,
  createContinuationRecordInDatabase,
  deleteContinuationRecordInDatabase,
  electContinuationWorkInDatabase,
  listContinuationRecordsInDatabase,
  pruneContinuationRecordsInDatabase,
  recordContinuationSpawnAttemptFailureInDatabase,
  updateContinuationRecordsInDatabase,
} from "./custody-store.worker.js";

const OWNER = "agent:main:custody-owner";

const tempDirs = useAutoCleanupTempDirTracker((cleanup) =>
  afterEach(async () => {
    await closeOpenClawStateDatabaseAsync();
    cleanup();
  }),
);

function stateOptions() {
  return { env: { ...process.env, OPENCLAW_STATE_DIR: tempDirs.make("continuation-custody-") } };
}

type Options = ReturnType<typeof stateOptions>;

function write<T>(options: Options, operation: (db: import("node:sqlite").DatabaseSync) => T): T {
  return runOpenClawStateWriteTransaction(({ db }) => operation(db), options);
}

function list(options: Options, ownerSessionKey = OWNER): ContinuationRecord[] {
  return write(options, (db) => listContinuationRecordsInDatabase(db, { ownerSessionKey }));
}

function work(recordId: string, extra: Partial<Omit<NewContinuationRecord, "kind">> = {}) {
  return {
    recordId,
    kind: "work" as const,
    ownerSessionKey: OWNER,
    status: "queued" as const,
    createdAt: 1_000,
    stateJson: JSON.stringify({ kind: "work", reason: `synthetic ${recordId}` }),
    ...extra,
  };
}

function delegate(recordId: string, extra: Partial<Omit<NewContinuationRecord, "kind">> = {}) {
  return {
    recordId,
    kind: "delegate" as const,
    ownerSessionKey: OWNER,
    status: "queued" as const,
    createdAt: 1_000,
    stateJson: JSON.stringify({ kind: "delegate", task: "synthetic task" }),
    ...extra,
  };
}

function seedParkedWork(options: Options, ...ids: string[]): ContinuationRecord[] {
  return ids.map((id) => {
    const result = write(options, (db) => createContinuationRecordInDatabase(db, work(id)));
    if (result.outcome !== "created") {
      throw new Error(`seed ${id} failed`);
    }
    return result.record;
  });
}

function electionOver(priors: readonly ContinuationRecord[], newId: string): ContinuationElection {
  return {
    ownerSessionKey: OWNER,
    expectedLive: priors.map((prior) => ({
      recordId: prior.recordId,
      revision: prior.revision,
      status: "queued" as const,
    })),
    supersede: priors.map((prior) => ({
      recordId: prior.recordId,
      expectedRevision: prior.revision,
      phase: `superseded: ${newId}`,
      stateJson: JSON.stringify({ kind: "work", superseded: true }),
    })),
    create: work(newId, { createdAt: 2_000 }),
    now: 2_000,
  };
}

/** Install a trigger that aborts the named write, so the fault lands exactly between steps. */
function injectFault(options: Options, event: "INSERT" | "UPDATE", recordId: string): void {
  const { db } = openOpenClawStateDatabase(options);
  db.exec(`
    CREATE TRIGGER inject_custody_fault BEFORE ${event} ON continuation_records
    WHEN NEW.record_id = '${recordId}'
    BEGIN SELECT RAISE(ABORT, 'injected custody fault'); END;
  `);
}

function clearFault(options: Options): void {
  openOpenClawStateDatabase(options).db.exec("DROP TRIGGER IF EXISTS inject_custody_fault");
}

/**
 * The owner's work custody after an election attempt is exactly the pre-state
 * or exactly the post-state. It never holds two live obligations for one
 * election, and it never strands a superseded prior without its replacement.
 */
function electionState(
  options: Options,
  priors: readonly ContinuationRecord[],
  newId: string,
): "pre" | "post" | "two-live" | "stranded" | "other" {
  const records = new Map(list(options).map((record) => [record.recordId, record]));
  const created = records.get(newId);
  const priorStates = priors.map((prior) => records.get(prior.recordId));
  const priorsUntouched = priorStates.every(
    (record, index) =>
      record?.status === "queued" &&
      record.revision === priors[index]?.revision &&
      record.stateJson === priors[index]?.stateJson,
  );
  const priorsSuperseded = priorStates.every(
    (record) => record?.status === "succeeded" && record.endedAt !== undefined,
  );
  if (!created && priorsUntouched) {
    return "pre";
  }
  if (created?.status === "queued" && priorsSuperseded) {
    return "post";
  }
  if (created && priorStates.some((record) => record?.status === "queued")) {
    return "two-live";
  }
  if (!created && priorStates.some((record) => record?.status === "succeeded")) {
    return "stranded";
  }
  return "other";
}

/**
 * The deliberately split variant: the same kernel steps committed as two
 * transactions, as composing the single-record CAS and create operations would.
 */
function electSplit(options: Options, election: ContinuationElection): void {
  write(options, (db) =>
    updateContinuationRecordsInDatabase(
      db,
      election.supersede.map((prior) => ({
        recordId: prior.recordId,
        expectedRevision: prior.expectedRevision,
        patch: { status: "succeeded", phase: prior.phase, stateJson: prior.stateJson },
      })),
      election.now,
    ),
  );
  write(options, (db) => createContinuationRecordInDatabase(db, election.create));
}

describe("owner-conditioned election replacement is one commit", () => {
  it("rolls back every superseded prior when the insert faults after the supersede writes", () => {
    const options = stateOptions();
    const priors = seedParkedWork(options, "parked-a", "parked-b");
    injectFault(options, "INSERT", "elected");

    expect(() =>
      write(options, (db) => electContinuationWorkInDatabase(db, electionOver(priors, "elected"))),
    ).toThrow("injected custody fault");
    expect(electionState(options, priors, "elected")).toBe("pre");

    clearFault(options);
    const retried = write(options, (db) =>
      electContinuationWorkInDatabase(db, electionOver(priors, "elected")),
    );
    expect(retried.outcome).toBe("elected");
    expect(electionState(options, priors, "elected")).toBe("post");
  });

  it("rolls back the first supersede when the second supersede faults", () => {
    const options = stateOptions();
    const priors = seedParkedWork(options, "parked-a", "parked-b");
    injectFault(options, "UPDATE", "parked-b");

    expect(() =>
      write(options, (db) => electContinuationWorkInDatabase(db, electionOver(priors, "elected"))),
    ).toThrow("injected custody fault");
    expect(electionState(options, priors, "elected")).toBe("pre");
  });

  it("negative control: the split-transaction variant strands the superseded prior", () => {
    const options = stateOptions();
    const priors = seedParkedWork(options, "parked-a");
    injectFault(options, "INSERT", "elected");

    expect(() => electSplit(options, electionOver(priors, "elected"))).toThrow(
      "injected custody fault",
    );
    // The same fault the real operation survives leaves the split variant broken.
    expect(electionState(options, priors, "elected")).toBe("stranded");
  });

  it("refuses a stale owner snapshot and commits nothing", () => {
    const options = stateOptions();
    const [parked] = seedParkedWork(options, "parked-a");
    const election = electionOver([parked!], "elected");
    // A racing election commits first; the owner's live set changed.
    write(options, (db) => createContinuationRecordInDatabase(db, work("racer")));

    expect(write(options, (db) => electContinuationWorkInDatabase(db, election))).toEqual({
      outcome: "owner_changed",
      ownerSessionKey: OWNER,
    });
    expect(
      list(options).map((record) => [record.recordId, record.status, record.revision]),
    ).toEqual([
      ["parked-a", "queued", 0],
      ["racer", "queued", 0],
    ]);
  });

  it("refuses a prior claimed after the snapshot, and ignores chain identity (Q5)", () => {
    const options = stateOptions();
    const [parked] = seedParkedWork(options, "parked-a");
    const election = electionOver([parked!], "elected");
    election.create = work("elected", { chainId: "another-chain", createdAt: 2_000 });
    write(options, (db) =>
      updateContinuationRecordsInDatabase(
        db,
        [{ recordId: "parked-a", expectedRevision: 0, patch: { status: "running" } }],
        1_500,
      ),
    );

    expect(write(options, (db) => electContinuationWorkInDatabase(db, election)).outcome).toBe(
      "owner_changed",
    );
    expect(list(options).map((record) => record.recordId)).toEqual(["parked-a"]);
  });

  it("excludes cancel-fenced work from the owner condition, as at C", () => {
    const options = stateOptions();
    seedParkedWork(options, "fenced");
    write(options, (db) =>
      updateContinuationRecordsInDatabase(
        db,
        [{ recordId: "fenced", expectedRevision: 0, patch: { cancelRequestedAt: 1_100 } }],
        1_100,
      ),
    );

    const result = write(options, (db) =>
      electContinuationWorkInDatabase(db, electionOver([], "elected")),
    );
    expect(result.outcome).toBe("elected");
  });

  it("refuses to supersede a running record and an existing record ID", () => {
    const options = stateOptions();
    const [running] = seedParkedWork(options, "running");
    const claimed = write(options, (db) =>
      updateContinuationRecordsInDatabase(
        db,
        [{ recordId: "running", expectedRevision: 0, patch: { status: "running" } }],
        1_100,
      ),
    );
    expect(claimed.outcome).toBe("applied");
    const snapshot = { ...running!, revision: 1, status: "running" as const };
    const supersedeRunning = {
      ...electionOver([snapshot], "elected"),
      expectedLive: [{ recordId: "running", revision: 1, status: "running" as const }],
    };
    expect(write(options, (db) => electContinuationWorkInDatabase(db, supersedeRunning))).toEqual({
      outcome: "invalid_prior",
      recordId: "running",
    });

    const duplicate = {
      ...electionOver([], "running"),
      expectedLive: [{ recordId: "running", revision: 1, status: "running" as const }],
    };
    expect(write(options, (db) => electContinuationWorkInDatabase(db, duplicate))).toEqual({
      outcome: "exists",
      recordId: "running",
    });
  });
});

describe("revision CAS", () => {
  it("rejects a stale revision and leaves the record unchanged", () => {
    const options = stateOptions();
    seedParkedWork(options, "work-a");
    write(options, (db) =>
      updateContinuationRecordsInDatabase(
        db,
        [{ recordId: "work-a", expectedRevision: 0, patch: { phase: "anchored" } }],
        1_100,
      ),
    );

    expect(
      write(options, (db) =>
        updateContinuationRecordsInDatabase(
          db,
          [{ recordId: "work-a", expectedRevision: 0, patch: { phase: "stale writer" } }],
          1_200,
        ),
      ),
    ).toEqual({ outcome: "revision_conflict", recordId: "work-a", revision: 1 });
    expect(list(options)[0]).toMatchObject({ revision: 1, phase: "anchored", updatedAt: 1_100 });
  });

  it("applies a multi-record CAS all or nothing", () => {
    const options = stateOptions();
    seedParkedWork(options, "work-a", "work-b");
    write(options, (db) =>
      updateContinuationRecordsInDatabase(
        db,
        [{ recordId: "work-b", expectedRevision: 0, patch: { phase: "moved" } }],
        1_100,
      ),
    );

    const result = write(options, (db) =>
      updateContinuationRecordsInDatabase(
        db,
        [
          { recordId: "work-a", expectedRevision: 0, patch: { status: "failed" } },
          { recordId: "work-b", expectedRevision: 0, patch: { status: "failed" } },
        ],
        1_200,
      ),
    );
    expect(result).toEqual({ outcome: "revision_conflict", recordId: "work-b", revision: 1 });
    expect(list(options).map((record) => [record.recordId, record.status])).toEqual([
      ["work-a", "queued"],
      ["work-b", "queued"],
    ]);
  });

  it("stamps ended_at on terminal writes, clears it on requeue, and restores rollback priors", () => {
    const options = stateOptions();
    const [prior] = seedParkedWork(options, "work-a");
    const elected = write(options, (db) =>
      electContinuationWorkInDatabase(db, electionOver([prior!], "elected")),
    );
    expect(elected.outcome).toBe("elected");
    const superseded = list(options).find((record) => record.recordId === "work-a")!;
    expect(superseded).toMatchObject({ status: "succeeded", endedAt: 2_000, revision: 1 });

    // Rollback: fail the created record and restore the prior exactly, marked explicitly.
    const rollback = write(options, (db) =>
      updateContinuationRecordsInDatabase(
        db,
        [
          {
            recordId: "elected",
            expectedRevision: 0,
            patch: { status: "failed", failureReason: "rolled back" },
          },
          {
            recordId: "work-a",
            expectedRevision: 1,
            patch: {
              status: "queued",
              phase: prior!.phase ?? null,
              stateJson: prior!.stateJson,
              cancelRequestedAt: null,
              rollbackOf: "elected",
            },
          },
        ],
        3_000,
      ),
    );
    expect(rollback.outcome).toBe("applied");
    const restored = list(options).find((record) => record.recordId === "work-a")!;
    expect(restored).toMatchObject({
      status: "queued",
      stateJson: prior!.stateJson,
      rollbackOf: "elected",
      revision: 2,
    });
    expect(restored.endedAt).toBeUndefined();
    expect(restored.phase).toBeUndefined();
  });
});

describe("spawn attempts", () => {
  it("allocates strictly increasing, never reused attempt IDs formatted only by L0", () => {
    const options = stateOptions();
    write(options, (db) => createContinuationRecordInDatabase(db, delegate("delegate-a")));

    const first = write(options, (db) =>
      claimContinuationSpawnAttemptInDatabase(db, {
        recordId: "delegate-a",
        expectedRevision: 0,
        now: 1_100,
      }),
    );
    if (first.outcome !== "claimed") {
      throw new Error("expected first claim");
    }
    expect(first.attempt).toEqual({
      attemptId: 1,
      childRunId: formatContinuationChildRunId("delegate-a", 1),
      claimedAt: 1_100,
    });

    // Only an initialize-phase failure is requeued by the dispatcher; the store records it.
    const failed = write(options, (db) =>
      recordContinuationSpawnAttemptFailureInDatabase(
        db,
        {
          recordId: "delegate-a",
          expectedRevision: 1,
          attemptId: 1,
          failurePhase: "initialize",
          patch: { status: "queued" },
        },
        1_200,
      ),
    );
    expect(failed.outcome).toBe("applied");
    // A second failure for the same attempt is refused.
    expect(
      write(options, (db) =>
        recordContinuationSpawnAttemptFailureInDatabase(
          db,
          { recordId: "delegate-a", expectedRevision: 2, attemptId: 1, failurePhase: "dispatch" },
          1_250,
        ),
      ).outcome,
    ).toBe("invalid_transition");

    const second = write(options, (db) =>
      claimContinuationSpawnAttemptInDatabase(db, {
        recordId: "delegate-a",
        expectedRevision: 2,
        now: 1_300,
      }),
    );
    if (second.outcome !== "claimed") {
      throw new Error("expected second claim");
    }
    expect(second.attempt.attemptId).toBe(2);
    expect(second.record.spawnAttempts).toEqual([
      {
        attemptId: 1,
        childRunId: formatContinuationChildRunId("delegate-a", 1),
        claimedAt: 1_100,
        failurePhase: "initialize",
      },
      { attemptId: 2, childRunId: formatContinuationChildRunId("delegate-a", 2), claimedAt: 1_300 },
    ]);
    const runIds = second.record.spawnAttempts.map((attempt) => attempt.childRunId);
    expect(new Set(runIds).size).toBe(runIds.length);
    expect(runIds.map((runId) => parseContinuationChildRunId(runId))).toEqual([
      { recordId: "delegate-a", attemptId: 1 },
      { recordId: "delegate-a", attemptId: 2 },
    ]);
  });

  it("lets exactly one of two claims at the same revision win", () => {
    const options = stateOptions();
    write(options, (db) => createContinuationRecordInDatabase(db, delegate("delegate-a")));
    const claim = () =>
      write(options, (db) =>
        claimContinuationSpawnAttemptInDatabase(db, {
          recordId: "delegate-a",
          expectedRevision: 0,
          now: 1_100,
        }),
      );

    expect(claim().outcome).toBe("claimed");
    expect(claim()).toEqual({ outcome: "revision_conflict", recordId: "delegate-a", revision: 1 });
    expect(list(options)[0]!.spawnAttempts).toHaveLength(1);
  });

  it("keeps stored child run IDs as opaque evidence and continues after the highest attempt", () => {
    const options = stateOptions();
    write(options, (db) => createContinuationRecordInDatabase(db, delegate("delegate-a")));
    // Imported evidence may carry a run ID the L0 formatter would never produce.
    openOpenClawStateDatabase(options)
      .db.prepare("UPDATE continuation_records SET spawn_attempts_json = ? WHERE record_id = ?")
      .run(
        JSON.stringify([{ attemptId: 3, childRunId: "legacy-opaque-run", claimedAt: 900 }]),
        "delegate-a",
      );

    const claimed = write(options, (db) =>
      claimContinuationSpawnAttemptInDatabase(db, {
        recordId: "delegate-a",
        expectedRevision: 0,
        now: 1_100,
      }),
    );
    if (claimed.outcome !== "claimed") {
      throw new Error("expected claim");
    }
    expect(claimed.record.spawnAttempts.map((attempt) => attempt.childRunId)).toEqual([
      "legacy-opaque-run",
      formatContinuationChildRunId("delegate-a", 4),
    ]);
  });

  it("keeps attempt evidence through terminalization and refuses claims on non-delegates", () => {
    const options = stateOptions();
    write(options, (db) => createContinuationRecordInDatabase(db, delegate("delegate-a")));
    write(options, (db) =>
      claimContinuationSpawnAttemptInDatabase(db, {
        recordId: "delegate-a",
        expectedRevision: 0,
        now: 1_100,
      }),
    );
    write(options, (db) =>
      updateContinuationRecordsInDatabase(
        db,
        [
          {
            recordId: "delegate-a",
            expectedRevision: 1,
            patch: {
              status: "failed",
              failureReason: "spawn-interrupted",
              terminalNoticePending: "delegate-spawn-interrupted",
            },
          },
        ],
        1_200,
      ),
    );
    expect(list(options)[0]).toMatchObject({
      status: "failed",
      terminalNoticePending: "delegate-spawn-interrupted",
      spawnAttempts: [{ attemptId: 1, childRunId: formatContinuationChildRunId("delegate-a", 1) }],
    });

    seedParkedWork(options, "work-a");
    expect(
      write(options, (db) =>
        claimContinuationSpawnAttemptInDatabase(db, {
          recordId: "work-a",
          expectedRevision: 0,
          now: 1_300,
        }),
      ).outcome,
    ).toBe("not_claimable");
  });
});

describe("list-by-owner, scrub and retention", () => {
  it("lists FIFO per owner and filters by kind and status", () => {
    const options = stateOptions();
    write(options, (db) =>
      createContinuationRecordInDatabase(db, work("b-work", { createdAt: 2_000 })),
    );
    write(options, (db) =>
      createContinuationRecordInDatabase(db, delegate("a-delegate", { createdAt: 2_000 })),
    );
    write(options, (db) =>
      createContinuationRecordInDatabase(db, work("c-work", { createdAt: 1_000 })),
    );
    write(options, (db) =>
      createContinuationRecordInDatabase(db, {
        ...work("other"),
        ownerSessionKey: "agent:main:other",
      }),
    );

    expect(list(options).map((record) => record.recordId)).toEqual([
      "c-work",
      "a-delegate",
      "b-work",
    ]);
    expect(
      write(options, (db) =>
        listContinuationRecordsInDatabase(db, { ownerSessionKey: OWNER, kinds: ["delegate"] }),
      ).map((record) => record.recordId),
    ).toEqual(["a-delegate"]);
    expect(
      write(options, (db) => listContinuationRecordsInDatabase(db, { statuses: ["queued"] }))
        .length,
    ).toBe(4);
  });

  it("reports an empty store without creating the first-use table", () => {
    const options = stateOptions();
    expect(write(options, (db) => listContinuationRecordsInDatabase(db, {}))).toEqual([]);
    const { db } = openOpenClawStateDatabase(options);
    expect(
      db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'continuation_records'").get(),
    ).toBeUndefined();
  });

  it("scrubs the attachment reference in the terminal commit and reports it for release", () => {
    const options = stateOptions();
    const attachmentId = "0f8fad5b-d9cb-469f-a165-70867728950e";
    write(options, (db) =>
      createContinuationRecordInDatabase(db, delegate("delegate-a", { attachmentId })),
    );

    const finished = write(options, (db) =>
      updateContinuationRecordsInDatabase(
        db,
        [
          {
            recordId: "delegate-a",
            expectedRevision: 0,
            patch: {
              status: "succeeded",
              handoff: {
                target: "subagent_runs",
                childRunId: formatContinuationChildRunId("delegate-a", 1),
                childSessionKey: "agent:main:subagent:child",
                handedOffAt: 1_100,
              },
            },
          },
        ],
        1_100,
      ),
    );
    expect(finished).toMatchObject({
      outcome: "applied",
      releasedAttachments: [{ recordId: "delegate-a", attachmentId }],
      owners: [{ ownerSessionKey: OWNER, records: [] }],
    });
    expect(list(options)[0]!.attachmentId).toBeUndefined();
    // Handed-off custody never returns to the store.
    expect(
      write(options, (db) =>
        updateContinuationRecordsInDatabase(
          db,
          [{ recordId: "delegate-a", expectedRevision: 1, patch: { status: "queued" } }],
          1_200,
        ),
      ).outcome,
    ).toBe("invalid_transition");
  });

  it("deletes at an exact revision and prunes only notice-free terminal records", () => {
    const options = stateOptions();
    seedParkedWork(options, "live", "done", "owed", "recent");
    const end = (recordId: string, now: number, notice?: "retry-exhausted") =>
      write(options, (db) =>
        updateContinuationRecordsInDatabase(
          db,
          [
            {
              recordId,
              expectedRevision: 0,
              patch: { status: "failed", ...(notice ? { terminalNoticePending: notice } : {}) },
            },
          ],
          now,
        ),
      );
    end("done", 1_000);
    end("owed", 1_000, "retry-exhausted");
    end("recent", 9_000);

    expect(
      write(options, (db) => pruneContinuationRecordsInDatabase(db, { endedBefore: 5_000 })),
    ).toEqual({
      deletedRecordIds: ["done"],
    });
    expect(
      write(options, (db) =>
        deleteContinuationRecordInDatabase(db, { recordId: "live", expectedRevision: 1 }),
      ),
    ).toEqual({ outcome: "revision_conflict", recordId: "live", revision: 0 });
    expect(
      write(options, (db) =>
        deleteContinuationRecordInDatabase(db, { recordId: "live", expectedRevision: 0 }),
      ).outcome,
    ).toBe("deleted");
    expect(list(options).map((record) => record.recordId)).toEqual(["owed", "recent"]);
  });
});
