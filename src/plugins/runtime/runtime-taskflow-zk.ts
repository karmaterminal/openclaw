/**
 * Cross-host TaskFlow ownership implementation.
 *
 * Two implementations ship from this module:
 *
 *   - `openLocalOnlyClusterOwnership` — no-op controller that always
 *     reports `isOwner() === true` and never yields a loss event.
 *     Behavior-preserving default so `ownership: "cluster"` can be
 *     set on a flow in environments without a ZK ensemble (dev box,
 *     unit test) without the flow wedging.
 *
 *   - `openZkClusterOwnership` — real ZK-backed controller that opens
 *     a `createZkClient({ hosts, chroot })` session, runs a
 *     `createElection(...).run(onLeader)` in the background, and
 *     fires `lostOwnership$` exactly once when the election's
 *     `onLeader` callback's `AbortSignal` aborts (leadership loss via
 *     session expiry, external delete, or explicit `release`).
 *
 * Consumers pick the implementation at apply time:
 *
 *     const controller = process.env.ZK_HOSTS
 *       ? await openZkClusterOwnership({ hosts: process.env.ZK_HOSTS, ... })
 *       : await openLocalOnlyClusterOwnership({ ... });
 *
 * Integration tests (`runtime-taskflow-zk.integration.test.ts`) run
 * against the live fleet ensemble under a per-run chroot; no docker
 * or testcontainer dep.
 */

import type { ZkClient } from "../../plugin-sdk/zk.js";
import { createElection, createZkClient } from "../../plugin-sdk/zk.js";

export interface ClusterOwnershipController {
  /** Stable identifier used to surface the current controller in `tasks flow show`. */
  readonly controllerId: string;
  /** True while this gateway holds leadership for the flow. */
  isOwner(): boolean;
  /**
   * Yields exactly once when ownership is lost (session expiry,
   * external delete, explicit `release`). Consumers subscribe once per
   * flow and unwind any in-flight step on the yielded event.
   */
  lostOwnership$(): AsyncIterable<{ reason: ClusterOwnershipLossReason }>;
  /** Release the election ephemeral and close any watches. Idempotent. */
  release(): Promise<void>;
}

export type ClusterOwnershipLossReason = "session-expired" | "external-release" | "cancelled";

export type OpenLocalOnlyArgs = {
  /** Stable id for this controller; printed in `tasks flow show`. */
  controllerId: string;
  /** Abort signal the caller can use to release ownership proactively. */
  cancel?: AbortSignal;
};

export type OpenZkOwnershipArgs = OpenLocalOnlyArgs & {
  /** ZK connection string (host:port,host:port). */
  hosts: string;
  /** ZK path for the per-flow election; typically `/openclaw/<env>/taskflow/<flowId>`. */
  ownershipPath: string;
  /** Optional chroot applied to the connecting session (separate from ownershipPath). */
  chroot?: string;
  /** ZK session timeout; affects how fast leadership loss propagates. Default 10s. */
  sessionTimeoutMs?: number;
};

export type OpenLocalOnlyClusterOwnership = (
  args: OpenLocalOnlyArgs,
) => Promise<ClusterOwnershipController>;

export type OpenZkClusterOwnership = (
  args: OpenZkOwnershipArgs,
) => Promise<ClusterOwnershipController>;

/**
 * Local-only controller — no ZK session. Used when `ownership: "cluster"`
 * is set but no ensemble is reachable (dev box, unit test). Behavior is
 * identical to host-local: always owner, never yields loss.
 */
export const openLocalOnlyClusterOwnership: OpenLocalOnlyClusterOwnership = async ({
  controllerId,
  cancel,
}) => {
  let released = false;
  const lossQueue: Array<{ reason: ClusterOwnershipLossReason }> = [];
  const lossResolvers: Array<
    (value: IteratorResult<{ reason: ClusterOwnershipLossReason }>) => void
  > = [];

  const fireLoss = (reason: ClusterOwnershipLossReason) => {
    if (!released || lossQueue.length === 0) {
      released = true;
      lossQueue.push({ reason });
      while (lossResolvers.length > 0) {
        const resolve = lossResolvers.shift()!;
        resolve({ value: { reason }, done: false });
      }
    }
  };

  if (cancel) {
    if (cancel.aborted) {
      fireLoss("cancelled");
    } else {
      cancel.addEventListener("abort", () => fireLoss("cancelled"), { once: true });
    }
  }

  return {
    controllerId,
    isOwner() {
      return !released;
    },
    lostOwnership$() {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<{ reason: ClusterOwnershipLossReason }>> {
              if (lossQueue.length > 0) {
                const reason = lossQueue.shift()!;
                return { value: reason, done: false };
              }
              if (released) {
                return { value: undefined, done: true };
              }
              return new Promise((resolve) => {
                lossResolvers.push(resolve);
              });
            },
          };
        },
      };
    },
    async release() {
      fireLoss("external-release");
    },
  };
};

/**
 * ZK-backed controller. Opens a `ZkClient` session, starts an
 * `createElection(...)` in the background, and resolves to the
 * controller once leadership is acquired.
 *
 * Contract:
 *   - `isOwner()` is true only after the election reports us as leader.
 *   - `lostOwnership$()` yields exactly one loss event when leadership
 *     is lost — session expiry, network partition past `sessionTimeoutMs`,
 *     external delete of our ephemeral, or `release()`. After yielding,
 *     the async iterator completes (`done: true`).
 *   - `release()` cancels the election (deletes our ephemeral) and
 *     closes the underlying ZK session. Idempotent.
 *
 * If ZK is unreachable at open time, the returned promise rejects. Callers
 * should catch and fall back to `openLocalOnlyClusterOwnership` when that
 * is the desired degradation shape for the flow.
 */
export const openZkClusterOwnership: OpenZkClusterOwnership = async ({
  controllerId,
  hosts,
  ownershipPath,
  chroot,
  sessionTimeoutMs,
  cancel,
}) => {
  const client = await createZkClient({
    hosts,
    chroot,
    sessionTimeoutMs,
  });

  let released = false;
  let owner = false;
  const lossQueue: Array<{ reason: ClusterOwnershipLossReason }> = [];
  const lossResolvers: Array<
    (value: IteratorResult<{ reason: ClusterOwnershipLossReason }>) => void
  > = [];
  // Executor runs synchronously, so these are assigned before the Promise
  // ctor returns. Store them as const-typed refs for type-narrowing.
  let acquiredResolveRef: { fn: ((value: void) => void) | null } = { fn: null };
  let acquiredRejectRef: { fn: ((err: unknown) => void) | null } = { fn: null };
  const acquired = new Promise<void>((resolve, reject) => {
    acquiredResolveRef = { fn: resolve };
    acquiredRejectRef = { fn: reject };
  });

  const fireLoss = (reason: ClusterOwnershipLossReason) => {
    if (lossQueue.length > 0 || !owner) {
      // Only fire once; if we never became owner, there's nothing to lose.
      if (!owner) {
        return;
      }
    }
    owner = false;
    lossQueue.push({ reason });
    while (lossResolvers.length > 0) {
      const resolve = lossResolvers.shift()!;
      resolve({ value: { reason }, done: false });
    }
  };

  const election = createElection(client, ownershipPath, controllerId);

  // Run the election in the background; once we're the leader,
  // `onLeader` blocks until the AbortSignal fires (loss).
  const runPromise = (async () => {
    try {
      await election.run(async (signal) => {
        owner = true;
        acquiredResolveRef.fn?.();
        acquiredResolveRef = { fn: null };
        acquiredRejectRef = { fn: null };
        // Block until leadership is lost. `signal` fires on session
        // expiry or cancel. We translate the reason by checking the
        // external cancel flag first.
        await new Promise<void>((resolveInner) => {
          if (signal.aborted) {
            resolveInner();
            return;
          }
          signal.addEventListener("abort", () => resolveInner(), { once: true });
        });
        const reason: ClusterOwnershipLossReason = released
          ? "external-release"
          : cancel?.aborted
            ? "cancelled"
            : "session-expired";
        fireLoss(reason);
      });
    } catch (err) {
      const rejectFn = acquiredRejectRef.fn;
      if (rejectFn) {
        rejectFn(err);
      } else {
        // We were already the leader (acquired resolved) and the run
        // errored after — treat as session loss.
        fireLoss("session-expired");
      }
    } finally {
      try {
        await client.close();
      } catch {
        // Close errors on an already-closed session are fine.
      }
    }
  })();

  // Wire external cancel → release.
  if (cancel) {
    const onCancel = async () => {
      if (released) {
        return;
      }
      released = true;
      await election.cancel();
    };
    if (cancel.aborted) {
      void onCancel();
    } else {
      cancel.addEventListener("abort", () => void onCancel(), { once: true });
    }
  }

  await acquired;

  return {
    controllerId,
    isOwner() {
      return owner;
    },
    lostOwnership$() {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<{ reason: ClusterOwnershipLossReason }>> {
              if (lossQueue.length > 0) {
                const reason = lossQueue.shift()!;
                return { value: reason, done: false };
              }
              if (released && !owner) {
                return { value: undefined, done: true };
              }
              return new Promise((resolve) => {
                lossResolvers.push(resolve);
              });
            },
          };
        },
      };
    },
    async release() {
      if (released) {
        return;
      }
      released = true;
      await election.cancel();
      // `runPromise` will complete shortly as `onLeader`'s signal aborts.
      await runPromise;
    },
  };
};

// Re-export for tests that want to build against the ZkClient shape directly.
export type { ZkClient };
