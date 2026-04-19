/**
 * LeaderElection recipe — kazoo.recipe.election.Election parity.
 *
 * Built on top of the Lock recipe's ephemeral-sequential algorithm:
 *   - Each contender creates an ephemeral-sequential child.
 *   - The lowest-sequence child is the leader.
 *   - On leadership loss (our ephemeral disappears — session expiry,
 *     network partition, explicit cancel), `onLeader`'s `AbortSignal`
 *     fires so the caller can unwind in-flight work.
 *
 * Kazoo's `Election.run(func, *args)` blocks until `func` returns, then
 * releases leadership. We honor the same contract: `run(onLeader)`
 * blocks until `onLeader` resolves (or the abort signal fires + the
 * callback honors it). A caller that wants to be a "standby candidate
 * who never runs the body" can pass a callback that immediately awaits
 * the signal.
 */

import type { ZkClient } from "./client.js";
import { ensurePath } from "./ensure-path.js";
import { NoNodeError, ZkError } from "./errors.js";
import { basename, joinPath, validatePath } from "./paths.js";

export interface LeaderElection {
  readonly path: string;
  run(onLeader: (signal: AbortSignal) => Promise<void>): Promise<void>;
  contenders(): Promise<readonly string[]>;
  cancel(): Promise<void>;
}

export function createElection(
  client: ZkClient,
  electionPath: string,
  identifier?: string,
): LeaderElection {
  validatePath(electionPath);
  const prefix = "elect-";
  const idBytes = Buffer.from(identifier ?? "");
  let myChild: string | null = null;
  const abortController = new AbortController();

  async function listChildrenSorted(): Promise<string[]> {
    const children = await client.driver.getChildren(electionPath);
    return [...children].toSorted();
  }

  function previous(sorted: readonly string[], mine: string): string | null {
    const idx = sorted.indexOf(mine);
    if (idx <= 0) {
      return null;
    }
    return sorted[idx - 1];
  }

  async function waitForLeadership(): Promise<void> {
    if (!myChild) {
      throw new ZkError("unknown", "internal: waitForLeadership without child");
    }
    while (!abortController.signal.aborted) {
      const sorted = await listChildrenSorted();
      const mineBase = basename(myChild);
      if (!sorted.includes(mineBase)) {
        // Our ephemeral vanished — session must have dropped. Bail out so
        // the caller sees a clean abort.
        throw new ZkError("session-expired", "election ephemeral lost", { path: electionPath });
      }
      const prev = previous(sorted, mineBase);
      if (prev === null) {
        return;
      }
      const prevPath = joinPath(electionPath, prev);
      const existsStat = await client.driver.exists(prevPath);
      if (!existsStat) {
        continue;
      }
      await Promise.race([
        client.driver.watchExists(prevPath).then(() => undefined),
        new Promise<void>((_, reject) => {
          if (abortController.signal.aborted) {
            reject(new ZkError("unknown", "election cancelled"));
            return;
          }
          abortController.signal.addEventListener(
            "abort",
            () => reject(new ZkError("unknown", "election cancelled")),
            { once: true },
          );
        }),
      ]);
    }
  }

  async function cleanup(): Promise<void> {
    if (!myChild) {
      return;
    }
    const toDelete = myChild;
    myChild = null;
    try {
      await client.driver.delete(toDelete);
    } catch (err) {
      if (!(err instanceof NoNodeError)) {
        // Session already died — ephemeral is gone. Quiet.
      }
    }
  }

  return {
    path: electionPath,
    async run(onLeader) {
      if (myChild) {
        throw new ZkError("unknown", "election already running on this handle");
      }
      await ensurePath(client, electionPath);
      const childBase = `${prefix}${identifier ? `${sanitize(identifier)}-` : ""}`;
      myChild = await client.driver.create(
        joinPath(electionPath, childBase),
        idBytes,
        "ephemeral-sequential",
      );
      try {
        await waitForLeadership();
        // We are the leader. Watch our own znode: if it disappears (session
        // expiry, external delete), abort the signal so onLeader unwinds.
        const watchLoss = (async () => {
          try {
            const selfWatch = await client.driver.watchExists(myChild);
            if (selfWatch.event?.kind === "deleted" || !selfWatch.stat) {
              abortController.abort();
            }
          } catch {
            // If the watch itself fails, pessimistically assume we lost it.
            abortController.abort();
          }
        })();
        await onLeader(abortController.signal);
        void watchLoss;
      } finally {
        await cleanup();
      }
    },
    async contenders() {
      const stat = await client.driver.exists(electionPath);
      if (!stat) {
        return [];
      }
      return listChildrenSorted();
    },
    async cancel() {
      abortController.abort();
      await cleanup();
    },
  };
}

function sanitize(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]/g, "_");
}
