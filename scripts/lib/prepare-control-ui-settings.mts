import { execFile } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { isNodeCompilerArg } from "../../node-runtime-env.mjs";

/** Keep the alias-aware native builder outside Vite's configuration bundle. */
export async function prepareControlUiSettings(
  repoRoot: string,
  scripts = path.resolve(import.meta.dirname, ".."),
): Promise<void> {
  if (!fs.existsSync(path.join(repoRoot, "extensions"))) {
    return;
  }
  // Bypass Vite's module runner: its HTTP import URLs cannot launch native children,
  // and bundled copies would lose the launcher's live ownership context.
  const {
    distArtifactEntryArgs,
    withDistArtifactOwnership,
  }: typeof import("./dist-artifact-ownership.mts") = createRequire(import.meta.url)(
    path.join(scripts, "lib/dist-artifact-ownership.mts"),
  );
  await withDistArtifactOwnership(repoRoot, () =>
    promisify(execFile)(
      process.execPath,
      [
        ...process.execArgv.filter(isNodeCompilerArg),
        ...distArtifactEntryArgs(path.join(scripts, "build-plugin-control-ui.mts"), [
          "--prepare-settings",
          repoRoot,
        ]),
      ],
      { cwd: repoRoot, maxBuffer: 1024 * 1024 },
    ),
  );
}
