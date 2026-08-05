# Shard execution classifier (increment-1)

Pure classifier for #1341. **No** `runs-on` / matrix authority.

**Freeze authority:** 🌻 reconcile pin `#1534401854522396702` · 🪨 WO `#1534401738373857290`/`#1534401740626202865` · CUT=A `#1534401220993876108` · 🌫 A cosign `#1534401462388658239`/`#1534401707432349726`.

**Path:** `scripts/lib/shard-execution/` (not `tools/`). Keep pure; do **not** wire workflow/`runs-on`.

## Two explicit policies (never inferred from a coverage threshold)

| policy                                | unmatched (`capability_class: unknown`, `proposed_execution_class: blocked`)                             | matrix / runs-on                                    | `effective_execution_class` |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------- |
| **bootstrap** (inc-1)                 | diagnostic/attested; blocked proposal deliberately shadowed by unchanged all-self-hosted effective route | yes — ordinary pre-existing self-hosted matrix path | `self-hosted` (wire hyphen) |
| **enforced** (first mixed-routing PR) | terminal plan/classification failure                                                                     | no                                                  | **omitted**                 |

- `bootstrap` must be an **explicit** `policy: "bootstrap"` argument. It cannot be selected implicitly.
- `enforced` is the **default** for any mixed-routing planner (and when `policy` is omitted).
- Do **not** label the bootstrap row “data-only.”
- Do **not** turn bootstrap `blocked` proposed into a terminal result without selecting `enforced`.

## Field enums

| Field                       | Domain                                                                 |
| --------------------------- | ---------------------------------------------------------------------- |
| `capability_class`          | `hermetic` \| `host_local` \| `unknown`                                |
| `proposed_execution_class`  | `hosted` \| `self-hosted` \| `blocked`                                 |
| `effective_execution_class` | bootstrap: always `self-hosted`; enforced rejected-unknown: **absent** |
| `policy`                    | `bootstrap` \| `enforced`                                              |

## Schema (every row + plan)

Emit **both** `planner_digest` (emitted identity set) **and** `ruleset_digest`.
Every row attests: identity + both digests + `classifier_version` + proposed/effective (bootstrap) + match/unknown + `policy`.
Tip-plan seed covers every identity the real planner emits; tiny tables = unit fixtures only.

## Surfaces

| Surface                                           | Role                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| `classify` / `classifyPlan`                       | Classification. Bootstrap = explicit; default/omitted = enforced. |
| `assertMixedRoutingEligible(plan)`                | Enforced terminal gate. Not called from inc-1.                    |
| `scripts/emit-shard-execution-classification.mjs` | Inc-1 emit with **explicit** `policy: "bootstrap"`.               |

## Inc-1 workorder (bootstrap)

1. Pure total classifier: every emitted identity → `capability_class` + `proposed_execution_class` (`unknown` ⇒ `blocked`)
2. Zero `runs-on` / matrix authority
3. Unmatched under bootstrap: unknown + blocked + diagnostic + effective self-hosted
4. Attest every row/plan: digests, version, identity, match, policy
5. Load dup/invalid → load failure; unmatched → classification result
6. `assertMixedRoutingEligible` dark — not called from inc-1
7. runs-on-unchanged regression
8. Tip-plan full coverage; tiny fixtures for units
9. `requires_dist` orthogonal · no release gate · no slot widen · no Silas enable
