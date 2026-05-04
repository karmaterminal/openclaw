import { loadPatternListFromEnv } from "./vitest.pattern-file.ts";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export function loadIncludePatternsFromEnv(
  env: Record<string, string | undefined> = process.env,
): string[] | null {
  return loadPatternListFromEnv("OPENCLAW_VITEST_INCLUDE_FILE", env);
}

export function createSwim37VitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(
    loadIncludePatternsFromEnv(env) ?? ["studies/swim-37/harness/**/*.test.ts"],
    {
      exclude: ["studies/swim-37/harness/durability/**/*.test.ts"],
      env,
      name: "swim-37",
      passWithNoTests: true,
    },
  );
}

export default createSwim37VitestConfig();
