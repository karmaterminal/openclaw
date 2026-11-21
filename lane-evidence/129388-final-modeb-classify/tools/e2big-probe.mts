// e2big-probe.mts WT SOURCE_ROOT PREPARED_ROOT: size of the NODE_OPTIONS string that
// test/scripts/vitest-worker-shutdown.test.ts hands its wrapper child, computed with WT's own
// collectRuntimeImportClosure and preparedScriptWrapperEnv, as if WT were checked out at
// SOURCE_ROOT and the prepared CLI copy lived at PREPARED_ROOT. Linux refuses exec with E2BIG when
// one argv/env string exceeds MAX_ARG_STRLEN (32 pages = 131072 bytes on 4 KiB pages).
// Run: node --import WT/scripts/tsx.mjs e2big-probe.mts WT SOURCE_ROOT PREPARED_ROOT
import path from "node:path";
import { pathToFileURL } from "node:url";

const [wt, sourceRoot, preparedRoot] = process.argv.slice(2);
const { collectRuntimeImportClosure } = await import(
  pathToFileURL(path.join(wt, "scripts/lib/runtime-import-closure.mts")).href
);
const { preparedScriptWrapperEnv } = await import(
  pathToFileURL(path.join(wt, "test/scripts/prepared-script-wrapper.test-support.ts")).href
);
const wrapperEntries = ["run-vitest.mts", "test-projects-serial.mts", "ci-run-node-test-shard.mts"];
const closure: string[] = collectRuntimeImportClosure(
  wt,
  wrapperEntries.map((entry) => `scripts/${entry}`),
  { includeDynamicImports: true },
).filter((source: string) => /\.[cm]?ts$/u.test(source));
const modules = closure.map(
  (source) =>
    [
      pathToFileURL(path.join(sourceRoot, source)),
      pathToFileURL(path.join(preparedRoot, source.replace(/\.[cm]?ts$/u, ".js"))),
    ] as const,
);
// The fixture preload is a file URL inside the test's temp root; model it at the prepared root.
const fixturePreload = `--import=${pathToFileURL(path.join(preparedRoot, "..", "worker proof-XXXXXX", "preload.mjs")).href}`;
const env = preparedScriptWrapperEnv(modules, { NODE_OPTIONS: fixturePreload });
const bytes = Buffer.byteLength(env.NODE_OPTIONS ?? "");
const relBytes = closure.reduce((sum, source) => sum + Buffer.byteLength(source), 0);
console.log(
  JSON.stringify({
    wt,
    sourceRoot,
    sourceRootLength: sourceRoot.length,
    preparedRoot,
    preparedRootLength: preparedRoot.length,
    closureTsModules: closure.length,
    closureRelPathBytes: relBytes,
    nodeOptionsBytes: bytes,
    maxArgStrlen: 131072,
    e2big: bytes > 131072,
  }),
);
if (process.env.E2BIG_PROBE_LIST) {
  for (const source of closure) console.log(`module\t${source}`);
}
