#!/usr/bin/env node
/**
 * Wrapper-node shim for Vitest's forks-pool workers.
 *
 * Vitest's forks pool rebuilds the worker `execArgv` from scratch and filters
 * the launcher's `process.execArgv` down to a tiny allowlist (cpu/heap-prof and
 * diagnostic-dir), so `--no-maglev` set on the launcher never reaches forked
 * workers. `--no-maglev` is also rejected inside `NODE_OPTIONS`, which kills
 * the env-var route. Tinypool calls `child_process.fork(...)` without an
 * `execPath` option, so workers inherit the launcher's `process.execPath`.
 *
 * The launcher preload (`vitest-fork-execpath-preload.mjs`) reassigns
 * `process.execPath` to this shim and stashes the real node path in
 * `OPENCLAW_VITEST_FORK_REAL_NODE`. When tinypool forks a worker, node spawns
 * this shim instead, which re-execs the real node with `--no-maglev --no-opt`
 * + forwarded args so the worker runs maglev-disabled. This is the only lever
 * that crosses into tinypool's forked workers on raptor-lake/alder-lake CPUs
 * that segfault under V8 maglev.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const shimPath = fileURLToPath(import.meta.url);
const realNode = process.env.OPENCLAW_VITEST_FORK_REAL_NODE ?? "";

if (!realNode || realNode === shimPath) {
  process.stderr.write(
    `[vitest-fork-node-shim] OPENCLAW_VITEST_FORK_REAL_NODE is missing or points at the shim itself; refusing to re-exec.\n`,
  );
  process.exit(1);
}

const result = spawnSync(realNode, ["--no-maglev", "--no-opt", ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  process.stderr.write(
    `[vitest-fork-node-shim] failed to spawn real node: ${result.error.message}\n`,
  );
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);
