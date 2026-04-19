/**
 * ReadWriteLock recipe — kazoo.recipe.lock.ReadLock + WriteLock parity.
 *
 * Algorithm (standard ZK RW lock):
 *   - Both readers and writers create ephemeral-sequential children of
 *     `rwlockPath`.
 *   - Readers use prefix `read-`, writers use prefix `write-`.
 *   - A reader is acquired when no writer with a *smaller* sequence
 *     number exists.
 *   - A writer is acquired when no child (reader or writer) with a
 *     smaller sequence number exists — i.e. when it's the absolute
 *     smallest.
 *   - Watch the predecessor-of-interest (smallest-qualifying-smaller
 *     child) to avoid the herd effect.
 *
 * Exposed as `createReadWriteLock(client, path) → { readLock(), writeLock() }`
 * where both return `Lock` instances (same contract as `createLock`).
 */

import type { ZkClient } from "./client.js";
import { ensurePath } from "./ensure-path.js";
import { NoNodeError, ZkError } from "./errors.js";
import type { Lock, LockHandle } from "./lock.js";
import { basename, joinPath, validatePath } from "./paths.js";

const READ_PREFIX = "read-";
const WRITE_PREFIX = "write-";

export interface ReadWriteLock {
  readLock(identifier?: string): Lock;
  writeLock(identifier?: string): Lock;
}

export function createReadWriteLock(client: ZkClient, rwlockPath: string): ReadWriteLock {
  validatePath(rwlockPath);
  return {
    readLock(identifier) {
      return buildRwLock(client, rwlockPath, "read", identifier);
    },
    writeLock(identifier) {
      return buildRwLock(client, rwlockPath, "write", identifier);
    },
  };
}

function buildRwLock(
  client: ZkClient,
  rwlockPath: string,
  kind: "read" | "write",
  identifier?: string,
): Lock {
  const myPrefix = kind === "read" ? READ_PREFIX : WRITE_PREFIX;
  const idBytes = Buffer.from(identifier ?? "");
  let myChild: string | null = null;
  let acquired = false;

  async function listSorted(): Promise<string[]> {
    const children = await client.driver.getChildren(rwlockPath);
    return [...children].toSorted();
  }

  function childSeq(name: string): number {
    // Last 10 chars are the zero-padded sequence; rest is the prefix.
    const tail = name.slice(-10);
    const n = Number.parseInt(tail, 10);
    return Number.isFinite(n) ? n : -1;
  }

  /**
   * Return the name of the child whose existence would block us.
   * - reader: predecessor is the largest writer with seq < ours
   * - writer: predecessor is the immediate prev child (any kind)
   */
  function blockingPredecessor(sorted: readonly string[], mine: string): string | null {
    const mineSeq = childSeq(mine);
    if (kind === "read") {
      let best: string | null = null;
      for (const c of sorted) {
        if (!c.startsWith(WRITE_PREFIX)) {
          continue;
        }
        if (childSeq(c) < mineSeq) {
          best = c;
        }
      }
      return best;
    }
    // writer: immediate predecessor (any)
    const idx = sorted.indexOf(mine);
    if (idx <= 0) {
      return null;
    }
    return sorted[idx - 1];
  }

  async function pollAcquire(
    signal: AbortSignal | undefined,
    deadline: number | null,
  ): Promise<void> {
    if (!myChild) {
      throw new ZkError("unknown", "internal: pollAcquire without child");
    }
    const mineBase = basename(myChild);
    for (;;) {
      if (signal?.aborted) {
        throw new ZkError("unknown", "aborted", { path: rwlockPath });
      }
      if (deadline !== null && Date.now() > deadline) {
        throw new ZkError("timeout", `zk ${kind}-lock acquire timed out on ${rwlockPath}`, {
          path: rwlockPath,
        });
      }
      const sorted = await listSorted();
      const prev = blockingPredecessor(sorted, mineBase);
      if (prev === null) {
        return;
      }
      const prevPath = joinPath(rwlockPath, prev);
      const existsStat = await client.driver.exists(prevPath);
      if (!existsStat) {
        continue;
      }
      const abortRace = new Promise<void>((_, reject) => {
        if (!signal) {
          return;
        }
        if (signal.aborted) {
          reject(new ZkError("unknown", "aborted"));
          return;
        }
        signal.addEventListener("abort", () => reject(new ZkError("unknown", "aborted")), {
          once: true,
        });
      });
      const watchP = client.driver.watchExists(prevPath).then(() => undefined);
      if (deadline !== null) {
        const timeoutP = new Promise<void>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new ZkError("timeout", `zk ${kind}-lock acquire timed out on ${rwlockPath}`, {
                  path: rwlockPath,
                }),
              ),
            Math.max(1, deadline - Date.now()),
          ),
        );
        await Promise.race([watchP, timeoutP, abortRace]);
      } else {
        await Promise.race([watchP, abortRace]);
      }
    }
  }

  async function tryRelease(): Promise<void> {
    if (!myChild) {
      return;
    }
    const toDelete = myChild;
    myChild = null;
    acquired = false;
    try {
      await client.driver.delete(toDelete);
    } catch (err) {
      if (!(err instanceof NoNodeError)) {
        // Ephemeral already vanished — quiet.
      }
    }
  }

  function buildHandle(): LockHandle {
    if (!myChild) {
      throw new ZkError("unknown", "internal: no child after acquire");
    }
    const ownerPath = myChild;
    let released = false;
    return {
      ownerPath,
      async release() {
        if (released) {
          return;
        }
        released = true;
        await tryRelease();
      },
    };
  }

  return {
    async acquire(opts) {
      if (acquired) {
        throw new ZkError(
          "node-exists",
          `${kind}-lock already acquired on ${rwlockPath} (this handle)`,
          { path: rwlockPath },
        );
      }
      await ensurePath(client, rwlockPath);
      const childBase = `${myPrefix}${identifier ? `${sanitize(identifier)}-` : ""}`;
      myChild = await client.driver.create(
        joinPath(rwlockPath, childBase),
        idBytes,
        "ephemeral-sequential",
      );
      const deadline =
        opts?.timeoutMs !== undefined && opts.timeoutMs > 0 ? Date.now() + opts.timeoutMs : null;
      try {
        await pollAcquire(opts?.signal, deadline);
        acquired = true;
        return buildHandle();
      } catch (err) {
        await tryRelease();
        throw err;
      }
    },
    async tryAcquire() {
      await ensurePath(client, rwlockPath);
      const childBase = `${myPrefix}${identifier ? `${sanitize(identifier)}-` : ""}`;
      myChild = await client.driver.create(
        joinPath(rwlockPath, childBase),
        idBytes,
        "ephemeral-sequential",
      );
      const sorted = await listSorted();
      const prev = blockingPredecessor(sorted, basename(myChild));
      if (prev !== null) {
        await tryRelease();
        return null;
      }
      acquired = true;
      return buildHandle();
    },
    isAcquired() {
      return acquired;
    },
    async contenders() {
      const stat = await client.driver.exists(rwlockPath);
      if (!stat) {
        return [];
      }
      return listSorted();
    },
  };
}

function sanitize(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]/g, "_");
}
