# Project 86 proof-code breadcrumbs

## What changed

- Added `analysis/project86-proof-code-breadcrumbs.json`, a machine-readable catalog for all 35 required proof rows.
- Added `analysis/project86-proof-code-breadcrumbs.md`, a human-readable triage guide covering contracts, production owners, caller chains, durable state, configuration, lifecycle, observability, tests, failure-class inspection order, blast radius, halt scope, and future-candidate commands.
- Bound every breadcrumb to OpenClaw assembly `b134a64a44351bcbce2d086da4ac30a596c01699`, docs catalog `abe1f9f0749d849b01da4e5d354c205ecffac946`, and reference corpus `4c235d8c1997e8964160117f8d6bf650ad1e8203`.

No product code or GitHub state was changed.

## Validation

- Artifact validation passed: 35 required rows, 35 unique represented rows, canonical order preserved, and every discovered source/test path present at the exact assembly SHA.
- Markdown validation passed: 35 ordered row sections.
- `pnpm docs:list` passed.
- `git diff --check` passed.
- The mandated full suite completed in 2,997.32 seconds: **275 of 296 shards passed; 21 failed**.
  - Across the 294 shards that emitted Vitest summaries: 8,066 test files passed, 147 failed, and 11 skipped; 113,845 tests passed, 125 failed, and 333 skipped.
  - Failures were outside the analysis-only diff. Examples include a Codex shard no-output timeout, a stale Slack-local `openclaw` package export, a missing `zip` executable, a worker import of missing `src/infra/node-sqlite.js`, and unrelated assertion failures.
  - Verdict: breadcrumb artifacts pass their acceptance checks; the assembly full suite is red for unrelated baseline/environment failures.

## Uncertainties

- These breadcrumbs are source-inspection triage aids, not substitutes for live proof. A final candidate must be diffed against the bound assembly before using a path as current ownership.
- No failed full-suite shard was selectively rerun because the workorder requires the sanctioned full-suite runner rather than hand-picked subsets.
- The reporting webhook returned HTTP 404 for the final full-suite trouble update after earlier checkpoint posts had succeeded. Reporting failure did not block the work.

## Exact commands

```bash
pnpm docs:list

set -euo pipefail
jq -e '. as $d | .schema == "openclaw.project86.proof-code-breadcrumbs.v1" and .binding.assemblySha == "b134a64a44351bcbce2d086da4ac30a596c01699" and .binding.docsCatalogSha == "abe1f9f0749d849b01da4e5d354c205ecffac946" and .inventory.requiredRowCount == 35 and .inventory.representedRowCount == 35 and (.rows | length) == 35 and ([.rows[].rowId] == .inventory.requiredRows) and (([.rows[].rowId] | unique | length) == 35)' analysis/project86-proof-code-breadcrumbs.json >/dev/null
while IFS= read -r path; do
  git cat-file -e "b134a64a44351bcbce2d086da4ac30a596c01699:$path"
done < <(jq -r '.. | strings | select(test("^(src|extensions|packages|test|ui|apps|docs)/[^[:space:]:]+\\.(ts|tsx|js|mjs|json)$"))' analysis/project86-proof-code-breadcrumbs.json | sort -u)
test "$(rg -c '^### R-' analysis/project86-proof-code-breadcrumbs.md)" -eq 35

git diff --check
node scripts/test-projects.mjs
```
