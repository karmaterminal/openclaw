// Custody readiness (phase A, RFC docs/design/continue-work-signal-v2.md §5.4.5):
// the production path from committed custody rows to a hydrated projection. No
// test here hydrates directly unless it says so: phase A runs because a real
// custody command, or Gateway startup, needed it.
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../../test/helpers/temp-dir.js";
import {
  closeOpenClawStateDatabaseAsync,
  closeOpenClawStateDatabaseByPathAsync,
  runOpenClawStateWriteTransaction,
} from "../../../state/openclaw-state-db.js";
import { runContinuationCustodyBoot } from "../custody-boot.js";
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
  listContinuationRecords,
  resolveContinuationCustodyDatabasePath,
  whenContinuationCustodyReady,
} from "./custody-store.js";
import { endContinuationCustodyLifetimeForTest } from "./custody.test-support.js";

const OWNER_A = "agent:main:telegram:direct:owner-a";
const OWNER_B = "agent:main:telegram:direct:owner-b";

// Pause-point arrivals as promises: a test awaits the exact event instead of
// polling a counter against a clock, so a slow runner waits longer rather than
// failing.
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

// Phase A is the `readBootFacts` command. Count it, and pause or fail it after
// the worker has answered: the window in which the database can close or the
// lifetime can end before phase A publishes.
const bootReadControl = vi.hoisted(() => ({
  calls: 0,
  throwNext: false,
  pauseNext: undefined as Promise<void> | undefined,
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
    if (type === "continuationCustody.readBootFacts") {
      bootReadControl.calls += 1;
      arrivals.note("boot-read");
      if (bootReadControl.pauseNext) {
        const pause = bootReadControl.pauseNext;
        bootReadControl.pauseNext = undefined;
        await pause;
      }
      if (bootReadControl.throwNext) {
        bootReadControl.throwNext = false;
        throw new Error("injected boot read failure");
      }
    }
    return output;
  };
  return { ...actual, runOpenClawStateWorkerOperation: run };
});

const tempDirs = useAutoCleanupTempDirTracker((cleanup) =>
  afterEach(async () => {
    resetContinuationCustodyProjection();
    await closeOpenClawStateDatabaseAsync();
    vi.unstubAllEnvs();
    cleanup();
  }),
);

beforeEach(() => {
  arrivals.reset();
  // Deliberately no hydration: each test starts as a Gateway that has not
  // run custody boot yet.
  vi.stubEnv("OPENCLAW_STATE_DIR", tempDirs.make("openclaw-continuation-readiness-"));
  bootReadControl.calls = 0;
  bootReadControl.throwNext = false;
  bootReadControl.pauseNext = undefined;
});

/**
 * Commit a queued delegate, then forget the projection: the next process sees
 * committed custody it has not hydrated yet.
 */
async function seedCommittedDelegate(owner: string, task: string): Promise<string> {
  const { recordId } = await enqueuePendingDelegate(owner, { task });
  resetContinuationCustodyProjection();
  bootReadControl.calls = 0;
  arrivals.reset();
  return recordId;
}

/** Replace the closed database with a different, empty one at the same path. */
function replaceStateDatabase(): void {
  const databasePath = resolveContinuationCustodyDatabasePath();
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
  runOpenClawStateWriteTransaction(() => undefined, { env: process.env });
}

async function recordIds(): Promise<string[]> {
  return (await listContinuationRecords({})).map((record) => record.recordId).toSorted();
}

describe("continuation custody readiness (phase A)", () => {
  it("hydrates committed custody before the first custody write commits", async () => {
    const committed = await seedCommittedDelegate(OWNER_A, "committed earlier");

    const created = await enqueuePendingDelegate(OWNER_B, { task: "fresh work" });

    expect(bootReadControl.calls).toBe(1);
    expect(await recordIds()).toEqual([committed, created.recordId].toSorted());
    // The projection describes committed state for both owners.
    expect(pendingDelegateCount(OWNER_A)).toBe(1);
    expect(pendingDelegateCount(OWNER_B)).toBe(1);
  });

  it("shares one phase A between concurrent first writes", async () => {
    const committed = await seedCommittedDelegate(OWNER_A, "committed earlier");

    const [first, second] = await Promise.all([
      enqueuePendingDelegate(OWNER_B, { task: "first" }),
      enqueuePendingDelegate(OWNER_B, { task: "second" }),
    ]);

    expect(bootReadControl.calls).toBe(1);
    expect(await recordIds()).toEqual([committed, first.recordId, second.recordId].toSorted());
  });

  it("admits no write when phase A throws, and the next write retries phase A", async () => {
    const committed = await seedCommittedDelegate(OWNER_A, "committed earlier");
    bootReadControl.throwNext = true;

    await expect(enqueuePendingDelegate(OWNER_B, { task: "blocked" })).rejects.toThrow(
      "injected boot read failure",
    );
    expect(isContinuationCustodyProjectionHydrated(resolveContinuationCustodyDatabasePath())).toBe(
      false,
    );

    const created = await enqueuePendingDelegate(OWNER_B, { task: "after retry" });

    expect(bootReadControl.calls).toBe(2);
    expect(await recordIds()).toEqual([committed, created.recordId].toSorted());
  });

  it("lets startup's phase A finish while a concurrent first write waits for it (no deadlock)", async () => {
    const committed = await seedCommittedDelegate(OWNER_A, "committed earlier");
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
    expect(bootReadControl.calls).toBe(1);
    expect(await recordIds()).toEqual([committed, created.recordId].toSorted());
  });

  it("never reads an unresolved owner as zero queued delegates for a decision", async () => {
    await enqueuePendingDelegate(OWNER_A, { task: "committed" });
    // An unknown write outcome leaves the owner unknown in the projection.
    invalidateContinuationCustodyOwners(resolveContinuationCustodyDatabasePath(), [OWNER_A]);

    expect(pendingDelegateCount(OWNER_A)).toBe(0);
    expect(await resolveQueuedDelegateCounts(OWNER_A)).toEqual({
      pending: 1,
      stagedPostCompaction: 0,
    });
  });

  it("counts committed work a decision would otherwise miss before hydration", async () => {
    await seedCommittedDelegate(OWNER_A, "committed earlier");

    // The sync projection read is unknown here, so a decision must not use it.
    expect(pendingDelegateCount(OWNER_A)).toBe(0);
    expect(await resolveQueuedDelegateCounts(OWNER_A)).toEqual({
      pending: 1,
      stagedPostCompaction: 0,
    });
    expect(bootReadControl.calls).toBe(1);
  });

  it("does not let a session reset outrun phase A (no surviving work)", async () => {
    const committed = await seedCommittedDelegate(OWNER_A, "committed earlier");

    // A reset before anything else has triggered phase A.
    await cancelSessionContinuations(OWNER_A);

    const [record] = await listContinuationRecords({ recordIds: [committed] });
    expect(record?.status).toBe("cancelled");
    expect(pendingDelegateCount(OWNER_A)).toBe(0);
  });

  it("does not let the cleanup guard judge an owner empty before phase A", async () => {
    await seedCommittedDelegate(OWNER_A, "committed earlier");

    expect(await hasLiveContinuationCustody(OWNER_A)).toBe(true);
  });

  it("runs phase A again for a database replaced at the same path", async () => {
    await enqueuePendingDelegate(OWNER_B, { task: "first database" });
    expect(bootReadControl.calls).toBe(1);

    // Orderly close, then a different (empty) database file at the same path.
    await closeOpenClawStateDatabaseAsync();
    replaceStateDatabase();

    await enqueuePendingDelegate(OWNER_A, { task: "second database" });

    expect(bootReadControl.calls).toBe(2);
    // The first database's facts did not survive into the replacement.
    expect(pendingDelegateCount(OWNER_B)).toBe(0);
    expect(pendingDelegateCount(OWNER_A)).toBe(1);
  });

  it("does not let phase A from a closed database publish into its replacement", async () => {
    await seedCommittedDelegate(OWNER_A, "committed earlier");
    let release: () => void = () => {};
    bootReadControl.pauseNext = new Promise<void>((resolve) => {
      release = resolve;
    });

    const stale = whenContinuationCustodyReady();
    await arrivals.reached("boot-read");
    await closeOpenClawStateDatabaseAsync();
    release();

    // Refused either by the state layer's admission check or by phase A's own
    // lifetime epoch; what matters is that nothing from the old lifetime publishes.
    await expect(stale).rejects.toThrow();
    expect(isContinuationCustodyProjectionHydrated(resolveContinuationCustodyDatabasePath())).toBe(
      false,
    );
    // The next command re-runs phase A against the current database.
    await whenContinuationCustodyReady();
    expect(bootReadControl.calls).toBe(2);
    expect(pendingDelegateCount(OWNER_A)).toBe(1);
  });

  it("invalidates on a path-scoped close when readiness began before the database existed", async () => {
    // No database file yet: the watcher captures a provisional identity.
    await enqueuePendingDelegate(OWNER_B, { task: "created the database" });

    // A path-scoped close reports the physical file identity.
    await closeOpenClawStateDatabaseByPathAsync(resolveContinuationCustodyDatabasePath());
    replaceStateDatabase();

    await enqueuePendingDelegate(OWNER_A, { task: "replacement database" });

    expect(bootReadControl.calls).toBe(2);
    expect(pendingDelegateCount(OWNER_B)).toBe(0);
  });

  it("epoch backstop: phase A from an ended lifetime installs no readiness or projection", async () => {
    await seedCommittedDelegate(OWNER_A, "committed earlier");
    let release: () => void = () => {};
    bootReadControl.pauseNext = new Promise<void>((resolve) => {
      release = resolve;
    });

    const stale = whenContinuationCustodyReady();
    await arrivals.reached("boot-read");
    // End the lifetime without a close, so the state layer has nothing to
    // refuse and phase A reaches publication holding old-lifetime facts.
    endContinuationCustodyLifetimeForTest();
    release();

    await expect(stale).rejects.toThrow("closed during readiness");
    expect(isContinuationCustodyProjectionHydrated(resolveContinuationCustodyDatabasePath())).toBe(
      false,
    );
    // Readiness was not recorded either: the next command runs phase A again.
    await whenContinuationCustodyReady();
    expect(bootReadControl.calls).toBe(2);
    expect(pendingDelegateCount(OWNER_A)).toBe(1);
  });

  it("does not re-run phase A in the late boot (phase B), so it cannot overwrite newer facts", async () => {
    await whenContinuationCustodyReady();
    await enqueuePendingDelegate(OWNER_B, { task: "committed after readiness" });
    expect(bootReadControl.calls).toBe(1);

    await runContinuationCustodyBoot({
      // Before the record was created, so recovery leaves it queued.
      armedAt: 0,
      whenSubagentRegistryActivated: async () => {},
    });

    expect(bootReadControl.calls).toBe(1);
    expect(pendingDelegateCount(OWNER_B)).toBe(1);
  });
});
