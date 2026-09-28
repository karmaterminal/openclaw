import path from "node:path";
import { expect, it } from "vitest";
import { standaloneRuntimeProcessBuildEntries } from "../../scripts/lib/runtime-process-core-build-entries.mts";
import { findSourceImportBackedges } from "../../test/helpers/source-import-closure.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");

// Standalone runtime processes build as single bundles, so a lazy `import()` still
// ships and evaluates with the worker. The session accessor facade reaches most of
// the application; inlining it made every cold state-read worker take over a second
// to start, long enough for session deletes to lose their race with post-write
// maintenance.
it.each(Object.entries(standaloneRuntimeProcessBuildEntries))(
  "keeps the %s bundle clear of the session accessor facade",
  (_name, source) => {
    expect(
      findSourceImportBackedges(
        path.relative(repoRoot, source),
        ["src/config/sessions/session-accessor.ts"],
        { includeDynamicImports: true },
      ),
    ).toEqual([]);
  },
);
