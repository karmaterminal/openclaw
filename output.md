# WO-PR85651-CW-1123 output

## What changed

- Added `formatDelegateTaskForSystemEvent()` in `src/auto-reply/continuation/delegate-dispatch.ts`, backed by `sanitizeInboundSystemTags()`.
- Routed every prompt-facing trusted `enqueueSystemEvent()` delegate task echo through that helper, including regular over-limit/policy/budget/spawn status events and post-compaction equivalents.
- Left `spawnSubagentDirect()` task inputs and trace/log reason inputs unchanged so delegate execution semantics and existing trace redaction remain separate.
- Added spoof-marker regression matrices for regular and post-compaction delegate task echoes.

## Validation

- `node scripts/run-vitest.mjs run src/auto-reply/continuation/delegate-dispatch.test.ts src/auto-reply/continuation/delegate-dispatch-post-compaction.test.ts` — passed 56 tests.
- `node scripts/run-vitest.mjs run src/auto-reply/continuation/delegate-dispatch.test.ts` — passed 40 tests.
- `node scripts/run-vitest.mjs run src/auto-reply/continuation/delegate-dispatch-post-compaction.test.ts` — passed 16 tests.
- `pnpm tsgo:core:test` — blocked by pnpm non-interactive modules-purge guard.
- `CI=true pnpm tsgo:core:test` — passed.
- `pnpm lint` — reached unrelated `extensions/line/src/message-cards.test.ts` `no-shadow` failure.
- `CI=true pnpm lint` — same unrelated extension lint failure.
- `CI=true pnpm lint:core` — first attempt raced shared `node_modules` recreation and hit transient `oxlint ENOENT`; direct retry below passed.
- `node scripts/run-oxlint-shards.mjs --only=core --split-core` — passed.
- `.agents/skills/autoreview/scripts/autoreview --mode branch --base origin/frond-scribe/20260624/assembly-continuation-followons --prompt "Review #1123 specifically: trusted continuation system events stay trusted, model-provided delegate task echoes are sanitized before prompt-facing enqueue, spawn/delegate execution semantics unchanged, tests cover spoof markers."` — clean, no accepted/actionable findings.
- `node scripts/test-projects.mjs` — completion runner finished with 85 passed shards and 4 failed shards. Aggregate failed shard digest:
  - `test/vitest/vitest.agents-core.config.ts` failed under the initial full run with MCP fetch DNS/OOM symptoms; serial rerun passed under Node 24.17.0.
  - `test/vitest/vitest.extension-misc.config.ts` still fails in `extensions/vercel-ai-gateway/provider-catalog.test.ts`.
  - `test/vitest/vitest.extension-mattermost.config.ts` still fails in `extensions/mattermost/src/mattermost/client.retry.test.ts` with mocked response `arrayBuffer` errors.
  - `test/vitest/vitest.extension-providers.config.ts` still fails NVIDIA provider catalog expectations.
- `node scripts/run-vitest.mjs run --config test/vitest/vitest.agents-core.config.ts --maxWorkers=1 --reporter=verbose` under Node 24.17.0 — passed 324 files / 5661 tests / 4 skipped.
- `node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-misc.config.ts --maxWorkers=1 --reporter=verbose` under Node 24.17.0 — failed 1 unrelated Vercel AI Gateway provider catalog test.
- `node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-mattermost.config.ts --maxWorkers=1 --reporter=verbose` under Node 24.17.0 — failed 11 unrelated Mattermost client retry tests.
- `node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-providers.config.ts --maxWorkers=1 --reporter=verbose` under Node 24.17.0 — failed 9 unrelated NVIDIA provider catalog tests.

## Delegate task echo byte-walk

All 11 `enqueueSystemEvent()` calls in `delegate-dispatch.ts` that still mention `delegate.task` or `dropped.task` call `formatDelegateTaskForSystemEvent(...)`:

| Line | Echo |
| --- | --- |
| 283 | over-limit rejection uses `formatDelegateTaskForSystemEvent(dropped.task)` |
| 311 | cross-session policy rejection uses `formatDelegateTaskForSystemEvent(delegate.task)` |
| 348 | budget rejection uses `formatDelegateTaskForSystemEvent(delegate.task)` |
| 440 | accepted spawn status uses `formatDelegateTaskForSystemEvent(delegate.task)` |
| 460 | spawn rejected status uses `formatDelegateTaskForSystemEvent(delegate.task)` |
| 476 | spawn failed status uses `formatDelegateTaskForSystemEvent(delegate.task)` |
| 623 | post-compaction over-limit rejection uses `formatDelegateTaskForSystemEvent(dropped.task)` |
| 648 | post-compaction cross-session policy rejection uses `formatDelegateTaskForSystemEvent(delegate.task)` |
| 684 | post-compaction budget rejection uses `formatDelegateTaskForSystemEvent(delegate.task)` |
| 730 | post-compaction spawn rejected status uses `formatDelegateTaskForSystemEvent(delegate.task)` |
| 739 | post-compaction spawn failed status uses `formatDelegateTaskForSystemEvent(delegate.task)` |

## Uncertainties

- Full `node scripts/test-projects.mjs` did not produce a clean aggregate because of unrelated extension shard failures. The touched continuation/agents-core surfaces pass focused tests, typecheck, scoped core lint, autoreview, and the serial agents-core shard rerun.
- No agent transcript was included in the PR body because this non-interactive run cannot obtain approval to insert sanitized local logs.

## Evidence links

- Branch: `codeagent/1123-delegate-task-sanitization`
- Final code commit before this report: `3597c5e453`
- PR: https://github.com/karmaterminal/openclaw/pull/1128
- Issue: https://github.com/karmaterminal/openclaw/issues/1123
