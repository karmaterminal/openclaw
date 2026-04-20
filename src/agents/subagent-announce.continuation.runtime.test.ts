// Regression coverage for issue karmaterminal/openclaw#473:
// `subagent-announce.ts` lazy-loads the continuation drain via
// `importRuntimeModule(import.meta.url, [...])`. That dynamic import path
// is NOT bundler-rewritten; the bundler emits the source modules into a
// flat hashed dist layout and the lazy import resolves against the dist
// file's own URL. Pre-fix, the import targeted
// `../auto-reply/continuation/{delegate-dispatch,config}.js` which does not
// exist post-bundle, producing `ERR_MODULE_NOT_FOUND` at runtime.
//
// Fix shape (mirrors `subagent-registry.runtime.ts`):
//   1. Co-located runtime entry `subagent-announce.continuation.runtime.ts`
//      that re-exports the two needed symbols.
//   2. Registered as a tsdown bundler entry so it lands at a stable on-disk
//      path post-bundle.
//   3. `subagent-announce.ts` lazy-imports against `["./subagent-announce.continuation.runtime", ".js"]`
//      which resolves cleanly against the same dist directory.
//
// These tests assert the contract of the fix so a refactor that drops the
// runtime entry, the bundler registration, or the symbol re-exports fails
// loudly instead of silently regressing to `ERR_MODULE_NOT_FOUND` in
// production.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import tsdownConfig from "../../tsdown.config.ts";
import * as continuationRuntime from "./subagent-announce.continuation.runtime.js";

type TsdownConfigEntry = {
  entry?: Record<string, string> | string[];
};

function asConfigArray(config: unknown): TsdownConfigEntry[] {
  return Array.isArray(config) ? (config as TsdownConfigEntry[]) : [config as TsdownConfigEntry];
}

function entriesOfMainGraph(): Record<string, string> {
  const configs = asConfigArray(tsdownConfig);
  const main = configs.find((c) => {
    const entry = c.entry;
    if (!entry || Array.isArray(entry)) {
      return false;
    }
    return Object.keys(entry).includes("subagent-registry.runtime");
  });
  if (!main || !main.entry || Array.isArray(main.entry)) {
    throw new Error("could not locate main dist graph in tsdown config");
  }
  return main.entry;
}

describe("subagent-announce continuation runtime entry (issue karmaterminal/openclaw#473)", () => {
  it("registers the continuation runtime as a tsdown bundler entry", () => {
    const entries = entriesOfMainGraph();
    expect(entries).toHaveProperty("agents/subagent-announce.continuation.runtime");
    expect(entries["agents/subagent-announce.continuation.runtime"]).toBe(
      "src/agents/subagent-announce.continuation.runtime.ts",
    );
  });

  it("exports dispatchToolDelegates from the continuation runtime", () => {
    expect(typeof continuationRuntime.dispatchToolDelegates).toBe("function");
  });

  it("exports resolveContinuationRuntimeConfig from the continuation runtime", () => {
    expect(typeof continuationRuntime.resolveContinuationRuntimeConfig).toBe("function");
  });

  it("subagent-announce lazy-imports the runtime entry by its co-located path, not the source-tree path", () => {
    // Post-bundle, the dist emits `agents/subagent-announce.continuation.runtime.js`
    // adjacent to the bundled subagent-announce code. The pre-fix path
    // (`../auto-reply/continuation/delegate-dispatch.js`) does not exist
    // post-bundle and would resolve to a non-existent nested path.
    const announceSrc = readFileSync(
      resolve(process.cwd(), "src/agents/subagent-announce.ts"),
      "utf8",
    );
    expect(announceSrc).toContain('"./subagent-announce.continuation.runtime"');
    expect(announceSrc).not.toContain('"../auto-reply/continuation/delegate-dispatch.js"');
    expect(announceSrc).not.toContain('"../auto-reply/continuation/config.js"');
  });
});
