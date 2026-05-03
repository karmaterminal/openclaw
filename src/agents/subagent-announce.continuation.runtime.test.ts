// Regression coverage for the continuation runtime entry:
// `subagent-announce.ts` lazy-loads the continuation drain via
// `importRuntimeModule(import.meta.url, [...])`. That dynamic import path
// is NOT bundler-rewritten; the bundler emits the source modules into a
// flat hashed dist layout and the lazy import resolves against the dist
// file's own URL. Pre-fix, the import targeted
// `../auto-reply/continuation/delegate-dispatch.js` which does not
// exist post-bundle, producing `ERR_MODULE_NOT_FOUND` at runtime.
//
// Fix shape (mirrors `subagent-registry.runtime.ts`):
//   1. Co-located runtime entry `subagent-announce.continuation.runtime.ts`
//      that re-exports the lazy drain symbols.
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

describe("subagent-announce continuation runtime entry", () => {
  it("registers the continuation runtime as a tsdown bundler entry", () => {
    const entries = entriesOfMainGraph();
    expect(entries).toHaveProperty("subagent-announce.continuation.runtime");
    expect(entries["subagent-announce.continuation.runtime"]).toBe(
      "src/agents/subagent-announce.continuation.runtime.ts",
    );
  });

  it("exports dispatchToolDelegates from the continuation runtime", () => {
    expect(typeof continuationRuntime.dispatchToolDelegates).toBe("function");
  });

  it("subagent-announce lazy-imports the runtime entry by its co-located path, not the source-tree path", () => {
    // Post-bundle, the dist emits `subagent-announce.continuation.runtime.js`
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

describe("subagent-announce continuation runtime — complete export contract (#454)", () => {
  // Pins the contract that #454 issue body called out as structurally-unpinned:
  // "subagent-announce.ts destructures several symbols from
  // subagent-announce.continuation.runtime.ts, but the runtime-entry test
  // only asserts the tsdown entry plus two exports. Dropping
  // loadContinuationChainState, persistContinuationChainState,
  // updateSessionStore, resolveStorePath, or resolveAgentIdFromSessionKey
  // can break runtime-only paths without the current test failing."
  //
  // The destructure happens in the importRuntimeModule path of
  // subagent-announce.ts (currently lines ~251-268):
  //
  //   const { dispatchToolDelegates } = dispatchModule;
  //   const { loadContinuationChainState, persistContinuationChainState } = stateModule;
  //   const { updateSessionStore, resolveStorePath, resolveAgentIdFromSessionKey } =
  //     sessionStoreModule;
  //
  // All three "modules" resolve to the same runtime entry per current
  // subagent-announce.ts (the cycle-avoidance pattern uses ONE bundled
  // runtime entry for all destructured symbols). So all 6 symbols must
  // be live-exports from `subagent-announce.continuation.runtime.ts`.
  //
  // Pin the contract: dropping ANY of these 6 exports from the runtime
  // entry produces ERR_MODULE_NOT_FOUND-class failures at runtime that
  // the existing dispatchToolDelegates-only assertion would not catch.

  it("exports dispatchToolDelegates", () => {
    expect(typeof continuationRuntime.dispatchToolDelegates).toBe("function");
  });

  it("exports loadContinuationChainState", () => {
    expect(typeof continuationRuntime.loadContinuationChainState).toBe("function");
  });

  it("exports persistContinuationChainState", () => {
    expect(typeof continuationRuntime.persistContinuationChainState).toBe("function");
  });

  it("exports updateSessionStore", () => {
    expect(typeof continuationRuntime.updateSessionStore).toBe("function");
  });

  it("exports resolveStorePath", () => {
    expect(typeof continuationRuntime.resolveStorePath).toBe("function");
  });

  it("exports resolveAgentIdFromSessionKey", () => {
    expect(typeof continuationRuntime.resolveAgentIdFromSessionKey).toBe("function");
  });

  it("exports all 6 symbols destructured by subagent-announce.ts as the complete contract", () => {
    // Read subagent-announce.ts source + parse out the destructured names
    // from the importRuntimeModule path. Assert every destructured name
    // appears as a live export on the runtime module.
    //
    // This is the load-bearing assertion: if subagent-announce.ts adds a
    // new destructured symbol but the runtime entry doesn't re-export it,
    // OR the runtime entry drops an export that subagent-announce.ts still
    // destructures, this test fails by name + the failure-message points
    // at the missing-symbol explicitly.
    const announceSrc = readFileSync(
      resolve(process.cwd(), "src/agents/subagent-announce.ts"),
      "utf8",
    );
    // Pull every destructured name from the three `const { ... } = X;` lines
    // following the importRuntimeModule Promise.all block. Names are
    // captured by a regex against the destructure syntax; if the source
    // shape changes (e.g. switches to direct imports), the regex returns
    // empty and the assertion below fails — surfacing the substrate-shift
    // as a deliberate test-update need.
    const destructurePattern =
      /const\s*\{\s*([a-zA-Z0-9_,\s]+)\s*\}\s*=\s*(?:dispatchModule|stateModule|sessionStoreModule);/g;
    const destructuredNames: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = destructurePattern.exec(announceSrc)) !== null) {
      const names = match[1]
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      destructuredNames.push(...names);
    }
    expect(destructuredNames.length).toBeGreaterThanOrEqual(6);

    // Every destructured name must be a live export on the runtime module.
    for (const name of destructuredNames) {
      expect(
        (continuationRuntime as Record<string, unknown>)[name],
        `subagent-announce.ts destructures '${name}' from the runtime module, ` +
          `but the runtime module does not export it. Add the re-export to ` +
          `src/agents/subagent-announce.continuation.runtime.ts or remove the ` +
          `destructure from src/agents/subagent-announce.ts.`,
      ).toBeDefined();
    }
  });
});
