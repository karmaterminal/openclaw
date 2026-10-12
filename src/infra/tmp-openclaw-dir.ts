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
type NodeBuffer = typeof import("node:buffer");
type NodeFs = typeof import("node:fs");
type NodeOs = typeof import("node:os");
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
  os: NodeOs,
  posix: PosixPath,
): string | undefined {
  // Each root, and whether an override may contain it. It may not be, sit inside, or contain the
  // shared root or the per-user fallback a Gateway with the usual TMPDIR selects.
  const defaultRoots = new Map([[DEFAULT_POSIX_TMP_ROOT, false]]);
  if (uid !== undefined) {
    defaultRoots.set(`${DEFAULT_POSIX_TMP_ROOT}-${uid}`, false);
  }
  // A Gateway sharing this process's TMPDIR, the only one visible from here, falls back below it.
  // The override may contain that root: OpenClaw gives a child a TMPDIR inside its own temp root
  // (withPrivateStagedPackageInstall), and the child inherits the override.
  const fallbackRoot = posix.resolve(
    os.tmpdir(),
    uid === undefined ? "openclaw" : `openclaw-${uid}`,
  );
  if (!defaultRoots.has(fallbackRoot)) {
    defaultRoots.set(fallbackRoot, true);
  }
  // Letter case is ignored: on a case-insensitive volume, the macOS default, /TMP/OPENCLAW
  // is /tmp/openclaw.
  const fold = (target: string) => target.toLowerCase();
  const physicalCandidate = physicalPosixPath(candidate, fs, posix);
  for (const [root, mayContain] of defaultRoots) {
    const physicalRoot = physicalPosixPath(root, fs, posix);
    for (const [directory, defaultRoot] of [
      [fold(candidate), fold(root)],
      [fold(physicalCandidate), fold(physicalRoot)],
    ] as const) {
      if (directory === defaultRoot) {
        return `it is the default temp root ${root}`;
      }
      if (isPosixPathInside(defaultRoot, directory, posix)) {
        return `it is inside the default temp root ${root}`;
      }
      if (!mayContain && isPosixPathInside(directory, defaultRoot, posix)) {
        return `it contains the default temp root ${root}`;
      }
    }
  }
  return undefined;
}

function errnoCode(error: unknown): string | undefined {
  // SAFETY: fs failures are Node errno errors; optional chaining tolerates any other throw.
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

// Linux stops resolving a path after this many symbolic links (ELOOP).
const MAX_SYMLINK_FOLLOWS = 40;

// Another user who can rename entries in a directory on the override's path, or replace a
// symbolic link on it, could point the override elsewhere after admission. So the path is
// resolved here one entry at a time, following each link as the kernel would. Every directory
// it passes through must be owned by root or the current user, and only a sticky directory such
// as /tmp may let other users write to it; a link there, which its owner can replace, must be
// owned by root or the current user too.
function describeReplaceableAncestor(
  directory: string,
  uid: number | undefined,
  lstatSync: (candidate: string) => SecureDirStat,
  fs: NodeFs,
  buffer: NodeBuffer,
  posix: PosixPath,
): string | undefined {
  const foreign = (owner: number | undefined) =>
    uid !== undefined && owner !== undefined && owner !== 0 && owner !== uid;
  const pending = directory.split("/");
  // Directories other users can add entries to; only sticky ones get past the checks.
  const shared = new Set<string>();
  // The directory resolved so far, through every link followed.
  let resolved = "/";
  for (let entry = "/", follows = 0; ;) {
    let stat: SecureDirStat;
    let link: Buffer | undefined;
    try {
      stat = lstatSync(entry);
      // As bytes: the kernel follows a target that is not UTF-8, which a decoded string renames.
      link = stat.isSymbolicLink() ? fs.readlinkSync(entry, { encoding: "buffer" }) : undefined;
    } catch (error) {
      const code = errnoCode(error);
      // The resolver would refuse to create the override there too, but another user could
      // create a missing entry in a sticky directory before it tries.
      if (code === "ENOENT") {
        return `its ancestor ${entry} does not exist`;
      }
      return `its ancestor ${entry} cannot be inspected (${code ?? String(error)})`;
    }
    if (link === undefined) {
      if (foreign(stat.uid)) {
        return `its ancestor ${entry} is owned by uid ${stat.uid}, neither root nor the current user (uid ${uid})`;
      }
      if (stat.mode !== undefined && (stat.mode & 0o022) !== 0) {
        if ((stat.mode & 0o1000) === 0) {
          return `other users can rename entries in its ancestor ${entry} (mode ${(stat.mode & 0o7777).toString(8)}, not sticky)`;
        }
        shared.add(entry);
      }
      resolved = entry;
    } else {
      if (shared.has(posix.dirname(entry)) && foreign(stat.uid)) {
        return `its path follows ${entry}, a symbolic link that uid ${stat.uid} owns in a directory other users can write`;
      }
      if (!buffer.isUtf8(link)) {
        return `its path follows ${entry}, a symbolic link whose target is not valid UTF-8`;
      }
      if (++follows > MAX_SYMLINK_FOLLOWS) {
        return `its ancestor ${entry} cannot be inspected (ELOOP)`;
      }
      const target = link.toString("utf8");
      // The target replaces the link; a relative target resolves from the link's directory.
      pending.unshift(...target.split("/"));
      if (target.startsWith("/")) {
        resolved = "/";
      }
    }
    let name: string | undefined;
    do {
      name = pending.shift();
    } while (name === "" || name === ".");
    if (name === undefined) {
      return undefined;
    }
    entry = name === ".." ? posix.dirname(resolved) : posix.join(resolved, name);
  }
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
    const os = process.getBuiltinModule("node:os");
    const overlap = describeDefaultRootOverlap(preferredDir, uid, fs, os, path.posix);
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
    const code = errnoCode(error);
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
  if (!windows) {
    const ancestry = describeReplaceableAncestor(
      path.posix.dirname(preferredDir),
      uid,
      lstatSync,
      fs,
      process.getBuiltinModule("node:buffer"),
      path.posix,
    );
    if (ancestry) {
      throw refuse(ancestry);
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
 * The directory OPENCLAW_TMP_DIR names, or undefined when it is unset, for recognizing paths
 * OpenClaw wrote under that temp root, whose name can be anything. It admits nothing: OpenClaw
 * writes only where resolvePreferredOpenClawTmpDir admits.
 */
export function readOpenClawTmpDirOverridePath(): string | undefined {
  const value = process.env[TMP_DIR_OVERRIDE_ENV];
  if (!value || typeof process.getBuiltinModule !== "function") {
    return undefined;
  }
  return process.getBuiltinModule("node:path").resolve(value);
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
