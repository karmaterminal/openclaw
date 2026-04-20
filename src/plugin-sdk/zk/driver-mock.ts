/**
 * In-memory ZkDriver that honors the semantics recipes depend on:
 *   - ephemeral znodes disappear when the owning session closes/expires
 *   - *-sequential nodes suffix a monotonic 10-digit counter
 *   - data + children watches are one-shot; callers re-arm after each event
 *   - create(parent missing) → NoNodeError, create(existing) → NodeExistsError
 *   - delete(version mismatch) / set(version mismatch) → "version-mismatch" ZkError
 *
 * The mock deliberately DOES NOT simulate wire-level reconnects,
 * partitions, or readonly mode — callers wanting those scenarios should
 * run the testcontainer integration suite behind
 * `OPENCLAW_ZK_INTEGRATION=1`. This file's job is recipe correctness,
 * not wire simulation.
 *
 * Per session (driver instance) there is a private `sessionId`. Ephemeral
 * nodes track which session owns them; closing the session removes them.
 */

import type {
  ConnectionState,
  WatchEvent,
  ZkDriver,
  ZkDriverFactory,
  ZkDriverOptions,
  ZkStat,
} from "./driver.js";
import { NoNodeError, NodeExistsError, ZkError, toZkError } from "./errors.js";
import { parentPath, validatePath } from "./paths.js";

type MockNode = {
  path: string;
  data: Buffer;
  version: number;
  cversion: number;
  aversion: number;
  sessionId: string | null; // non-null for ephemeral nodes
  children: Set<string>; // basenames of direct children
  sequentialCounter: number;
  createdAt: string;
  modifiedAt: string;
};

type WatchKind = "data" | "children" | "exists";

type WatchSubscriber = {
  kind: WatchKind;
  path: string;
  resolve: (event: WatchEvent) => void;
};

/**
 * Shared state across all drivers pointing at the same mock cluster. Pass
 * `{ cluster }` to `createMockDriver` to let two drivers observe the same
 * znode tree — required for tests that exercise cross-host semantics
 * (e.g. two princes contending for the same lock path).
 */
export type MockCluster = {
  readonly _brand: "MockCluster";
  /** reset-all — useful between test cases. Drops every znode + watch. */
  reset(): void;
  /** number of live nodes, for test assertions */
  nodeCount(): number;
};

type ClusterState = {
  nodes: Map<string, MockNode>;
  watches: Set<WatchSubscriber>;
  sessions: Map<string, { state: ConnectionState; ephemerals: Set<string> }>;
};

export function createMockCluster(): MockCluster {
  const state: ClusterState = { nodes: new Map(), watches: new Set(), sessions: new Map() };
  // Seed root.
  state.nodes.set("/", makeNode("/", Buffer.alloc(0), null));
  const proxy: MockCluster & { __state: ClusterState } = {
    _brand: "MockCluster",
    reset() {
      state.nodes.clear();
      state.watches.clear();
      state.sessions.clear();
      state.nodes.set("/", makeNode("/", Buffer.alloc(0), null));
    },
    nodeCount() {
      return state.nodes.size;
    },
    __state: state,
  };
  return proxy;
}

function makeNode(path: string, data: Buffer, sessionId: string | null): MockNode {
  const now = new Date().toISOString();
  return {
    path,
    data,
    version: 0,
    cversion: 0,
    aversion: 0,
    sessionId,
    children: new Set(),
    sequentialCounter: 0,
    createdAt: now,
    modifiedAt: now,
  };
}

function toStat(node: MockNode): ZkStat {
  return {
    version: node.version,
    cversion: node.cversion,
    aversion: node.aversion,
    ephemeralOwner: node.sessionId,
    dataLength: node.data.length,
    numChildren: node.children.size,
    createdAt: node.createdAt,
    modifiedAt: node.modifiedAt,
  };
}

function fireWatch(state: ClusterState, event: WatchEvent): void {
  for (const sub of Array.from(state.watches)) {
    const match =
      (sub.kind === "data" && sub.path === event.path && event.kind !== "children-changed") ||
      (sub.kind === "exists" &&
        sub.path === event.path &&
        (event.kind === "created" || event.kind === "deleted")) ||
      (sub.kind === "children" && sub.path === event.path && event.kind === "children-changed");
    if (match) {
      state.watches.delete(sub);
      // Fire on a microtask so callers observing the same event don't race
      // themselves (e.g. create() resolves then watcher resolves).
      queueMicrotask(() => sub.resolve(event));
    }
  }
}

function getClusterState(cluster: MockCluster): ClusterState {
  return (cluster as MockCluster & { __state: ClusterState }).__state;
}

export type CreateMockDriverOptions = ZkDriverOptions & {
  /** Shared cluster — defaults to a fresh per-driver one. */
  cluster?: MockCluster;
  /** Deterministic session id for tests that assert ephemeral ownership. */
  sessionId?: string;
};

export const createMockDriver: ZkDriverFactory = async (opts: ZkDriverOptions) => {
  return _createMockDriverSync(opts as CreateMockDriverOptions);
};

/**
 * Synchronous entry point — factory variant for tests that want a driver
 * without the `await`. Returns a ZkDriver that already appears "connected."
 */
export function _createMockDriverSync(opts: CreateMockDriverOptions): ZkDriver {
  const cluster = opts.cluster ?? createMockCluster();
  const state = getClusterState(cluster);
  const sessionId = opts.sessionId ?? `mock-session-${Math.random().toString(36).slice(2, 10)}`;
  const session = { state: "connected" as ConnectionState, ephemerals: new Set<string>() };
  state.sessions.set(sessionId, session);
  opts.onStateChange?.("connected");

  function requireAlive(): void {
    if (session.state === "expired" || session.state === "closed") {
      throw new ZkError("session-expired", `mock session ${sessionId} is ${session.state}`);
    }
  }

  function assertNode(path: string): MockNode {
    const n = state.nodes.get(path);
    if (!n) {
      throw new NoNodeError(path);
    }
    return n;
  }

  function ensureParent(path: string): MockNode {
    const pPath = parentPath(path);
    const parent = state.nodes.get(pPath);
    if (!parent) {
      throw new NoNodeError(pPath);
    }
    return parent;
  }

  const driver: ZkDriver = {
    get state() {
      return session.state;
    },

    async create(path, data, mode) {
      requireAlive();
      validatePath(path);
      const parent = ensureParent(path);

      let finalPath = path;
      if (mode === "persistent-sequential" || mode === "ephemeral-sequential") {
        const suffix = String(parent.sequentialCounter).padStart(10, "0");
        parent.sequentialCounter += 1;
        finalPath = `${path}${suffix}`;
        validatePath(finalPath);
      }

      if (state.nodes.has(finalPath)) {
        throw new NodeExistsError(finalPath);
      }
      const ephemeral = mode === "ephemeral" || mode === "ephemeral-sequential";
      const node = makeNode(finalPath, data, ephemeral ? sessionId : null);
      state.nodes.set(finalPath, node);
      parent.children.add(finalPath.slice(parent.path === "/" ? 1 : parent.path.length + 1));
      parent.cversion += 1;
      if (ephemeral) {
        session.ephemerals.add(finalPath);
      }

      fireWatch(state, { kind: "created", path: finalPath });
      fireWatch(state, { kind: "children-changed", path: parent.path });
      return finalPath;
    },

    async delete(path, version) {
      requireAlive();
      validatePath(path);
      const node = assertNode(path);
      if (version !== undefined && version !== -1 && version !== node.version) {
        throw new ZkError("version-mismatch", `zk version mismatch at ${path}`, { path });
      }
      if (node.children.size > 0) {
        throw new ZkError("not-empty", `zk node has children: ${path}`, { path });
      }
      state.nodes.delete(path);
      session.ephemerals.delete(path);
      const parent = assertNode(parentPath(path));
      const base = path.slice(parent.path === "/" ? 1 : parent.path.length + 1);
      parent.children.delete(base);
      parent.cversion += 1;
      fireWatch(state, { kind: "deleted", path });
      fireWatch(state, { kind: "children-changed", path: parent.path });
    },

    async exists(path) {
      requireAlive();
      validatePath(path);
      const n = state.nodes.get(path);
      return n ? toStat(n) : null;
    },

    async get(path) {
      requireAlive();
      validatePath(path);
      const n = assertNode(path);
      return { data: Buffer.from(n.data), stat: toStat(n) };
    },

    async getChildren(path) {
      requireAlive();
      validatePath(path);
      const n = assertNode(path);
      return Array.from(n.children).toSorted();
    },

    async set(path, data, version) {
      requireAlive();
      validatePath(path);
      const n = assertNode(path);
      if (version !== undefined && version !== -1 && version !== n.version) {
        throw new ZkError("version-mismatch", `zk version mismatch at ${path}`, { path });
      }
      n.data = Buffer.from(data);
      n.version += 1;
      n.modifiedAt = new Date().toISOString();
      fireWatch(state, { kind: "data-changed", path });
      return toStat(n);
    },

    async watchExists(path) {
      requireAlive();
      validatePath(path);
      const current = state.nodes.get(path);
      return new Promise((resolve) => {
        state.watches.add({
          kind: "exists",
          path,
          resolve: (event) =>
            resolve({ stat: state.nodes.get(path) ? toStat(state.nodes.get(path)!) : null, event }),
        });
        // If the node exists, we still return a pending subscription —
        // exists() gives the snapshot; the watch fires on next change.
        void current;
      });
    },

    async watchChildren(path) {
      requireAlive();
      validatePath(path);
      const n = assertNode(path);
      const snapshot = Array.from(n.children).toSorted();
      return new Promise((resolve) => {
        state.watches.add({
          kind: "children",
          path,
          resolve: (event) => {
            const current = state.nodes.get(path);
            resolve({ children: current ? Array.from(current.children).toSorted() : [], event });
          },
        });
        // snapshot is returned synchronously via a separate callsite — keep
        // the resolve shape consistent with `exists` so recipes can branch.
        void snapshot;
      });
    },

    async watchData(path) {
      requireAlive();
      validatePath(path);
      const n = state.nodes.get(path);
      if (!n) {
        return null;
      }
      return new Promise((resolve) => {
        state.watches.add({
          kind: "data",
          path,
          resolve: (event) => {
            const current = state.nodes.get(path);
            if (!current) {
              resolve(null);
            } else {
              resolve({ data: Buffer.from(current.data), stat: toStat(current), event });
            }
          },
        });
      });
    },

    async close() {
      if (session.state === "closed" || session.state === "expired") {
        return;
      }
      session.state = "closed";
      // Drop ephemerals.
      for (const ephemPath of Array.from(session.ephemerals)) {
        const node = state.nodes.get(ephemPath);
        if (!node) {
          continue;
        }
        state.nodes.delete(ephemPath);
        const parent = state.nodes.get(parentPath(ephemPath));
        if (parent) {
          const base = ephemPath.slice(parent.path === "/" ? 1 : parent.path.length + 1);
          parent.children.delete(base);
          parent.cversion += 1;
          fireWatch(state, { kind: "children-changed", path: parent.path });
        }
        fireWatch(state, { kind: "deleted", path: ephemPath });
      }
      session.ephemerals.clear();
      state.sessions.delete(sessionId);
      opts.onStateChange?.("closed");
    },
  };

  return driver;
}

/** Force a session into the `expired` state — used by tests to verify recipes abort cleanly. */
export function _expireMockSession(cluster: MockCluster, sessionId?: string): void {
  const state = getClusterState(cluster);
  for (const [id, session] of state.sessions.entries()) {
    if (sessionId && id !== sessionId) {
      continue;
    }
    session.state = "expired";
    // Ephemeral cleanup matches real ZK semantics.
    for (const ephemPath of Array.from(session.ephemerals)) {
      const node = state.nodes.get(ephemPath);
      if (!node) {
        continue;
      }
      state.nodes.delete(ephemPath);
      const parent = state.nodes.get(parentPath(ephemPath));
      if (parent) {
        const base = ephemPath.slice(parent.path === "/" ? 1 : parent.path.length + 1);
        parent.children.delete(base);
        parent.cversion += 1;
        fireWatch(state, { kind: "children-changed", path: parent.path });
      }
      fireWatch(state, { kind: "deleted", path: ephemPath });
    }
    session.ephemerals.clear();
  }
}

// Silences unused-import lints; `toZkError` is re-exported for recipe tests
// that want to construct drive-derived errors without reaching into
// `./errors` through a different barrel.
export { toZkError };
