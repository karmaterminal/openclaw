import path from "node:path";
import { expect, it } from "vitest";
import {
  getStandaloneRuntimeProcessOutputOptions,
  standaloneRuntimeProcessBuildEntries,
} from "../../scripts/lib/runtime-process-core-build-entries.mts";
import { findSourceImportBackedges } from "../../test/helpers/source-import-closure.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");

// Unsplit runtime processes inline lazy imports, while split workers keep those
// branches in separate chunks until requested. The session accessor facade reaches
// most of the application; loading it on a cold state read made workers take over
// a second to start, long enough for session deletes to lose their race with
// post-write maintenance.
it.each(Object.entries(standaloneRuntimeProcessBuildEntries))(
  "keeps the %s bundle clear of the session accessor facade",
  (name, source) => {
    expect(
      findSourceImportBackedges(
        path.relative(repoRoot, source),
        ["src/config/sessions/session-accessor.ts"],
        { includeDynamicImports: !getStandaloneRuntimeProcessOutputOptions(name).codeSplitting },
      ),
    ).toEqual([]);
  },
);
