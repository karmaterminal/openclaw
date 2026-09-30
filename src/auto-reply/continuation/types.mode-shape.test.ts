/**
 * Trap test for the PendingContinuationDelegate mode-only compat boundary.
 *
 * Bug-shape / risk:
 *   The canonical runtime delegate shape is `PendingContinuationDelegate.mode`,
 *   while booleans are only an on-disk compatibility encoding. A future refactor
 *   can accidentally reintroduce `silent` / `silentWake` as runtime API fields
 *   without breaking today's behavior tests immediately.
 *
 * What this trap guards (load-bearing assertions):
 *   1. RUNTIME OBJECTS: `consumePendingDelegates` / `claimStagedPostCompactionDelegates`
 *      return objects whose only mode-bearing field is `mode`. They MUST NOT
 *      expose `silent` / `silentWake` / `postCompaction` boolean runtime flags.
 *   2. TOOL DESCRIPTOR: the `continue_delegate` parameter schema advertises
 *      `mode` as an enum (normal | silent | silent-wake | post-compaction)
 *      and exposes NO `silent` / `silentWake` boolean parameters.
 *   3. ON-DISK BACK-COMPAT: persisted custody `stateJson` MAY still contain
 *      legacy boolean flags (`silent`, `silentWake`, `postCompaction`). This is
 *      a positive assertion — the disk shape stays back-compat for historical
 *      rows — and is what justifies the runtime/disk encoding split.
 */
import { expectDefined } from "@openclaw/normalization-core";
import { describe, expect, it } from "vitest";
import {
  custodyStateForTest,
  listCustodyRecordsForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import {
  claimStagedPostCompactionDelegates,
  stagePostCompactionCustodyDelegate,
} from "./delegate-store-post-compaction.js";
import { consumePendingDelegates, enqueuePendingDelegate } from "./delegate-store.js";
import type { PendingContinuationDelegate } from "./types.js";

const SESSION_KEY = "test-session-438";

const RUNTIME_BOOLEAN_FIELDS = ["silent", "silentWake", "postCompaction"] as const;

// Real continuation custody, so the runtime path is exercised through
// production code, not stubs.
useContinuationCustodyTestState();

async function onlyStoredState(): Promise<Record<string, unknown>> {
  const records = await listCustodyRecordsForTest();
  expect(records).toHaveLength(1);
  return custodyStateForTest(expectDefined(records.at(0), "record"));
}

describe("keeps PendingContinuationDelegate mode-only at runtime boundaries", () => {
  describe("runtime objects from consumePendingDelegates", () => {
    it.each([
      ["normal", { mode: undefined as PendingContinuationDelegate["mode"] }],
      ["silent", { mode: "silent" as const }],
      ["silent-wake", { mode: "silent-wake" as const }],
    ])(
      "consume pending (%s mode) returns runtime object with no boolean fields",
      async (_label, { mode }) => {
        await enqueuePendingDelegate(SESSION_KEY, {
          task: "trap test",
          ...(mode !== undefined ? { mode } : {}),
        });
        const consumed = await consumePendingDelegates(SESSION_KEY);
        expect(consumed).toHaveLength(1);
        const delegate = expectDefined(consumed.at(0), "delegate");
        for (const field of RUNTIME_BOOLEAN_FIELDS) {
          expect(
            Object.hasOwn(delegate, field),
            `runtime PendingContinuationDelegate must not expose '${field}' (mode-only encoding)`,
          ).toBe(false);
        }
        if (mode !== undefined) {
          expect(delegate.mode).toBe(mode);
        }
      },
    );

    it("consume staged post-compaction returns runtime object with mode='post-compaction' and no boolean fields", async () => {
      await stagePostCompactionCustodyDelegate(SESSION_KEY, {
        task: "trap test",
        stagedAt: Date.now(),
      });
      const consumed = await claimStagedPostCompactionDelegates(SESSION_KEY);
      expect(consumed).toHaveLength(1);
      const delegate = expectDefined(consumed.at(0), "post-compaction delegate");
      expect(delegate.mode).toBe("post-compaction");
      for (const field of RUNTIME_BOOLEAN_FIELDS) {
        expect(
          Object.hasOwn(delegate, field),
          `post-compaction runtime delegate must not expose '${field}'`,
        ).toBe(false);
      }
    });
  });

  describe("on-disk custody stateJson back-compat (positive assertion)", () => {
    it.each([
      ["silent", "silent"],
      ["silent-wake", "silentWake"],
      ["post-compaction", "postCompaction"],
    ] as const)(
      "persisted stateJson for mode='%s' projects to legacy boolean '%s'=true (back-compat preserved)",
      async (mode, expectedBooleanField) => {
        if (mode === "post-compaction") {
          await stagePostCompactionCustodyDelegate(SESSION_KEY, {
            task: "back-compat",
            stagedAt: Date.now(),
          });
        } else {
          await enqueuePendingDelegate(SESSION_KEY, { task: "back-compat", mode });
        }
        const stateJson = await onlyStoredState();
        expect(stateJson[expectedBooleanField]).toBe(true);
      },
    );

    it("persisted stateJson for normal mode projects no boolean mode flags", async () => {
      await enqueuePendingDelegate(SESSION_KEY, { task: "normal" });
      const stateJson = await onlyStoredState();
      for (const field of RUNTIME_BOOLEAN_FIELDS) {
        expect(stateJson[field]).toBeUndefined();
      }
    });
  });
});

describe("continue_delegate tool descriptor exposes mode enum, not boolean flags", () => {
  it("descriptor advertises mode as enum with the four canonical values and no silent/silentWake parameters", async () => {
    // Stub config used by createContinueDelegateTool's resolveMaxDelegatesPerTurn.
    const tool = (
      await import("../../agents/tools/continue-delegate-tool.js")
    ).createContinueDelegateTool({ agentSessionKey: SESSION_KEY });

    const params = tool.parameters as {
      type?: string;
      properties?: Record<string, unknown>;
    };

    expect(params.type).toBe("object");
    const properties = params.properties ?? {};

    // Must expose `mode` as an enum/string-union.
    expect(properties).toHaveProperty("mode");
    const modeProp = properties.mode as {
      anyOf?: Array<{ const?: string; enum?: string[] }>;
      enum?: string[];
    };
    // optionalStringEnum may render as anyOf [ { const: "normal" }, ... ] OR as enum.
    const enumValues = new Set<string>();
    if (Array.isArray(modeProp.enum)) {
      for (const v of modeProp.enum) {
        enumValues.add(v);
      }
    }
    if (Array.isArray(modeProp.anyOf)) {
      for (const branch of modeProp.anyOf) {
        if (typeof branch.const === "string") {
          enumValues.add(branch.const);
        }
        if (Array.isArray(branch.enum)) {
          for (const v of branch.enum) {
            enumValues.add(v);
          }
        }
      }
    }
    for (const expected of ["normal", "silent", "silent-wake", "post-compaction"]) {
      expect(
        enumValues.has(expected),
        `tool descriptor mode enum must include '${expected}' (got: ${[...enumValues].join(", ")})`,
      ).toBe(true);
    }

    // Must NOT expose boolean `silent` / `silentWake` parameters.
    for (const forbidden of ["silent", "silentWake"]) {
      expect(
        Object.hasOwn(properties, forbidden),
        `continue_delegate tool descriptor must not expose '${forbidden}' parameter (mode-only API surface)`,
      ).toBe(false);
    }
  });
});
