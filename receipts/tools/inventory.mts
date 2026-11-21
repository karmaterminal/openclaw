// List the files the extension-database-workers Vitest config selects at one tree (cwd = tree).
// Uses the config's own include/exclude and dir; vitest resolves them with tinyglobby the same way.
// usage: node --import ./scripts/tsx.mjs <this> <out.json>
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";

const tree = process.cwd();
const req = createRequire(resolve(tree, "package.json"));
const { glob } = await import(pathToFileURL(req.resolve("tinyglobby")).href);
const mod = await import(
  pathToFileURL(resolve(tree, "test/vitest/vitest.extension-database-workers.config.ts")).href
);
const config = await (typeof mod.default === "function"
  ? mod.default({ mode: "test", command: "serve" })
  : mod.default);
const test = config.test ?? {};
const dir = resolve(tree, test.dir ?? ".");
const files = (
  await glob(test.include, {
    cwd: dir,
    ignore: test.exclude ?? [],
    absolute: true,
    dot: true,
    expandDirectories: false,
  })
)
  .map((f: string) => relative(tree, f))
  .sort();
writeFileSync(
  process.argv[2],
  JSON.stringify(
    {
      tree,
      dir: relative(tree, dir),
      include: test.include,
      exclude: test.exclude,
      count: files.length,
      files,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    dir: relative(tree, dir),
    includeCount: test.include?.length,
    excludeCount: test.exclude?.length,
    count: files.length,
  }),
);
