# 1093 post-backmerge CI fixes

## Commit SHA

- Code/test tip validated: `a3a0b3a1fd698d4814ad461020043bd7c3b736ec`
- Latest assembly base included: `4d2f410f4ea0b491301879f9d0f6d8a04cf4dae7`
- Fast-forward compatible with `origin/frond-scribe/20260624/assembly-continuation-followons`: yes

## Files changed

Compared with the original assembly CI SHA `8cd7a987f87540b85bda95b6aecd9eb36e39fd72`, the branch carries the post-backmerge fixes in:

- `extensions/ollama/provider-discovery.test.ts`
- `src/i18n/registry.test.ts`
- `src/infra/exec-authorization-render.ts`
- `src/infra/exec-authorization-render.test.ts`
- `src/plugins/status.test.ts`
- `src/scripts/test-projects.test.ts`

The assembly branch advanced during this work with overlapping fixes. Compared with latest assembly `4d2f410f4ea0b491301879f9d0f6d8a04cf4dae7`, the remaining code/test delta is only extra `hi`/`ru` registry coverage in `src/i18n/registry.test.ts`.

## Focused test results

- `node scripts/run-vitest.mjs run --config test/vitest/vitest.plugins.config.ts --maxWorkers=1 src/plugins/status.test.ts` — pass, 27 tests.
- `node scripts/run-vitest.mjs run --config test/vitest/vitest.infra.config.ts --maxWorkers=1 src/infra/exec-authorization-render.test.ts` — pass, 14 tests.
- `node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-providers.config.ts --maxWorkers=1 extensions/ollama/provider-discovery.test.ts` — pass, 18 tests.
- `node scripts/run-vitest.mjs run --config test/vitest/vitest.unit-fast.config.ts --maxWorkers=1 src/i18n/registry.test.ts` — pass, 3 tests.
- `node scripts/run-vitest.mjs run --config test/vitest/vitest.tooling.config.ts --maxWorkers=1 src/scripts/test-projects.test.ts -t 'routes top-level test helpers to importing repo tests'` — pass, 1 selected test.
- `node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-codex-app-server-attempt.config.ts --maxWorkers=1 extensions/codex/src/app-server/run-attempt.test.ts -t 'keeps managed web_search for provider-qualified Codex model overrides'` — pass, 1 selected test in 65.5s.
- `node scripts/run-tsgo.mjs -p tsconfig.core.json --incremental --tsBuildInfoFile .artifacts/tsgo-cache/core.tsbuildinfo` — pass.

## Full-suite result

- `node scripts/test-projects.mjs` — red: 89 Vitest shards ran in 355.07s; failed shard digest had one shard, `test/vitest/vitest.extension-imessage.config.ts`.
- Standalone rerun: `node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-imessage.config.ts --maxWorkers=1 --reporter=verbose` — pass, 55 files / 636 tests.

## Remaining red / classification

- Codex provider-qualified `web_search` is no longer red on the merged assembly tip; the focused receipt passed.
- The only remaining red signal is the full-suite parallel `extension-imessage` watch-subscribe retry failure. The same shard passed standalone immediately after, so classify it as a parallel full-suite flake/resource-ordering issue rather than a continuation regression from this branch.

## Recommendation

The branch is fast-forward compatible with the latest assembly branch and is ready for an `openclaw-local-ci` rerun. Treat the local full-suite result as "focused gates pass, full-suite red only on standalone-clean iMessage flake"; monitor the iMessage shard in CI rerun output.
