import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";

const scopeWarn = vi.hoisted(() => vi.fn());
const procSelfCgroup = vi.hoisted(() => ({ text: "" }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  // This process's cgroup is host state: each case supplies the line the kernel would report.
  const readFile = vi.fn((...args: Parameters<typeof actual.readFile>) =>
    args[0] === "/proc/self/cgroup"
      ? Promise.resolve(procSelfCgroup.text)
      : actual.readFile(...args),
  );
  return { ...actual, readFile, default: { ...actual, readFile } };
});
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
const uid = process.getuid?.() ?? 0;
const userApps = `/user.slice/user-${uid}.slice/user@${uid}.service/app.slice`;
const gatewayUnit = "openclaw-gateway.service";
const binding = (unit: string) => [
  "-p",
  `BindsTo=${unit}`,
  "-p",
  `Before=${unit}`,
  "-p",
  `StopPropagatedFrom=${unit}`,
];
const launcherArgs = (unit?: string, memoryMax = "5G", memorySwapMax = "2G") => [
  "--user",
  "--scope",
  "--quiet",
  "--collect",
  "--description=OpenClaw heavy child",
  "-p",
  `MemoryMax=${memoryMax}`,
  "-p",
  `MemorySwapMax=${memorySwapMax}`,
  ...(unit ? binding(unit) : []),
  "--",
];

/** Stands in for systemd-run --scope: records its argv, then execs the command in place. */
function installFakeSystemdRun(mode: "exec" | "fail" | "reject-properties" = "exec") {
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
        : mode === "reject-properties"
          ? 'case " $* " in *" -p "*) echo "Unknown assignment: MemorySwapMax=2G" >&2; exit 1;; esac'
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

/** Stands in for the user manager's `systemctl --user show`: records its argv, then answers. */
function installFakeSystemctl(reply: string, exitCode = 0) {
  const dir = tempDirs.make("openclaw-child-scope-systemctl-");
  const log = path.join(dir, "invocations.log");
  fs.writeFileSync(path.join(dir, "reply"), reply);
  fs.writeFileSync(
    path.join(dir, "systemctl"),
    [
      "#!/bin/sh",
      `printf '%s\\n' "$*" >> '${log}'`,
      exitCode === 0 ? `cat '${dir}/reply'` : `cat '${dir}/reply' >&2; exit ${exitCode}`,
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  vi.stubEnv("PATH", `${dir}${path.delimiter}${process.env.PATH ?? ""}`);
  return {
    invocations: () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : []),
  };
}

/** This process sits in `cgroup`; the user manager reports `controlGroup` for the unit. */
function arrangeOwner(cgroup: string, controlGroup?: string) {
  procSelfCgroup.text = `${cgroup}\n`;
  return installFakeSystemctl(`ControlGroup=${controlGroup ?? ""}\n`);
}

const ownerUnverified = (reason: string) =>
  `child memory scope: owning unit not verified (${reason}); scoped children will outlive a hard gateway stop`;

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

let systemctl: ReturnType<typeof installFakeSystemctl>;

beforeEach(() => {
  scopeWarn.mockReset();
  vi.stubEnv("XDG_RUNTIME_DIR", "/run/user/openclaw-test");
  // By default this process is in the Gateway's own user service, as in production.
  systemctl = arrangeOwner(`0::${userApps}/${gatewayUnit}`, `${userApps}/${gatewayUnit}`);
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
    const launcher = launcherArgs(gatewayUnit, memoryMax, memorySwapMax);
    const wrapped = {
      command: fake.bin,
      args: [...launcher, "/bin/sh", "-c", "exit 0"],
      scoped: true,
    };

    await expect(prepare(...shell)).resolves.toEqual(wrapped);
    await expect(prepare(...shell)).resolves.toEqual(wrapped);
    // One real probe scope and one owner check per process, never one per spawn; the probe
    // carries exactly the launch properties.
    expect(fake.invocations()).toEqual([`${launcher.join(" ")} true`]);
    expect(systemctl.invocations()).toEqual([
      `--user show --property=ControlGroup -- ${gatewayUnit}`,
    ]);
    expect(scopeWarn).not.toHaveBeenCalled();
  },
);

it.skipIf(process.platform !== "linux").each([
  {
    name: "profile",
    cgroup: `${userApps}/openclaw-gateway-work.service`,
    unit: "openclaw-gateway-work.service",
  },
  { name: "custom", cgroup: `${userApps}/frond-gateway.service`, unit: "frond-gateway.service" },
  {
    // The user manager places template instances in an implicit app-<template>.slice.
    name: "templated",
    cgroup: `${userApps}/app-openclaw\\x2dgateway.slice/openclaw-gateway@work.service`,
    unit: "openclaw-gateway@work.service",
  },
  {
    name: "delegated sub-cgroup",
    cgroup: `${userApps}/${gatewayUnit}/payload`,
    controlGroup: `${userApps}/${gatewayUnit}`,
    unit: gatewayUnit,
  },
])(
  "binds each scope to the owning unit the user manager confirms: $name",
  async ({ cgroup, controlGroup, unit }) => {
    const fake = installFakeSystemdRun();
    const owner = arrangeOwner(`0::${cgroup}`, controlGroup ?? cgroup);
    const prepare = await loadScope({ process: { childScope: { enabled: true } } });

    await expect(prepare(...shell)).resolves.toEqual({
      command: fake.bin,
      args: [...launcherArgs(unit), "/bin/sh", "-c", "exit 0"],
      scoped: true,
    });
    expect(fake.invocations()).toEqual([`${launcherArgs(unit).join(" ")} true`]);
    expect(owner.invocations()).toEqual([`--user show --property=ControlGroup -- ${unit}`]);
    expect(scopeWarn).not.toHaveBeenCalled();
  },
);

it.skipIf(process.platform !== "linux")(
  "reads unit membership from the named systemd hierarchy on hybrid hosts",
  async () => {
    installFakeSystemdRun();
    const owner = arrangeOwner(
      [
        `12:memory:/user.slice/user-${uid}.slice/user@${uid}.service`,
        `1:name=systemd:${userApps}/${gatewayUnit}`,
        `0::/user.slice/user-${uid}.slice/user@${uid}.service`,
      ].join("\n"),
      `${userApps}/${gatewayUnit}`,
    );
    const prepare = await loadScope({ process: { childScope: { enabled: true } } });

    await expect(prepare(...shell)).resolves.toMatchObject({
      args: [...launcherArgs(gatewayUnit), "/bin/sh", "-c", "exit 0"],
    });
    expect(owner.invocations()).toEqual([`--user show --property=ControlGroup -- ${gatewayUnit}`]);
  },
);

it.skipIf(process.platform !== "linux").each([
  { name: "a system service", cgroup: `/system.slice/${gatewayUnit}` },
  {
    name: "another user's service",
    cgroup: `/user.slice/user-${uid + 1}.slice/user@${uid + 1}.service/app.slice/${gatewayUnit}`,
  },
  { name: "a transient scope", cgroup: `${userApps}/run-r0123456789abcdef.scope` },
  { name: "a login session", cgroup: `/user.slice/user-${uid}.slice/session-3.scope` },
  { name: "the container root", cgroup: "/" },
])("scopes without a binding, warning once, for a process in $name", async ({ cgroup }) => {
  installFakeSystemdRun();
  const owner = arrangeOwner(`0::${cgroup}`, cgroup);
  const prepare = await loadScope({ process: { childScope: { enabled: true } } });

  for (let spawn = 0; spawn < 2; spawn += 1) {
    await expect(prepare(...shell)).resolves.toMatchObject({
      args: [...launcherArgs(), "/bin/sh", "-c", "exit 0"],
      scoped: true,
    });
  }
  expect(owner.invocations()).toEqual([]);
  expect(scopeWarn.mock.calls).toEqual([
    [ownerUnverified(`cgroup ${cgroup} is not a service under user@${uid}.service`)],
  ]);
});

it.skipIf(process.platform !== "linux").each([
  {
    name: "the unit's cgroup is elsewhere",
    reply: `ControlGroup=${userApps}/other-gateway.service\n`,
    reason: `the user manager reports ${gatewayUnit} at ${userApps}/other-gateway.service, not this process's cgroup`,
  },
  {
    // systemctl show answers an unknown or inactive unit with an empty ControlGroup.
    name: "the unit has no cgroup",
    reply: "ControlGroup=\n",
    reason: `the user manager reports ${gatewayUnit} at no cgroup, not this process's cgroup`,
  },
  {
    name: "systemctl fails",
    reply: "Failed to connect to bus: No such file or directory\n",
    exitCode: 1,
    reason: `systemctl --user show ${gatewayUnit} failed: Failed to connect to bus: No such file or directory`,
  },
])("refuses the binding when $name, and still scopes", async ({ reply, exitCode, reason }) => {
  const fake = installFakeSystemdRun();
  procSelfCgroup.text = `0::${userApps}/${gatewayUnit}\n`;
  installFakeSystemctl(reply, exitCode);
  const prepare = await loadScope({ process: { childScope: { enabled: true } } });

  for (let spawn = 0; spawn < 2; spawn += 1) {
    await expect(prepare(...shell)).resolves.toEqual({
      command: fake.bin,
      args: [...launcherArgs(), "/bin/sh", "-c", "exit 0"],
      scoped: true,
    });
  }
  expect(fake.invocations()).toEqual([`${launcherArgs().join(" ")} true`]);
  expect(scopeWarn.mock.calls).toEqual([[ownerUnverified(reason)]]);
});

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
  {
    // The probe carries the launch properties, so a manager that rejects them never wraps.
    reason: "systemd-run probe failed: Unknown assignment: MemorySwapMax=2G",
    arrange: () => installFakeSystemdRun("reject-properties"),
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
