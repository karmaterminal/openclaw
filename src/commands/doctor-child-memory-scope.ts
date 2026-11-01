import { note } from "../../packages/terminal-core/src/note.js";
import type { OpenClawConfig } from "../config/config.js";
import type { HealthFinding } from "../flows/health-checks.js";
import {
  formatChildMemoryScopeUnavailable,
  probeChildMemoryScope,
} from "../process/child-memory-scope.js";

const CHECK_ID = "core/doctor/child-memory-scope";

/** Doctor probes its own environment; the Gateway logs its result once, at its first heavy spawn. */
export async function collectChildMemoryScopeHealthFindings(
  cfg: OpenClawConfig,
): Promise<readonly HealthFinding[]> {
  if (cfg.process?.childScope?.enabled !== true) {
    return [];
  }
  const scope = await probeChildMemoryScope();
  if (scope.available) {
    return [];
  }
  return [
    {
      checkId: CHECK_ID,
      severity: "warning",
      message: formatChildMemoryScopeUnavailable(scope.reason),
      path: "process.childScope.enabled",
      fixHint:
        "Run the Gateway as a Linux systemd user service with systemd-run on PATH and the user bus reachable, or set process.childScope.enabled to false.",
    },
  ];
}

export async function noteChildMemoryScope(cfg: OpenClawConfig): Promise<void> {
  for (const finding of await collectChildMemoryScopeHealthFindings(cfg)) {
    note(`- ${finding.message}\n- ${finding.fixHint}`, "Child memory scope");
  }
}
