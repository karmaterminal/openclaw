import { getRuntimeConfigSnapshot } from "../config/runtime-snapshot.js";
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
 * A scoped child sits outside the Gateway unit, so stopping the unit no longer kills it through
 * the cgroup. OpenClaw's own cancellation and restart orphan cleanup still own it.
 */

const DEFAULT_MEMORY_MAX = "5G";
const DEFAULT_MEMORY_SWAP_MAX = "2G";
const PROBE_TIMEOUT_MS = 5_000;

const log = createSubsystemLogger("process/child-scope");

export type ChildMemoryScopeAvailability =
  | { available: true; systemdRun: string }
  | { available: false; reason: string };

export type ChildMemoryScopedSpawn = { command: string; args: string[]; scoped: boolean };

// systemd-run --user reaches the user manager through either variable.
function hasUserBusRoute(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.DBUS_SESSION_BUS_ADDRESS?.trim() || env.XDG_RUNTIME_DIR?.trim());
}

export function formatChildMemoryScopeUnavailable(reason: string): string {
  return `child memory scope unavailable: ${reason}; heavy children share the gateway cgroup`;
}

/** Uncached host check for this process's environment; the spawn path caches its own result. */
export async function probeChildMemoryScope(): Promise<ChildMemoryScopeAvailability> {
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
  // Start and collect one real scope: the user manager must answer and accept transient scopes.
  try {
    const result = await runUtf8CommandWithTimeout(
      [systemdRun, "--user", "--scope", "--quiet", "--collect", "--", "true"],
      { timeoutMs: PROBE_TIMEOUT_MS },
    );
    if (result.termination === "exit" && result.code === 0) {
      return { available: true, systemdRun };
    }
    const detail =
      result.stderr.trim().split("\n")[0] ||
      (result.termination === "exit" ? `exit code ${result.code}` : result.termination);
    return { available: false, reason: `systemd-run probe failed: ${detail}` };
  } catch (error) {
    return { available: false, reason: `systemd-run probe failed: ${String(error)}` };
  }
}

let availability: Promise<ChildMemoryScopeAvailability> | undefined;

/** Probe once per process; an unavailable scope is logged once and every spawn stays plain. */
function resolveChildMemoryScopeAvailability(): Promise<ChildMemoryScopeAvailability> {
  return (availability ??= probeChildMemoryScope().then((result) => {
    if (!result.available) {
      log.warn(formatChildMemoryScopeUnavailable(result.reason));
    }
    return result;
  }));
}

/** Heavy-child owners call this right before native spawn; internal workers never do. */
export async function prepareChildMemoryScopedSpawn(
  command: string,
  args: readonly string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string } = {},
): Promise<ChildMemoryScopedSpawn> {
  const plain = { command, args: [...args], scoped: false };
  const config = getRuntimeConfigSnapshot()?.process?.childScope;
  if (config?.enabled !== true) {
    return plain;
  }
  const scope = await resolveChildMemoryScopeAvailability();
  // systemd-run reaches the user manager through the child's environment and execvp's the
  // command from the child's PATH; without either it exits 1 before the command starts.
  // An unresolvable command stays plain so its owner keeps the native ENOENT.
  if (
    !scope.available ||
    !hasUserBusRoute(options.env ?? process.env) ||
    !resolveExecutablePath(command, { env: options.env, cwd: options.cwd })
  ) {
    return plain;
  }
  return {
    command: scope.systemdRun,
    args: [
      "--user",
      "--scope",
      "--quiet",
      "--collect",
      "-p",
      `MemoryMax=${config.memoryMax ?? DEFAULT_MEMORY_MAX}`,
      "-p",
      `MemorySwapMax=${config.memorySwapMax ?? DEFAULT_MEMORY_SWAP_MAX}`,
      "--",
      command,
      ...args,
    ],
    scoped: true,
  };
}
