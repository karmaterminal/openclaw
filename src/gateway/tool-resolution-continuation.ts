// Continuation (karmaterminal): the Gateway's tool catalog build. Kept beside its one caller,
// tool-resolution.ts, which sits at its line cap, so that file only switches this factory.
import { createOpenClawToolsAsync } from "../agents/openclaw-tools.js";
import { buildInventoryContinuationToolOpts } from "../agents/tools/continuation-inventory-opts.js";

/**
 * Gateway tool resolution builds the tool catalog for dispatch lookup, not for live execution.
 * It registers continue_work and request_compaction through callbacks that error clearly when
 * invoked, so the catalog reflects the full continuation surface and the openclaw-tools.ts
 * partial-registration warning is satisfied honestly (not suppressed).
 */
export function createCatalogToolsAsync(
  ...[options, preparation]: Parameters<typeof createOpenClawToolsAsync>
): ReturnType<typeof createOpenClawToolsAsync> {
  return createOpenClawToolsAsync(
    { ...options, ...buildInventoryContinuationToolOpts(options?.config) },
    preparation,
  );
}
