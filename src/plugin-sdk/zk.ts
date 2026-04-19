/**
 * Public entry point for the openclaw ZooKeeper coordination SDK.
 *
 *   import { createZkClient, ZkError, featurePath } from "openclaw/plugin-sdk/zk";
 *
 * This file re-exports contract types eagerly (cheap — no wire code), and
 * exposes `createZkClient` as an async factory that dynamically imports
 * the heavy driver module on first call. Cold `import` of this subpath
 * will not touch the `zookeeper` native binding — that only loads on a
 * real `createZkClient({ hosts: ... })` call.
 *
 * Recipes (Lock, LeaderElection, Party, ReadWriteLock) land in PR 2 and
 * are re-exported from this same subpath.
 *
 * See `docs/plugins/zk.md` for operator setup + the `ZK_HOSTS` contract,
 * and `docs/plugins/zk-parity.md` for the kazoo-parity roadmap + the
 * path-prefix convention + wire-up evidence template.
 */

// Contract types (zero runtime cost).
export type {
  ConnectionState,
  CreateMode,
  WatchEvent,
  ZkDriver,
  ZkDriverFactory,
  ZkDriverOptions,
  ZkStat,
  ToZkErrorFn,
} from "./zk/driver.js";
export type { ZkClient, ZkClientOptions } from "./zk/client.js";
export type { ZkErrorCode } from "./zk/errors.js";

// Error constructors — tiny, fine to re-export eagerly.
export {
  ZkError,
  SessionExpiredError,
  ConnectionLossError,
  NoNodeError,
  NodeExistsError,
  ZkNativeDriverUnavailableError,
  toZkError,
} from "./zk/errors.js";

// Path helpers — pure, no wire deps.
export {
  ZK_ROOT,
  ZK_DEFAULT_ENV,
  joinPath,
  validatePath,
  featurePath,
  parentPath,
  basename,
} from "./zk/paths.js";

// Mock driver factory — exported so consumers can build fast unit tests
// against the same contract without a running ensemble. Re-exported
// eagerly because it has no native deps.
export {
  createMockDriver,
  createMockCluster,
  _createMockDriverSync,
  _expireMockSession,
} from "./zk/driver-mock.js";
export type { MockCluster, CreateMockDriverOptions } from "./zk/driver-mock.js";

// Recipes — zero-runtime-cost until invoked. Each recipe is pure logic
// over `ZkClient.driver`, so re-exporting them from the public barrel
// doesn't pull in any wire code.
export { createLock, withLock } from "./zk/lock.js";
export type { Lock, LockHandle, CreateLockOptions } from "./zk/lock.js";
export { createElection } from "./zk/election.js";
export type { LeaderElection } from "./zk/election.js";
export { createParty } from "./zk/party.js";
export type { Party } from "./zk/party.js";
export { createReadWriteLock } from "./zk/rwlock.js";
export type { ReadWriteLock } from "./zk/rwlock.js";
export { ensurePath } from "./zk/ensure-path.js";

import type { ZkClient, ZkClientOptions } from "./zk/client.js";

/**
 * Open a new ZooKeeper session. Resolves once the underlying driver
 * transitions to `"connected"` (or rejects with `ConnectionLossError`
 * on `connectTimeoutMs` — default 5000ms).
 *
 * In production this dynamically imports `./zk/driver-native.ts`, which
 * in turn dynamic-imports the `zookeeper` native npm package. When the
 * native package isn't installed (typical on boxes without the node-gyp
 * toolchain), the returned promise rejects with
 * `ZkNativeDriverUnavailableError` — message points at `openclaw zk setup`.
 *
 * Tests inject `driver` directly; no native import.
 */
export async function createZkClient(opts: ZkClientOptions): Promise<ZkClient> {
  const { wrapDriver, buildStateDispatcher } = await import("./zk/client.js");
  const dispatcher = buildStateDispatcher();
  let driver = opts.driver;
  if (!driver) {
    const { createNativeDriver } = await import("./zk/driver-native.js");
    driver = await createNativeDriver({
      ...opts,
      onStateChange: (state) => {
        dispatcher.onStateChange(state);
        opts.onStateChange?.(state);
      },
    });
  } else {
    // Caller-provided driver — tap its state emissions too.
    const prev = opts.onStateChange;
    opts.onStateChange = (state) => {
      dispatcher.onStateChange(state);
      prev?.(state);
    };
  }
  return wrapDriver(driver);
}
