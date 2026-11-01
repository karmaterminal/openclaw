import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";

const scopeWarn = vi.hoisted(() => vi.fn());
vi.mock("../logging/subsystem.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../logging/subsystem.js")>();
  const { createMockSubsystemLogger } = await import("../../test/helpers/mock-subsystem-logger.js");
  return {
    ...actual,
    createSubsystemLogger: (subsystem: string) =>
      createMockSubsystemLogger(
        subsystem,
        subsystem === "process/child-scope" ? { warn: scopeWarn } : {},
      ),
  };
});

const tempDirs = useAutoCleanupTempDirTracker(afterEach);
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const shell = ["/bin/sh", ["-c", "exit 0"]] as const;

/** Stands in for systemd-run --scope: records its argv, then execs the command in place. */
function installFakeSystemdRun(mode: "exec" | "fail" = "exec") {
  const dir = tempDirs.make("openclaw-child-scope-bin-");
  const log = path.join(dir, "invocations.log");
  const bin = path.join(dir, "systemd-run");
  fs.writeFileSync(
    bin,
    [
      "#!/bin/sh",
      `printf '%s\\n' "$*" >> '${log}'`,
      mode === "fail"
        ? 'echo "Failed to start transient scope unit: Access denied" >&2; exit 1'
        : 'while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done; shift; exec "$@"',
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  vi.stubEnv("PATH", `${dir}${path.delimiter}${process.env.PATH ?? ""}`);
  return {
    bin,
    invocations: () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : []),
  };
}

// The scope caches its probe per process; each case starts from a fresh module graph.
async function loadScope(config: OpenClawConfig) {
  vi.resetModules();
  const snapshot = await import("../config/runtime-snapshot.js");
  snapshot.setRuntimeConfigSnapshot(config);
  const scope = await import("./child-memory-scope.js");
  return (
    command: string,
    args: readonly string[],
    options: { env?: NodeJS.ProcessEnv; argv0?: string } = {},
  ) => scope.prepareChildMemoryScopedSpawn(command, args, { env: process.env, ...options });
}

beforeEach(() => {
  scopeWarn.mockReset();
  vi.stubEnv("XDG_RUNTIME_DIR", "/run/user/openclaw-test");
});

afterEach(async () => {
  Object.defineProperty(process, "platform", originalPlatform);
  (await import("../config/runtime-snapshot.js")).clearRuntimeConfigSnapshot();
  vi.unstubAllEnvs();
});

it.skipIf(process.platform !== "linux").each([
  { name: "omitted", config: {} },
  { name: "disabled", config: { process: { childScope: { enabled: false, memoryMax: "1G" } } } },
])("leaves heavy spawns unchanged and never probes when the scope is $name", async ({ config }) => {
  const fake = installFakeSystemdRun();
  const prepare = await loadScope(config);

  await expect(prepare(...shell)).resolves.toEqual({
    command: "/bin/sh",
    args: ["-c", "exit 0"],
    scoped: false,
  });
  expect(fake.invocations()).toEqual([]);
  expect(scopeWarn).not.toHaveBeenCalled();
});

it.skipIf(process.platform !== "linux").each([
  { childScope: { enabled: true }, memoryMax: "5G", memorySwapMax: "2G" },
  {
    childScope: { enabled: true, memoryMax: "3G", memorySwapMax: "0" },
    memoryMax: "3G",
    memorySwapMax: "0",
  },
])(
  "wraps heavy spawns in a capped user scope (MemoryMax=$memoryMax, MemorySwapMax=$memorySwapMax)",
  async ({ childScope, memoryMax, memorySwapMax }) => {
    const fake = installFakeSystemdRun();
    const prepare = await loadScope({ process: { childScope } });
    const wrapped = {
      command: fake.bin,
      args: [
        "--user",
        "--scope",
        "--quiet",
        "--collect",
        "--description=OpenClaw heavy child",
        "-p",
        `MemoryMax=${memoryMax}`,
        "-p",
        `MemorySwapMax=${memorySwapMax}`,
        "--",
        "/bin/sh",
        "-c",
        "exit 0",
      ],
      scoped: true,
    };

    await expect(prepare(...shell)).resolves.toEqual(wrapped);
    await expect(prepare(...shell)).resolves.toEqual(wrapped);
    // One real probe scope per process, never one per spawn.
    expect(fake.invocations()).toEqual(["--user --scope --quiet --collect -- true"]);
    expect(scopeWarn).not.toHaveBeenCalled();
  },
);

it.each([
  {
    reason: "not Linux (darwin)",
    arrange: () => Object.defineProperty(process, "platform", { value: "darwin" }),
  },
  {
    reason: "systemd-run is not on PATH",
    arrange: () => vi.stubEnv("PATH", tempDirs.make("openclaw-child-scope-empty-path-")),
  },
  {
    reason: "no user systemd bus (XDG_RUNTIME_DIR and DBUS_SESSION_BUS_ADDRESS are unset)",
    arrange: () => {
      installFakeSystemdRun();
      vi.stubEnv("XDG_RUNTIME_DIR", undefined);
      vi.stubEnv("DBUS_SESSION_BUS_ADDRESS", undefined);
    },
  },
  {
    reason: "systemd-run probe failed: Failed to start transient scope unit: Access denied",
    arrange: () => installFakeSystemdRun("fail"),
  },
])(
  "spawns plain with exactly one warning when the scope is unavailable: $reason",
  async ({ reason, arrange }) => {
    arrange();
    const prepare = await loadScope({ process: { childScope: { enabled: true } } });

    for (let spawn = 0; spawn < 2; spawn += 1) {
      await expect(prepare(...shell)).resolves.toEqual({
        command: "/bin/sh",
        args: ["-c", "exit 0"],
        scoped: false,
      });
    }
    expect(scopeWarn.mock.calls).toEqual([
      [`child memory scope unavailable: ${reason}; heavy children share the gateway cgroup`],
    ]);
  },
);

it.skipIf(process.platform !== "linux")(
  "keeps a spawn plain when its child could not start through systemd-run",
  async () => {
    installFakeSystemdRun();
    const prepare = await loadScope({ process: { childScope: { enabled: true } } });

    // systemd-run would exit 1 before the command: no user-bus route in the child env…
    for (let spawn = 0; spawn < 2; spawn += 1) {
      await expect(prepare(...shell, { env: { PATH: process.env.PATH } })).resolves.toMatchObject({
        command: "/bin/sh",
        scoped: false,
      });
    }
    // …or a command its PATH cannot resolve, whose owner expects the native ENOENT.
    await expect(prepare("openclaw-child-scope-missing-command", [])).resolves.toMatchObject({
      command: "openclaw-child-scope-missing-command",
      scoped: false,
    });
    expect(scopeWarn.mock.calls).toEqual([
      [
        "child memory scope skipped: the child environment has no XDG_RUNTIME_DIR or DBUS_SESSION_BUS_ADDRESS; those children share the gateway cgroup",
      ],
    ]);
  },
);

it.skipIf(process.platform !== "linux")(
  "never changes a distinct argv[0], which systemd-run cannot preserve",
  async () => {
    installFakeSystemdRun();
    const prepare = await loadScope({ process: { childScope: { enabled: true } } });

    for (let spawn = 0; spawn < 2; spawn += 1) {
      await expect(prepare(...shell, { argv0: "/opt/shims/sh" })).resolves.toEqual({
        command: "/bin/sh",
        args: ["-c", "exit 0"],
        scoped: false,
      });
    }
    await expect(prepare(...shell, { argv0: "/bin/sh" })).resolves.toMatchObject({
      scoped: true,
    });
    expect(scopeWarn.mock.calls).toEqual([
      [
        "child memory scope skipped: systemd-run cannot keep a distinct argv[0]; those children share the gateway cgroup",
      ],
    ]);
  },
);
