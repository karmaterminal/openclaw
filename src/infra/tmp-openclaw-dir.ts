import { getSealedRuntimeSecureTempRoot } from "./sealed-runtime-registry.js";

/** Preferred shared OpenClaw temp root on POSIX systems when ownership and permissions are safe. */
export const DEFAULT_POSIX_TMP_ROOT = "/tmp/openclaw";

// Names a per-process temp root that replaces the shared default, for isolated runs such as
// CI shards. Contract: docs/help/environment.md.
const TMP_DIR_OVERRIDE_ENV = "OPENCLAW_TMP_DIR";

type SecureDirStat = {
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  mode?: number;
  uid?: number;
};

/** Injectable filesystem/platform hooks for resolving the preferred temp root in tests. */
export type ResolvePreferredOpenClawTmpDirOptions = {
  accessSync?: (path: string, mode?: number) => void;
  chmodSync?: (path: string, mode: number) => void;
  getuid?: () => number | undefined;
  lstatSync?: (path: string) => SecureDirStat;
  mkdirSync?: (path: string, opts: { recursive: boolean; mode?: number }) => void;
  platform?: NodeJS.Platform;
  preferredDir?: string;
  tmpdir?: () => string;
  warn?: (message: string) => void;
};

type ResolveSecureTempRoot =
  typeof import("@openclaw/fs-safe/secure-temp-root").resolveSecureTempRoot;
type NodeFs = typeof import("node:fs");
type PosixPath = typeof import("node:path").posix;

let resolveSecureTempRootRuntime: ResolveSecureTempRoot | undefined;
declare const SEALED_RUNTIME_BUILD: boolean;

function loadResolveSecureTempRoot(): ResolveSecureTempRoot {
  if (resolveSecureTempRootRuntime) {
    return resolveSecureTempRootRuntime;
  }
  const injected = getSealedRuntimeSecureTempRoot();
  if (injected) {
    resolveSecureTempRootRuntime = injected;
    return injected;
  }
  if (typeof SEALED_RUNTIME_BUILD === "boolean" && SEALED_RUNTIME_BUILD) {
    throw new Error("sealed temp-root runtime was not registered before use");
  }
  // Keep browser imports safe; load the Node-only resolver when a temp root is needed.
  if (typeof process.getBuiltinModule !== "function") {
    throw new Error("Node module loading is unavailable for secure temp-root resolution");
  }
  const require = process.getBuiltinModule("module").createRequire(import.meta.url);
  const fsSafeTemp =
    require("@openclaw/fs-safe/secure-temp-root") as typeof import("@openclaw/fs-safe/secure-temp-root");
  resolveSecureTempRootRuntime = fsSafeTemp.resolveSecureTempRoot;
  return resolveSecureTempRootRuntime;
}

function isPosixPathInside(root: string, candidate: string, posix: PosixPath): boolean {
  const relative = posix.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith("../");
}

// Resolves symlinked ancestors but never the leaf: a link planted at the override itself is
// refused by admission instead of being followed here.
function physicalPosixPath(target: string, fs: NodeFs, posix: PosixPath): string {
  const tail = [posix.basename(target)];
  for (let directory = posix.dirname(target); ; directory = posix.dirname(directory)) {
    try {
      return posix.join(fs.realpathSync.native(directory), ...tail);
    } catch {
      if (directory === posix.dirname(directory)) {
        return target;
      }
      tail.unshift(posix.basename(directory));
    }
  }
}

function describeDefaultRootOverlap(
  candidate: string,
  uid: number | undefined,
  fs: NodeFs,
  posix: PosixPath,
): string | undefined {
  // The shared root, and the per-user fallback a Gateway with the usual TMPDIR selects.
  const defaultRoots = [DEFAULT_POSIX_TMP_ROOT];
  if (uid !== undefined) {
    defaultRoots.push(`${DEFAULT_POSIX_TMP_ROOT}-${uid}`);
  }
  const physicalCandidate = physicalPosixPath(candidate, fs, posix);
  for (const root of defaultRoots) {
    const physicalRoot = physicalPosixPath(root, fs, posix);
    for (const [directory, defaultRoot] of [
      [candidate, root],
      [physicalCandidate, physicalRoot],
    ] as const) {
      if (directory === defaultRoot) {
        return `it is the default temp root ${root}`;
      }
      if (isPosixPathInside(defaultRoot, directory, posix)) {
        return `it is inside the default temp root ${root}`;
      }
      if (isPosixPathInside(directory, defaultRoot, posix)) {
        return `it contains the default temp root ${root}`;
      }
    }
  }
  return undefined;
}

/** Admits OPENCLAW_TMP_DIR as this process's temp root or refuses it; it never falls back. */
function resolveTmpDirOverride(
  value: string,
  options: ResolvePreferredOpenClawTmpDirOptions,
): string {
  const refuse = (reason: string) =>
    new Error(
      `OpenClaw refused ${TMP_DIR_OVERRIDE_ENV}=${JSON.stringify(value)}: ${reason}. ` +
        "Set it to an absolute path for a private directory, or unset it to use the default temp root.",
    );
  if (typeof process.getBuiltinModule !== "function") {
    throw new Error("Node module loading is unavailable for secure temp-root resolution");
  }
  const fs = process.getBuiltinModule("node:fs");
  const path = process.getBuiltinModule("node:path");
  const windows = process.platform === "win32" || options.platform === "win32";
  if (value === "") {
    throw refuse("it is empty");
  }
  // A Windows root without a drive or share would follow the current drive.
  if (
    windows
      ? !path.win32.isAbsolute(value) || !/^(?:[A-Za-z]:|[\\/]{2})/u.test(value)
      : !path.posix.isAbsolute(value)
  ) {
    throw refuse("it is not an absolute path");
  }
  const preferredDir = windows ? path.win32.resolve(value) : path.posix.resolve(value);
  const uid = windows ? undefined : options.getuid ? options.getuid() : process.getuid?.();
  if (!windows) {
    const overlap = describeDefaultRootOverlap(preferredDir, uid, fs, path.posix);
    if (overlap) {
      throw refuse(overlap);
    }
  }

  // The resolver repairs an owned directory whose mode is too broad. An override is admitted
  // only as found, so naming a shared directory such as /var/tmp can never tighten it.
  const lstatSync = options.lstatSync ?? ((candidate: string) => fs.lstatSync(candidate));
  let existing: SecureDirStat | undefined;
  try {
    existing = lstatSync(preferredDir);
  } catch (error) {
    // SAFETY: lstat failures are Node errno errors; optional chaining tolerates any other throw.
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code !== "ENOENT") {
      throw refuse(`it cannot be inspected (${code ?? String(error)})`);
    }
  }
  if (existing) {
    if (existing.isSymbolicLink()) {
      throw refuse("it is a symbolic link");
    }
    if (!existing.isDirectory()) {
      throw refuse("it is not a directory");
    }
    if (uid !== undefined && existing.uid !== undefined && existing.uid !== uid) {
      throw refuse(`it is owned by uid ${existing.uid}, not the current user (uid ${uid})`);
    }
    if (!windows && existing.mode !== undefined && (existing.mode & 0o022) !== 0) {
      throw refuse(
        `other users can write to it (mode ${(existing.mode & 0o7777).toString(8)}), and OpenClaw never repairs an override`,
      );
    }
    try {
      (options.accessSync ?? fs.accessSync)(preferredDir, fs.constants.W_OK | fs.constants.X_OK);
    } catch {
      throw refuse("the current user cannot write to it");
    }
  }

  return loadResolveSecureTempRoot()({
    ...options,
    preferredDir,
    fallbackPrefix: "openclaw",
    warningPrefix: "[openclaw]",
    unsafeFallbackLabel: "OpenClaw temp dir",
    skipPreferredOnWindows: false,
    // The resolver reads tmpdir only to fall back, and an override never falls back.
    tmpdir: () => {
      throw refuse(
        "it could not be created as a private directory; its parent must exist and be writable by the current user",
      );
    },
  });
}

/**
 * Resolves this process's OpenClaw temp root: OPENCLAW_TMP_DIR when set, which fails closed,
 * otherwise the shared root, falling back to user-scoped os.tmpdir paths when needed.
 */
export function resolvePreferredOpenClawTmpDir(
  options: ResolvePreferredOpenClawTmpDirOptions = {},
): string {
  // A caller-selected root names some other private directory; the override replaces only
  // the shared default.
  const override =
    options.preferredDir === undefined ? process.env[TMP_DIR_OVERRIDE_ENV] : undefined;
  if (override !== undefined) {
    return resolveTmpDirOverride(override, options);
  }
  return loadResolveSecureTempRoot()({
    ...options,
    preferredDir: options.preferredDir ?? DEFAULT_POSIX_TMP_ROOT,
    fallbackPrefix: "openclaw",
    warningPrefix: "[openclaw]",
    unsafeFallbackLabel: "OpenClaw temp dir",
    skipPreferredOnWindows: true,
  });
}
