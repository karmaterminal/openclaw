import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { ToolInputError } from "./common.js";

/**
 * Stub continuation-tool callbacks for inventory/catalog build paths
 * (gateway tool-resolution, skills tool-dispatch, tools-effective-inventory).
 *
 * These surfaces build the tool catalog for discovery / dispatch lookup, not
 * for live execution. Supplying these callbacks registers continue_work +
 * request_compaction so the catalog reflects the full continuation surface
 * (and the openclaw-tools.ts partial-registration warning is genuinely
 * satisfied — not suppressed). The callbacks are NOT inert no-ops: invoking
 * the tool on one of these non-runner paths must ERROR CLEARLY rather than
 * silently succeed (the openclaw-tools.ts design contract — callback-less
 * continuation tools are dead tools that error when invoked). So:
 *   - continue_work's requestContinuation throws a clear ToolInputError.
 *   - request_compaction's getContextUsage returns null, which the tool turns
 *     into a clear structured rejection before any compaction is enqueued.
 * Real runners pass their own live closures instead. Returns no callbacks unless
 * `agents.defaults.continuation.enabled` is true in `cfg`.
 */
export function buildInventoryContinuationToolOpts(cfg: OpenClawConfig | undefined): {
  continueWorkOpts?: { requestContinuation: () => void };
  requestCompactionOpts?: {
    sessionId: string;
    ownerAgentId?: string;
    contextUsageOrigin: "inventory_stub";
    getContextUsage: () => number | null;
    triggerCompaction: () => Promise<{ ok: boolean; compacted: boolean; reason: string }>;
  };
} {
  if (cfg?.agents?.defaults?.continuation?.enabled !== true) {
    return {};
  }
  return {
    continueWorkOpts: {
      requestContinuation: () => {
        throw new ToolInputError(
          "continue_work is not available in this catalog/inventory context (no continuation runner).",
        );
      },
    },
    requestCompactionOpts: {
      sessionId: "<inventory-only>",
      contextUsageOrigin: "inventory_stub",
      getContextUsage: () => null,
      triggerCompaction: async () => ({
        ok: false,
        compacted: false,
        reason: "inventory-only path",
      }),
    },
  };
}
