// Continuation (karmaterminal): the forest's real SQLite workers reopen shared state through
// the host broker, so this suite keeps agents-support's forked workers on its own owner.
import { agentVitestProjectOwners } from "./vitest.agents-paths.mjs";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export function createAgentsContinuationForestVitestConfig(
  env?: Record<string, string | undefined>,
) {
  const owner = agentVitestProjectOwners.continuationForest;
  return createScopedVitestConfig(owner.include, {
    dir: owner.dir,
    env,
    name: owner.name,
    passWithNoTests: true,
    pool: "forks",
  });
}

export default createAgentsContinuationForestVitestConfig();
