// Pure shard-execution classifier (increment-1 / #1341).
// Classifies planner identities against an explicit allow/deny ruleset.
// Does not select runners and must not mutate runs-on in audit/bootstrap.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CLASSIFIER_VERSION = "1.0.0";
export const DEFAULT_RULESET_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "ruleset.v1.json",
);

const VALID_CAPABILITIES = new Set(["hermetic", "host_local", "unknown"]);
const VALID_MODES = new Set(["bootstrap", "mixed"]);
const VALID_LOCAL_CAPS = new Set(["gateway", "sqlite", "journal", "swim", "seat"]);

/**
 * Stable planner identity tuple used for table match + attestation.
 * @param {{ check_name?: string, checkName?: string, shard_name?: string, shardName?: string }} row
 */
export function plannerIdentity(row) {
  const check_name = row.check_name ?? row.checkName;
  const shard_name = row.shard_name ?? row.shardName;
  if (typeof check_name !== "string" || check_name.length === 0) {
    throw new Error("planner identity requires non-empty check_name");
  }
  if (typeof shard_name !== "string" || shard_name.length === 0) {
    throw new Error("planner identity requires non-empty shard_name");
  }
  return { check_name, shard_name };
}

export function identityKey(identity) {
  const id = plannerIdentity(identity);
  return `${id.check_name}\u0000${id.shard_name}`;
}

function assertStringArray(value, path) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  for (const [i, entry] of value.entries()) {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error(`${path}[${i}] must be a non-empty string`);
    }
  }
}

function normalizeTableRow(row, path, expectedCapability) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`${path} must be an object`);
  }
  const identity = plannerIdentity(row);
  const local_capabilities = row.local_capabilities ?? [];
  assertStringArray(local_capabilities, `${path}.local_capabilities`);
  for (const [i, cap] of local_capabilities.entries()) {
    if (!VALID_LOCAL_CAPS.has(cap)) {
      throw new Error(
        `${path}.local_capabilities[${i}] invalid: ${cap} (allowed: ${[...VALID_LOCAL_CAPS].join(", ")})`,
      );
    }
  }
  if (expectedCapability === "hermetic" && local_capabilities.length > 0) {
    throw new Error(`${path}: hermetic rows must not declare local_capabilities`);
  }
  if (expectedCapability === "host_local" && local_capabilities.length === 0) {
    throw new Error(`${path}: host_local rows must declare at least one local_capability`);
  }
  const reason = row.reason;
  if (typeof reason !== "string" || reason.length === 0) {
    throw new Error(`${path}.reason must be a non-empty string`);
  }
  return {
    ...identity,
    capability: expectedCapability,
    local_capabilities: [...local_capabilities].toSorted((a, b) => a.localeCompare(b)),
    reason,
  };
}

/**
 * Load + validate ruleset. Duplicate/invalid canonical keys are ruleset-load errors.
 * @param {string | object} source path or already-parsed object
 */
export function loadRuleset(source = DEFAULT_RULESET_PATH) {
  const raw =
    typeof source === "string" ? JSON.parse(readFileSync(source, "utf8")) : structuredClone(source);

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("ruleset must be an object");
  }
  if (typeof raw.classifier_version !== "string" || raw.classifier_version.length === 0) {
    throw new Error("ruleset.classifier_version must be a non-empty string");
  }
  if (typeof raw.ruleset_id !== "string" || raw.ruleset_id.length === 0) {
    throw new Error("ruleset.ruleset_id must be a non-empty string");
  }
  if (!Array.isArray(raw.identity_fields) || raw.identity_fields.length === 0) {
    throw new Error("ruleset.identity_fields must be a non-empty array");
  }
  for (const field of raw.identity_fields) {
    if (field !== "check_name" && field !== "shard_name") {
      throw new Error(`ruleset.identity_fields contains unsupported field: ${field}`);
    }
  }

  const hermetic = Array.isArray(raw.hermetic) ? raw.hermetic : null;
  const host_local = Array.isArray(raw.host_local) ? raw.host_local : null;
  if (!hermetic) {
    throw new Error("ruleset.hermetic must be an array");
  }
  if (!host_local) {
    throw new Error("ruleset.host_local must be an array");
  }

  const byKey = new Map();
  const remember = (row, path, capability) => {
    const normalized = normalizeTableRow(row, path, capability);
    const key = identityKey(normalized);
    if (byKey.has(key)) {
      const prior = byKey.get(key);
      throw new Error(
        `ruleset-load error: duplicate canonical identity ${JSON.stringify(plannerIdentity(normalized))} (also at ${prior.path})`,
      );
    }
    byKey.set(key, { ...normalized, path });
    return normalized;
  };

  const hermeticRows = hermetic.map((row, i) => remember(row, `hermetic[${i}]`, "hermetic"));
  const hostLocalRows = host_local.map((row, i) => remember(row, `host_local[${i}]`, "host_local"));

  const canonical = {
    classifier_version: raw.classifier_version,
    ruleset_id: raw.ruleset_id,
    identity_fields: [...raw.identity_fields],
    hermetic: hermeticRows,
    host_local: hostLocalRows,
  };
  const ruleset_digest = digestRuleset(canonical);
  return {
    ...canonical,
    ruleset_digest,
    byKey,
  };
}

export function digestRuleset(canonical) {
  // Digest only stable classification inputs (not map order / path metadata).
  const payload = {
    classifier_version: canonical.classifier_version,
    ruleset_id: canonical.ruleset_id,
    identity_fields: canonical.identity_fields,
    hermetic: canonical.hermetic.map((row) => ({
      check_name: row.check_name,
      shard_name: row.shard_name,
      local_capabilities: row.local_capabilities,
      reason: row.reason,
    })),
    host_local: canonical.host_local.map((row) => ({
      check_name: row.check_name,
      shard_name: row.shard_name,
      local_capabilities: row.local_capabilities,
      reason: row.reason,
    })),
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

/**
 * Classify one planner row. Absent identity → capability unknown (not a load error).
 * @param {object} row planner identity-bearing row
 * @param {object} ruleset from loadRuleset
 * @param {{ mode?: 'bootstrap'|'mixed', hostedSelectionAvailable?: boolean }} options
 */
export function classifyPlannerRow(row, ruleset, options = {}) {
  const mode = options.mode ?? "bootstrap";
  if (!VALID_MODES.has(mode)) {
    throw new Error(`invalid classifier mode: ${mode}`);
  }
  const hostedSelectionAvailable = options.hostedSelectionAvailable ?? mode === "mixed";
  if (mode === "bootstrap" && hostedSelectionAvailable) {
    throw new Error("bootstrap mode requires hostedSelectionAvailable=false");
  }
  if (mode === "mixed" && !hostedSelectionAvailable) {
    throw new Error("mixed mode requires hostedSelectionAvailable=true");
  }

  const identity = plannerIdentity(row);
  const hit = ruleset.byKey.get(identityKey(identity));

  let capability;
  let local_capabilities;
  let reason;
  let match = "none";

  if (!hit) {
    capability = "unknown";
    local_capabilities = [];
    reason = "emitted planner identity absent from digest-bound ruleset";
    match = "unmatched";
  } else {
    capability = hit.capability;
    local_capabilities = hit.local_capabilities;
    reason = hit.reason;
    match = "exact";
  }

  if (!VALID_CAPABILITIES.has(capability)) {
    throw new Error(`internal: invalid capability ${capability}`);
  }

  // Prospective route the hybrid planner would take (proposed_*).
  let proposed_execution_class;
  let blocked = false;
  let diagnostic = null;

  if (capability === "hermetic") {
    proposed_execution_class = "hosted";
  } else if (capability === "host_local") {
    proposed_execution_class = "self-hosted";
  } else if (mode === "bootstrap") {
    // Mode A: unknown → self-hosted + diagnostic while hosted is unreachable.
    proposed_execution_class = "self-hosted";
    diagnostic = {
      code: "unknown_identity_bootstrap",
      message:
        "unknown planner identity routed self-hosted because hosted selection is structurally unavailable for this run; still subject to eligibility/slot guards",
    };
  } else {
    // Mode B: unknown is terminal before runs-on / matrix row.
    proposed_execution_class = "blocked";
    blocked = true;
    diagnostic = {
      code: "unknown_identity_terminal",
      message:
        "unknown planner identity is a terminal planning error under mixed routing; no runs-on selection",
    };
  }

  // Increment-1 effective routing stays all-self-hosted / unchanged.
  // Classification emission must not be read as a dispatch decision.
  const effective_execution_class = "self-hosted";

  return {
    planner_identity: identity,
    match,
    capability,
    local_capabilities,
    reason,
    proposed_execution_class,
    effective_execution_class,
    blocked,
    diagnostic,
    classifier_version: ruleset.classifier_version,
    ruleset_digest: ruleset.ruleset_digest,
    ruleset_id: ruleset.ruleset_id,
    mode,
    hosted_selection_available: hostedSelectionAvailable,
  };
}

/**
 * Classify a full emitted plan. Enforces mode contracts at the plan layer.
 * @param {object[]} rows
 * @param {object} ruleset
 * @param {{ mode?: 'bootstrap'|'mixed', hostedSelectionAvailable?: boolean }} options
 */
export function classifyPlan(rows, ruleset, options = {}) {
  if (!Array.isArray(rows)) {
    throw new Error("classifyPlan rows must be an array");
  }

  const mode = options.mode ?? "bootstrap";
  const classifications = [];
  const seen = new Map();

  for (const [index, row] of rows.entries()) {
    const identity = plannerIdentity(row);
    const key = identityKey(identity);
    if (seen.has(key)) {
      throw new Error(
        `plan error: duplicate emitted planner identity ${JSON.stringify(identity)} at index ${index} (first at ${seen.get(key)})`,
      );
    }
    seen.set(key, index);
    classifications.push(classifyPlannerRow(row, ruleset, options));
  }

  const unknowns = classifications.filter((c) => c.capability === "unknown");
  const blocked = classifications.filter((c) => c.blocked);

  if (mode === "mixed" && unknowns.length > 0) {
    const err = new Error(
      `plan/classification error: ${unknowns.length} unknown identity(ies) under mixed routing; refusing matrix/runs-on creation`,
    );
    err.code = "UNKNOWN_IDENTITY_TERMINAL";
    err.unknowns = unknowns.map((u) => u.planner_identity);
    err.classifications = classifications;
    throw err;
  }

  // Coverage: 100% of emitted identities for this plan must be classified
  // (every row has a classification object). Unmatched is still "classified"
  // as unknown; Mode B throws above. Mode A keeps them with diagnostics.
  const artifact = {
    classifier_version: ruleset.classifier_version,
    ruleset_id: ruleset.ruleset_id,
    ruleset_digest: ruleset.ruleset_digest,
    mode,
    hosted_selection_available: options.hostedSelectionAvailable ?? mode === "mixed",
    identity_coverage: {
      emitted: classifications.length,
      matched: classifications.filter((c) => c.match === "exact").length,
      unknown: unknowns.length,
      blocked: blocked.length,
      // Exact digest-bound coverage ratio (not a soft threshold gate).
      matched_ratio:
        classifications.length === 0
          ? 1
          : classifications.filter((c) => c.match === "exact").length / classifications.length,
    },
    // Increment-1 regression surface: proposed may say hosted; effective does not.
    runs_on_unchanged: true,
    effective_topology: "all-self-hosted",
    rows: classifications,
  };

  return artifact;
}

/**
 * Convenience: load default committed ruleset and classify.
 */
export function classifyPlanWithDefaultRuleset(rows, options = {}) {
  return classifyPlan(rows, loadRuleset(DEFAULT_RULESET_PATH), options);
}
