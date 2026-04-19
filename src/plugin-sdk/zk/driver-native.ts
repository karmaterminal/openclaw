/**
 * Native ZkDriver adapter over the `zookeeper` (yfinkelstein) npm package.
 *
 * The `zookeeper` package is a NATIVE binding (node-gyp + build-essential
 * + python3 at install time), so we import it dynamically here. If the
 * import fails — typically because `npm i -g openclaw` ran on a minimal
 * box without the build toolchain — we raise `ZkNativeDriverUnavailableError`
 * with a message that points operators at `openclaw zk setup`.
 *
 * Shipped separately from `./driver.ts` so the type contract stays
 * compile-cheap and test suites using `driver-mock.ts` don't pull native
 * bindings.
 */

import type {
  ConnectionState,
  CreateMode,
  WatchEvent,
  ZkDriver,
  ZkDriverFactory,
  ZkDriverOptions,
  ZkStat,
} from "./driver.js";
import {
  ConnectionLossError,
  SessionExpiredError,
  ZkError,
  ZkNativeDriverUnavailableError,
  toZkError,
} from "./errors.js";

// The native module's shape is declared minimally so TypeScript compiles
// without the optional dep resolving at type-check time. Keep in sync with
// https://github.com/yfinkelstein/node-zookeeper README.
type NativeClient = {
  init(cfg: Record<string, unknown>): void;
  close(): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  create(path: string, data: Buffer, flags: number, ttl?: number): Promise<string>;
  delete_(path: string, version: number): Promise<void>;
  exists(path: string, watch: boolean): Promise<NativeStat | null>;
  pathExists(path: string, watch: boolean): Promise<boolean>;
  get(path: string, watch: boolean): Promise<[NativeStat, Buffer | string]>;
  get_children(path: string, watch: boolean): Promise<string[]>;
  set(path: string, data: Buffer, version: number): Promise<NativeStat>;
  w_exists(path: string, watchCb: NativeWatchCb): Promise<NativeStat | null>;
  w_get_children(path: string, watchCb: NativeWatchCb): Promise<string[]>;
  w_get(path: string, watchCb: NativeWatchCb): Promise<[NativeStat, Buffer | string]>;
  add_auth(scheme: string, auth: string, cb: (rc: number, err: string) => void): void;
};

type NativeStat = {
  version: number;
  cversion: number;
  aversion: number;
  ephemeralOwner?: bigint | number | string | null;
  dataLength: number;
  numChildren: number;
  ctime?: number | bigint;
  mtime?: number | bigint;
};

type NativeWatchCb = (type: number, state: number, path: string) => void;

type ZooKeeperModule = {
  default?: new (cfg: Record<string, unknown>) => NativeClient;
  // Some ESM shims export the ctor as both default + named.
  ZooKeeper?: new (cfg: Record<string, unknown>) => NativeClient;
  constants: {
    ZOO_PERSISTENT: number;
    ZOO_EPHEMERAL: number;
    ZOO_PERSISTENT_SEQUENTIAL: number;
    ZOO_EPHEMERAL_SEQUENTIAL: number;
    ZOO_LOG_LEVEL_WARN?: number;
    ZOO_CONNECTED_STATE?: number;
    ZOO_EXPIRED_SESSION_STATE?: number;
    ZOO_AUTH_FAILED_STATE?: number;
    ZOO_CREATED_EVENT?: number;
    ZOO_DELETED_EVENT?: number;
    ZOO_CHANGED_EVENT?: number;
    ZOO_CHILD_EVENT?: number;
  };
};

let cachedModule: ZooKeeperModule | null = null;
let moduleLoadError: unknown = null;

async function loadZkModule(): Promise<ZooKeeperModule> {
  if (cachedModule) {
    return cachedModule;
  }
  if (moduleLoadError) {
    throw new ZkNativeDriverUnavailableError(moduleLoadError);
  }
  try {
    // Dynamic import; tolerates the native dep being missing.
    const mod = (await import("zookeeper")) as unknown as ZooKeeperModule;
    cachedModule = mod;
    return mod;
  } catch (err) {
    moduleLoadError = err;
    throw new ZkNativeDriverUnavailableError(err);
  }
}

function constructClient(mod: ZooKeeperModule, cfg: Record<string, unknown>): NativeClient {
  // The CJS + ESM shims expose the ctor differently; pick the one that's a fn.
  const Ctor = mod.default ?? mod.ZooKeeper;
  if (typeof Ctor !== "function") {
    throw new ZkError(
      "native-driver-unavailable",
      "zookeeper module loaded but no constructor export found",
    );
  }
  return new Ctor(cfg);
}

function modeToFlag(mod: ZooKeeperModule, mode: CreateMode): number {
  const { constants } = mod;
  switch (mode) {
    case "persistent":
      return constants.ZOO_PERSISTENT;
    case "ephemeral":
      return constants.ZOO_EPHEMERAL;
    case "persistent-sequential":
      return constants.ZOO_PERSISTENT_SEQUENTIAL;
    case "ephemeral-sequential":
      return constants.ZOO_EPHEMERAL_SEQUENTIAL;
    default: {
      const unreachable: never = mode;
      throw new ZkError("invalid-path", `unknown create mode: ${String(unreachable)}`);
    }
  }
}

function normalizeStat(stat: NativeStat | null | undefined): ZkStat | null {
  if (!stat) {
    return null;
  }
  return {
    version: stat.version ?? 0,
    cversion: stat.cversion ?? 0,
    aversion: stat.aversion ?? 0,
    ephemeralOwner:
      stat.ephemeralOwner != null && stat.ephemeralOwner !== 0n && stat.ephemeralOwner !== 0
        ? String(stat.ephemeralOwner)
        : null,
    dataLength: stat.dataLength ?? 0,
    numChildren: stat.numChildren ?? 0,
    createdAt: stat.ctime ? new Date(Number(stat.ctime)).toISOString() : new Date(0).toISOString(),
    modifiedAt: stat.mtime ? new Date(Number(stat.mtime)).toISOString() : new Date(0).toISOString(),
  };
}

/** Map the native watch-event type int to our `WatchEvent.kind`. */
function normalizeEvent(mod: ZooKeeperModule, type: number, path: string): WatchEvent | null {
  const { constants } = mod;
  if (type === constants.ZOO_CREATED_EVENT) {
    return { kind: "created", path };
  }
  if (type === constants.ZOO_DELETED_EVENT) {
    return { kind: "deleted", path };
  }
  if (type === constants.ZOO_CHANGED_EVENT) {
    return { kind: "data-changed", path };
  }
  if (type === constants.ZOO_CHILD_EVENT) {
    return { kind: "children-changed", path };
  }
  return null;
}

export const createNativeDriver: ZkDriverFactory = async (opts: ZkDriverOptions) => {
  const mod = await loadZkModule();
  const cfg: Record<string, unknown> = {
    connect: opts.hosts,
    timeout: opts.sessionTimeoutMs ?? 10_000,
    debug_level: mod.constants.ZOO_LOG_LEVEL_WARN ?? 3,
    host_order_deterministic: false,
    data_as_buffer: true,
  };
  if (opts.chroot) {
    cfg.chroot = opts.chroot;
  }

  const raw = constructClient(mod, cfg);

  let state: ConnectionState = "connecting";
  const setState = (next: ConnectionState) => {
    if (state === next) {
      return;
    }
    state = next;
    opts.onStateChange?.(state);
  };

  const connected = new Promise<void>((resolve, reject) => {
    const connectTimer = setTimeout(() => {
      reject(new ConnectionLossError("zk connect timeout"));
    }, opts.connectTimeoutMs ?? 5_000);
    raw.on("connect", () => {
      clearTimeout(connectTimer);
      setState("connected");
      resolve();
    });
    raw.on("close", () => {
      setState("closed");
    });
    raw.on("expired", () => {
      setState("expired");
    });
    raw.on("error", (err: unknown) => {
      clearTimeout(connectTimer);
      reject(toZkError(err));
    });
  });

  raw.init(cfg);

  // Optionally add auth.
  if (opts.authInfo) {
    for (const info of opts.authInfo) {
      await new Promise<void>((resolve, reject) => {
        raw.add_auth(info.scheme, info.auth.toString(), (rc, err) => {
          if (rc !== 0) {
            reject(new ZkError("auth-failed", err || "zk auth failed"));
          } else {
            resolve();
          }
        });
      });
    }
  }

  await connected;

  const driver: ZkDriver = {
    get state() {
      return state;
    },

    async create(path, data, mode) {
      try {
        const flag = modeToFlag(mod, mode);
        return await raw.create(path, data, flag);
      } catch (err) {
        throw toZkError(err, path);
      }
    },

    async delete(path, version) {
      try {
        await raw.delete_(path, version ?? -1);
      } catch (err) {
        throw toZkError(err, path);
      }
    },

    async exists(path) {
      try {
        const stat = await raw.exists(path, false);
        return normalizeStat(stat);
      } catch (err) {
        throw toZkError(err, path);
      }
    },

    async get(path) {
      try {
        const [stat, data] = await raw.get(path, false);
        const normalized = normalizeStat(stat);
        if (!normalized) {
          throw toZkError(new Error("no stat"), path);
        }
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        return { data: buf, stat: normalized };
      } catch (err) {
        throw toZkError(err, path);
      }
    },

    async getChildren(path) {
      try {
        return await raw.get_children(path, false);
      } catch (err) {
        throw toZkError(err, path);
      }
    },

    async set(path, data, version) {
      try {
        const stat = await raw.set(path, data, version ?? -1);
        const normalized = normalizeStat(stat);
        if (!normalized) {
          throw toZkError(new Error("no stat"), path);
        }
        return normalized;
      } catch (err) {
        throw toZkError(err, path);
      }
    },

    async watchExists(path) {
      return new Promise((resolve, reject) => {
        raw
          .w_exists(path, (type, _zkState, watchPath) => {
            const event = normalizeEvent(mod, type, watchPath);
            // Re-query to get the current stat for the resolved watch.
            raw
              .exists(watchPath, false)
              .then((s) => resolve({ stat: normalizeStat(s), event }))
              .catch((err) => reject(toZkError(err, path)));
          })
          .then((initial) => {
            // watchExists returns immediately with the snapshot AND arms a
            // callback; we return after the watch fires. Callers that want
            // the snapshot should call exists() themselves — this matches
            // kazoo's DataWatch semantics and keeps the API narrow.
            void initial;
          })
          .catch((err) => reject(toZkError(err, path)));
      });
    },

    async watchChildren(path) {
      return new Promise((resolve, reject) => {
        raw
          .w_get_children(path, (type, _zkState, watchPath) => {
            const event = normalizeEvent(mod, type, watchPath);
            raw
              .get_children(watchPath, false)
              .then((children) => resolve({ children, event }))
              .catch((err) => reject(toZkError(err, path)));
          })
          .then(() => {
            // snapshot discarded; see `watchExists` note.
          })
          .catch((err) => reject(toZkError(err, path)));
      });
    },

    async watchData(path) {
      return new Promise((resolve, reject) => {
        raw
          .w_get(path, (type, _zkState, watchPath) => {
            const event = normalizeEvent(mod, type, watchPath);
            raw
              .get(watchPath, false)
              .then(([stat, data]) => {
                const normalized = normalizeStat(stat);
                if (!normalized) {
                  resolve(null);
                  return;
                }
                const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
                resolve({ data: buf, stat: normalized, event });
              })
              .catch((err) => {
                // If the node was deleted mid-watch, resolve `null` instead
                // of rejecting — matches the contract documented in
                // `driver.ts#ZkDriver.watchData`.
                const zerr = toZkError(err, path);
                if (zerr.code === "no-node") {
                  resolve(null);
                } else {
                  reject(zerr);
                }
              });
          })
          .then(() => {
            // snapshot discarded; see `watchExists` note.
          })
          .catch((err) => reject(toZkError(err, path)));
      });
    },

    async close() {
      raw.close();
      setState("closed");
    },
  };

  // Silences eslint on the unused alias; SessionExpiredError is re-exported
  // from `./errors.ts` for ergonomics and is used by recipes in later PRs.
  void SessionExpiredError;

  return driver;
};
