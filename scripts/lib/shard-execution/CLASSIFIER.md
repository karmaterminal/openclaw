# Shard execution classifier (increment-1)

Pure data-plane for #1341. **No** `runs-on` / matrix authority.

**Freeze authority:** 🪨 WO review `#1534401738373857290` + `#1534401740626202865` · CUT=A `#1534401220993876108` · 🌻 two-mode `#1534401471783768236` + cardinality `#1534401551148388473` · 🌫 A cosign `#1534401462388658239` / `#1534401707432349726`.

**Path:** pure module under `scripts/lib/shard-execution/` (not `tools/`). Keep pure wherever it lands; do **not** wire workflow/`runs-on`.

## 1. Field enums (settled split)

| Field                       | Domain                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `capability_class`          | `hermetic` \| `host_local` \| `unknown`                                            |
| `proposed_execution_class`  | `hosted` \| `self-hosted` \| `blocked`                                             |
| `effective_execution_class` | incumbent route (Mode A always `self-hosted`; Mode B rejected-unknown: **absent**) |

Do **not** put hermetic/host_local/unknown on `proposed_execution_class`.

## 2. Mode A unknown byte (bootstrap / this PR)

Unmatched →:

- `capability_class: unknown`
- `proposed_execution_class: blocked` (**not** `self-hosted`)
- `blocked: true`
- diagnostic (`unknown_identity_audit`)
- `effective_execution_class: self-hosted` unchanged (topology inertia; may still execute)
- digests + `classifier_version` + canonical `planner_identity` + `match: unmatched`

“unknown → self-hosted + diagnostic” names the **effective/audit** outcome, **not** proposed.

## 3. Schema (every row + plan)

Emit **both**:

- `planner_digest` — emitted identity set
- `ruleset_digest` — digest-bound ruleset table bytes

Every row attests: `planner_identity` + both digests + `classifier_version` + proposed/effective (Mode A) + match/unknown status.

Tip-plan seed (`ruleset.v1.json`) covers every identity the real planner emits; tiny tables = unit fixtures only.

## Mode cardinality

| Mode                                     | When                 | Unknown row shape                                                                                                              |
| ---------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **A — Bootstrap / inc-1**                | audit emit (this PR) | `unknown` + `blocked` + **`effective_execution_class: self-hosted`** + diagnostic; routed through unchanged self-hosted matrix |
| **B — Enforced mixed-routing preflight** | later only           | `unknown` + `blocked` + diagnostic → **terminal before matrix**; **no** `effective_execution_class`                            |

“Attested, then rejected before a matrix row” = **Mode B only**.

## Inc-1 workorder (A)

1. Pure total classifier: every emitted identity → `capability_class` + `proposed_execution_class` (`unknown` ⇒ `blocked`)
2. Classifier has **zero** `runs-on` / matrix authority
3. Unmatched: emit unknown/blocked + digests + audit; effective stays pre-existing self-hosted
4. Attest every row/plan: `classifier_version`, `ruleset_digest`, `planner_digest`, canonical identity, match status
5. Table dup/invalid key → **load** failure; unmatched emitted → **classification result**
6. Dark pure seam `assertMixedRoutingEligible(plan)` — unit/policy only; **not called from inc-1 workflow**
7. Byte/structural regression: classifier output cannot change `runs-on`
8. Tip-plan seed full coverage; tiny tables = unit fixtures only
9. `requires_dist` orthogonal · Gate-3g separate · no release gate · no slot widen · no Silas enable

## Later mixed-routing (B, not this PR)

`assertMixedRoutingEligible(plan)` rejects any unknown before matrix/`runs-on`. Terminal artifact: unknown + blocked + diagnostic, **no effective_***. Not called from inc-1.

## Surfaces

| Surface                                           | Role                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `classify` / `classifyPlan`                       | Mode A audit/attestation. May emit unknown+blocked+effective self-hosted. |
| `assertMixedRoutingEligible(plan)`                | Mode B dark seam. Not called from inc-1.                                  |
| `scripts/emit-shard-execution-classification.mjs` | Data-only workflow emit (audit only).                                     |

## Seed policy

- `ruleset.v1.json` = tip-plan full coverage (`createNodeTestShards()` identities)
- `host_local`: only concrete identities needing live gateway / SQLite / journal / SWIM / seat
- Unit tests use tiny fixture tables, not the tip seed
- No implicit capability from kind/shard_group/configs/includePatterns without explicit row
