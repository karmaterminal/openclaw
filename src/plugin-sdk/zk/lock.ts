/**
 * Lock recipe — kazoo.recipe.lock.Lock parity.
 *
 * Algorithm (the canonical ZooKeeper distributed-lock algorithm):
 *   1. Ensure `lockPath` exists (persistent znode).
 *   2. Create an ephemeral-sequential child `lockPath/lock-<id>-` with
 *      our identifier as data. ZK appends a monotonic 10-digit suffix.
 *   3. List `lockPath` children. Sort ascending by sequence suffix.
 *   4. If our child is the smallest, we hold the lock.
 *   5. Otherwise, set a one-shot watch on the *immediate predecessor*
 *      child's existence. When that watch fires (predecessor deleted
 *      or changed), re-run step 3.
 *
 * We watch only the predecessor — not the full child list — to avoid
 * the "herd effect" when N waiters all wake up on any single change.
 *
 * Release is delete-our-child, which is idempotent: if the ephemeral
 * already vanished (session expiry, caller-side close), we swallow
 * `no-node` on the release side.
 */

import type { ZkClient } from "./client.js";
import { ensurePath } from "./ensure-path.js";
import { NoNodeError, ZkError } from "./errors.js";
import { basename, joinPath, validatePath } from "./paths.js";

export interface LockHandle {
  readonly ownerPath: string;
  release(): Promise<void>;
}

export interface Lock {
  acquire(opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<LockHandle>;
  tryAcquire(): Promise<LockHandle | null>;
  isAcquired(): boolean;
  contenders(): Promise<readonly string[]>;
}

export type CreateLockOptions = {
  /** Prefix used on the ephemeral-sequential child; defaults to "lock-". */
  prefix?: string;
};

export function createLock(
  client: ZkClient,
  lockPath: string,
  identifier?: string,
  options: CreateLockOptions = {},
): Lock {
  validatePath(lockPath);
  const prefix = options.prefix ?? "lock-";
  const idBytes = Buffer.from(identifier ?? "");
  let myChild: string | null = null;
  let acquired = false;

  async function listChildrenSorted(): Promise<string[]> {
    const children = await client.driver.getChildren(lockPath);
    // Sort by the sequence-number suffix (last 10 chars). Kazoo + Curator
    // both use lexicographic sort on the full name; since the prefix is
    // shared and the suffix is zero-padded, lex sort is equivalent.
    return [...children].toSorted();
  }

  function previous(sorted: readonly string[], mine: string): string | null {
    const idx = sorted.indexOf(mine);
    if (idx < 0) {
      return null;
    }
    return idx === 0 ? null : sorted[idx - 1];
  }

  async function pollAcquire(
    signal: AbortSignal | undefined,
    deadline: number | null,
  ): Promise<void> {
    // We've created our child and want to see if we're the smallest.
    if (!myChild) {
      throw new ZkError("unknown", "internal: pollAcquire called without child");
    }
    for (;;) {
      if (signal?.aborted) {
        throw new ZkError("unknown", "aborted", { path: lockPath });
      }
      if (deadline !== null && Date.now() > deadline) {
        throw new ZkError("timeout", `zk lock acquire timed out on ${lockPath}`, {
          path: lockPath,
        });
      }
      const sorted = await listChildrenSorted();
      const prev = previous(sorted, basename(myChild));
      if (prev === null) {
        // Lowest sequence number — we hold it.
        return;
      }
      const prevPath = joinPath(lockPath, prev);
      // Race-safe: watch predecessor; on delete/change, re-check. If it's
      // already gone, watchExists will fire immediately on the next change
      // or resolve against a missing node — we re-loop.
      const existsStat = await client.driver.exists(prevPath);
      if (!existsStat) {
        // Predecessor vanished between list and exists — loop and re-check.
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
                new ZkError("timeout", `zk lock acquire timed out on ${lockPath}`, {
                  path: lockPath,
                }),
              ),
            Math.max(1, deadline - Date.now()),
          ),
        );
        await Promise.race([watchP, timeoutP, abortRace]);
      } else {
        await Promise.race([watchP, abortRace]);
      }
      // Loop — predecessor changed state; we re-list children.
    }
  }

  async function doAcquire(opts?: {
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<LockHandle> {
    if (acquired) {
      throw new ZkError("node-exists", `lock already acquired on ${lockPath} (this handle)`, {
        path: lockPath,
      });
    }
    await ensurePath(client, lockPath);
    const childBase = `${prefix}${identifier ? `${sanitize(identifier)}-` : ""}`;
    const createdPath = await client.driver.create(
      joinPath(lockPath, childBase),
      idBytes,
      "ephemeral-sequential",
    );
    myChild = createdPath;
    const deadline =
      opts?.timeoutMs !== undefined && opts.timeoutMs > 0 ? Date.now() + opts.timeoutMs : null;
    try {
      await pollAcquire(opts?.signal, deadline);
      acquired = true;
      return buildHandle();
    } catch (err) {
      // On any failure (timeout / abort / session loss), try to clean up our
      // ephemeral. Swallow delete errors — the ephemeral is already gone if
      // the session died.
      await tryRelease();
      throw err;
    }
  }

  async function tryRelease(): Promise<void> {
    if (!myChild) {
      return;
    }
    try {
      await client.driver.delete(myChild);
    } catch (err) {
      if (!(err instanceof NoNodeError)) {
        // Session-expired errors are expected when the ephemeral already
        // vanished via ZK-side cleanup. Swallow noisily but don't crash.
      }
    } finally {
      myChild = null;
      acquired = false;
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
      return doAcquire(opts);
    },
    async tryAcquire() {
      // Use a deadline of "right now" — if we can't grab on first sort, give up.
      await ensurePath(client, lockPath);
      const childBase = `${prefix}${identifier ? `${sanitize(identifier)}-` : ""}`;
      const createdPath = await client.driver.create(
        joinPath(lockPath, childBase),
        idBytes,
        "ephemeral-sequential",
      );
      myChild = createdPath;
      const sorted = await listChildrenSorted();
      const prev = previous(sorted, basename(myChild));
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
      const stat = await client.driver.exists(lockPath);
      if (!stat) {
        return [];
      }
      return listChildrenSorted();
    },
  };
}

/**
 * Convenience wrapper that mirrors kazoo's `async with lock:` idiom.
 * Acquires the lock, runs the callback, releases in `finally`. Any
 * exception from `fn` propagates after the lock is released.
 */
export async function withLock<T>(
  client: ZkClient,
  lockPath: string,
  fn: (handle: LockHandle) => Promise<T>,
  opts?: {
    identifier?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    prefix?: string;
  },
): Promise<T> {
  const lock = createLock(client, lockPath, opts?.identifier, { prefix: opts?.prefix });
  const handle = await lock.acquire({ timeoutMs: opts?.timeoutMs, signal: opts?.signal });
  try {
    return await fn(handle);
  } finally {
    await handle.release();
  }
}

/**
 * Keep identifiers safe for use inside a znode basename. ZK allows many
 * characters but our shell-bridging CLI validators reject the exotic
 * ones; sanitizing here means a hostile caller can't inject `/`.
 */
function sanitize(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]/g, "_");
}
