import { loadPatternListFromEnv } from "./vitest.pattern-file.ts";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export function loadIncludePatternsFromEnv(
  env: Record<string, string | undefined> = process.env,
): string[] | null {
  return loadPatternListFromEnv("OPENCLAW_VITEST_INCLUDE_FILE", env);
}

export function createContinuationDurabilityVitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(
    loadIncludePatternsFromEnv(env) ?? ["studies/swim-37/harness/durability/**/*.test.ts"],
    {
      env,
      name: "continuation-durability",
      passWithNoTests: true,
    },
  );
}

export default createContinuationDurabilityVitestConfig();
