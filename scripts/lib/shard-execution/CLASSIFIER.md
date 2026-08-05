# Shard execution classifier (increment-1)

Pure data-plane for #1341. Does **not** change `runs-on`.

## Modes

- **Mode A (`bootstrap`)** — hosted selection is structurally unavailable for the whole run.
  `unknown` → proposed `self-hosted` + diagnostic. Existing eligibility/slot guards still apply.
- **Mode B (`mixed`)** — hosted routing is reachable.
  `unknown` → terminal planning error before any matrix / `runs-on` resolution.
  No `unknown → self-hosted` fallback once hosted exists.

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
