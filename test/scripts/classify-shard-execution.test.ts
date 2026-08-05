// Pure unit proofs for the #1341 shard-execution classifier (increment-1).
// Freeze: 🪨 CUT=A audit-inc-1 (#1534401220993876108).
// Phase split: classify (audit emit) vs assertMixedRoutingEligible (dark seam).
// Tiny tables = unit fixtures only; tip-plan full coverage is a separate proof.
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

/** Tiny unit-fixture tables (WO item 8). Not the tip-plan seed. */
const TINY_RULESET = {
  classifier_version: CLASSIFIER_VERSION,
  ruleset_id: "shard-execution-ruleset-unit-fixture",
  identity_fields: ["check_name", "shard_name"],
  hermetic: [
    {
      check_name: HERMETIC_SEED.check_name,
      shard_name: HERMETIC_SEED.shard_name,
      local_capabilities: [],
      reason: "unit fixture: pure hermetic stripe",
    },
  ],
  host_local: [
    {
      check_name: HOST_LOCAL_SEED.check_name,
      shard_name: HOST_LOCAL_SEED.shard_name,
      local_capabilities: ["gateway"],
      reason: "unit fixture: host_local gateway",
    },
  ],
};

function rulesetFrom(json: unknown) {
  return loadRuleset(json as object);
}

describe("scripts/lib/shard-execution/classify-shard-execution.mjs", () => {
  it("ruleset_digest is stable for fixed table bytes", () => {
    const a = loadRuleset(TINY_RULESET);
    const b = loadRuleset(TINY_RULESET);
    expect(a.ruleset_digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(a.ruleset_digest).toBe(b.ruleset_digest);
    expect(digestRuleset(a)).toBe(a.ruleset_digest);
    expect(a.classifier_version).toBe(CLASSIFIER_VERSION);
  });

  it("dup/conflicting table key → load failure", () => {
    expect(() =>
      rulesetFrom({
        ...TINY_RULESET,
        hermetic: [
          ...TINY_RULESET.hermetic,
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
        ...TINY_RULESET,
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
    const ruleset = loadRuleset(TINY_RULESET);
    const row = classifyPlannerRow(HERMETIC_SEED, ruleset, {
      policy: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(row.capability_class).toBe("hermetic");
    expect(row.proposed_execution_class).toBe("hosted");
    expect(row.effective_execution_class).toBe("self-hosted");
    expect(row.blocked).toBe(false);
    expect(row.match).toBe("exact");
    expect(row.planner_identity).toEqual(plannerIdentity(HERMETIC_SEED));
    expect(row.classifier_version).toBe(CLASSIFIER_VERSION);
    expect(row.ruleset_digest).toBe(ruleset.ruleset_digest);
  });

  it("2. host-local → self-hosted + expected local_capabilities", () => {
    const ruleset = loadRuleset(TINY_RULESET);
    const row = classifyPlannerRow(HOST_LOCAL_SEED, ruleset, {
      policy: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(row.capability_class).toBe("host_local");
    expect(row.local_capabilities).toEqual(["gateway"]);
    expect(row.proposed_execution_class).toBe("self-hosted");
    expect(row.effective_execution_class).toBe("self-hosted");
    expect(row.blocked).toBe(false);
  });

  it("3a. classify(unknown): Mode A proposed=blocked (NOT self-hosted) + effective self-hosted + diagnostic", () => {
    const ruleset = loadRuleset(TINY_RULESET);
    const row = classifyPlannerRow(UNKNOWN_ROW, ruleset, {
      policy: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(row.capability_class).toBe("unknown");
    expect(row.match).toBe("unmatched");
    // 🪨 Mode-A proposed byte: blocked, never self-hosted on unmatched.
    expect(row.proposed_execution_class).toBe("blocked");
    expect(row.proposed_execution_class).not.toBe("self-hosted");
    expect(row.blocked).toBe(true);
    expect(row.effective_execution_class).toBe("self-hosted");
    expect(row.diagnostic?.code).toBe("unknown_identity_audit");
    expect(row.reason).toMatch(/absent from digest-bound ruleset/u);

    // classifyPlan audit may include unmatched rows (not a mixed router).
    const artifact = classifyPlan([HERMETIC_SEED, UNKNOWN_ROW], ruleset, {
      policy: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(artifact.identity_coverage.unknown).toBe(1);
    // Mode A attestation totality: unknown is a valid observed row; alias + predicates named.
    expect(artifact.identity_coverage.unknown_count).toBe(artifact.identity_coverage.unknown);
    expect(artifact.identity_coverage.attestation_complete).toBe(true);
    expect(artifact.identity_coverage.ruleset_match_complete).toBe(false);
    expect(artifact.runs_on_unchanged).toBe(true);
    expect(artifact.planner_digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(artifact.ruleset_digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(artifact.planner_digest).not.toBe(artifact.ruleset_digest);
    for (const r of artifact.rows) {
      expect(r.effective_execution_class).toBe("self-hosted");
      expect(r.planner_digest).toBe(artifact.planner_digest);
      expect(r.ruleset_digest).toBe(artifact.ruleset_digest);
      expect(r.classifier_version).toBe(artifact.classifier_version);
    }
    const unknownRow = artifact.rows.find((r) => r.match === "unmatched");
    expect(unknownRow?.proposed_execution_class).toBe("blocked");
    expect(unknownRow?.blocked).toBe(true);
  });

  it("coverage predicates: Mode A attestation vs Mode B ruleset-match", () => {
    const ruleset = loadRuleset(TINY_RULESET);
    const dirty = classifyPlan([HERMETIC_SEED, UNKNOWN_ROW], ruleset, {
      policy: "bootstrap",
      hostedSelectionAvailable: false,
    });
    // Mode A: 100% attestation over planner_digest (every emitted identity has a row),
    // even when unknown_count > 0. Not a soft %-threshold.
    expect(dirty.identity_coverage.emitted).toBe(2);
    expect(dirty.identity_coverage.attestation_complete).toBe(true);
    expect(dirty.rows).toHaveLength(dirty.identity_coverage.emitted);
    expect(dirty.identity_coverage.unknown).toBe(1);
    expect(dirty.identity_coverage.unknown_count).toBe(1);
    expect(dirty.identity_coverage.ruleset_match_complete).toBe(false);

    // Mode B: ruleset-match terminal before selection when unknown_count !== 0.
    expect(() => assertMixedRoutingEligible(dirty)).toThrow(/mixed-routing ineligible/u);

    const clean = classifyPlan([HERMETIC_SEED, HOST_LOCAL_SEED], ruleset, {
      policy: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(clean.identity_coverage.attestation_complete).toBe(true);
    expect(clean.identity_coverage.ruleset_match_complete).toBe(true);
    expect(clean.identity_coverage.unknown_count).toBe(0);
    expect(assertMixedRoutingEligible(clean)).toBe(clean);
  });

  it("3a-mixed. Mode B unknown row: proposed blocked, NO effective_execution_class", () => {
    const ruleset = loadRuleset(TINY_RULESET);
    const row = classifyPlannerRow(UNKNOWN_ROW, ruleset, {
      policy: "enforced",
      hostedSelectionAvailable: true,
    });
    expect(row.capability_class).toBe("unknown");
    expect(row.proposed_execution_class).toBe("blocked");
    expect(row.blocked).toBe(true);
    expect(row.diagnostic?.code).toBe("unknown_identity_terminal");
    expect(row.effective_execution_class).toBeUndefined();
    expect("effective_execution_class" in row && row.effective_execution_class !== undefined).toBe(
      false,
    );
  });

  it("3c. bootstrap cannot be selected implicitly; default policy is enforced", () => {
    const ruleset = loadRuleset(TINY_RULESET);
    const implicit = classifyPlannerRow(UNKNOWN_ROW, ruleset, {});
    expect(implicit.policy).toBe("enforced");
    expect(implicit.policy).not.toBe("bootstrap");
    expect(implicit.proposed_execution_class).toBe("blocked");
    expect(implicit.effective_execution_class).toBeUndefined();
    expect(implicit.diagnostic?.code).toBe("unknown_identity_terminal");

    const boot = classifyPlannerRow(UNKNOWN_ROW, ruleset, {
      policy: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(boot.policy).toBe("bootstrap");
    expect(boot.effective_execution_class).toBe("self-hosted");
    expect(boot.diagnostic?.code).toBe("unknown_identity_audit");
    expect(boot.proposed_execution_class).toBe("blocked");

    const plan = classifyPlan([UNKNOWN_ROW], ruleset, {});
    expect(plan.policy).toBe("enforced");
    expect(plan.rows[0]?.effective_execution_class).toBeUndefined();
  });

  it("3b. assertMixedRoutingEligible(plan): rejects unknown before matrix/runner selection", () => {
    const ruleset = loadRuleset(TINY_RULESET);
    const dirty = classifyPlan([HERMETIC_SEED, UNKNOWN_ROW], ruleset, {
      policy: "bootstrap",
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
      policy: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(assertMixedRoutingEligible(clean)).toBe(clean);
  });

  it("4. requires_dist=true hermetic still hermetic (ortho)", () => {
    const ruleset = loadRuleset(TINY_RULESET);
    const withDist = classifyPlannerRow(
      { ...HERMETIC_SEED, requiresDist: true, requires_dist: true },
      ruleset,
      { policy: "bootstrap", hostedSelectionAvailable: false },
    );
    const withoutDist = classifyPlannerRow({ ...HERMETIC_SEED, requiresDist: false }, ruleset, {
      policy: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(withDist.capability_class).toBe("hermetic");
    expect(withoutDist.capability_class).toBe("hermetic");
    expect(withDist.proposed_execution_class).toBe("hosted");
    expect(withDist.proposed_execution_class).toBe(withoutDist.proposed_execution_class);
  });

  it("6. dup emitted identity → plan terminal", () => {
    const ruleset = loadRuleset(TINY_RULESET);
    expect(() =>
      classifyPlan([HERMETIC_SEED, HERMETIC_SEED], ruleset, {
        policy: "bootstrap",
        hostedSelectionAvailable: false,
      }),
    ).toThrow(/duplicate emitted planner identity/u);
  });

  it("7. unmatched emitted identity → classification unknown; mixed eligibility terminal", () => {
    const ruleset = loadRuleset(TINY_RULESET);
    expect(() => loadRuleset(TINY_RULESET)).not.toThrow();
    const artifact = classifyPlan([UNKNOWN_ROW], ruleset, {
      policy: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(artifact.identity_coverage.unknown).toBe(1);
    expect(artifact.rows[0]?.capability_class).toBe("unknown");
    expect(() => assertMixedRoutingEligible(artifact)).toThrow(
      /UNKNOWN_IDENTITY_TERMINAL|mixed-routing ineligible/u,
    );
  });

  it("8–9. ruleset_digest stable; planner_digest reflects exact emitted identity set", () => {
    const ruleset = loadRuleset(TINY_RULESET);
    const planRows = [HOST_LOCAL_SEED, HERMETIC_SEED];
    const artifact = classifyPlan(planRows, ruleset, {
      policy: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(artifact.ruleset_digest).toBe(ruleset.ruleset_digest);
    expect(artifact.planner_digest).toBe(plannerDigest(planRows));
    expect(artifact.planner_digest).toBe(plannerDigest([HERMETIC_SEED, HOST_LOCAL_SEED]));
    expect(artifact.planner_digest).not.toBe(artifact.ruleset_digest);
    expect(artifact.planner_digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it("10. inc-1 emit cannot change runs-on (still all-self-hosted)", () => {
    const ruleset = loadRuleset(TINY_RULESET);
    const artifact = classifyPlan([HERMETIC_SEED, HOST_LOCAL_SEED], ruleset, {
      policy: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(artifact.runs_on_unchanged).toBe(true);
    expect(artifact.effective_topology).toBe("all-self-hosted");
    expect(artifact.identity_coverage.unknown).toBe(0);
    expect(artifact.identity_coverage.unknown_count).toBe(0);
    expect(artifact.identity_coverage.matched).toBe(2);
    expect(artifact.identity_coverage.matched_ratio).toBe(1);
    expect(artifact.identity_coverage.attestation_complete).toBe(true);
    expect(artifact.identity_coverage.ruleset_match_complete).toBe(true);

    for (const row of artifact.rows) {
      expect(row.effective_execution_class).toBe("self-hosted");
      expect(row.classifier_version).toBe(CLASSIFIER_VERSION);
      expect(row.ruleset_digest).toBe(ruleset.ruleset_digest);
      expect(row.planner_identity.check_name).toBeTruthy();
      expect(row.planner_identity.shard_name).toBeTruthy();
    }

    // proposed may be hosted; effective never flips from classifier emission.
    const hermetic = artifact.rows.find((r) => r.capability_class === "hermetic");
    expect(hermetic?.proposed_execution_class).toBe("hosted");
    expect(hermetic?.effective_execution_class).toBe("self-hosted");
  });

  it("no implicit capability_class from kind/shard_group/configs/includePatterns", () => {
    const ruleset = loadRuleset(TINY_RULESET);
    const row = classifyPlannerRow(
      {
        ...UNKNOWN_ROW,
        configs: ["test/vitest/vitest.unit.config.ts"],
        includePatterns: ["src/**/*.test.ts"],
        kind: "unit",
        shard_group: "core",
      },
      ruleset,
      { policy: "bootstrap", hostedSelectionAvailable: false },
    );
    expect(row.capability_class).toBe("unknown");
    expect(row.proposed_execution_class).toBe("blocked");
    expect(row.match).toBe("unmatched");
  });

  it("accepts camelCase planner fields from createNodeTestShards shape", () => {
    const ruleset = loadRuleset(TINY_RULESET);
    const row = classifyPlannerRow(
      {
        checkName: HERMETIC_SEED.check_name,
        shardName: HERMETIC_SEED.shard_name,
      },
      ruleset,
      { policy: "bootstrap", hostedSelectionAvailable: false },
    );
    expect(row.match).toBe("exact");
    expect(identityKey(row.planner_identity)).toBe(identityKey(HERMETIC_SEED));
  });

  it("WO8 tip-plan seed covers every identity createNodeTestShards emits", async () => {
    // Tip seed lives in ruleset.v1.json; tiny tables are unit fixtures only.
    const plan = await import("../../scripts/lib/ci-node-test-plan.mjs");
    const shards = plan.createNodeTestShards();
    expect(Array.isArray(shards)).toBe(true);
    expect(shards.length).toBeGreaterThan(0);

    const ruleset = loadRuleset(defaultRulesetJson);
    const rows = shards.map((shard: { checkName?: string; shardName?: string }) => ({
      checkName: shard.checkName,
      shardName: shard.shardName,
    }));
    const artifact = classifyPlan(rows, ruleset, {
      policy: "bootstrap",
      hostedSelectionAvailable: false,
    });

    expect(artifact.identity_coverage.emitted).toBe(shards.length);
    expect(artifact.identity_coverage.unknown).toBe(0);
    expect(artifact.identity_coverage.unknown_count).toBe(0);
    expect(artifact.identity_coverage.matched).toBe(shards.length);
    expect(artifact.identity_coverage.matched_ratio).toBe(1);
    expect(artifact.identity_coverage.attestation_complete).toBe(true);
    expect(artifact.identity_coverage.ruleset_match_complete).toBe(true);
    expect(artifact.runs_on_unchanged).toBe(true);
    expect(artifact.planner_digest).toBe(plannerDigest(rows));
    // assertMixedRoutingEligible NOT required for tip audit (Mode A).
    for (const row of artifact.rows) {
      expect(row.capability_class === "hermetic" || row.capability_class === "host_local").toBe(
        true,
      );
      expect(row.effective_execution_class).toBe("self-hosted");
    }
  });
});
