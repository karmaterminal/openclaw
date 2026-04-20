/**
 * ZkDriver is the minimal wire-protocol surface every recipe composes
 * against. Shapes after kazoo's `KazooClient` — just enough verbs to
 * implement Lock / LeaderElection / Party / ReadWriteLock on top.
 *
 * Two implementations ship with plugin-sdk/zk:
 *   - `driver-native.ts` — wraps the `zookeeper` (yfinkelstein) native
 *     npm package. Dynamic-imported on first use so a missing optional
 *     dep doesn't break `openclaw` import.
 *   - `driver-mock.ts`  — in-memory ZK respecting ephemeral/sequential
 *     znode semantics + data/children watches. Unit tests target this
 *     so recipes can be exercised without a running ensemble.
 *
 * Keep this file runtime-dep-free. Error types live in `./errors`, which
 * drivers use to normalize failures before raising to callers.
 */

import type { ZkError } from "./errors.js";

export type ConnectionState = "connecting" | "connected" | "readonly" | "expired" | "closed";

export type CreateMode =
  | "persistent"
  | "ephemeral"
  | "persistent-sequential"
  | "ephemeral-sequential";

export type WatchEvent =
  | { kind: "created"; path: string }
  | { kind: "deleted"; path: string }
  | { kind: "data-changed"; path: string }
  | { kind: "children-changed"; path: string };

export type ZkStat = {
  version: number;
  cversion: number;
  aversion: number;
  ephemeralOwner: string | null;
  dataLength: number;
  numChildren: number;
  /** ISO timestamp of creation (ctime in native). */
  createdAt: string;
  /** ISO timestamp of last data mutation (mtime in native). */
  modifiedAt: string;
};

export type ZkDriverOptions = {
  hosts: string;
  sessionTimeoutMs?: number;
  connectTimeoutMs?: number;
  chroot?: string;
  /** Auth credentials. `{ scheme: "digest", auth: Buffer.from("user:pass") }`, etc. */
  authInfo?: readonly { scheme: string; auth: Buffer }[];
  /** Fires on every state transition — `"expired"` is the one recipes care about. */
  onStateChange?: (state: ConnectionState) => void;
};

/**
 * Thin wire-level client. Every method is async; drivers normalize
 * errors via `toZkError` before rejecting.
 *
 * `watch*` variants attach a one-shot watcher — ZK's native contract.
 * Recipes build reusable watch loops by re-arming after each event.
 */
export interface ZkDriver {
  readonly state: ConnectionState;

  create(path: string, data: Buffer, mode: CreateMode): Promise<string>;
  delete(path: string, version?: number): Promise<void>;
  exists(path: string): Promise<ZkStat | null>;
  get(path: string): Promise<{ data: Buffer; stat: ZkStat }>;
  getChildren(path: string): Promise<readonly string[]>;
  set(path: string, data: Buffer, version?: number): Promise<ZkStat>;

  /** One-shot existence watch; resolves when the node's state changes. */
  watchExists(path: string): Promise<{ stat: ZkStat | null; event: WatchEvent | null }>;
  /** One-shot children watch; resolves when the child set changes. */
  watchChildren(path: string): Promise<{ children: readonly string[]; event: WatchEvent | null }>;
  /** One-shot data watch; resolves when the node's data changes or it is deleted. */
  watchData(path: string): Promise<{ data: Buffer; stat: ZkStat; event: WatchEvent | null } | null>;

  close(): Promise<void>;
}

/**
 * Factory signature every driver exposes. Keeping the signature shared
 * makes it cheap to swap drivers from tests or from a future native swap.
 */
export type ZkDriverFactory = (opts: ZkDriverOptions) => Promise<ZkDriver>;

/** Helper used by recipes to surface a typed error to callers. */
export type ToZkErrorFn = (err: unknown, fallbackPath?: string) => ZkError;
