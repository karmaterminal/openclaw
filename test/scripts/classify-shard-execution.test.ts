// Pure unit proofs for the #1341 shard-execution classifier (increment-1).
import { describe, expect, it } from "vitest";
import {
  CLASSIFIER_VERSION,
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
  it("loads the committed ruleset and attests version + digest", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    expect(ruleset.classifier_version).toBe(CLASSIFIER_VERSION);
    expect(ruleset.ruleset_digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(ruleset.hermetic.length).toBeGreaterThan(0);
    expect(ruleset.host_local.length).toBeGreaterThan(0);
    // Digest is stable for the same canonical payload.
    expect(digestRuleset(ruleset)).toBe(ruleset.ruleset_digest);
  });

  it("ruleset-load error: duplicate canonical table identity", () => {
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

  it("ruleset-load error: invalid host_local row missing capabilities", () => {
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

  it("ruleset-load error: invalid capability token", () => {
    expect(() =>
      rulesetFrom({
        ...defaultRulesetJson,
        host_local: [
          {
            check_name: "checks-node-bad-cap",
            shard_name: "bad-cap",
            local_capabilities: ["daemon-import"],
            reason: "implicit capability not allowed",
          },
        ],
      }),
    ).toThrow(/local_capabilities\[0\] invalid/u);
  });

  it("proof 1: hermetic → proposed hosted (Mode B path)", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    const row = classifyPlannerRow(HERMETIC_SEED, ruleset, {
      mode: "mixed",
      hostedSelectionAvailable: true,
    });
    expect(row.capability).toBe("hermetic");
    expect(row.proposed_execution_class).toBe("hosted");
    expect(row.effective_execution_class).toBe("self-hosted");
    expect(row.blocked).toBe(false);
    expect(row.planner_identity).toEqual(plannerIdentity(HERMETIC_SEED));
    expect(row.classifier_version).toBe(CLASSIFIER_VERSION);
    expect(row.ruleset_digest).toBe(ruleset.ruleset_digest);
    expect(row.match).toBe("exact");
  });

  it("proof 2: host-local → proposed self-hosted", () => {
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
    expect(row.planner_identity).toEqual(plannerIdentity(HOST_LOCAL_SEED));
  });

  it("proof 3 Mode A audit: unknown → proposed blocked + audit finding; effective stays pre-existing self-hosted", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    const row = classifyPlannerRow(UNKNOWN_ROW, ruleset, {
      mode: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(row.capability).toBe("unknown");
    expect(row.match).toBe("unmatched");
    // Total classifier: proposed is always blocked for unknown (not soft-local).
    expect(row.proposed_execution_class).toBe("blocked");
    expect(row.blocked).toBe(true);
    // Effective remains pre-existing self-hosted: classifier has zero runs-on authority.
    expect(row.effective_execution_class).toBe("self-hosted");
    expect(row.diagnostic?.code).toBe("unknown_identity_audit");
    expect(row.hosted_selection_available).toBe(false);

    // Audit plan does not throw on unknown — emits finding; topology unchanged.
    const artifact = classifyPlan([HERMETIC_SEED, UNKNOWN_ROW], ruleset, {
      mode: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(artifact.identity_coverage.unknown).toBe(1);
    expect(artifact.runs_on_unchanged).toBe(true);
    expect(artifact.rows.every((r) => r.effective_execution_class === "self-hosted")).toBe(true);
  });

  it("proof 4 Mode B mixed: unknown → proposed blocked; planner-layer terminal before matrix/runs-on", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    const row = classifyPlannerRow(UNKNOWN_ROW, ruleset, {
      mode: "mixed",
      hostedSelectionAvailable: true,
    });
    expect(row.capability).toBe("unknown");
    expect(row.proposed_execution_class).toBe("blocked");
    expect(row.blocked).toBe(true);
    expect(row.effective_execution_class).toBe("self-hosted");
    expect(row.diagnostic?.code).toBe("unknown_identity_terminal");

    expect(() =>
      classifyPlan([HERMETIC_SEED, UNKNOWN_ROW], ruleset, {
        mode: "mixed",
        hostedSelectionAvailable: true,
      }),
    ).toThrow(/unknown identity\(ies\) under mixed routing/u);

    try {
      classifyPlan([UNKNOWN_ROW], ruleset, {
        mode: "mixed",
        hostedSelectionAvailable: true,
      });
      expect.unreachable("expected terminal plan error");
    } catch (error) {
      const err = error as Error & { code?: string; unknowns?: unknown[] };
      expect(err.code).toBe("UNKNOWN_IDENTITY_TERMINAL");
      expect(err.unknowns).toEqual([plannerIdentity(UNKNOWN_ROW)]);
    }
  });

  it("emitted identity absent is classification unknown, not ruleset-load error", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    // load still succeeds with the committed table; absence is per-row.
    const row = classifyPlannerRow(UNKNOWN_ROW, ruleset, {
      mode: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(row.capability).toBe("unknown");
    expect(row.reason).toMatch(/absent from digest-bound ruleset/u);
  });

  it("plan rejects duplicate emitted planner identities", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    expect(() =>
      classifyPlan([HERMETIC_SEED, HERMETIC_SEED], ruleset, {
        mode: "bootstrap",
        hostedSelectionAvailable: false,
      }),
    ).toThrow(/duplicate emitted planner identity/u);
  });

  it("artifact attests version, ruleset_digest, planner_digest, exact identity; increment-1 runs-on unchanged", () => {
    const ruleset = loadRuleset(defaultRulesetJson);
    const planRows = [HERMETIC_SEED, HOST_LOCAL_SEED, UNKNOWN_ROW];
    const artifact = classifyPlan(planRows, ruleset, {
      mode: "bootstrap",
      hostedSelectionAvailable: false,
    });
    expect(artifact.classifier_version).toBe(CLASSIFIER_VERSION);
    expect(artifact.ruleset_digest).toBe(ruleset.ruleset_digest);
    expect(artifact.planner_digest).toBe(plannerDigest(planRows));
    expect(artifact.planner_digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    // Distinct digests: table bytes ≠ emitted identity set.
    expect(artifact.planner_digest).not.toBe(artifact.ruleset_digest);
    expect(artifact.runs_on_unchanged).toBe(true);
    expect(artifact.effective_topology).toBe("all-self-hosted");
    expect(artifact.identity_coverage.emitted).toBe(3);
    expect(artifact.identity_coverage.matched).toBe(2);
    expect(artifact.identity_coverage.unknown).toBe(1);
    expect(artifact.identity_coverage.matched_ratio).toBeCloseTo(2 / 3);

    for (const row of artifact.rows) {
      expect(row.planner_identity.check_name).toBeTruthy();
      expect(row.planner_identity.shard_name).toBeTruthy();
      expect(row.classifier_version).toBe(CLASSIFIER_VERSION);
      expect(row.ruleset_digest).toBe(ruleset.ruleset_digest);
      // proposed may be hosted; effective stays self-hosted in increment-1.
      expect(row.effective_execution_class).toBe("self-hosted");
    }

    const hermetic = artifact.rows.find((r) => r.capability === "hermetic");
    expect(hermetic?.proposed_execution_class).toBe("hosted");
    expect(hermetic?.effective_execution_class).toBe("self-hosted");
  });

  it("requires_dist is orthogonal to capability classification", () => {
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
    expect(withDist.proposed_execution_class).toBe(withoutDist.proposed_execution_class);
    // Artifact path does not consult requires_dist for capability or route.
    expect(withDist.local_capabilities).toEqual([]);
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

  it("does not infer capability from configs/includePatterns (no implicit capability)", () => {
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
    // Evidence fields present must not flip unknown → hermetic.
    expect(row.capability).toBe("unknown");
    expect(row.match).toBe("unmatched");
  });
});
