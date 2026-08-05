# Shard execution classifier (increment-1)

Pure classifier for #1341. **No** `runs-on` / matrix authority.

**Freeze authority (locked):**

- 🌻 phase split `#1534400897973489685` · ratchet split `#1534401021`
- 🪨 freeze lock `#1534404874274345161` · disposition `#1534405122258370681` (green-with-absorbs)
- 🌫 accept `#1534404915454017636` / `#1534405052771471500`

**Path:** `scripts/lib/shard-execution/` (not `tools/`). Keep pure; do **not** wire workflow/`runs-on`.

## Phase split (Mode A / Mode B)

| mode                         | surface        | unmatched (`capability_class: unknown`, `proposed_execution_class: blocked`)                                                                | matrix / runs-on                                     | `effective_execution_class`                                                                             |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **A — bootstrap / inc-1**    | audit artifact | **valid observed result** (attestation totality): emit unknown + proposed blocked + diagnostic; classifier has **zero** `runs-on` authority | ordinary pre-existing self-hosted path **unchanged** | incumbent `self-hosted` (audit attestation only — not a classifier-created route or matrix entitlement) |
| **B — enforced / end-state** | dark guard     | terminal planning failure **before** any `runs-on` selection via `assertMixedRoutingEligible` (or successor)                                | **no**                                               | **omitted**                                                                                             |

- `bootstrap` must be an **explicit** `policy: "bootstrap"` argument. It cannot be selected implicitly.
- `enforced` is the **default** when policy is omitted / for mixed-routing planner. Legacy mode `"mixed"` aliases to `enforced`.
- `blocked` = **proposed class only**. Mode A deliberately shadows it with pre-existing effective self-hosted. **Not terminal in bootstrap.**
- Mode B is **dark in inc-1** (helper exists; not called from workflow).
- Do **not** label bootstrap “data-only.”
- Do **not** characterize Mode A’s effective field as a struck `unknown→self-hosted` product path / soft-local route. That wording is **struck**. Mode A effective is topology-inertia attestation only.

## Two coverage predicates (named; never inferred from a soft % threshold)

| predicate                  | mode                      | meaning                                                                                       | gate                                                                           |
| -------------------------- | ------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **attestation coverage**   | Mode A (always)           | 100% attestation over exact `planner_digest`: every emitted identity has a classification row | required on every plan artifact; unknown rows still count as attested          |
| **ruleset-match coverage** | Mode B (before selection) | 100% ruleset-match for that digest: `identity_coverage.unknown === 0` / `unknown_count === 0` | enforced by `assertMixedRoutingEligible` before any matrix/`runs-on` selection |

Attestation coverage ≠ ruleset-match coverage. Mode A can (and must) attest unknowns; Mode B refuses selection until ruleset-match is total.

## Field enums

| Field                       | Domain                                                                 |
| --------------------------- | ---------------------------------------------------------------------- |
| `capability_class`          | `hermetic` \| `host_local` \| `unknown`                                |
| `proposed_execution_class`  | `hosted` \| `self-hosted` \| `blocked`                                 |
| `effective_execution_class` | bootstrap: always `self-hosted`; enforced rejected-unknown: **absent** |
| `policy`                    | `bootstrap` \| `enforced`                                              |

## Schema (every row + plan)

Emit **both** `planner_digest` (emitted identity set) **and** `ruleset_digest` (table bytes) — distinct.
Every row attests: `planner_identity` + both digests + `classifier_version` + proposed/effective (bootstrap) + match/unknown + `policy`.
Plan artifact also surfaces:

- `identity_coverage.unknown` and alias `identity_coverage.unknown_count` (same integer)
- `identity_coverage.attestation_complete` (Mode A predicate: every emitted identity has a row)
- `identity_coverage.ruleset_match_complete` (Mode B predicate: `unknown === 0`)

Tip-plan seed covers every identity the real planner emits; tiny tables = unit fixtures only.

## Surfaces

| Surface                                           | Role                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `classify` / `classifyPlan`                       | Classification. Bootstrap = explicit; default/omitted = enforced.   |
| `assertMixedRoutingEligible(plan)`                | Mode B ruleset-match terminal gate. Not called from inc-1 workflow. |
| `scripts/emit-shard-execution-classification.mjs` | Inc-1 emit with **explicit** `policy: "bootstrap"`.                 |

## Inc-1 workorder (bootstrap / Mode A)

1. Pure total classifier: every emitted identity → `capability_class` + `proposed_execution_class` (`unknown` ⇒ `blocked`)
2. Zero `runs-on` / matrix authority
3. Unmatched under bootstrap: unknown + blocked + diagnostic + effective self-hosted (attestation, not grant)
4. Attest every row/plan: digests, version, identity, match, policy; 100% attestation over `planner_digest`
5. Load dup/invalid → load failure; unmatched → classification result (valid under Mode A)
6. `assertMixedRoutingEligible` dark — Mode B ruleset-match only; not called from inc-1
7. runs-on-unchanged regression
8. Tip-plan full coverage; tiny fixtures for units
9. `requires_dist` orthogonal · no release gate · no slot widen · no Silas enable · **stop before dispatch/runner**
