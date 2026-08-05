// Pure unit proofs for the #1341 shard-execution classifier (increment-1).
// Phase split: classify (audit emit) vs assertMixedRoutingEligible (dark seam).
import { describe, expect, it } from "vitest";
import {
  CLASSIFIER_VERSION,
  assertMixedRoutingEligible,
  classifyPlan,
  classifyPlannerRow,
  digestRuleset,
  identityKey,
  loadRuleset,
  plannerDigest,
  plannerIdentity,
} from "../../scripts/lib/shard-execution/classify-shard-execution.mjs";
import defaultRulesetJson from "../../scripts/lib/shard-execution/ruleset.v1.json" with { type: "json" };

const HERMETIC_SEED = {
  check_name: "checks-node-core-fast-1",
  shard_name: "core-unit-fast-1",
};

const HOST_LOCAL_SEED = {
  check_name: "checks-node-agentic-control-plane-startup-core",
  shard_name: "agentic-control-plane-startup-core",
};

const UNKNOWN_ROW = {
  check_name: "checks-node-never-seeded-upstream-shard",
  shard_name: "never-seeded-upstream-shard",
};

function rulesetFrom(json: unknown) {
  return loadRuleset(json as object);
}

describe("scripts/lib/shard-execution/classify-shard-execution.mjs", () => {
  it("ruleset_digest is stable for fixed table bytes", () => {
    const a = loadRuleset(defaultRulesetJson);
    const b = loadRuleset(defaultRulesetJson);
    expect(a.ruleset_digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(a.ruleset_digest).toBe(b.ruleset_digest);
    expect(digestRuleset(a)).toBe(a.ruleset_digest);
    expect(a.classifier_version).toBe(CLASSIFIER_VERSION);
  });

  it("dup/conflicting table key → load failure", () => {
    expect(() =>
      rulesetFrom({
        ...defaultRulesetJson,
        hermetic: [
          ...defaultRulesetJson.hermetic,
          {
            ...HERMETIC_SEED,
            local_capabilities: [],
            reason: "duplicate seed",
          },
        ],
      }),
    ).toThrow(/ruleset-load error: duplicate canonical identity/u);
  });

  it("invalid table row → load failure", () => {
    expect(() =>
      rulesetFrom({
        ...defaultRulesetJson,
        host_local: [
          {
            check_name: "checks-node-bad",
            shard_name: "bad",
            local_capabilities: [],
            reason: "missing caps",
          },
        ],
      }),
    ).toThrow(/host_local rows must declare at least one local_capability/u);
  });

  it("1. hermetic → proposed_execution_class=hosted", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    const row = classifyPlannerRow(HERMETIC_SEED, ruleset, {
      mode: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(row.capability).toBe("hermetic");
    expect(row.proposed_execution_class).toBe("hosted");
    expect(row.effective_execution_class).toBe("self-hosted");
    expect(row.blocked).toBe(false);
    expect(row.match).toBe("exact");
    expect(row.planner_identity).toEqual(plannerIdentity(HERMETIC_SEED));
    expect(row.classifier_version).toBe(CLASSIFIER_VERSION);
    expect(row.ruleset_digest).toBe(ruleset.ruleset_digest);
  });

  it("2. host-local → self-hosted + expected local_capabilities", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    const row = classifyPlannerRow(HOST_LOCAL_SEED, ruleset, {
      mode: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(row.capability).toBe("host_local");
    expect(row.local_capabilities).toEqual(["gateway"]);
    expect(row.proposed_execution_class).toBe("self-hosted");
    expect(row.effective_execution_class).toBe("self-hosted");
    expect(row.blocked).toBe(false);
  });

  it("3a. classify(unknown): emits unknown + proposed blocked; effective stays independently self-hosted", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    const row = classifyPlannerRow(UNKNOWN_ROW, ruleset, {
      mode: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(row.capability).toBe("unknown");
    expect(row.match).toBe("unmatched");
    expect(row.proposed_execution_class).toBe("blocked");
    expect(row.blocked).toBe(true);
    // Unchanged workflow still has independently determined effective self-hosted.
    expect(row.effective_execution_class).toBe("self-hosted");
    expect(row.reason).toMatch(/absent from digest-bound ruleset/u);

    // classifyPlan audit may include unmatched rows (not a mixed router).
    const artifact = classifyPlan([HERMETIC_SEED, UNKNOWN_ROW], ruleset, {
      mode: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(artifact.identity_coverage.unknown).toBe(1);
    expect(artifact.runs_on_unchanged).toBe(true);
    expect(artifact.rows.every((r) => r.effective_execution_class === "self-hosted")).toBe(true);
  });

  it("3b. assertMixedRoutingEligible(plan): rejects unknown before matrix/runner selection", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    const dirty = classifyPlan([HERMETIC_SEED, UNKNOWN_ROW], ruleset, {
      mode: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(() => assertMixedRoutingEligible(dirty)).toThrow(/mixed-routing ineligible/u);
    try {
      assertMixedRoutingEligible(dirty);
      expect.unreachable("expected terminal eligibility error");
    } catch (error) {
      const err = error as Error & { code?: string; unknowns?: unknown[] };
      expect(err.code).toBe("UNKNOWN_IDENTITY_TERMINAL");
      expect(err.unknowns).toEqual([plannerIdentity(UNKNOWN_ROW)]);
    }

    const clean = classifyPlan([HERMETIC_SEED, HOST_LOCAL_SEED], ruleset, {
      mode: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(assertMixedRoutingEligible(clean)).toBe(clean);
  });

  it("4. requires_dist=true hermetic still hermetic (ortho)", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    const withDist = classifyPlannerRow(
      { ...HERMETIC_SEED, requiresDist: true, requires_dist: true },
      ruleset,
      { mode: "bootstrap", hostedSelectionAvailable: false },
    );
    const withoutDist = classifyPlannerRow({ ...HERMETIC_SEED, requiresDist: false }, ruleset, {
      mode: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(withDist.capability).toBe("hermetic");
    expect(withoutDist.capability).toBe("hermetic");
    expect(withDist.proposed_execution_class).toBe("hosted");
    expect(withDist.proposed_execution_class).toBe(withoutDist.proposed_execution_class);
  });

  it("6. dup emitted identity → plan terminal", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    expect(() =>
      classifyPlan([HERMETIC_SEED, HERMETIC_SEED], ruleset, {
        mode: "bootstrap",
        hostedSelectionAvailable: false,
      }),
    ).toThrow(/duplicate emitted planner identity/u);
  });

  it("7. unmatched emitted identity → classification unknown; mixed eligibility terminal", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    expect(() => loadRuleset(defaultRulesetJson)).not.toThrow();
    const artifact = classifyPlan([UNKNOWN_ROW], ruleset, {
      mode: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(artifact.identity_coverage.unknown).toBe(1);
    expect(artifact.rows[0]?.capability).toBe("unknown");
    expect(() => assertMixedRoutingEligible(artifact)).toThrow(
      /UNKNOWN_IDENTITY_TERMINAL|mixed-routing ineligible/u,
    );
  });

  it("8–9. ruleset_digest stable; planner_digest reflects exact emitted identity set", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    const planRows = [HOST_LOCAL_SEED, HERMETIC_SEED];
    const artifact = classifyPlan(planRows, ruleset, {
      mode: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(artifact.ruleset_digest).toBe(ruleset.ruleset_digest);
    expect(artifact.planner_digest).toBe(plannerDigest(planRows));
    expect(artifact.planner_digest).toBe(plannerDigest([HERMETIC_SEED, HOST_LOCAL_SEED]));
    expect(artifact.planner_digest).not.toBe(artifact.ruleset_digest);
    expect(artifact.planner_digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it("10. inc-1 emit cannot change runs-on (still all-self-hosted)", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    const artifact = classifyPlan([HERMETIC_SEED, HOST_LOCAL_SEED], ruleset, {
      mode: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(artifact.runs_on_unchanged).toBe(true);
    expect(artifact.effective_topology).toBe("all-self-hosted");
    expect(artifact.identity_coverage.unknown).toBe(0);
    expect(artifact.identity_coverage.matched).toBe(2);
    expect(artifact.identity_coverage.matched_ratio).toBe(1);

    for (const row of artifact.rows) {
      expect(row.effective_execution_class).toBe("self-hosted");
      expect(row.classifier_version).toBe(CLASSIFIER_VERSION);
      expect(row.ruleset_digest).toBe(ruleset.ruleset_digest);
      expect(row.planner_identity.check_name).toBeTruthy();
      expect(row.planner_identity.shard_name).toBeTruthy();
    }

    // proposed may be hosted; effective never flips from classifier emission.
    const hermetic = artifact.rows.find((r) => r.capability === "hermetic");
    expect(hermetic?.proposed_execution_class).toBe("hosted");
    expect(hermetic?.effective_execution_class).toBe("self-hosted");
  });

  it("no implicit capability from kind/shard_group/configs/includePatterns", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    const row = classifyPlannerRow(
      {
        ...UNKNOWN_ROW,
        configs: ["test/vitest/vitest.unit.config.ts"],
        includePatterns: ["src/**/*.test.ts"],
        kind: "unit",
        shard_group: "core",
      },
      ruleset,
      { mode: "bootstrap", hostedSelectionAvailable: false },
    );
    expect(row.capability).toBe("unknown");
    expect(row.proposed_execution_class).toBe("blocked");
    expect(row.match).toBe("unmatched");
  });

  it("accepts camelCase planner fields from createNodeTestShards shape", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    const row = classifyPlannerRow(
      {
        checkName: HERMETIC_SEED.check_name,
        shardName: HERMETIC_SEED.shard_name,
      },
      ruleset,
      { mode: "bootstrap", hostedSelectionAvailable: false },
    );
    expect(row.match).toBe("exact");
    expect(identityKey(row.planner_identity)).toBe(identityKey(HERMETIC_SEED));
  });
});
