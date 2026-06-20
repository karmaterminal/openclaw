/**
 * Launcher preload for the Vitest forks-pool maglev fix.
 *
 * Imported into the Vitest launcher via `--import` BEFORE vitest builds its
 * tinypool. Vitest's forks pool filters the launcher's `process.execArgv` to a
 * tiny allowlist and forks workers without an `execPath` option, so workers
 * inherit `process.execPath` from the launcher. By reassigning
 * `process.execPath` to the wrapper-node shim and stashing the real node path
 * in `OPENCLAW_VITEST_FORK_REAL_NODE`, every forked worker is launched through
 * the shim and re-exec'd under `--no-maglev --no-opt`. Without this hop,
 * `--no-maglev` set on the launcher never reaches workers on raptor-lake /
 * alder-lake CPUs that segfault under V8 maglev.
 *
 * Guarded and non-throwing: any error leaves `process.execPath` untouched so
 * a broken preload cannot break the launcher.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  if (!process.env.OPENCLAW_VITEST_FORK_REAL_NODE) {
    const preloadDir = path.dirname(fileURLToPath(import.meta.url));
    const shimPath = path.join(preloadDir, "vitest-fork-node-shim.mjs");
    if (fs.existsSync(shimPath)) {
      const realNode = process.execPath;
      process.env.OPENCLAW_VITEST_FORK_REAL_NODE = realNode;
      process.execPath = shimPath;
    }
  }
} catch {
  // Never break the launcher: leave process.execPath as-is on any failure.
}
