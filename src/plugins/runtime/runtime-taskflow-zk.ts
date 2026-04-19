/**
 * Cross-host TaskFlow ownership scaffold (v1.1 — contract-only).
 *
 * Public surface declared here: `ClusterOwnershipController` — the
 * per-flow handle that a cluster-scoped TaskFlow holds while
 * controlling the flow. It exposes `isOwner()`, `lostOwnership$`
 * (AsyncIterable that yields once on loss), and `release()`.
 *
 * **This file is deliberately stub-level.** It declares the contract
 * and ships a no-op default implementation so callers can wire against
 * it without a runtime behavior change. The ZK-backed implementation
 * lands in the PR 4b follow-up, which wires
 * `openclaw/plugin-sdk/zk#createElection` in place of the no-op.
 *
 * Landing the contract separately from the wiring lets PR 5
 * (reply-dedup) be reviewed against a stable API — no more "I need to
 * know the shape before I can write the consumer" back-and-forth.
 *
 * See `docs/automation/taskflow.md` § Cluster ownership.
 */

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

export type OpenClusterOwnership = (args: {
  /** ZK path; defaults to `/openclaw/<env>/taskflow/<flowId>`. */
  ownershipPath: string;
  /** Stable id for this controller; printed in `tasks flow show`. */
  controllerId: string;
  /** Abort signal the caller can use to release ownership proactively. */
  cancel?: AbortSignal;
}) => Promise<ClusterOwnershipController>;

/**
 * Default implementation — NOT wired to ZK. Acts as if ownership is
 * always held locally so the TaskFlow behavior stays identical to
 * host-local mode until PR 4b swaps this out for the real
 * `openclaw/plugin-sdk/zk`-backed implementation.
 */
export const openLocalOnlyClusterOwnership: OpenClusterOwnership = async ({ controllerId }) => {
  let released = false;
  const controller: ClusterOwnershipController = {
    controllerId,
    isOwner() {
      return !released;
    },
    lostOwnership$() {
      // No-op: the local-only implementation never yields a loss.
      // Returns an AsyncIterable that completes when `release()` runs.
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<{ reason: ClusterOwnershipLossReason }>> {
              await new Promise<void>((resolve) => {
                const check = () => {
                  if (released) {
                    resolve();
                  } else {
                    setTimeout(check, 100);
                  }
                };
                check();
              });
              return { value: undefined, done: true };
            },
          };
        },
      };
    },
    async release() {
      released = true;
    },
  };
  return controller;
};
