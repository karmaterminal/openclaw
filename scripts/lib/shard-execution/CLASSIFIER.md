# Shard execution classifier (increment-1)

Pure data-plane for #1341. Does **not** change `runs-on`.

## Modes

Classifier result is **total**: unmatched → `capability: unknown` + `proposed_execution_class: blocked` always.

- **Mode A (`bootstrap` / increment-1 audit)** — hosted selection dark; classifier has **zero** `runs-on` authority.
  Unknown rows may be emitted with audit findings. `effective_execution_class` stays the pre-existing self-hosted route (not a grey-row fallback; topology unchanged because routing is untouched).
- **Mode B (`mixed`)** — hosted routing reachable.
  Require `unknown_count === 0` on the exact planner digest before selection is enabled. If unknown occurs, **planner** rejects before matrix / `runs-on` creation. No `unknown → self-hosted` proposed route.

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
