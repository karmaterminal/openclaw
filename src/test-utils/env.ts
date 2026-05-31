import path from "node:path";

export function captureEnv(keys: string[]) {
  const snapshot = new Map<string, string | undefined>();
  for (const key of keys) {
    snapshot.set(key, process.env[key]);
  }

  return {
    restore() {
      for (const [key, value] of snapshot) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    },
  };
}

function applyEnvValues(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

const PATH_RESOLUTION_ENV_KEYS = [
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "OPENCLAW_HOME",
  "OPENCLAW_STATE_DIR",
  "OPENCLAW_BUNDLED_PLUGINS_DIR",
  "OPENCLAW_DISABLE_BUNDLED_PLUGINS",
] as const;

function resolveWindowsHomeParts(homeDir: string): { homeDrive?: string; homePath?: string } {
  if (process.platform !== "win32") {
    return {};
  }
  const match = homeDir.match(/^([A-Za-z]:)(.*)$/);
  if (!match) {
    return {};
  }
  return {
    homeDrive: match[1],
    homePath: match[2] || "\\",
  };
}

export function createPathResolutionEnv(
  homeDir: string,
  env: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  const resolvedHome = path.resolve(homeDir);
  const nextEnv: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: resolvedHome,
    USERPROFILE: resolvedHome,
    OPENCLAW_HOME: undefined,
    OPENCLAW_STATE_DIR: undefined,
    OPENCLAW_BUNDLED_PLUGINS_DIR: undefined,
    OPENCLAW_DISABLE_BUNDLED_PLUGINS: undefined,
  };

  const windowsHome = resolveWindowsHomeParts(resolvedHome);
  nextEnv.HOMEDRIVE = windowsHome.homeDrive;
  nextEnv.HOMEPATH = windowsHome.homePath;

  for (const [key, value] of Object.entries(env)) {
    nextEnv[key] = value;
  }

  return nextEnv;
}

export function withPathResolutionEnv<T>(
  homeDir: string,
  env: Record<string, string | undefined>,
  fn: (resolvedEnv: NodeJS.ProcessEnv) => T,
): T {
  const resolvedEnv = createPathResolutionEnv(homeDir, env);
  const scopedEnv: Record<string, string | undefined> = {};
  for (const key of new Set([...PATH_RESOLUTION_ENV_KEYS, ...Object.keys(env)])) {
    scopedEnv[key] = resolvedEnv[key];
  }
  return withEnv(scopedEnv, () => fn(resolvedEnv));
}

export function captureFullEnv() {
  const snapshot: Record<string, string | undefined> = { ...process.env };

  return {
    restore() {
      for (const key of Object.keys(process.env)) {
        if (!(key in snapshot)) {
          delete process.env[key];
        }
      }
      for (const [key, value] of Object.entries(snapshot)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    },
  };
}

export function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const snapshot = captureEnv(Object.keys(env));
  try {
    applyEnvValues(env);
    return fn();
  } finally {
    snapshot.restore();
  }
}

export async function withEnvAsync<T>(
  env: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const snapshot = captureEnv(Object.keys(env));
  try {
    applyEnvValues(env);
    return await fn();
  } finally {
    snapshot.restore();
  }
}

/**
 * Returns the current `OPENCLAW_*` environment-variable keys present in
 * `process.env`. Used by hermetic-env helpers to discover seat-divergent
 * systemd-unit injections (which vary between prince-seats: e.g. silas-seat
 * exports 8 vars, cael-seat exports those 8 plus `OPENCLAW_ALLOW_OLDER_BINARY_DESTRUCTIVE_ACTIONS`).
 */
export function listOpenclawEnvKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.keys(env).filter((key) => key.startsWith("OPENCLAW_"));
}

/**
 * Captures and clears all currently-set `OPENCLAW_*` environment variables
 * for the lifetime of the returned handle. Call `.restore()` to put them back.
 *
 * Useful in `beforeEach` blocks for tests that exercise gateway/service-mode
 * CLI paths, plugin runtime startup gates, or anything that reads systemd-unit
 * env injections. Hermetic by construction across prince-seats with divergent
 * systemd env sets — discovers and clears whatever's there rather than
 * enumerating known keys.
 *
 * Example:
 * ```ts
 * import { captureHermeticOpenclawEnv } from "../../test-utils/env.js";
 *
 * describe("gateway CLI option collisions", () => {
 *   let openclawEnvSnapshot: { restore: () => void };
 *   beforeEach(() => {
 *     openclawEnvSnapshot = captureHermeticOpenclawEnv();
 *   });
 *   afterEach(() => {
 *     openclawEnvSnapshot.restore();
 *   });
 *   // ... tests run with no OPENCLAW_* host env leakage
 * });
 * ```
 */
export function captureHermeticOpenclawEnv(): { restore: () => void } {
  const snapshot = captureEnv(listOpenclawEnvKeys());
  for (const key of listOpenclawEnvKeys()) {
    delete process.env[key];
  }
  return snapshot;
}

/**
 * Runs `fn` synchronously with all `OPENCLAW_*` environment variables
 * stripped, restoring them on exit (including on throw).
 */
export function withHermeticOpenclawEnv<T>(fn: () => T): T {
  const snapshot = captureHermeticOpenclawEnv();
  try {
    return fn();
  } finally {
    snapshot.restore();
  }
}

/**
 * Async variant of `withHermeticOpenclawEnv`.
 */
export async function withHermeticOpenclawEnvAsync<T>(fn: () => Promise<T>): Promise<T> {
  const snapshot = captureHermeticOpenclawEnv();
  try {
    return await fn();
  } finally {
    snapshot.restore();
  }
}
