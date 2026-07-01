# 1147/1148/1149 continuation mechanics output

## What changed

- Narrowed the no-op rearm guard so fresh room events are neutral only when they carry a non-stale inbound timestamp; timestamp-less or stale room events remain `room_event_backlog` and accrue the self-rearm guard.
- Threaded inbound event timestamps through follow-up run metadata into the no-op guard without making timestamp-only messages collect-mode batching barriers.
- Added regression coverage for:
  - three same-turn `continue_work` calls at 55s/60s/61s, including a requests-in-flight parking/recovery variant;
  - fresh/stale/timestamp-less room-event classification and replayed room-event IDs scoped per session;
  - reaction-only room activity not accruing a suppression streak when the room event is fresh;
  - all-zero explicit traceparent rejection for `continue_work`, `continue_delegate`, and `request_compaction`.

## Validation

- `node scripts/run-vitest.mjs src/auto-reply/reply/no-op-rearm-guard.test.ts` — passed, 40 tests.
- `node scripts/run-vitest.mjs src/auto-reply/reply/queue.collect.test.ts` — passed, 56 tests.
- `node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-core.config.ts --maxWorkers=1 src/auto-reply/continuation/work-dispatch.test.ts` — passed, 80 tests.
- `node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1 src/auto-reply/reply/followup-runner.test.ts` — passed, 95 tests.
- `node scripts/run-vitest.mjs run --config test/vitest/vitest.agents-tools.config.ts --maxWorkers=1 src/agents/tools/continue-work-tool.test.ts src/agents/tools/continue-delegate-tool.test.ts src/agents/tools/request-compaction-tool.test.ts` — passed, 69 tests.
- `node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.core.test.json --incremental --tsBuildInfoFile .artifacts/tsgo-cache/core-test.tsbuildinfo` — passed.
- `node scripts/run-oxlint.mjs --tsconfig config/tsconfig/oxlint.scripts.json <changed files>` — passed.
- `node_modules/.bin/oxfmt --check <changed files>` — passed.
- `.agents/skills/autoreview/scripts/autoreview --mode branch --base origin/frond-scribe/20260624/assembly-continuation-followons` — clean after two accepted findings were fixed.
- `node scripts/test-projects.mjs` full-suite run 1 — failed: 4431 passed / 1 failed / 24 skipped; the only failure was `test/scripts/plugin-lifecycle-measure.test.ts` in `vitest.tooling.config.ts`.
- `node scripts/run-vitest.mjs run --config test/vitest/vitest.tooling.config.ts --reporter=verbose test/scripts/plugin-lifecycle-measure.test.ts` — rerun passed, 12 tests.
- `node scripts/test-projects.mjs` full-suite run 2 at final SHA `42afdf3b1b` — failed by shard digest: visible summaries reported 4432 passed / 24 skipped and no failed tests, but `vitest.agents-core.config.ts` exited 1 from worker heap OOM.
- `node scripts/run-vitest.mjs run --config test/vitest/vitest.agents-core.config.ts --maxWorkers=1 --reporter=verbose` — rerun passed, 5671 passed / 4 skipped.

## Uncertainties

- The sanctioned full-suite runner did not produce a fully green final exit in this local worktree. The remaining final failure was a worker heap OOM in the broad `agents-core` shard; the same shard passed with `--maxWorkers=1`, and no full-suite assertion failure remained in the final visible summaries.
- No live proof or fleet wake was run, per non-goals.

## Exact commands

```bash
node scripts/run-vitest.mjs src/auto-reply/reply/no-op-rearm-guard.test.ts
node scripts/run-vitest.mjs src/auto-reply/reply/queue.collect.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-core.config.ts --maxWorkers=1 src/auto-reply/continuation/work-dispatch.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1 src/auto-reply/reply/followup-runner.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.agents-tools.config.ts --maxWorkers=1 src/agents/tools/continue-work-tool.test.ts src/agents/tools/continue-delegate-tool.test.ts src/agents/tools/request-compaction-tool.test.ts
node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.core.test.json --incremental --tsBuildInfoFile .artifacts/tsgo-cache/core-test.tsbuildinfo
node scripts/run-oxlint.mjs --tsconfig config/tsconfig/oxlint.scripts.json <changed files>
node_modules/.bin/oxfmt --check <changed files>
.agents/skills/autoreview/scripts/autoreview --mode branch --base origin/frond-scribe/20260624/assembly-continuation-followons
node scripts/test-projects.mjs
node scripts/run-vitest.mjs run --config test/vitest/vitest.tooling.config.ts --reporter=verbose test/scripts/plugin-lifecycle-measure.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.agents-core.config.ts --maxWorkers=1 --reporter=verbose
```
