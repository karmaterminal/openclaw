# Shard execution classifier (increment-1)

Pure data-plane for #1341. Freeze authority: **🪨 freeze v2.3**.

Does **not** change `runs-on`.

## Freeze v2.3 pins

1. **Classifier always total.** unmatched → `capability: unknown` + `proposed_execution_class: blocked`. Never `proposed_execution_class: self-hosted` for unknown. Soft-local struck.
2. **Inc-1 authority:** classifier has **zero** `runs-on` power. `effective_execution_class` = pre-existing all-self-hosted. Unknown may still _execute_ only as topology inertia — not classifier policy.
3. **ruleset-load vs classification:** table dup/invalid → load error; emitted absent → classification unknown (not load failure).
4. **`assertMixedRoutingEligible(plan)`** — dark pure seam. Rejects any unknown before matrix/`runs-on`. **Unit-tested. Not called from inc-1 workflow.**
5. **Mode B activation** (later PR): `unknown_count === 0` on that exact `planner_digest` + wire the assert + only then hosted selection.
6. **Inc-1 workflow:** emit classifier fields + digests + loud `unknown_count` / audit findings. Do **not** fail the live plan on unknown.
7. **Privilege note:** unknown-on-prince-seat in inc-1 is pre-existing all-self-hosted risk made _visible_, not a new grant.

## Phase split

| Surface                                           | Role                                                |
| ------------------------------------------------- | --------------------------------------------------- |
| `classify` / `classifyPlan`                       | Mode A audit/attestation. May emit unknown+blocked. |
| `assertMixedRoutingEligible(plan)`                | Mode B dark seam. Not called from inc-1.            |
| `scripts/emit-shard-execution-classification.mjs` | Data-only workflow emit (pin 6).                    |

## Artifact fields

- `proposed_execution_class` — classifier output (what hybrid would do)
- `effective_execution_class` — independently determined route (inc-1: always self-hosted)
- `classifier_version`, `ruleset_digest`, `planner_digest`, exact `planner_identity`

## No implicit capability

`kind` / `shard_group` / `configs` / `includePatterns` may only feed evidence for an **explicit** allow/deny row.

## Seed policy

- `host_local`: only concrete identities needing live gateway / SQLite / journal / SWIM / seat.
- Gate 3g / local-proof: separate workstream.
- `deploy` outside test-shard matrix.
- `requires_dist` orthogonal.
