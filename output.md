# 1151 rebuild continuation guard output

## What changed

- Judged #1150 insufficient for #1151's boundary: it narrowed #1143 but still converted timestamp-less/replayed room events into `room_event_backlog` self-rearm suppression.
- Removed the broad #1143 room-event/restart/system replay suppression semantics from `NoOpRearmGuard`. The only suppressible self-rearm source is now explicit `isContinuationWake: true`.
- Kept continuation-owned protection: durable `continuation_work` dispatch still calls the pre-provider guard with `isContinuationWake: true`, and low-value/no-op continuation turns still accrue a per-session streak that blocks before `getReplyFromConfig`.
- Normal room behavior is now first-class: room events, repeated room event IDs, old/timestamp-less room events, reaction-only/message_react turns, restart/system followups, and direct human messages are admitted as neutral/fresh unless a caller explicitly marks them continuation-owned.
- Updated follow-up runner comments/tests to prove room/reaction/system activity does not build suppression while continuation-owned no-op streaks remain isolated.

## Byte-walk decision

- #1143 safe-to-keep pieces: turn outcome classification for visible delivery vs low-value tools, per-session bounded in-memory streak ledger, idempotent per-run recording, pre-provider continuation dispatch admission, and post-turn recording before next continuation scheduling.
- #1143 broad pieces removed/narrowed: `room_event_backlog`, `restart_recovery`, `recovery_replay`, `internal_system`, `human_replay`, stale timestamp checks, and seen-message-id replay downgrades. These treated room/system provenance as the bug instead of continuation ownership.
- #1150 was not equivalent to the preferred boundary because it still required timestamp freshness proof for room events and still suppressed replayed/timestamp-less room events.
- Non-goals respected: no #1146/Codex provider-preflight work, no live/fleet wake proof, no prince runtime dirs.

## Validation

- `node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1 src/auto-reply/reply/followup-runner.test.ts src/auto-reply/continuation/work-dispatch.test.ts` — passed, 175 tests.
- `node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply.config.ts --maxWorkers=1` — passed, 179 files / 3407 passed / 1 todo.
- `node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.core.test.json --incremental --tsBuildInfoFile .artifacts/tsgo-cache/core-test.tsbuildinfo` — passed.
- `node scripts/run-oxlint.mjs --tsconfig config/tsconfig/oxlint.scripts.json src/auto-reply/reply/no-op-rearm-guard.ts src/auto-reply/reply/no-op-rearm-guard.test.ts src/auto-reply/reply/followup-runner.ts src/auto-reply/reply/followup-runner.test.ts src/auto-reply/continuation/work-dispatch.test.ts` — passed.
- `node_modules/.bin/oxfmt --check src/auto-reply/reply/no-op-rearm-guard.ts src/auto-reply/reply/no-op-rearm-guard.test.ts src/auto-reply/reply/followup-runner.ts src/auto-reply/reply/followup-runner.test.ts src/auto-reply/continuation/work-dispatch.test.ts` — passed.
- `node scripts/test-projects.mjs` full suite run 1 — failed 2/89 shards: `agents-core` worker heap OOM after visible tests passed; `extension-matrix` logger mock failures. Reruns: Matrix shard passed with `--maxWorkers=1`; agents-core exact failing file passed, while the broad shard continued to hit local worker OOM/one unrelated registry flake.
- `OPENCLAW_TEST_PROJECTS_PARALLEL=4 OPENCLAW_VITEST_MAX_WORKERS=1 NODE_OPTIONS=--max-old-space-size=8192 node scripts/test-projects.mjs` full suite run 2 — failed 1/89 shards: `extension-codex-app-server-attempt-extra` ENOTEMPTY temp-dir cleanup flake. Exact shard rerun passed.
- `.agents/skills/autoreview/scripts/autoreview --mode branch --base origin/frond-scribe/20260624/assembly-continuation-followons` — one finding rejected: it requested restoring stale room-event suppression, which is the explicit #1151 behavior being removed ("the room is not the bug").

## Uncertainties

- The sanctioned full-suite runner did not produce a green all-shards exit in this shared local worktree. The remaining reduced-run failure was an unrelated temp-dir ENOTEMPTY flake in a Codex app-server test shard, and the exact shard passed on rerun. No touched auto-reply/continuation proof failed.
- No live proof or fleet wake was run, per non-goals.

## Exact commands

```bash
node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1 src/auto-reply/reply/followup-runner.test.ts src/auto-reply/continuation/work-dispatch.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply.config.ts --maxWorkers=1
node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.core.test.json --incremental --tsBuildInfoFile .artifacts/tsgo-cache/core-test.tsbuildinfo
node scripts/run-oxlint.mjs --tsconfig config/tsconfig/oxlint.scripts.json src/auto-reply/reply/no-op-rearm-guard.ts src/auto-reply/reply/no-op-rearm-guard.test.ts src/auto-reply/reply/followup-runner.ts src/auto-reply/reply/followup-runner.test.ts src/auto-reply/continuation/work-dispatch.test.ts
node_modules/.bin/oxfmt --check src/auto-reply/reply/no-op-rearm-guard.ts src/auto-reply/reply/no-op-rearm-guard.test.ts src/auto-reply/reply/followup-runner.ts src/auto-reply/reply/followup-runner.test.ts src/auto-reply/continuation/work-dispatch.test.ts
node scripts/test-projects.mjs
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-matrix.config.ts --reporter=verbose --maxWorkers=1
NODE_OPTIONS=--max-old-space-size=8192 node scripts/run-vitest.mjs run --config test/vitest/vitest.agents-core.config.ts --reporter=verbose --maxWorkers=1 src/agents/runtime-plugins.registry-reuse.test.ts
OPENCLAW_TEST_PROJECTS_PARALLEL=4 OPENCLAW_VITEST_MAX_WORKERS=1 NODE_OPTIONS=--max-old-space-size=8192 node scripts/test-projects.mjs
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-codex-app-server-attempt-extra.config.ts --reporter=verbose
.agents/skills/autoreview/scripts/autoreview --mode branch --base origin/frond-scribe/20260624/assembly-continuation-followons
```
