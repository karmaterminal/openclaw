// Covers preferred OpenClaw temp directory resolution.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { DEFAULT_POSIX_TMP_ROOT, resolvePreferredOpenClawTmpDir } from "./tmp-openclaw-dir.js";

type TmpDirOptions = NonNullable<Parameters<typeof resolvePreferredOpenClawTmpDir>[0]>;

function fallbackTmp(uid = 501) {
  return path.join("/var/fallback", `openclaw-${uid}`);
}

function nodeErrorWithCode(code: string) {
  const err = new Error(code) as Error & { code?: string };
  err.code = code;
  return err;
}

function secureDirStat(uid = 501) {
  return {
    isDirectory: () => true,
    isSymbolicLink: () => false,
    uid,
    mode: 0o40700,
  };
}

function makeDirStat(params?: {
  isDirectory?: boolean;
  isSymbolicLink?: boolean;
  uid?: number;
  mode?: number;
}) {
  return {
    isDirectory: () => params?.isDirectory ?? true,
    isSymbolicLink: () => params?.isSymbolicLink ?? false,
    uid: params?.uid ?? 501,
    mode: params?.mode ?? 0o40700,
  };
}

function readOnlyTmpAccessSync() {
  return vi.fn((target: string) => {
    if (target === "/tmp") {
      throw new Error("read-only");
    }
  });
}

function symlinkTmpDirLstat() {
  return vi.fn(() => makeDirStat({ isSymbolicLink: true, mode: 0o120777 }));
}

function expectFallsBackToOsTmpDir(params: { lstatSync: NonNullable<TmpDirOptions["lstatSync"]> }) {
  const { resolved, tmpdir } = resolveWithMocks({ lstatSync: params.lstatSync });
  expect(resolved).toBe(fallbackTmp());
  expect(tmpdir).toHaveBeenCalled();
}

function expectResolvesFallbackTmpDir(params: {
  lstatSync: NonNullable<TmpDirOptions["lstatSync"]>;
  accessSync?: NonNullable<TmpDirOptions["accessSync"]>;
}) {
  const { resolved, tmpdir } = resolveWithMocks({
    lstatSync: params.lstatSync,
    ...(params.accessSync ? { accessSync: params.accessSync } : {}),
  });
  expect(resolved).toBe(fallbackTmp());
  expect(tmpdir).toHaveBeenCalled();
}

function expectPrivateDirectory(candidate: string, uid: number) {
  const stat = fs.lstatSync(candidate, { bigint: true });
  expect(stat.isDirectory()).toBe(true);
  expect(stat.isSymbolicLink()).toBe(false);
  expect(stat.uid).toBe(BigInt(uid));
  expect(stat.mode & 0o7777n).toBe(0o700n);
  fs.accessSync(candidate, fs.constants.W_OK | fs.constants.X_OK);
  return stat;
}

function resolveWithMocks(params: {
  lstatSync: NonNullable<TmpDirOptions["lstatSync"]>;
  fallbackLstatSync?: NonNullable<TmpDirOptions["lstatSync"]>;
  accessSync?: NonNullable<TmpDirOptions["accessSync"]>;
  warn?: NonNullable<TmpDirOptions["warn"]>;
  uid?: number;
  tmpdirPath?: string;
}) {
  const uid = params.uid ?? 501;
  const fallbackPath = fallbackTmp(uid);
  const accessSync = params.accessSync ?? vi.fn();
  const warn = params.warn ?? vi.fn();
  const wrappedLstatSync = vi.fn((target: string) => {
    if (target === DEFAULT_POSIX_TMP_ROOT) {
      return params.lstatSync(target);
    }
    if (target === fallbackPath) {
      if (params.fallbackLstatSync) {
        return params.fallbackLstatSync(target);
      }
      return secureDirStat(uid);
    }
    return secureDirStat(uid);
  }) as NonNullable<TmpDirOptions["lstatSync"]>;
  const mkdirSync = vi.fn();
  const getuid = vi.fn(() => uid);
  const tmpdir = vi.fn(() => params.tmpdirPath ?? "/var/fallback");
  const resolved = resolvePreferredOpenClawTmpDir({
    accessSync,
    lstatSync: wrappedLstatSync,
    mkdirSync,
    getuid,
    tmpdir,
    warn,
  });
  return { resolved, accessSync, lstatSync: wrappedLstatSync, mkdirSync, tmpdir };
}

describe.skipIf(process.platform === "win32")("POSIX preferred temp directory selection", () => {
  // CI shards export OPENCLAW_TMP_DIR; these cases cover the shared default.
  beforeEach(() => {
    vi.stubEnv("OPENCLAW_TMP_DIR", undefined);
  });

  it("prefers /tmp/openclaw when it already exists and is writable", () => {
    const lstatSync: NonNullable<TmpDirOptions["lstatSync"]> = vi.fn(() => ({
      isDirectory: () => true,
      isSymbolicLink: () => false,
      uid: 501,
      mode: 0o40700,
    }));
    const { resolved, accessSync, tmpdir } = resolveWithMocks({ lstatSync });

    expect(lstatSync).toHaveBeenCalledTimes(1);
    expect(accessSync).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(DEFAULT_POSIX_TMP_ROOT);
    expect(tmpdir).not.toHaveBeenCalled();
  });

  it("honors a caller-selected secure root without changing the default temp policy", () => {
    const preferredDir = "/var/cache/openclaw";
    const lstatSync = vi.fn(() => secureDirStat());

    expect(
      resolvePreferredOpenClawTmpDir({
        accessSync: vi.fn(),
        getuid: () => 501,
        lstatSync,
        preferredDir,
        tmpdir: () => "/var/cache",
      }),
    ).toBe(preferredDir);
    expect(lstatSync).toHaveBeenCalledWith(preferredDir);
  });

  it("uses OPENCLAW_TMP_DIR in place of the shared root only while it is set", () => {
    const override = "/srv/ci/shard-1/openclaw-tmp";
    const lstatSync = vi.fn(() => secureDirStat());
    const tmpdir = vi.fn(() => "/var/fallback");
    const resolve = () =>
      resolvePreferredOpenClawTmpDir({ accessSync: vi.fn(), getuid: () => 501, lstatSync, tmpdir });

    expect(resolve()).toBe(DEFAULT_POSIX_TMP_ROOT);
    vi.stubEnv("OPENCLAW_TMP_DIR", override);
    expect(resolve()).toBe(override);
    expect(lstatSync).toHaveBeenLastCalledWith(override);
    expect(tmpdir).not.toHaveBeenCalled();
  });

  it("keeps a caller-selected root when OPENCLAW_TMP_DIR is set", () => {
    vi.stubEnv("OPENCLAW_TMP_DIR", "/srv/ci/shard-1/openclaw-tmp");
    const preferredDir = "/var/cache/openclaw";
    const lstatSync = vi.fn(() => secureDirStat());

    expect(
      resolvePreferredOpenClawTmpDir({
        accessSync: vi.fn(),
        getuid: () => 501,
        lstatSync,
        preferredDir,
        tmpdir: () => "/var/cache",
      }),
    ).toBe(preferredDir);
    expect(lstatSync).toHaveBeenCalledExactlyOnceWith(preferredDir);
  });

  it.each([
    {
      name: "falls back to os.tmpdir()/openclaw when /tmp/openclaw is not a directory",
      lstatSync: vi.fn(() => makeDirStat({ isDirectory: false, mode: 0o100644 })),
    },
    {
      name: "falls back to os.tmpdir()/openclaw when /tmp is not writable",
      lstatSync: vi.fn(() => {
        throw nodeErrorWithCode("ENOENT");
      }),
      accessSync: vi.fn((target: string) => {
        if (target === "/tmp") {
          throw new Error("read-only");
        }
      }),
    },
    {
      name: "falls back when /tmp/openclaw exists but is not writable",
      lstatSync: vi.fn(() => secureDirStat()),
      accessSync: vi.fn((target: string) => {
        if (target === DEFAULT_POSIX_TMP_ROOT) {
          throw new Error("not writable");
        }
      }),
    },
    {
      name: "falls back when /tmp/openclaw is a symlink",
      lstatSync: symlinkTmpDirLstat(),
    },
    {
      name: "falls back when /tmp/openclaw is not owned by the current user",
      lstatSync: vi.fn(() => makeDirStat({ uid: 0 })),
    },
    {
      name: "falls back when /tmp/openclaw is group/other writable",
      lstatSync: vi.fn(() => makeDirStat({ mode: 0o40777 })),
    },
  ])("$name", ({ lstatSync, accessSync }) => {
    if (accessSync) {
      expectResolvesFallbackTmpDir({ lstatSync, accessSync });
      return;
    }
    expectFallsBackToOsTmpDir({ lstatSync });
  });

  it("throws when fallback path is a symlink", () => {
    const lstatSync = symlinkTmpDirLstat();
    const fallbackLstatSync = vi.fn(() => makeDirStat({ isSymbolicLink: true, mode: 0o120777 }));

    expect(() =>
      resolveWithMocks({
        lstatSync,
        fallbackLstatSync,
      }),
    ).toThrow(/Unsafe fallback OpenClaw temp dir/);
  });

  it("uses an unscoped fallback suffix when process uid is unavailable", () => {
    const tmpdirPath = "/var/fallback";
    const fallbackPath = path.join(tmpdirPath, "openclaw");

    const resolved = resolvePreferredOpenClawTmpDir({
      accessSync: vi.fn((target: string) => {
        if (target === "/tmp") {
          throw new Error("read-only");
        }
      }),
      lstatSync: vi.fn((target: string) => {
        if (target === DEFAULT_POSIX_TMP_ROOT) {
          throw nodeErrorWithCode("ENOENT");
        }
        if (target === fallbackPath) {
          return makeDirStat({ uid: 0, mode: 0o40777 });
        }
        return secureDirStat();
      }),
      mkdirSync: vi.fn(),
      chmodSync: vi.fn(),
      getuid: vi.fn(() => undefined),
      tmpdir: vi.fn(() => tmpdirPath),
      warn: vi.fn(),
    });

    expect(resolved).toBe(fallbackPath);
  });

  it("throws when the fallback directory cannot be created", () => {
    expect(() =>
      resolvePreferredOpenClawTmpDir({
        accessSync: readOnlyTmpAccessSync(),
        lstatSync: vi.fn((target: string) => {
          if (target === DEFAULT_POSIX_TMP_ROOT || target === fallbackTmp()) {
            throw nodeErrorWithCode("ENOENT");
          }
          return secureDirStat();
        }),
        mkdirSync: vi.fn(() => {
          throw new Error("mkdir failed");
        }),
        chmodSync: vi.fn(),
        getuid: vi.fn(() => 501),
        tmpdir: vi.fn(() => "/var/fallback"),
        warn: vi.fn(),
      }),
    ).toThrow(/Unable to create fallback OpenClaw temp dir/);
  });

  it("still uses the POSIX preferred path on non-Windows platforms when available", () => {
    const result = resolvePreferredOpenClawTmpDir({
      platform: "linux",
      accessSync: vi.fn(),
      lstatSync: vi.fn(() => secureDirStat()),
      mkdirSync: vi.fn(),
      chmodSync: vi.fn(),
      getuid: vi.fn(() => 501),
      tmpdir: vi.fn(() => "/var/fallback"),
      warn: vi.fn(),
    });

    expect(result).toBe(DEFAULT_POSIX_TMP_ROOT);
  });
});

describe("Windows temp directory selection", () => {
  beforeEach(() => {
    vi.stubEnv("OPENCLAW_TMP_DIR", undefined);
  });

  it("skips the POSIX preferred path on Windows even when /tmp is accessible (#60713)", () => {
    // Node on Windows resolves the POSIX path `/tmp` to `C:\tmp` against the
    // current drive root. If `C:\tmp` happens to exist (Git, MSYS2, etc.
    // create it), the previous code path returned `/tmp/openclaw` and routed
    // log files / TTS temp files there instead of `%TEMP%\openclaw`. The
    // platform: "win32" branch must skip the POSIX path entirely.
    const winFallback = path.win32.join("C:\\Users\\u\\AppData\\Local\\Temp", "openclaw-501");
    const accessSync = vi.fn();
    const lstatSync = vi.fn((target: string) => {
      if (target === DEFAULT_POSIX_TMP_ROOT || target === winFallback) {
        return secureDirStat();
      }
      throw nodeErrorWithCode("ENOENT");
    });
    const mkdirSync = vi.fn();
    const chmodSync = vi.fn();
    const tmpdir = vi.fn(() => "C:\\Users\\u\\AppData\\Local\\Temp");

    const result = resolvePreferredOpenClawTmpDir({
      platform: "win32",
      accessSync,
      lstatSync,
      mkdirSync,
      chmodSync,
      getuid: vi.fn(() => 501),
      tmpdir,
      warn: vi.fn(),
    });

    expect(result).toBe(winFallback);
    expect(result).not.toBe(DEFAULT_POSIX_TMP_ROOT);
    expect(tmpdir).toHaveBeenCalled();
  });

  it("honors a drive-qualified OPENCLAW_TMP_DIR and refuses a drive-relative one", () => {
    const override = "D:\\ci\\shard-1\\openclaw-tmp";
    const tmpdir = vi.fn(() => "C:\\Users\\u\\AppData\\Local\\Temp");
    const resolve = () =>
      resolvePreferredOpenClawTmpDir({
        platform: "win32",
        accessSync: vi.fn(),
        lstatSync: vi.fn(() => secureDirStat()),
        getuid: vi.fn(() => 501),
        tmpdir,
        warn: vi.fn(),
      });

    vi.stubEnv("OPENCLAW_TMP_DIR", override);
    expect(resolve()).toBe(override);
    vi.stubEnv("OPENCLAW_TMP_DIR", "\\ci\\openclaw-tmp");
    expect(resolve).toThrow("it is not an absolute path");
    expect(tmpdir).not.toHaveBeenCalled();
  });
});

describe.skipIf(process.platform === "win32")("POSIX temp directory admission and repair", () => {
  const tempDirs = useAutoCleanupTempDirTracker((cleanup) => {
    afterEach(() => {
      vi.restoreAllMocks();
      cleanup();
    });
  });

  function fixture(route: "preferred" | "fallback") {
    const directory = tempDirs.make("openclaw-temp-repair-");
    const uid = process.getuid?.();
    if (uid === undefined) {
      throw new Error("POSIX temp directory proof requires a process uid");
    }
    const preferredDir = path.join(directory, "preferred");
    const fallbackDir = path.join(directory, `openclaw-${uid}`);
    if (route === "fallback") {
      fs.writeFileSync(preferredDir, "not a directory");
    }
    const candidate = route === "preferred" ? preferredDir : fallbackDir;
    const tmpdir = vi.fn(() => directory);
    const warn = vi.fn();
    return {
      candidate,
      fallbackDir,
      uid,
      tmpdir,
      warn,
      resolve: () => resolvePreferredOpenClawTmpDir({ preferredDir, tmpdir, warn }),
    };
  }

  it.each(["preferred", "fallback"] as const)(
    "creates a missing %s directory with private ownership and mode",
    (route) => {
      const f = fixture(route);
      expect(fs.existsSync(f.candidate)).toBe(false);

      expect(f.resolve()).toBe(f.candidate);

      expectPrivateDirectory(f.candidate, f.uid);
      if (route === "preferred") {
        expect(f.tmpdir).not.toHaveBeenCalled();
      }
    },
  );

  it.each(
    (["preferred", "fallback"] as const).flatMap((route) =>
      (["existing", "created"] as const).map((state) => ({ route, state })),
    ),
  )("repairs the same $state $route directory when its mode is too broad", ({ route, state }) => {
    const f = fixture(route);
    let admitted: fs.BigIntStats | undefined;
    const broaden = () => {
      fs.chmodSync(f.candidate, 0o775);
      admitted = fs.lstatSync(f.candidate, { bigint: true });
    };
    if (state === "existing") {
      fs.mkdirSync(f.candidate);
      broaden();
    } else {
      const mkdirSync = fs.mkdirSync;
      vi.spyOn(fs, "mkdirSync").mockImplementation((candidate, options) => {
        const created = mkdirSync(candidate, options);
        if (candidate === f.candidate) {
          // A concurrent actor broadens the new directory before final admission.
          broaden();
        }
        return created;
      });
    }

    expect(f.resolve()).toBe(f.candidate);

    expect(admitted).toBeDefined();
    expect(expectPrivateDirectory(f.candidate, f.uid)).toMatchObject({
      dev: admitted?.dev,
      ino: admitted?.ino,
    });
    expect(f.warn).toHaveBeenCalledExactlyOnceWith(
      `[openclaw] tightened permissions on temp dir: ${f.candidate}`,
    );
    if (route === "preferred") {
      expect(f.tmpdir).not.toHaveBeenCalled();
    }
  });

  it.each(["preferred", "fallback"] as const)(
    "accepts the same %s directory tightened by a competitor before repair",
    (route) => {
      const f = fixture(route);
      fs.mkdirSync(f.candidate);
      fs.chmodSync(f.candidate, 0o777);
      const admitted = fs.lstatSync(f.candidate, { bigint: true });
      const openSync = fs.openSync;
      const opened: number[] = [];
      vi.spyOn(fs, "openSync").mockImplementation((candidate, flags, mode) => {
        if (candidate === f.candidate) {
          fs.chmodSync(f.candidate, 0o700);
        }
        const fd = openSync(candidate, flags, mode);
        if (candidate === f.candidate) {
          opened.push(fd);
        }
        return fd;
      });
      const fchmod = vi.spyOn(fs, "fchmodSync");

      expect(f.resolve()).toBe(f.candidate);

      expect(opened).toHaveLength(1);
      expect(fchmod).not.toHaveBeenCalled();
      expect(expectPrivateDirectory(f.candidate, f.uid)).toMatchObject({
        dev: admitted.dev,
        ino: admitted.ino,
      });
      expect(f.warn).not.toHaveBeenCalled();
      if (route === "preferred") {
        expect(f.tmpdir).not.toHaveBeenCalled();
      }
    },
  );

  it.each(
    (
      [
        { route: "preferred", code: "EPERM" },
        { route: "fallback", code: "EACCES" },
      ] as const
    ).flatMap((params) =>
      [true, false].map((repaired) => ({ route: params.route, code: params.code, repaired })),
    ),
  )(
    "accepts failed $code repair of the $route directory only when a competitor repaired it ($repaired)",
    ({ route, code, repaired }) => {
      const f = fixture(route);
      fs.mkdirSync(f.candidate);
      fs.chmodSync(f.candidate, 0o777);
      const admitted = fs.lstatSync(f.candidate, { bigint: true });
      const fchmodSync = fs.fchmodSync;
      let attempts = 0;
      vi.spyOn(fs, "fchmodSync").mockImplementation((fd, mode) => {
        const stat = fs.fstatSync(fd, { bigint: true });
        if (stat.dev !== admitted.dev || stat.ino !== admitted.ino) {
          return fchmodSync(fd, mode);
        }
        attempts += 1;
        if (repaired) {
          // Change the real admitted inode before simulating the losing chmod.
          fchmodSync(fd, 0o700);
        }
        throw nodeErrorWithCode(code);
      });

      if (repaired) {
        expect(f.resolve()).toBe(f.candidate);
        expect(expectPrivateDirectory(f.candidate, f.uid)).toMatchObject({
          dev: admitted.dev,
          ino: admitted.ino,
        });
        if (route === "preferred") {
          expect(f.tmpdir).not.toHaveBeenCalled();
        }
      } else {
        if (route === "preferred") {
          expect(f.resolve()).toBe(f.fallbackDir);
          expectPrivateDirectory(f.fallbackDir, f.uid);
        } else {
          expect(f.resolve).toThrow(/Unsafe fallback OpenClaw temp dir/);
        }
        expect(fs.lstatSync(f.candidate, { bigint: true })).toMatchObject({
          dev: admitted.dev,
          ino: admitted.ino,
          mode: admitted.mode,
        });
      }
      expect(attempts).toBe(1);
      expect(f.warn).not.toHaveBeenCalled();
    },
  );
});

describe.skipIf(process.platform === "win32")("OPENCLAW_TMP_DIR per-process temp root", () => {
  let defaultRootWrites: string[] = [];
  const tempDirs = useAutoCleanupTempDirTracker((cleanup) => {
    afterEach(() => {
      vi.restoreAllMocks();
      cleanup();
      // Last, so a failure here cannot leave the fs spy or temp directories behind.
      expect(defaultRootWrites).toEqual([]);
    });
  });
  const currentUid = () => {
    const uid = process.getuid?.();
    if (uid === undefined) {
      throw new Error("POSIX temp directory proof requires a process uid");
    }
    return uid;
  };
  const physicalPath = (target: string) => {
    const tail = [path.basename(target)];
    for (let directory = path.dirname(target); ; directory = path.dirname(directory)) {
      try {
        return path.join(fs.realpathSync.native(directory), ...tail);
      } catch {
        if (directory === path.dirname(directory)) {
          return target;
        }
        tail.unshift(path.basename(directory));
      }
    }
  };
  beforeEach(() => {
    // Nothing here may create a default temp root or anything in it, even if the override
    // were ignored. The resolver creates directories through fs.mkdirSync.
    defaultRootWrites = [];
    const defaultRoots = [DEFAULT_POSIX_TMP_ROOT, `${DEFAULT_POSIX_TMP_ROOT}-${currentUid()}`].map(
      physicalPath,
    );
    const mkdirSync = fs.mkdirSync;
    vi.spyOn(fs, "mkdirSync").mockImplementation((target, options) => {
      const physical = physicalPath(path.resolve(String(target)));
      if (defaultRoots.some((root) => physical === root || physical.startsWith(`${root}/`))) {
        defaultRootWrites.push(physical);
        throw nodeErrorWithCode("EACCES");
      }
      return mkdirSync(target, options);
    });
  });

  it.each(["missing", "existing"] as const)(
    "resolves a %s override as a private root without falling back",
    (state) => {
      const root = tempDirs.make("openclaw-tmp-override-");
      // A setgid TMPDIR would pass its bit to the roots made here; they are plain 0700.
      fs.chmodSync(root, 0o700);
      const override = path.join(root, "shard-1");
      if (state === "existing") {
        fs.mkdirSync(override, { mode: 0o700 });
      }
      vi.stubEnv("OPENCLAW_TMP_DIR", override);
      const tmpdir = vi.fn(() => root);
      const warn = vi.fn();

      expect(resolvePreferredOpenClawTmpDir({ tmpdir, warn })).toBe(override);

      expectPrivateDirectory(override, currentUid());
      expect(fs.readdirSync(root)).toEqual(["shard-1"]);
      expect(tmpdir).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it.each<{
    name: string;
    arrange: (
      root: string,
      uid: number,
    ) => { value: string; reason: string; options?: TmpDirOptions; check?: () => void };
  }>([
    { name: "an empty value", arrange: () => ({ value: "", reason: "it is empty" }) },
    {
      name: "a relative path",
      arrange: () => ({ value: "relative/openclaw-tmp", reason: "it is not an absolute path" }),
    },
    {
      name: "the shared root",
      arrange: () => ({
        value: DEFAULT_POSIX_TMP_ROOT,
        reason: `it is the default temp root ${DEFAULT_POSIX_TMP_ROOT}`,
      }),
    },
    {
      name: "a directory inside the shared root",
      arrange: () => ({
        value: `${DEFAULT_POSIX_TMP_ROOT}/shard-1`,
        reason: `it is inside the default temp root ${DEFAULT_POSIX_TMP_ROOT}`,
      }),
    },
    {
      name: "a parent of the shared root",
      arrange: () => ({
        value: path.dirname(DEFAULT_POSIX_TMP_ROOT),
        reason: `it contains the default temp root ${DEFAULT_POSIX_TMP_ROOT}`,
      }),
    },
    {
      name: "the per-user fallback root",
      arrange: (_root, uid) => ({
        value: `${DEFAULT_POSIX_TMP_ROOT}-${uid}`,
        reason: `it is the default temp root ${DEFAULT_POSIX_TMP_ROOT}-${uid}`,
      }),
    },
    {
      name: "the shared root reached through a symlinked parent",
      arrange: (root) => {
        fs.symlinkSync(path.dirname(DEFAULT_POSIX_TMP_ROOT), path.join(root, "tmp-link"));
        return {
          value: path.join(root, "tmp-link", path.basename(DEFAULT_POSIX_TMP_ROOT)),
          reason: `it is the default temp root ${DEFAULT_POSIX_TMP_ROOT}`,
        };
      },
    },
    {
      name: "a symlink",
      arrange: (root) => {
        fs.mkdirSync(path.join(root, "private"), { mode: 0o700 });
        fs.symlinkSync(path.join(root, "private"), path.join(root, "link"));
        return { value: path.join(root, "link"), reason: "it is a symbolic link" };
      },
    },
    {
      name: "a file",
      arrange: (root) => {
        fs.writeFileSync(path.join(root, "file"), "");
        return { value: path.join(root, "file"), reason: "it is not a directory" };
      },
    },
    {
      name: "a directory another user owns",
      arrange: (root, uid) => {
        fs.mkdirSync(path.join(root, "foreign"), { mode: 0o700 });
        return {
          value: path.join(root, "foreign"),
          options: { getuid: () => uid + 1 },
          reason: `it is owned by uid ${uid}, not the current user (uid ${uid + 1})`,
        };
      },
    },
    {
      name: "a directory other users can write",
      arrange: (root) => {
        const value = path.join(root, "shared");
        fs.mkdirSync(value);
        fs.chmodSync(value, 0o777);
        return {
          value,
          reason: "other users can write to it (mode 777), and OpenClaw never repairs an override",
          check: () => expect(fs.statSync(value).mode & 0o7777).toBe(0o777),
        };
      },
    },
    {
      name: "a directory the current user cannot write",
      arrange: (root) => {
        fs.mkdirSync(path.join(root, "locked"), { mode: 0o700 });
        return {
          value: path.join(root, "locked"),
          options: {
            accessSync: () => {
              throw nodeErrorWithCode("EACCES");
            },
          },
          reason: "the current user cannot write to it",
        };
      },
    },
    {
      name: "a path below a file",
      arrange: (root) => {
        fs.writeFileSync(path.join(root, "file"), "");
        return {
          value: path.join(root, "file", "openclaw-tmp"),
          reason: "it cannot be inspected (ENOTDIR)",
        };
      },
    },
    {
      name: "a directory whose parent is missing",
      arrange: (root) => ({
        value: path.join(root, "missing", "openclaw-tmp"),
        reason:
          "it could not be created as a private directory; its parent must exist and be writable by the current user",
        check: () => expect(fs.existsSync(path.join(root, "missing"))).toBe(false),
      }),
    },
  ])("refuses $name without falling back", ({ arrange }) => {
    const root = tempDirs.make("openclaw-tmp-override-");
    const { value, reason, options, check } = arrange(root, currentUid());
    const before = fs.readdirSync(root).toSorted();
    vi.stubEnv("OPENCLAW_TMP_DIR", value);
    const tmpdir = vi.fn(() => root);

    expect(() => resolvePreferredOpenClawTmpDir({ ...options, tmpdir })).toThrow(
      `OpenClaw refused OPENCLAW_TMP_DIR=${JSON.stringify(value)}: ${reason}.`,
    );

    expect(tmpdir).not.toHaveBeenCalled();
    expect(fs.readdirSync(root).toSorted()).toEqual(before);
    check?.();
  });

  it("gives concurrent processes separate roots that never share children", async () => {
    const root = tempDirs.make("openclaw-tmp-override-");
    const probe = path.join(root, "resolve-temp-root.mjs");
    fs.writeFileSync(
      probe,
      `import fs from "node:fs";
import path from "node:path";
const defaultRoots = [${JSON.stringify(DEFAULT_POSIX_TMP_ROOT)}, ${JSON.stringify(`${DEFAULT_POSIX_TMP_ROOT}-${currentUid()}`)}];
// Fail rather than write into a default temp root if the override were ignored.
for (const name of ["mkdirSync", "mkdtempSync"]) {
  const original = fs[name];
  fs[name] = (target, ...rest) => {
    const resolved = path.resolve(String(target));
    if (defaultRoots.some((dir) => resolved === dir || resolved.startsWith(dir + "/"))) {
      throw new Error("refused to write under " + resolved);
    }
    return original(target, ...rest);
  };
}
const { resolvePreferredOpenClawTmpDir } = await import(${JSON.stringify(pathToFileURL(path.resolve("src/infra/tmp-openclaw-dir.ts")).href)});
const tempRoot = resolvePreferredOpenClawTmpDir();
const child = fs.mkdtempSync(path.join(tempRoot, "child-"));
process.stdout.write(JSON.stringify({ tempRoot, child }));
`,
    );
    const run = async (shard: string) => {
      const override = path.join(root, shard, "openclaw-tmp");
      fs.mkdirSync(path.dirname(override), { mode: 0o700 });
      const { stdout } = await promisify(execFile)(
        process.execPath,
        ["--import", path.resolve("scripts/tsx.mjs"), probe],
        { env: { ...process.env, NODE_OPTIONS: "", OPENCLAW_TMP_DIR: override } },
      );
      return { override, ...(JSON.parse(stdout) as { tempRoot: string; child: string }) };
    };

    const shards = await Promise.all([run("shard-1"), run("shard-2")]);

    for (const shard of shards) {
      expect(shard.tempRoot).toBe(shard.override);
      expect(path.dirname(shard.child)).toBe(shard.override);
      expect(fs.readdirSync(shard.override)).toEqual([path.basename(shard.child)]);
      expectPrivateDirectory(shard.override, currentUid());
    }
  });
});
