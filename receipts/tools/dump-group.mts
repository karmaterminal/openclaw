// Dump how CI plans the extension-database-workers shard at one tree.
// usage (cwd = tree): node --import ./scripts/tsx.mjs <this> <out.json>
import { writeFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";

const tree = process.cwd();
const CONFIG = "test/vitest/vitest.extension-database-workers.config.ts";
// Mode-B's matrix builder sets this before it plans (compact-plan.mjs MODE_B_TEST_RUNTIME_POLICY = "node").
process.env.OPENCLAW_CI_TEST_RUNTIME_POLICY = "node";
const imp = async (rel: string, exts: string[]) => {
  const hits = exts.map((e) => resolve(tree, rel + e)).filter((p) => existsSync(p));
  if (hits.length !== 1) throw new Error(`expected one module for ${rel}, got ${hits.join(",")}`);
  return import(pathToFileURL(hits[0]).href);
};
const nodePlanner = await imp("scripts/lib/ci-node-test-plan", [".mts", ".mjs"]);
const shardsModule = await imp("test/vitest/vitest.test-shards", [".mjs", ".mts"]);

// (a) the target planner, exactly as bootstrap 105e83ab's matrix builder calls it
const nodeShards = nodePlanner.createNodeTestShards({ includeReleaseOnlyPluginShards: true });
const nodeHits = nodeShards
  .filter(
    (s: any) =>
      s.configs.includes(CONFIG) || String(s.shardName).includes("extension-database-workers"),
  )
  .map((s: any) => ({
    checkName: s.checkName,
    shardName: s.shardName,
    configs: s.configs,
    includePatterns: s.includePatterns ?? null,
    env: s.env ?? null,
    requiresDist: s.requiresDist === true,
    pretestBuildMode: s.pretestBuildMode ?? null,
    runner: s.runner ?? null,
  }));

// (b) bootstrap 105e83ab tools/openclaw-local-ci-build-matrix.mjs "supplemental" extension rows
const configBase = (c: string) =>
  basename(c)
    .replace(/^vitest\./, "")
    .replace(/\.config\.ts$/, "");
const normalizeShard = (v: string) => v.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
const extensions = shardsModule.fullSuiteVitestShards.find((s: any) => s.name === "extensions");
const supplementalRow = (extensions?.projects ?? [])
  .filter((c: string) => c === CONFIG)
  .map((c: string) => ({
    kind: "supplemental",
    check_name: `checks-node-${configBase(c)}`,
    shard_name: normalizeShard(configBase(c)),
    configs: [c],
    includePatterns: null,
    requires_dist: false,
    planner_runner: null,
    planner_env: null,
    pretest_build_mode: null,
  }));

// (c) the group handed to scripts/ci-run-node-test-shard.mts
const group =
  supplementalRow.length === 1
    ? {
        configs: supplementalRow[0].configs,
        includePatterns: supplementalRow[0].includePatterns,
        shard_name: supplementalRow[0].shard_name,
        env: supplementalRow[0].planner_env,
      }
    : null;

// (d) the config's own file inventory, as the repo planner resolves it
let fileCount: number | null = null;
let files: string[] | null = null;
try {
  const paths = await imp("test/vitest/vitest.extension-database-workers-paths", [".mjs", ".mts"]);
  const list = paths.databaseWorkerExtensionTestFiles;
  if (Array.isArray(list)) {
    files = [...list].sort();
    fileCount = files.length;
  }
} catch (e) {
  /* recorded as null */
}

const out = {
  tree,
  head: process.env.DUMP_HEAD ?? null,
  runtimePolicy: process.env.OPENCLAW_CI_TEST_RUNTIME_POLICY,
  createNodeTestShards: { totalShards: nodeShards.length, extdbwRows: nodeHits },
  extensionsOwnerProjects: extensions?.projects ?? null,
  modeBSupplementalRow: supplementalRow,
  group,
  databaseWorkerExtensionTestFiles: { count: fileCount, files },
};
writeFileSync(process.argv[2], JSON.stringify(out, null, 2) + "\n");
console.log(
  JSON.stringify({
    nodeShardRows: nodeHits.length,
    supplemental: supplementalRow.length,
    group,
    fileCount,
  }),
);
