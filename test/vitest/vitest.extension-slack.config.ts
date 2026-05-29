import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export function createExtensionSlackVitestConfig(
  env: Record<string, string | undefined> = process.env,
) {
  return createScopedVitestConfig(["extensions/slack/**/*.test.ts"], {
    dir: "extensions",
    env,
    // Slack monitor tests share a mocked Bolt handler map; keep files serial so
    // full-extension project runs cannot overwrite active message handlers.
    fileParallelism: false,
    includeOpenClawRuntimeSetup: false,
    name: "extension-slack",
    passWithNoTests: true,
    setupFiles: ["test/setup.extensions.ts"],
    fileParallelism: false,
  });
}

export default createExtensionSlackVitestConfig();
