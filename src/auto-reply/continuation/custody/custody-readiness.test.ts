// Custody readiness (phase A, RFC docs/design/continue-work-signal-v2.md §5.4.5):
// the production path from surviving legacy TaskFlow rows to a gated, hydrated
// custody store. No test here calls the importer directly: every legacy import
// must happen because a real custody mutation, or Gateway startup, ran phase A.
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../../test/helpers/temp-dir.js";
import {
  closeOpenClawStateDatabaseAsync,
  closeOpenClawStateDatabaseByPathAsync,
} from "../../../state/openclaw-state-db.js";
import { runContinuationCustodyBoot } from "../custody-boot.js";
import {
  isContinuationCustodyOwnerAwaitingImport,
  resetContinuationCustodyImportGateForTests,
} from "../custody-import-gate.js";
import {
  enqueuePendingDelegate,
  pendingDelegateCount,
  resolveQueuedDelegateCounts,
} from "../delegate-store.js";
import { cancelSessionContinuations } from "../session-reset.js";
import { hasLiveContinuationCustody } from "../work-store.js";
import {
  invalidateContinuationCustodyOwners,
  isContinuationCustodyProjectionHydrated,
  resetContinuationCustodyProjection,
} from "./custody-projection.js";
import {
  hydrateContinuationCustody,
  listContinuationRecords,
  resolveContinuationCustodyDatabasePath,
  whenContinuationCustodyReady,
} from "./custody-store.js";
import { ensureContinuationCustodySchema } from "./custody-store.worker.js";
import { endContinuationCustodyLifetimeForTest } from "./custody.test-support.js";
import {
  OWNER_A,
  OWNER_B,
  delegateState,
  dumpState,
  newRootPayloadPath,
  readQueue,
  readReceipts,
  seedFlow,
  seedPreCutoverEntry,
  writeLegacyPayload,
  type Options,
} from "./legacy-taskflow-import.test-support.js";
import { queueEntryReceiptKey } from "./legacy-taskflow-migration-source.js";

// Pause-point arrivals as promises: a test awaits the exact event instead of
// polling a counter against a clock, so a slow runner waits longer rather than
// failing (vi.waitFor's default 1 s window timed out on slower seats).
const arrivals = vi.hoisted(() => {
  const counts = new Map<string, number>();
  const waiters: { name: string; count: number; resolve: () => void }[] = [];
  return {
    note(name: string): void {
      const count = (counts.get(name) ?? 0) + 1;
      counts.set(name, count);
      for (const waiter of waiters.filter((w) => w.name === name && w.count <= count)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve();
      }
    },
    reached(name: string, count = 1): Promise<void> {
      if ((counts.get(name) ?? 0) >= count) {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        waiters.push({ name, count, resolve });
      });
    },
    reset(): void {
      counts.clear();
      waiters.length = 0;
    },
  };
});

const importControl = vi.hoisted(() => ({
  calls: 0,
  throwNext: false,
  pauseNext: undefined as Promise<void> | undefined,
}));

vi.mock("./legacy-taskflow-import.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./legacy-taskflow-import.js")>();
  return {
    ...actual,
    migrateContinuationTaskFlowCustody: async (
      options: Parameters<typeof actual.migrateContinuationTaskFlowCustody>[0],
    ) => {
      importControl.calls += 1;
      arrivals.note("import");
      if (importControl.pauseNext) {
        const pause = importControl.pauseNext;
        importControl.pauseNext = undefined;
        await pause;
      }
      if (importControl.throwNext) {
        importControl.throwNext = false;
        throw new Error("injected import failure");
      }
      return await actual.migrateContinuationTaskFlowCustody(options);
    },
  };
});

const payloadControl = vi.hoisted(() => ({
  pauseNext: undefined as Promise<void> | undefined,
  entered: 0,
}));

// Pause point inside the importer, after it snapshotted the legacy rows and
// before its first write: payload preparation for the first owner.
vi.mock("./legacy-taskflow-payloads.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./legacy-taskflow-payloads.js")>();
  return {
    ...actual,
    preparePayloads: async (...args: Parameters<typeof actual.preparePayloads>) => {
      payloadControl.entered += 1;
      arrivals.note("payload");
      if (payloadControl.pauseNext) {
        const pause = payloadControl.pauseNext;
        payloadControl.pauseNext = undefined;
        await pause;
      }
      return await actual.preparePayloads(...args);
    },
  };
});

// Pause points at the filesystem mutations themselves: after every caller-side
// lifetime check, before the payload create or legacy delete runs.
const fsControl = vi.hoisted(() => ({
  pauseStore: undefined as Promise<void> | undefined,
  storeEntered: 0,
  pauseRemove: undefined as Promise<void> | undefined,
  removeEntered: 0,
}));

vi.mock("./custody-payload-store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./custody-payload-store.js")>();
  return {
    ...actual,
    storeContinuationCustodyPayload: async (
      ...args: Parameters<typeof actual.storeContinuationCustodyPayload>
    ) => {
      fsControl.storeEntered += 1;
      arrivals.note("store");
      if (fsControl.pauseStore) {
        const pause = fsControl.pauseStore;
        fsControl.pauseStore = undefined;
        await pause;
      }
      return await actual.storeContinuationCustodyPayload(...args);
    },
  };
});

vi.mock("../../../agents/subagents/subagent-attachment-cleanup.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../agents/subagents/subagent-attachment-cleanup.js")
    >();
  return {
    ...actual,
    removeSubagentAttachmentTree: async (
      ...args: Parameters<typeof actual.removeSubagentAttachmentTree>
    ) => {
      fsControl.removeEntered += 1;
      arrivals.note("remove");
      if (fsControl.pauseRemove) {
        const pause = fsControl.pauseRemove;
        fsControl.pauseRemove = undefined;
        await pause;
      }
      return await actual.removeSubagentAttachmentTree(...args);
    },
  };
});

// Pause point after a custody list has returned, before its caller reads the
// import gate: the window in which the database can close and be replaced.
const listControl = vi.hoisted(() => ({
  pauseAfterList: undefined as Promise<void> | undefined,
  paused: 0,
}));

vi.mock("../../../state/openclaw-state-worker-store.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../state/openclaw-state-worker-store.js")>();
  const run = async (...args: Parameters<typeof actual.runOpenClawStateWorkerOperation>) => {
    const [context, operation, operationOptions] = args;
    let type: string | undefined;
    const output = await actual.runOpenClawStateWorkerOperation(
      context,
      (scope) =>
        operation(
          new Proxy(scope, {
            get(target, property, receiver) {
              const value = Reflect.get(target, property, receiver) as unknown;
              if (property === "execute" && typeof value === "function") {
                return (request: { type: string }) => {
                  type = request.type;
                  return (value as (request: unknown) => unknown).call(target, request);
                };
              }
              return typeof value === "function" ? value.bind(target) : value;
            },
          }),
        ),
      operationOptions,
    );
    if (type === "continuationCustody.list" && listControl.pauseAfterList) {
      const pause = listControl.pauseAfterList;
      listControl.pauseAfterList = undefined;
      listControl.paused += 1;
      arrivals.note("list");
      await pause;
    }
    return output;
  };
  return { ...actual, runOpenClawStateWorkerOperation: run };
});

const IMPORT_PENDING = "waiting on legacy import";

let options: Options;
const tempDirs = useAutoCleanupTempDirTracker((cleanup) =>
  afterEach(async () => {
    resetContinuationCustodyProjection();
    resetContinuationCustodyImportGateForTests();
    await closeOpenClawStateDatabaseAsync();
    vi.unstubAllEnvs();
    cleanup();
  }),
);

beforeEach(() => {
  arrivals.reset();
  // Deliberately no hydration: each test starts as a Gateway that has not
  // run custody boot yet.
  const stateDir = tempDirs.make("openclaw-continuation-readiness-");
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
  options = { env: { ...process.env, OPENCLAW_STATE_DIR: stateDir } };
  importControl.calls = 0;
  importControl.throwNext = false;
  importControl.pauseNext = undefined;
  payloadControl.pauseNext = undefined;
  payloadControl.entered = 0;
  fsControl.pauseStore = undefined;
  fsControl.storeEntered = 0;
  fsControl.pauseRemove = undefined;
  fsControl.removeEntered = 0;
  listControl.pauseAfterList = undefined;
  listControl.paused = 0;
});

function seedLegacyQueuedDelegate(flowId: string, owner = OWNER_A): void {
  seedFlow(options, {
    flowId,
    owner,
    controller: "delegate",
    status: "queued",
    state: delegateState(),
    createdAt: Date.now() - 60_000,
    updatedAt: Date.now() - 60_000,
  });
}

const STUCK_ATTACHMENT_ID = "0b6f5d7e-8c1a-4b2f-9e3d-5a6b7c8d9e0f";
const FILE_ATTACHMENT_ID = "3d1e8a4c-2b6f-4c1d-9a7e-5f0b2c8d4e6a";

/**
 * Seeds a legacy delegate whose payload file cannot be copied into the new
 * root (a file sits where the directory goes): the L3 per-owner import fault.
 * That owner's import fails and it stays awaiting import; others import.
 */
function seedUncopyableLegacyDelegate(flowId: string, owner: string): void {
  seedFlow(options, {
    flowId,
    owner,
    controller: "delegate",
    status: "queued",
    state: delegateState({ attachmentId: STUCK_ATTACHMENT_ID, attachmentCount: 1 }),
  });
  writeLegacyPayload(options, { attachmentId: STUCK_ATTACHMENT_ID, flowId, owner });
  fs.writeFileSync(
    path.join(options.env.OPENCLAW_STATE_DIR!, "attachments", "continuation-custody"),
    "blocked",
  );
}

function removeStateDatabaseFiles(): void {
  const databasePath = resolveContinuationCustodyDatabasePath();
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

/** Committed record IDs, read raw: a public list would itself run phase A. */
async function recordIds(): Promise<string[]> {
  const records = dumpState(options).records as Array<{ record_id: string }>;
  return records.map((record) => record.record_id).toSorted();
}

describe("continuation custody readiness (phase A)", () => {
  it("imports surviving legacy rows before the first custody write commits", async () => {
    seedLegacyQueuedDelegate("legacy-queued");

    const created = await enqueuePendingDelegate(OWNER_B, { task: "fresh work" });

    expect(importControl.calls).toBe(1);
    expect(await recordIds()).toEqual(["legacy-queued", created.recordId].toSorted());
    expect(readReceipts(options).some((row) => row.source_key.endsWith(":legacy-queued"))).toBe(
      true,
    );
    // The projection describes post-import state for both owners.
    expect(pendingDelegateCount(OWNER_A)).toBe(1);
    expect(pendingDelegateCount(OWNER_B)).toBe(1);
  });

  it("refuses a startup-window write for an owner whose import failed, and admits others", async () => {
    seedUncopyableLegacyDelegate("legacy-stuck", OWNER_A);

    await expect(enqueuePendingDelegate(OWNER_A, { task: "would bypass" })).rejects.toThrow(
      IMPORT_PENDING,
    );
    const admitted = await enqueuePendingDelegate(OWNER_B, { task: "unaffected owner" });

    expect(await recordIds()).toEqual([admitted.recordId]);
  });

  it("keeps a failed owner awaiting import and refusing writes until a later phase A imports it", async () => {
    seedUncopyableLegacyDelegate("legacy-retried", OWNER_A);
    await whenContinuationCustodyReady();

    await expect(enqueuePendingDelegate(OWNER_A, { task: "refused" })).rejects.toThrow(
      IMPORT_PENDING,
    );
    await expect(enqueuePendingDelegate(OWNER_A, { task: "still refused" })).rejects.toThrow(
      IMPORT_PENDING,
    );
    expect(isContinuationCustodyOwnerAwaitingImport(OWNER_A)).toBe(true);
    expect(importControl.calls).toBe(1);

    // The fault clears; the next phase A (a Gateway restart; here a re-hydration) retries it.
    fs.rmSync(path.join(options.env.OPENCLAW_STATE_DIR!, "attachments", "continuation-custody"));
    await hydrateContinuationCustody();

    expect(importControl.calls).toBe(2);
    expect(isContinuationCustodyOwnerAwaitingImport(OWNER_A)).toBe(false);
    const admitted = await enqueuePendingDelegate(OWNER_A, { task: "admitted after retry" });
    expect(await recordIds()).toEqual(["legacy-retried", admitted.recordId].toSorted());
  });

  it("shares one phase A between concurrent first writes", async () => {
    seedLegacyQueuedDelegate("legacy-shared");

    const [first, second] = await Promise.all([
      enqueuePendingDelegate(OWNER_B, { task: "first" }),
      enqueuePendingDelegate(OWNER_B, { task: "second" }),
    ]);

    expect(importControl.calls).toBe(1);
    expect(await recordIds()).toEqual(
      ["legacy-shared", first.recordId, second.recordId].toSorted(),
    );
  });

  it("admits no write when the import throws, and the next write retries phase A", async () => {
    seedLegacyQueuedDelegate("legacy-retry");
    importControl.throwNext = true;

    await expect(enqueuePendingDelegate(OWNER_B, { task: "blocked" })).rejects.toThrow(
      "injected import failure",
    );
    expect(await recordIds()).toEqual([]);

    const created = await enqueuePendingDelegate(OWNER_B, { task: "after retry" });

    expect(importControl.calls).toBe(2);
    expect(await recordIds()).toEqual(["legacy-retry", created.recordId].toSorted());
  });

  it("lets startup's phase A finish while a concurrent first write waits for it (no deadlock)", async () => {
    seedLegacyQueuedDelegate("legacy-startup");
    const order: string[] = [];

    const startup = whenContinuationCustodyReady().then(() => order.push("ready"));
    const write = enqueuePendingDelegate(OWNER_B, { task: "admitted during startup" }).then(
      (record) => {
        order.push("write");
        return record;
      },
    );
    const created = await write;
    await startup;

    expect(order).toEqual(["ready", "write"]);
    expect(importControl.calls).toBe(1);
    expect(await recordIds()).toEqual(["legacy-startup", created.recordId].toSorted());
  });

  it("never reads an unresolved owner as zero queued delegates for a decision", async () => {
    await enqueuePendingDelegate(OWNER_A, { task: "committed" });
    // An unknown write outcome leaves the owner unknown in the projection.
    invalidateContinuationCustodyOwners(resolveContinuationCustodyDatabasePath(), [OWNER_A]);

    expect(pendingDelegateCount(OWNER_A)).toBe(0);
    expect(await resolveQueuedDelegateCounts(OWNER_A)).toEqual({
      pending: 1,
      stagedPostCompaction: 0,
      awaitingImport: false,
    });
  });

  it("counts legacy work a decision would otherwise miss before hydration", async () => {
    seedLegacyQueuedDelegate("legacy-counted");

    // The sync projection read is unknown here, so a decision must not use it.
    expect(pendingDelegateCount(OWNER_A)).toBe(0);
    expect(await resolveQueuedDelegateCounts(OWNER_A)).toEqual({
      pending: 1,
      stagedPostCompaction: 0,
      awaitingImport: false,
    });
    expect(importControl.calls).toBe(1);
  });

  it("reports awaitingImport from the hydrated projection when the owner's legacy import failed", async () => {
    seedUncopyableLegacyDelegate("legacy-counts-hydrated", OWNER_A);
    await whenContinuationCustodyReady();
    expect(isContinuationCustodyProjectionHydrated(resolveContinuationCustodyDatabasePath())).toBe(
      true,
    );
    expect(isContinuationCustodyOwnerAwaitingImport(OWNER_A)).toBe(true);

    // The legacy delegate is not in custody, so zero counts are only a lower bound.
    expect(await resolveQueuedDelegateCounts(OWNER_A)).toEqual({
      pending: 0,
      stagedPostCompaction: 0,
      awaitingImport: true,
    });
    // An owner with no legacy work reads exact counts.
    expect(await resolveQueuedDelegateCounts(OWNER_B)).toEqual({
      pending: 0,
      stagedPostCompaction: 0,
      awaitingImport: false,
    });
  });

  it("reports awaitingImport from the committed inventory when the projection does not know the owner", async () => {
    seedUncopyableLegacyDelegate("legacy-counts-inventory", OWNER_A);
    await whenContinuationCustodyReady();
    // Force the inventory path for both owners.
    invalidateContinuationCustodyOwners(resolveContinuationCustodyDatabasePath(), [
      OWNER_A,
      OWNER_B,
    ]);

    expect(await resolveQueuedDelegateCounts(OWNER_A)).toEqual({
      pending: 0,
      stagedPostCompaction: 0,
      awaitingImport: true,
    });
    expect(await resolveQueuedDelegateCounts(OWNER_B)).toEqual({
      pending: 0,
      stagedPostCompaction: 0,
      awaitingImport: false,
    });
  });

  it("does not let a session reset outrun the legacy import (no resurrected work)", async () => {
    seedLegacyQueuedDelegate("legacy-reset");

    // A reset before anything else has triggered phase A.
    await cancelSessionContinuations(OWNER_A);
    await whenContinuationCustodyReady();

    const imported = (await listContinuationRecords({ recordIds: ["legacy-reset"] }))[0];
    expect(imported?.status).toBe("cancelled");
    expect(pendingDelegateCount(OWNER_A)).toBe(0);
  });

  it("does not let the cleanup guard judge an owner empty before its legacy import", async () => {
    seedLegacyQueuedDelegate("legacy-guarded");

    expect(await hasLiveContinuationCustody(OWNER_A)).toBe(true);
  });

  it("refuses a reset (retryable) while the owner's legacy import has failed", async () => {
    // The public inventory for this owner is empty, but its legacy rows are not.
    seedUncopyableLegacyDelegate("legacy-reset-blocked", OWNER_A);

    await expect(cancelSessionContinuations(OWNER_A)).rejects.toThrow(IMPORT_PENDING);
  });

  it("treats an owner whose legacy import failed as live for cleanup, never empty", async () => {
    seedUncopyableLegacyDelegate("legacy-cleanup-blocked", OWNER_A);

    expect(await hasLiveContinuationCustody(OWNER_A)).toBe(true);
  });

  it("does not reset over an inventory read from a database closed before its import state", async () => {
    await enqueuePendingDelegate(OWNER_B, { task: "first database" });
    let release: () => void = () => {};
    listControl.pauseAfterList = new Promise<void>((resolve) => {
      release = resolve;
    });

    // The first database answers "nothing for OWNER_A". Before reset reads the
    // import state, the same path is replaced by a database holding OWNER_A
    // legacy work that cannot be imported.
    const reset = cancelSessionContinuations(OWNER_A);
    await arrivals.reached("list");
    await closeOpenClawStateDatabaseAsync();
    removeStateDatabaseFiles();
    seedUncopyableLegacyDelegate("legacy-behind-reset", OWNER_A);
    release();

    await expect(reset).rejects.toThrow(IMPORT_PENDING);
    expect(isContinuationCustodyOwnerAwaitingImport(OWNER_A)).toBe(true);
  });

  it("does not report idle from an inventory read from a database closed before its import state", async () => {
    await enqueuePendingDelegate(OWNER_B, { task: "first database" });
    let release: () => void = () => {};
    listControl.pauseAfterList = new Promise<void>((resolve) => {
      release = resolve;
    });

    const live = hasLiveContinuationCustody(OWNER_A);
    await arrivals.reached("list");
    await closeOpenClawStateDatabaseAsync();
    removeStateDatabaseFiles();
    seedUncopyableLegacyDelegate("legacy-behind-cleanup", OWNER_A);
    release();

    expect(await live).toBe(true);
  });

  it("imports a queue-only legacy post-compaction entry at startup (no flow_runs row)", async () => {
    // A covered C-era queue entry is the owner's only legacy source.
    const entryId = seedPreCutoverEntry(options, { owner: OWNER_A });

    await whenContinuationCustodyReady();

    expect(importControl.calls).toBe(1);
    expect(readQueue(options).find((row) => row.id === entryId)?.status).not.toBe("pending");
    expect(
      readReceipts(options).some((row) => row.source_key === queueEntryReceiptKey(entryId)),
    ).toBe(true);
    expect(isContinuationCustodyOwnerAwaitingImport(OWNER_A)).toBe(false);
  });

  it("runs phase A again for a database replaced at the same path", async () => {
    await enqueuePendingDelegate(OWNER_B, { task: "first database" });
    expect(importControl.calls).toBe(0);

    // Orderly close, then a different database file at the same path whose
    // legacy work for OWNER_A was never imported (and cannot be).
    await closeOpenClawStateDatabaseAsync();
    removeStateDatabaseFiles();
    seedUncopyableLegacyDelegate("legacy-in-replacement", OWNER_A);

    await expect(enqueuePendingDelegate(OWNER_A, { task: "would bypass" })).rejects.toThrow(
      IMPORT_PENDING,
    );
    expect(importControl.calls).toBe(1);
  });

  it("does not let phase A from a closed database publish into its replacement", async () => {
    seedLegacyQueuedDelegate("legacy-closing");
    let release: () => void = () => {};
    importControl.pauseNext = new Promise<void>((resolve) => {
      release = resolve;
    });

    const stale = whenContinuationCustodyReady();
    await arrivals.reached("import");
    await closeOpenClawStateDatabaseAsync();
    release();

    // Refused either by the state layer's admission check or by phase A's own
    // lifetime epoch; what matters is that nothing from the old lifetime publishes.
    await expect(stale).rejects.toThrow();
    expect(pendingDelegateCount(OWNER_A)).toBe(0);
    // The next command re-runs phase A against the current database.
    await whenContinuationCustodyReady();
    expect(pendingDelegateCount(OWNER_A)).toBe(1);
  });

  it("invalidates on a path-scoped close when readiness began before the database existed", async () => {
    // No database file yet: the watcher captures a provisional identity.
    await enqueuePendingDelegate(OWNER_B, { task: "created the database" });

    // A path-scoped close reports the physical file identity.
    await closeOpenClawStateDatabaseByPathAsync(resolveContinuationCustodyDatabasePath());
    removeStateDatabaseFiles();
    seedUncopyableLegacyDelegate("legacy-after-path-close", OWNER_A);

    await expect(enqueuePendingDelegate(OWNER_A, { task: "would bypass" })).rejects.toThrow(
      IMPORT_PENDING,
    );
    expect(importControl.calls).toBe(1);
  });

  it("does not let a stale importer write into a replacement database", async () => {
    // Two lifetimes of the same legacy row, byte-identical. A replacement whose
    // rows differ is already refused by the importer's own snapshot check
    // ("legacy continuation rows changed during the import"); identical rows
    // pass it, so only the lifetime binding keeps the ended lifetime's import
    // run (its records, receipts and payload copies) out of the replacement.
    const legacyRow = {
      flowId: "legacy-shared-id",
      owner: OWNER_A,
      controller: "delegate" as const,
      status: "queued",
      state: delegateState(),
      createdAt: 1_000,
      updatedAt: 2_000,
    };
    seedFlow(options, legacyRow);
    let release: () => void = () => {};
    payloadControl.pauseNext = new Promise<void>((resolve) => {
      release = resolve;
    });

    const stale = whenContinuationCustodyReady();
    // Paused inside the importer, after its legacy snapshot and before any write.
    await arrivals.reached("payload");
    await closeOpenClawStateDatabaseByPathAsync(resolveContinuationCustodyDatabasePath());
    removeStateDatabaseFiles();
    seedFlow(options, legacyRow);
    // Like a restored post-cutover backup, the replacement already has the
    // custody schema, so a stale write would land rather than fail.
    ensureContinuationCustodySchema({ env: options.env });
    release();

    await expect(stale).rejects.toThrow();
    // The ended lifetime's import wrote nothing: no record, no receipt.
    expect(dumpState(options).records).toEqual([]);
    expect(readReceipts(options)).toEqual([]);
    expect(isContinuationCustodyProjectionHydrated(resolveContinuationCustodyDatabasePath())).toBe(
      false,
    );
    // The replacement's own phase A imports it on the next command.
    await whenContinuationCustodyReady();
    expect(await recordIds()).toEqual(["legacy-shared-id"]);
    expect(importControl.calls).toBe(2);
  });

  it("does not let a stale importer create payload bytes in a replacement's payload root", async () => {
    const legacyRow = {
      flowId: "legacy-with-file",
      owner: OWNER_A,
      controller: "delegate" as const,
      status: "queued",
      state: delegateState({ attachmentId: FILE_ATTACHMENT_ID, attachmentCount: 1 }),
      createdAt: 1_000,
      updatedAt: 2_000,
    };
    seedFlow(options, legacyRow);
    writeLegacyPayload(options, { attachmentId: FILE_ATTACHMENT_ID, flowId: "legacy-with-file" });
    let release: () => void = () => {};
    fsControl.pauseStore = new Promise<void>((resolve) => {
      release = resolve;
    });

    const stale = whenContinuationCustodyReady();
    // Past every caller-side check, before the payload store mutates anything.
    await arrivals.reached("store");
    await closeOpenClawStateDatabaseByPathAsync(resolveContinuationCustodyDatabasePath());
    removeStateDatabaseFiles();
    seedFlow(options, legacyRow);
    ensureContinuationCustodySchema({ env: options.env });
    release();

    await expect(stale).rejects.toThrow();
    expect(fs.existsSync(newRootPayloadPath(options, FILE_ATTACHMENT_ID))).toBe(false);
    // The replacement's own import writes the payload and releases the legacy file.
    await whenContinuationCustodyReady();
    expect(fs.existsSync(newRootPayloadPath(options, FILE_ATTACHMENT_ID))).toBe(true);
    expect(await recordIds()).toEqual(["legacy-with-file"]);
  });

  it("does not let a stale importer delete a legacy payload a replacement still needs", async () => {
    const legacyRow = {
      flowId: "legacy-delete-race",
      owner: OWNER_A,
      controller: "delegate" as const,
      status: "queued",
      state: delegateState({ attachmentId: FILE_ATTACHMENT_ID, attachmentCount: 1 }),
      createdAt: 1_000,
      updatedAt: 2_000,
    };
    seedFlow(options, legacyRow);
    const legacyFile = writeLegacyPayload(options, {
      attachmentId: FILE_ATTACHMENT_ID,
      flowId: "legacy-delete-race",
    });
    let release: () => void = () => {};
    fsControl.pauseRemove = new Promise<void>((resolve) => {
      release = resolve;
    });

    const stale = whenContinuationCustodyReady();
    // The old lifetime committed its import and now wants to delete the legacy file.
    await arrivals.reached("remove");
    await closeOpenClawStateDatabaseByPathAsync(resolveContinuationCustodyDatabasePath());
    removeStateDatabaseFiles();
    // The replacement still holds the un-imported row that needs that file.
    seedFlow(options, legacyRow);
    ensureContinuationCustodySchema({ env: options.env });
    release();

    await expect(stale).rejects.toThrow();
    expect(fs.existsSync(legacyFile)).toBe(true);
    // The replacement imports the payload as copied, not missing.
    await whenContinuationCustodyReady();
    const [imported] = await listContinuationRecords({ recordIds: ["legacy-delete-race"] });
    expect(imported?.attachmentId).toBe(FILE_ATTACHMENT_ID);
    expect(fs.existsSync(newRootPayloadPath(options, FILE_ATTACHMENT_ID))).toBe(true);
  });

  it("epoch backstop: phase A from an ended lifetime installs no readiness, projection or gate", async () => {
    // OWNER_A's legacy row imports; OWNER_B's cannot, so publication would gate B.
    seedLegacyQueuedDelegate("legacy-epoch", OWNER_A);
    seedUncopyableLegacyDelegate("legacy-epoch-stuck", OWNER_B);
    let release: () => void = () => {};
    importControl.pauseNext = new Promise<void>((resolve) => {
      release = resolve;
    });

    const stale = whenContinuationCustodyReady();
    await arrivals.reached("import");
    // End the lifetime without a close, so the state layer has nothing to
    // refuse and phase A reaches publication holding old-lifetime facts.
    endContinuationCustodyLifetimeForTest();
    release();

    await expect(stale).rejects.toThrow("closed during readiness");
    const databasePath = resolveContinuationCustodyDatabasePath();
    expect(isContinuationCustodyProjectionHydrated(databasePath)).toBe(false);
    expect(isContinuationCustodyOwnerAwaitingImport(OWNER_B)).toBe(false);
    // Readiness was not recorded either: the next command runs phase A again.
    await whenContinuationCustodyReady();
    expect(importControl.calls).toBe(2);
    expect(isContinuationCustodyOwnerAwaitingImport(OWNER_B)).toBe(true);
  });

  it("does not re-run phase A in the late boot (phase B), so it cannot overwrite newer facts", async () => {
    // A stuck owner makes every phase A attempt the import, so the import count
    // shows whether phase B re-read and re-installed custody state.
    seedUncopyableLegacyDelegate("legacy-stuck", OWNER_A);
    await whenContinuationCustodyReady();
    await enqueuePendingDelegate(OWNER_B, { task: "committed after readiness" });
    expect(importControl.calls).toBe(1);

    await runContinuationCustodyBoot({
      // Before the record was created, so recovery leaves it queued.
      armedAt: 0,
      whenSubagentRegistryActivated: async () => {},
    });

    expect(importControl.calls).toBe(1);
    expect(pendingDelegateCount(OWNER_B)).toBe(1);
  });
});
