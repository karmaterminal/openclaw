# Shard execution classifier (increment-1)

Pure data-plane for #1341.

**Freeze authority:** 🪨 CUT=A `#1534401220993876108` · 🌻 two-mode freeze `#1534401471783768236` · 🌫 A cosign `#1534401462388658239`.
Privileged-seat hole accepted explicitly for inc-1 (audit-exec preserves pre-existing all-self-hosted; does not grant new privilege).

Does **not** change `runs-on`.

## Inc-1 workorder (A)

1. Pure total classifier: every emitted identity → `capability_class` + `proposed_execution_class` (`unknown` ⇒ `blocked`)
2. Classifier has **zero** `runs-on` / matrix authority
3. Unmatched row: emit unknown/blocked + digests + audit finding; `effective_execution_class` stays pre-existing self-hosted
4. Attest on every row/plan: `classifier_version`, `ruleset_digest`, `planner_digest`, canonical `planner_identity`
5. Table dup/invalid key → **load** failure; unmatched emitted identity → **classification result** (not silent host default)
6. Dark pure seam `assertMixedRoutingEligible(plan)` rejects any unknown — **unit/policy only; not called from inc-1 workflow**
7. Byte/structural regression: classifier output cannot change `runs-on` expression/result
8. Tip-plan seed (`ruleset.v1.json`) covers every identity the real planner emits; tiny tables = unit fixtures only
9. `requires_dist` orthogonal · Gate-3g/local-proof separate · no release gate · no slot widen · no Silas enable

## Later mixed-routing (B, not this PR)

Require `unknown_count === 0` on that `planner_digest` before selection; if unknown occurs anyway → terminal before matrix/`runs-on`. No `unknown → self-hosted` once any hosted route can be chosen.

## Phase split

| Surface                                           | Role                                                |
| ------------------------------------------------- | --------------------------------------------------- |
| `classify` / `classifyPlan`                       | Mode A audit/attestation. May emit unknown+blocked. |
| `assertMixedRoutingEligible(plan)`                | Mode B dark seam. Not called from inc-1.            |
| `scripts/emit-shard-execution-classification.mjs` | Data-only workflow emit (audit only).               |

## Artifact fields

- `capability_class` — `hermetic` | `host_local` | `unknown`
- `proposed_execution_class` — classifier output (`blocked` on unknown)
- `effective_execution_class` — independently determined route (inc-1: always self-hosted)
- `classifier_version`, `ruleset_digest`, `planner_digest`, exact `planner_identity`

## No implicit capability_class

`kind` / `shard_group` / `configs` / `includePatterns` may only feed evidence for an **explicit** allow/deny row.

## Seed policy

- `ruleset.v1.json` = tip-plan full coverage (every `createNodeTestShards()` identity)
- `host_local`: only concrete identities needing live gateway / SQLite / journal / SWIM / seat
- Unit tests use tiny fixture tables, not the tip seed
- Gate 3g / local-proof: separate workstream
- `requires_dist` orthogonal
