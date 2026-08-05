#!/usr/bin/env node
// Data-only emit for #1341 increment-1 (freeze v2.3 pin 6).
// Classifies the live planner identity set, writes digests + loud unknown_count.
// Does NOT fail the plan on unknown. Does NOT change runs-on / matrix.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  classifyPlan,
  loadRuleset,
  DEFAULT_RULESET_PATH,
} from "./lib/shard-execution/classify-shard-execution.mjs";

function parseArgs(argv) {
  const out = {
    outPath: process.env.OPENCLAW_SHARD_EXECUTION_CLASSIFICATION_OUT ?? "",
    rulesetPath: process.env.OPENCLAW_SHARD_EXECUTION_RULESET ?? DEFAULT_RULESET_PATH,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out" || arg === "-o") {
      out.outPath = argv[++i] ?? "";
      continue;
    }
    if (arg === "--ruleset") {
      out.rulesetPath = argv[++i] ?? out.rulesetPath;
      continue;
    }
    if (arg === "--quiet") {
      out.quiet = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: emit-shard-execution-classification.mjs [--out path] [--ruleset path] [--quiet]\n" +
          "Emits classifier audit for createNodeTestShards() identities. Never fails on unknown.",
      );
      process.exit(0);
    }
  }
  return out;
}

async function loadPlannerRows() {
  const planUrl = pathToFileURL(resolve("scripts/lib/ci-node-test-plan.mjs")).href;
  const plan = await import(planUrl);
  if (typeof plan.createNodeTestShards !== "function") {
    throw new Error("ci-node-test-plan.mjs does not export createNodeTestShards");
  }
  const shards = plan.createNodeTestShards();
  if (!Array.isArray(shards)) {
    throw new Error("createNodeTestShards() did not return an array");
  }
  // Map planner rows into classifier identity surface (camelCase accepted).
  return shards.map((shard) => ({
    checkName: shard.checkName ?? shard.check_name,
    shardName: shard.shardName ?? shard.shard_name,
    requiresDist: shard.requiresDist ?? shard.requires_dist ?? false,
    kind: shard.kind,
    shard_group: shard.shardGroup ?? shard.shard_group,
    configs: shard.configs,
    includePatterns: shard.includePatterns,
  }));
}

function loudSummary(artifact) {
  const unknowns = artifact.rows.filter((row) => row.capability_class === "unknown");
  const lines = [
    `[shard-execution-classifier] version=${artifact.classifier_version}`,
    `[shard-execution-classifier] ruleset_digest=${artifact.ruleset_digest}`,
    `[shard-execution-classifier] planner_digest=${artifact.planner_digest}`,
    `[shard-execution-classifier] emitted=${artifact.identity_coverage.emitted} matched=${artifact.identity_coverage.matched} unknown_count=${artifact.identity_coverage.unknown}`,
    `[shard-execution-classifier] runs_on_unchanged=${artifact.runs_on_unchanged} effective_topology=${artifact.effective_topology}`,
    `[shard-execution-classifier] mode=${artifact.mode} (audit emit only; assertMixedRoutingEligible NOT called)`,
  ];
  if (unknowns.length > 0) {
    lines.push(
      `[shard-execution-classifier] AUDIT unknown_count=${unknowns.length} (pre-existing all-self-hosted risk made visible; not a plan failure in inc-1)`,
    );
    for (const row of unknowns.slice(0, 50)) {
      lines.push(
        `[shard-execution-classifier] unknown identity check_name=${row.planner_identity.check_name} shard_name=${row.planner_identity.shard_name}`,
      );
    }
    if (unknowns.length > 50) {
      lines.push(
        `[shard-execution-classifier] ...and ${unknowns.length - 50} more unknown identities`,
      );
    }
  } else {
    lines.push(
      `[shard-execution-classifier] AUDIT unknown_count=0 (full table coverage for this planner_digest)`,
    );
  }
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = await loadPlannerRows();
  const ruleset = loadRuleset(args.rulesetPath);
  // Mode A audit: may include unknown; do NOT call assertMixedRoutingEligible.
  const artifact = classifyPlan(rows, ruleset, {
    mode: "bootstrap",
    hostedSelectionAvailable: false,
  });

  const payload = {
    ...artifact,
    // Explicit privilege note (freeze v2.3 pin 7).
    privilege_note:
      "unknown-on-prince-seat in inc-1 is pre-existing all-self-hosted risk made visible, not a new grant; soft-local policy remains struck",
    assert_mixed_routing_eligible_called: false,
  };

  const summary = loudSummary(payload);
  if (!args.quiet) {
    console.log(summary);
  }

  if (args.outPath) {
    const abs = resolve(args.outPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    if (!args.quiet) {
      console.log(`[shard-execution-classifier] wrote ${abs}`);
    }
  }

  // Never fail the live plan on unknown in increment-1.
  process.exitCode = 0;
}

main().catch((error) => {
  console.error(`[shard-execution-classifier] emit failed: ${error?.stack ?? error}`);
  // Emit tool failure is a tooling error, not an unknown-identity gate.
  process.exitCode = 1;
});
