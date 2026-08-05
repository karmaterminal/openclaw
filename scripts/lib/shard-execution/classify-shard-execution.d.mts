export const CLASSIFIER_VERSION: string;
export const DEFAULT_RULESET_PATH: string;

export type PlannerIdentity = {
  check_name: string;
  shard_name: string;
};

export type ClassifierPolicy = "bootstrap" | "enforced";
/** @deprecated use ClassifierPolicy; "mixed" was renamed to enforced */
export type ClassifierMode = ClassifierPolicy;

export type CapabilityClass = "hermetic" | "host_local" | "unknown";

export type ProposedExecutionClass = "hosted" | "self-hosted" | "blocked";

export type ClassifyOptions = {
  /** Explicit policy. Default = enforced. bootstrap is NEVER implicit. */
  policy?: ClassifierPolicy;
  /** @deprecated use policy; "mixed" aliases to enforced */
  mode?: ClassifierPolicy | "mixed";
  hostedSelectionAvailable?: boolean;
};

export type ClassificationRow = {
  planner_identity: PlannerIdentity;
  match: "exact" | "unmatched" | "none";
  capability_class: CapabilityClass;
  local_capabilities: string[];
  reason: string;
  proposed_execution_class: ProposedExecutionClass;
  /** bootstrap always; enforced rejected-unknown omits (no effective route). */
  effective_execution_class?: "self-hosted";
  blocked: boolean;
  diagnostic: { code: string; message: string } | null;
  classifier_version: string;
  ruleset_digest: string;
  /** Stamped by classifyPlan once emitted identity set is known. */
  planner_digest?: string;
  ruleset_id: string;
  policy: ClassifierPolicy;
  mode: ClassifierPolicy;
  hosted_selection_available: boolean;
};

export type PlanArtifact = {
  classifier_version: string;
  ruleset_id: string;
  ruleset_digest: string;
  planner_digest: string;
  policy: ClassifierPolicy;
  mode: ClassifierPolicy;
  hosted_selection_available: boolean;
  identity_coverage: {
    emitted: number;
    matched: number;
    unknown: number;
    /** Alias of `unknown` (WO literal field name). */
    unknown_count: number;
    blocked: number;
    matched_ratio: number;
    /** Mode A: every emitted identity has a classification row over planner_digest. */
    attestation_complete: boolean;
    /** Mode B: ruleset-match total — unknown_count === 0 before selection. */
    ruleset_match_complete: boolean;
  };
  runs_on_unchanged: true;
  effective_topology: "all-self-hosted";
  rows: ClassificationRow[];
};

export function plannerIdentity(row: {
  check_name?: string;
  checkName?: string;
  shard_name?: string;
  shardName?: string;
}): PlannerIdentity;

export function identityKey(identity: PlannerIdentity): string;

export function plannerDigest(rows: object[]): string;

export function loadRuleset(source?: string | object): {
  classifier_version: string;
  ruleset_id: string;
  identity_fields: string[];
  hermetic: Array<PlannerIdentity & { capability_class: "hermetic"; local_capabilities: string[]; reason: string }>;
  host_local: Array<PlannerIdentity & { capability_class: "host_local"; local_capabilities: string[]; reason: string }>;
  ruleset_digest: string;
  byKey: Map<string, unknown>;
};

export function digestRuleset(canonical: object): string;

export function classifyPlannerRow(
  row: object,
  ruleset: ReturnType<typeof loadRuleset>,
  options?: ClassifyOptions,
): ClassificationRow;

export function classifyPlan(
  rows: object[],
  ruleset: ReturnType<typeof loadRuleset>,
  options?: ClassifyOptions,
): PlanArtifact;

export function assertMixedRoutingEligible(
  planOrArtifact: PlanArtifact | { rows?: ClassificationRow[]; identity_coverage?: { unknown?: number } },
): PlanArtifact | { rows?: ClassificationRow[]; identity_coverage?: { unknown?: number } };

export function classifyPlanWithDefaultRuleset(
  rows: object[],
  options?: ClassifyOptions,
): PlanArtifact;
