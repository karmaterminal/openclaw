import type { createSubagentRegistrySweeper } from "./subagent-registry-sweeper.js";

/** Sweeper construction params, derived from upstream's inline sweeper signature. */
export type SubagentRegistrySweeperParams = Parameters<typeof createSubagentRegistrySweeper>[0];
