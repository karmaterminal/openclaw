// Frond (karmaterminal): fork-39 bridge. Fork-owned and outside the upstream-facing continuation
// diff; the jump-12 Gate 2 notes list this file and its call site.
import { withoutAgentPostgresColdNavigation } from "../../state/openclaw-agent-cold-navigation-schema.js";
import { AGENT_COLD_NAVIGATION_SCHEMA_VERSION } from "../../state/openclaw-agent-db-contract.js";
import { getAgentFork39MigrationSchema } from "../../state/openclaw-agent-fork39-bridge.js";
import type { PortDescriptor } from "./port-types.js";

/**
 * The fleet's PostgreSQL 39 for Doctor's exact export: the current layout, recipient authority
 * included, with upstream's 38 payload constraint. Admission selects it by the authority table and
 * verifies its catalog as exactly as upstream's 39; step 40 then admits it as an alternate source.
 */
export async function loadAgentFork39PortDescriptor(
  loadCurrent: () => Promise<PortDescriptor>,
): Promise<PortDescriptor> {
  const current = await loadCurrent();
  return {
    ...current,
    version: AGENT_COLD_NAVIGATION_SCHEMA_VERSION,
    sqlite: getAgentFork39MigrationSchema().replace(/^INSERT OR IGNORE INTO[^;]+;/gm, ""),
    preData: withoutAgentPostgresColdNavigation(current.preData),
    inspectSqliteSource: undefined,
    migrateSqliteSource: undefined,
    admit: undefined,
  };
}
