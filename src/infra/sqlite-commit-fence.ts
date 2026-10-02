/// <reference lib="es2024.sharedmemory" />
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getEnvironmentData, setEnvironmentData } from "node:worker_threads";
import { stageSqliteTransactionState } from "./sqlite-post-commit.js";

// One process-wide cell array shared by every thread through Worker environment data.
// Each bucket holds [started, finished] mutation counters for a hashed fact key.
const FENCE_ENVIRONMENT_KEY = "openclaw.sqliteCommitFence.v1";
const FENCE_BUCKETS = 4096;
const FENCE_BYTES = FENCE_BUCKETS * 2 * Int32Array.BYTES_PER_ELEMENT;

export type SqliteCommitFenceSnapshot = {
  readonly buckets: readonly number[];
  readonly started: readonly number[];
};

let cells: Int32Array<SharedArrayBuffer> | undefined;

function fenceCells(): Int32Array<SharedArrayBuffer> {
  if (cells) {
    return cells;
  }
  const inherited: unknown = getEnvironmentData(FENCE_ENVIRONMENT_KEY);
  if (inherited !== undefined) {
    if (!(inherited instanceof SharedArrayBuffer) || inherited.byteLength !== FENCE_BYTES) {
      throw new Error("Inherited SQLite commit fence has an incompatible layout");
    }
    cells = new Int32Array(inherited);
    return cells;
  }
  const buffer = new SharedArrayBuffer(FENCE_BYTES);
  // Workers inherit environment data only when spawned after it is set; Worker
  // construction publishes the fence first so every descendant shares these cells.
  setEnvironmentData(FENCE_ENVIRONMENT_KEY, buffer);
  cells = new Int32Array(buffer);
  return cells;
}

/** Install the fence in this thread's environment before constructing a Worker. */
export function publishSqliteCommitFence(): void {
  fenceCells();
}

function bucketOf(key: string): number {
  return createHash("sha256").update(key).digest().readUInt32BE(0) % FENCE_BUCKETS;
}

function bucketsOf(keys: readonly string[]): number[] {
  return [...new Set(keys.map(bucketOf))].toSorted((left, right) => left - right);
}

/**
 * Record an in-transaction mutation of `key`. The bucket stays in flight until the
 * owning transaction commits or rolls back, so a concurrent reader cannot certify
 * a worker snapshot taken while the mutation was still uncommitted.
 */
export function markSqliteCommitFenceMutation(db: DatabaseSync, key: string): void {
  const fence = fenceCells();
  const started = bucketOf(key) * 2;
  const finish = () => {
    Atomics.add(fence, started + 1, 1);
    Atomics.notify(fence, started + 1);
  };
  if (
    !stageSqliteTransactionState(db, {
      stage: () => {
        Atomics.add(fence, started, 1);
      },
      commit: finish,
      rollback: finish,
    })
  ) {
    throw new Error("SQLite commit fence mutation requires its managed transaction scope");
  }
}

/** Capture the fence before a worker read; undefined while any key has a mutation in flight. */
export function snapshotSqliteCommitFence(
  keys: readonly string[],
): SqliteCommitFenceSnapshot | undefined {
  const fence = fenceCells();
  const buckets = bucketsOf(keys);
  const started: number[] = [];
  for (const bucket of buckets) {
    // Finished first: a mutation completing between the loads still reads as in flight.
    const finished = Atomics.load(fence, bucket * 2 + 1);
    const current = Atomics.load(fence, bucket * 2);
    if (current !== finished) {
      return undefined;
    }
    started.push(current);
  }
  return { buckets, started };
}

/** True when no in-process mutation of the snapshot's keys started after it was taken. */
export function isSqliteCommitFenceUnchanged(snapshot: SqliteCommitFenceSnapshot): boolean {
  const fence = fenceCells();
  return snapshot.buckets.every(
    (bucket, index) => Atomics.load(fence, bucket * 2) === snapshot.started[index],
  );
}

/** Wait until in-flight mutations of `keys` settle or the bounded wait expires. */
export async function waitForSqliteCommitFence(
  keys: readonly string[],
  timeoutMs: number,
): Promise<void> {
  const fence = fenceCells();
  for (const bucket of bucketsOf(keys)) {
    const finished = Atomics.load(fence, bucket * 2 + 1);
    if (Atomics.load(fence, bucket * 2) !== finished) {
      await Atomics.waitAsync(fence, bucket * 2 + 1, finished, timeoutMs).value;
    }
  }
}
