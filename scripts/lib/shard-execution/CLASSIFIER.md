# Shard execution classifier (increment-1)

Pure data-plane for #1341. Does **not** change `runs-on`.

## Phase split (load-bearing)

Classifier result is **total**: unmatched → `capability: unknown` + `proposed_execution_class: blocked` always.

| Surface                            | Role                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classify` / `classifyPlan`        | Audit/attestation. May emit unknown+blocked. `effective_execution_class` stays independently self-hosted (classifier has **zero** `runs-on` authority). |
| `assertMixedRoutingEligible(plan)` | Dark pure policy seam. Rejects any unknown before matrix/runner selection. **Do not call from increment-1 workflow.**                                   |

Duplicate **emitted** planner identity fails at `classifyPlan` (malformed plan). Duplicate **table** key fails at ruleset load.

Mode-A `unknown → self-hosted` is **not** a product path. Soft-local struck.

## Failure sites

| Site              | Cause                                                   | Effect                                                            |
| ----------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Ruleset load      | duplicate / invalid canonical keys                      | throw (config-load error)                                         |
| Classification    | emitted planner identity absent from digest-bound table | `capability: unknown` + `proposed_execution_class: blocked`       |
| Mixed eligibility | any unknown in plan                                     | `assertMixedRoutingEligible` throws (`UNKNOWN_IDENTITY_TERMINAL`) |

## No implicit capability

`kind` / `shard_group` / `configs` / `includePatterns` may only feed evidence for an **explicit** allow/deny row. Never derive hermetic/hosted from “no daemon import.”

## Seed policy

- `host_local` table: only concrete planner identities proven to need live gateway / SQLite / journal / SWIM / seat services.
- Gate 3g / local-proof acceptance: separate workstream (not ordinary unit labels).
- `deploy` stays outside the test-shard matrix.
- `requires_dist` is orthogonal (artifact download only).

## Artifact fields

- `proposed_execution_class` — classifier output (what hybrid would do)
- `effective_execution_class` — independently determined route (increment-1: always self-hosted / unchanged)
- `classifier_version`, `ruleset_digest`, `planner_digest`, exact `planner_identity`
