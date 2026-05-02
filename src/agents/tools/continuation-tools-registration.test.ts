import { describe, expect, it, vi } from "vitest";
import { createOpenClawTools } from "../openclaw-tools.js";
import "../test-helpers/fast-core-tools.js";
import { createPerSenderSessionConfig } from "../test-helpers/session-config.js";

// CI runners are slower than dev hardware; this test transitively loads the full
// createOpenClawTools dependency graph (~70s on a Spark, ~120s+ on CI). Bump
// per-test timeout above the default 120s ceiling. Follow-up: lazy-load heavy
// deps in createOpenClawTools so import is fast (tracked separately).
describe("continuation tool registration", { timeout: 240000 }, () => {
  const config = {
    session: createPerSenderSessionConfig(),
    agents: {
      defaults: {
        continuation: {
          enabled: true,
        },
      },
    },
  } as const;

  it("exposes continue_delegate on normal turns when continuation is enabled", () => {
    const tools = createOpenClawTools({
      config,
      agentSessionKey: "main",
    });

    expect(tools.some((tool) => tool.name === "continue_delegate")).toBe(true);
  });

  it("omits targetSessionKey from the continue_delegate schema descriptor", () => {
    // Per #362 / #338-successor: cross-session addressing was deferred from this
    // surface to the #332 session-delivery-queue substrate. The schema MUST NOT
    // advertise `targetSessionKey` on `continue_delegate` — callers reaching for
    // sibling-session enrichment use the (b)-shape evolution tracked in
    // karmaterminal/binary-canticle#11, not this verb.
    const tools = createOpenClawTools({
      config,
      agentSessionKey: "main",
    });
    const tool = tools.find((candidate) => candidate.name === "continue_delegate");
    if (!tool) {
      throw new Error("continue_delegate tool not registered");
    }

    const params = tool.parameters as { properties?: Record<string, unknown> };
    expect(params.properties).toBeDefined();
    expect(params.properties).not.toHaveProperty("targetSessionKey");
  });

  it("description points at the (b)-shape lane for cross-session enrichment", () => {
    const tools = createOpenClawTools({
      config,
      agentSessionKey: "main",
    });
    const tool = tools.find((candidate) => candidate.name === "continue_delegate");
    if (!tool) {
      throw new Error("continue_delegate tool not registered");
    }

    expect(tool.description).toContain("binary-canticle#11");
  });

  it("hides continue_delegate when continuation is disabled", () => {
    const tools = createOpenClawTools({
      config: {
        ...config,
        agents: { defaults: { continuation: { enabled: false } } },
      },
      agentSessionKey: "main",
    });

    expect(tools.some((tool) => tool.name === "continue_delegate")).toBe(false);
  });

  it("exposes continue_work when continuation is enabled and the runner wires it", () => {
    const tools = createOpenClawTools({
      config,
      agentSessionKey: "main",
      continueWorkOpts: {
        requestContinuation: vi.fn(),
      },
    });

    expect(tools.some((tool) => tool.name === "continue_work")).toBe(true);
  });

  // Truth-table coverage for the drainsContinuationDelegateQueue gate predicate
  // in createOpenClawTools (`!== false`). Three states must be pinned so a future
  // refactor cannot silently regress to `=== true` (which broke the
  // "normal turns" case on PR #306 commit c825009e9b8 before the !== false fix
  // landed in 9f00132dd67). See discussion at
  // https://github.com/karmaterminal/openclaw/pull/306
  it("exposes continue_delegate when drainsContinuationDelegateQueue is undefined (default normal turns)", () => {
    const tools = createOpenClawTools({
      config,
      agentSessionKey: "main",
      // drainsContinuationDelegateQueue intentionally omitted to assert default behavior
    });

    expect(tools.some((tool) => tool.name === "continue_delegate")).toBe(true);
  });

  it("exposes continue_delegate when drainsContinuationDelegateQueue is explicitly true (explicit drainers)", () => {
    const tools = createOpenClawTools({
      config,
      agentSessionKey: "main",
      drainsContinuationDelegateQueue: true,
    });

    expect(tools.some((tool) => tool.name === "continue_delegate")).toBe(true);
  });

  it("hides continue_delegate when drainsContinuationDelegateQueue is explicitly false (e.g. llm-slug-generator)", () => {
    const tools = createOpenClawTools({
      config,
      agentSessionKey: "main",
      drainsContinuationDelegateQueue: false,
    });

    expect(tools.some((tool) => tool.name === "continue_delegate")).toBe(false);
  });

  // [#446] Exact-keys trap for continue_delegate descriptor.
  //
  // Bug-shape / risk:
  //   #438's mode-only trap (PR #462) pins that `mode` is exposed as an enum
  //   AND that boolean `silent`/`silentWake` are absent. This test extends
  //   that surface with the COMPLEMENTARY pin: the EXACT set of advertised
  //   parameter keys on the tool descriptor. A refactor that adds a new
  //   model-facing parameter (cross-session addressing, retry knobs, priority)
  //   without an ADR would slip past #438's trap because #438 only checks
  //   what MUST be absent (silent/silentWake) and what MUST be present (mode
  //   enum). This trap pins the closed set.
  //
  // The canonical advertised keys (cf7830ffb3) are:
  //   - task         (required)
  //   - delaySeconds (optional)
  //   - mode         (optional, enum)
  //
  // Extension to #438's mode-only trap, not duplication: #438 lives in
  // `src/auto-reply/continuation/types.mode-shape.test.ts` and asserts
  // mode-as-enum + silent/silentWake-absent on the descriptor. This file
  // asserts the closed-set + targetSessionKey-absent + boolean-runtime-absent.
  it("pins continue_delegate descriptor to mode enum and no boolean compatibility fields", () => {
    const tools = createOpenClawTools({
      config,
      agentSessionKey: "main",
    });
    const tool = tools.find((candidate) => candidate.name === "continue_delegate");
    if (!tool) {
      throw new Error("continue_delegate tool not registered");
    }

    const params = tool.parameters as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(params.type).toBe("object");
    const properties = params.properties ?? {};

    // Closed-set assertion: exactly these advertised keys, no more, no less.
    const expectedKeys = ["task", "delaySeconds", "mode"].toSorted();
    const actualKeys = Object.keys(properties).toSorted();
    expect(
      actualKeys,
      `continue_delegate descriptor must advertise exactly [task, delaySeconds, mode]; got [${actualKeys.join(", ")}]`,
    ).toEqual(expectedKeys);

    // task is required (model-facing contract).
    expect(params.required).toContain("task");

    // mode enum must include the four canonical values.
    const modeProp = properties.mode as {
      anyOf?: Array<{ const?: string; enum?: string[] }>;
      enum?: string[];
    };
    const modeEnumValues = new Set<string>();
    if (Array.isArray(modeProp.enum)) {
      for (const v of modeProp.enum) {
        modeEnumValues.add(v);
      }
    }
    if (Array.isArray(modeProp.anyOf)) {
      for (const branch of modeProp.anyOf) {
        if (typeof branch.const === "string") {
          modeEnumValues.add(branch.const);
        }
        if (Array.isArray(branch.enum)) {
          for (const v of branch.enum) {
            modeEnumValues.add(v);
          }
        }
      }
    }
    for (const expected of ["normal", "silent", "silent-wake", "post-compaction"]) {
      expect(
        modeEnumValues.has(expected),
        `mode enum must include '${expected}' (got: ${[...modeEnumValues].join(", ")})`,
      ).toBe(true);
    }

    // Boolean-runtime compatibility fields MUST be absent at the descriptor.
    // (Their on-disk back-compat lives in the Zod state schema, not the tool surface.)
    for (const forbidden of ["silent", "silentWake", "postCompaction"]) {
      expect(
        Object.prototype.hasOwnProperty.call(properties, forbidden),
        `continue_delegate descriptor must not expose boolean compatibility field '${forbidden}'`,
      ).toBe(false);
    }

    // Cross-session addressing belongs to the (b)-shape lane (binary-canticle#11),
    // not this verb. Reaffirmed here as part of the closed-set check, but kept
    // as an explicit named assertion so a future regression surfaces with the
    // load-bearing reason in the failure message.
    expect(
      Object.prototype.hasOwnProperty.call(properties, "targetSessionKey"),
      "continue_delegate descriptor must not expose 'targetSessionKey' — cross-session addressing is the (b)-shape lane (binary-canticle#11)",
    ).toBe(false);
  });
});
