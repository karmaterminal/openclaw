# Shard execution classifier (increment-1)

Pure data-plane for #1341. Does **not** change `runs-on`.

## Modes / plan contract

Classifier result is **total**: unmatched → `capability: unknown` + `proposed_execution_class: blocked` always (every phase).

- **Per-row classify** may emit unknown + blocked + diagnostic (attestation).
- **`classifyPlan` (planner assemble)** is terminal on any unknown / duplicate emitted identity — no matrix row, no `runs-on` selection. Surviving plan must be fully classified for that exact `planner_digest`.
- **Increment-1:** classifier has **zero** `runs-on` authority. Topology stays all-self-hosted only for the _surviving fully-classified_ plan — not by executing unknowns under soft-local. Mode-A `unknown → self-hosted` is **not** a product path.
- **First mixed-routing PR:** keep unknown terminal before selection (already implied by plan terminal).

## Failure sites

| Site           | Cause                                                   | Effect                                   |
| -------------- | ------------------------------------------------------- | ---------------------------------------- |
| Ruleset load   | duplicate / invalid canonical keys                      | throw (config-load error)                |
| Classification | emitted planner identity absent from digest-bound table | `capability: unknown` (+ Mode A/B route) |

## No implicit capability

`kind` / `shard_group` / `configs` / `includePatterns` may only feed evidence for an **explicit** allow/deny row. Never derive hermetic/hosted from “no daemon import.”

## Seed policy

- `host_local` table: only concrete planner identities proven to need live gateway / SQLite / journal / SWIM / seat services.
- Gate 3g / local-proof acceptance: separate workstream (not ordinary unit labels).
- `deploy` stays outside the test-shard matrix.
- `requires_dist` is orthogonal (artifact download only).

## Artifact fields

- `proposed_execution_class` — classifier output (what hybrid would do)
- `effective_execution_class` — what actually routes (increment-1: always self-hosted / unchanged)
- `classifier_version`, `ruleset_digest`, exact `planner_identity`
