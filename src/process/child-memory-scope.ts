import fs from "node:fs/promises";
import { getRuntimeConfigSnapshot } from "../config/runtime-snapshot.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { parseKeyValueOutput } from "../daemon/runtime-parse.js";
import { resolveExecutablePath } from "../infra/executable-path.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { runUtf8CommandWithTimeout } from "./exec-runner.js";

/**
 * systemd-oomd kills a whole cgroup, so heavy children in the Gateway's user unit take the
 * Gateway down with them (#1512). With process.childScope enabled, owners of heavy children
 * (host exec, code-agent CLIs, Codex app-server) launch them through `systemd-run --user
 * --scope`, which moves the process into its own capped scope and then execs the command in
 * place: the pid, process group, stdio, signals and exit status stay the command's own.
 * Internal workers (spawn broker, SQLite and plugin workers) never call this and stay in the unit.
 *
 * A scoped child sits outside the Gateway unit's cgroup, so the unit's own stop no longer reaches
 * it. When the user manager confirms which service holds this process, every scope is bound to
 * that unit and stops with it; otherwise (a CLI, or an unverified owner) only OpenClaw's own
 * cancellation and restart orphan cleanup end it.
 */

const DEFAULT_MEMORY_MAX = "5G";
const DEFAULT_MEMORY_SWAP_MAX = "2G";
const PROBE_TIMEOUT_MS = 5_000;
const SCOPE_DESCRIPTION = "OpenClaw heavy child";

const log = createSubsystemLogger("process/child-scope");

/** The service whose stop should end this process's scoped children, or why there is none. */
type OwningUnit = { unit: string } | { reason: string };

export type ChildMemoryScopeAvailability =
  | { available: true; systemdRun: string; launcherArgs: readonly string[]; owner: OwningUnit }
  | { available: false; reason: string };

export type ChildMemoryScopedSpawn = { command: string; args: string[]; scoped: boolean };
type ChildScopeConfig = NonNullable<NonNullable<OpenClawConfig["process"]>["childScope"]>;

/** The probe and every launch share one argv, so the probe proves the properties launches set. */
function scopeLauncherArgs(config: ChildScopeConfig, owner: OwningUnit): string[] {
  return [
    "--user",
    "--scope",
    "--quiet",
    "--collect",
    // systemd otherwise describes the scope with the full command line, which would put
    // tool commands (and any secrets in them) into the user journal on every spawn.
    `--description=${SCOPE_DESCRIPTION}`,
    "-p",
    `MemoryMax=${config.memoryMax ?? DEFAULT_MEMORY_MAX}`,
    "-p",
    `MemorySwapMax=${config.memorySwapMax ?? DEFAULT_MEMORY_SWAP_MAX}`,
    // Stop with the owning unit on stop, restart or death. BindsTo= alone misses `systemctl
    // restart`: a scope cannot restart, so systemd drops the restart it propagates, stop and all.
    // StopPropagatedFrom= (systemd 249+) carries that stop. Before= keeps the unit's
    // KillMode=mixed order: the Gateway drains with its children alive and the scopes stop once
    // it exits. None of these lets a scope's stop or OOM kill reach the unit.
    ...("unit" in owner
      ? [
          "-p",
          `BindsTo=${owner.unit}`,
          "-p",
          `Before=${owner.unit}`,
          "-p",
          `StopPropagatedFrom=${owner.unit}`,
        ]
      : []),
    "--",
  ];
}

/** Runs one user-manager command: its stdout, or the first line of why it failed. */
async function runManagerCommand(
  argv: string[],
): Promise<{ ok: true; stdout: string } | { ok: false; detail: string }> {
  try {
    const result = await runUtf8CommandWithTimeout(argv, { timeoutMs: PROBE_TIMEOUT_MS });
    if (result.termination === "exit" && result.code === 0) {
      return { ok: true, stdout: result.stdout };
    }
    const detail =
      result.stderr.trim().split("\n")[0] ||
      (result.termination === "exit" ? `exit code ${result.code}` : result.termination);
    return { ok: false, detail };
  } catch (error) {
    return { ok: false, detail: String(error) };
  }
}

// Unit-name characters only, so a cgroup segment can never reach systemctl as a glob.
const SERVICE_UNIT_NAME = /^[\w:.\\@-]+\.service$/;

/**
 * The user service whose cgroup holds this process, once its manager confirms it. A process in a
 * scope or login session (a CLI in a terminal) has no service whose stop should end its children.
 * Any process inside the service's cgroup counts, not just its main process: the cgroup would have
 * taken the child down with the unit before the scope moved it out.
 */
async function resolveOwningUnit(): Promise<OwningUnit> {
  const lines = (await fs.readFile("/proc/self/cgroup", "utf8").catch(() => "")).split("\n");
  // Hybrid hosts track units in the named systemd hierarchy, unified hosts in 0::.
  const entry =
    lines.find((line) => line.split(":")[1]?.split(",").includes("name=systemd")) ??
    lines.find((line) => line.startsWith("0::"));
  const cgroup = entry?.slice(entry.indexOf(":", entry.indexOf(":") + 1) + 1) || "(none)";
  const segments = cgroup.split("/");
  const manager = `user@${process.getuid?.()}.service`;
  const managerIndex = segments.indexOf(manager);
  // The user manager places template instances in an implicit app-<template>.slice.
  const unitIndex =
    managerIndex < 0
      ? -1
      : segments.findIndex((segment, index) => index > managerIndex && !segment.endsWith(".slice"));
  const unit = segments[unitIndex];
  if (!unit || !SERVICE_UNIT_NAME.test(unit)) {
    return { reason: `cgroup ${cgroup} is not a service under ${manager}` };
  }
  const systemctl = resolveExecutablePath("systemctl", { useCache: false });
  if (!systemctl) {
    return { reason: "systemctl is not on PATH" };
  }
  const show = await runManagerCommand([
    systemctl,
    "--user",
    "show",
    "--property=ControlGroup",
    "--",
    unit,
  ]);
  if (!show.ok) {
    return { reason: `systemctl --user show ${unit} failed: ${show.detail}` };
  }
  const controlGroup = parseKeyValueOutput(show.stdout, "=").controlgroup;
  return controlGroup === segments.slice(0, unitIndex + 1).join("/")
    ? { unit }
    : {
        reason: `the user manager reports ${unit} at ${controlGroup || "no cgroup"}, not this process's cgroup`,
      };
}

// systemd-run --user reaches the user manager through either variable.
function hasUserBusRoute(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.DBUS_SESSION_BUS_ADDRESS?.trim() || env.XDG_RUNTIME_DIR?.trim());
}

export function formatChildMemoryScopeUnavailable(reason: string): string {
  return `child memory scope unavailable: ${reason}; heavy children share the gateway cgroup`;
}

/** Uncached host check for this process's environment; the spawn path caches its own result. */
export async function probeChildMemoryScope(
  config: ChildScopeConfig,
): Promise<ChildMemoryScopeAvailability> {
  if (process.platform !== "linux") {
    return { available: false, reason: `not Linux (${process.platform})` };
  }
  const systemdRun = resolveExecutablePath("systemd-run", { useCache: false });
  if (!systemdRun) {
    return { available: false, reason: "systemd-run is not on PATH" };
  }
  if (!hasUserBusRoute(process.env)) {
    return {
      available: false,
      reason: "no user systemd bus (XDG_RUNTIME_DIR and DBUS_SESSION_BUS_ADDRESS are unset)",
    };
  }
  const owner = await resolveOwningUnit();
  const launcherArgs = scopeLauncherArgs(config, owner);
  // Start and collect one real scope with the launch properties: the user manager must answer
  // and accept them. A manager restarted after this probe restarts the Gateway unit with it.
  const probe = await runManagerCommand([systemdRun, ...launcherArgs, "true"]);
  return probe.ok
    ? { available: true, systemdRun, launcherArgs, owner }
    : { available: false, reason: `systemd-run probe failed: ${probe.detail}` };
}

let availability: Promise<ChildMemoryScopeAvailability> | undefined;

/**
 * Probe once per process; an unavailable scope is logged once and every spawn stays plain.
 * Size changes restart the Gateway (process.* has no hot-reload rule), so one probe suffices.
 */
function resolveChildMemoryScopeAvailability(
  config: ChildScopeConfig,
): Promise<ChildMemoryScopeAvailability> {
  return (availability ??= probeChildMemoryScope(config).then((result) => {
    if (!result.available) {
      log.warn(formatChildMemoryScopeUnavailable(result.reason));
    } else if ("reason" in result.owner) {
      log.warn(
        `child memory scope: owning unit not verified (${result.owner.reason}); scoped children will outlive a hard gateway stop`,
      );
    }
    return result;
  }));
}

const loggedSkips = new Set<string>();

function skipChildMemoryScope(reason: string): void {
  if (!loggedSkips.has(reason)) {
    loggedSkips.add(reason);
    log.warn(`child memory scope skipped: ${reason}; those children share the gateway cgroup`);
  }
}

/** Heavy-child owners call this right before native spawn; internal workers never do. */
export async function prepareChildMemoryScopedSpawn(
  command: string,
  args: readonly string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string; argv0?: string } = {},
): Promise<ChildMemoryScopedSpawn> {
  const plain = { command, args: [...args], scoped: false };
  const config = getRuntimeConfigSnapshot()?.process?.childScope;
  if (config?.enabled !== true) {
    return plain;
  }
  const scope = await resolveChildMemoryScopeAvailability(config);
  if (!scope.available) {
    return plain;
  }
  // systemd-run execvp's the command as argv[0], reaches the user manager through the child's
  // environment, and resolves the command from the child's PATH. A spawn that would change
  // argv[0] or exit 1 before its command starts stays plain; an unresolvable command also keeps
  // its owner's native ENOENT.
  if (options.argv0 !== undefined && options.argv0 !== command) {
    skipChildMemoryScope("systemd-run cannot keep a distinct argv[0]");
    return plain;
  }
  if (!hasUserBusRoute(options.env ?? process.env)) {
    skipChildMemoryScope(
      "the child environment has no XDG_RUNTIME_DIR or DBUS_SESSION_BUS_ADDRESS",
    );
    return plain;
  }
  if (!resolveExecutablePath(command, { env: options.env, cwd: options.cwd })) {
    return plain;
  }
  return {
    command: scope.systemdRun,
    args: [...scope.launcherArgs, command, ...args],
    scoped: true,
  };
}
