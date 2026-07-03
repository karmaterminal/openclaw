# #1159 structural review lane

## Exact PR/head/base reviewed

- PR: karmaterminal/openclaw#1159, "Continuation: harden post-compaction delegate recovery followups"
- Base: `frond-scribe/20260624/assembly-continuation-followons` at `6f583229e682be5c8077886f00cc744ae27e0ad8`
- Head: `scribe/20260703/assembly-safe-fold-1158` at `c121dde51f1f17b6086063704526dae669903f0e`
- Local review branch: `codeagent/1159-structural-review` at `c121dde51f1f17b6086063704526dae669903f0e`
- Diff verified: 38 files, +2981/-244. No stale-base/wrong-surface explosion.
- Author identity: frond scribe (@scribe-dandelion-cult, account created 2026-05-06). OpenClaw last 12mo: 2 PRs, 5 issues, 1 commit. GitHub public last 12mo: 1474 commits, 1066 PRs, 154 issues, 22 reviews.

## Tools/agents used

- `gitcrawl doctor --json`: local archive fresh (`last_sync_at=2026-07-03T15:36:40Z`), but `gitcrawl threads` returned no cached thread for both `openclaw/openclaw#1159` and `karmaterminal/openclaw#1159`; live `gh pr view` used for PR metadata.
- Live `gh pr view 1159 --repo karmaterminal/openclaw`: confirmed head/base, stats, file list, author, assignees, comments, commits.
- Direct code inspection via `rg`, `view`, `git diff`, plus scoped guides `src/agents/AGENTS.md`, `src/gateway/AGENTS.md`, and system-provided `src/agents/tools/AGENTS.md`.
- Review-axis agents:
  - `coverage-axis`: completed.
  - `silent-failure-axis`: completed.
  - `type-design-axis`: completed.
  - `comment-axis`: completed.
  - `code-reviewer-axis`: launched, still running after two 180s waits; not included in final verdict.
- Validation command: `node scripts/test-projects.mjs`.

## GitNexus availability

- `gitnexus` command exists at `/home/figs/.local/bin/gitnexus`.
- `gitnexus status` reported `Repository not indexed`.
- `gitnexus analyze .` was attempted. It warned that Swift parsing was unavailable and skipped 703 Swift files, then still had not registered the repo after multiple waits; the process was stopped. `gitnexus status` still reported unindexed.
- No GitNexus relationship queries completed. Fallback was direct code graph inspection for:
  - `dispatchToolDelegates`
  - `recoverPendingContinuationDelegates`
  - `dispatchStagedPostCompactionDelegates`
  - `recoverAndReleaseStagedPostCompactionDelegates`
  - `drainChildContinuationQueue`
  - `spawnSubagentDirect`
  - `resetContinueDelegateTurnBudget`

## Critical issues

None found.

## Important issues

1. **Restart recovery fail-opens to a zero chain state when the session store cannot load.**  
   `recoverPendingContinuationDelegates` logs `delegate-recovery-store-load-failed` and then sets `sessionStore = {}` (`src/auto-reply/continuation/delegate-dispatch.ts:626-633`). `recoverAndReleaseStagedPostCompactionDelegates` does the same for post-compaction recovery (`src/auto-reply/continuation/delegate-dispatch.ts:967-974`). Both paths then dispatch from `loadContinuationChainState(undefined)`, losing the persisted chain count/tokens and delivery context. That can under-enforce max-chain/cost caps exactly at restart recovery, the path this PR is hardening. Best fix: fail closed for that session/store path when the store cannot load; leave rows queued/running and recoverable, log/surface the error, and retry on the next startup/hedge rather than dispatching from zero.

2. **Continuation child spawns are not uniformly idempotent or chain-seeded across sibling paths.**  
   The shared tool-delegate dispatcher passes both deterministic child identity and chain seed (`continuationDelegateFlowId` and `continuationChainState`) at `src/auto-reply/continuation/delegate-dispatch.ts:501-512`. Post-compaction dispatch seeds chain state but does not pass `continuationDelegateFlowId` from the claimed flow (`src/auto-reply/continuation/delegate-dispatch.ts:847-862`). The session-delivery post-compaction path sets `drainsContinuationDelegateQueue: true` but passes neither deterministic flow id nor child chain seed (`src/auto-reply/reply/post-compaction-delegate-dispatch.ts:576-593`). Bracket delegate spawns in the main runner and subagent announce paths also set `drainsContinuationDelegateQueue: true` without a child chain seed (`src/auto-reply/reply/agent-runner.ts:2967-2982`, `src/agents/subagent-announce.ts:1399-1415`). Best fix: make continuation child spawn a single helper/typed shape that requires `continuationChainState` whenever `drainsContinuationDelegateQueue` is true, and pass a deterministic id for every durable delegate substrate (TaskFlow flow id or delivery queue id).

3. **`releasePostCompactionLifecycle` finalizes all claimed rows even when dispatch failed, and appears stale relative to the production queue path.**  
   The helper claims staged rows, dispatches them, then finalizes `claimedFlowIds` unconditionally (`src/auto-reply/continuation/post-compaction-release.ts:103-130`). The recovery path finalizes only `result.dispatchedFlowIds` so failed rows remain recoverable (`src/auto-reply/continuation/delegate-dispatch.ts:989-1019`). `rg` found no production caller of `releasePostCompactionLifecycle`; production auto/request-compaction uses `dispatchPostCompactionDelegates`. Best fix: either delete the stale helper/tests if it is no longer a live seam, or align it with accepted-only finalization and add a spawn-failure test.

4. **Post-compaction delivery queue retries can duplicate an accepted child across crash-after-spawn/pre-ack because the child spawn is not deterministic.**  
   `drainPendingSessionDeliveries` acks only after `deliver()` resolves (`src/infra/session-delivery-queue-recovery.ts:147-165`). `deliverQueuedPostCompactionDelegate` persists chain state before spawning, then spawns without a deterministic continuation id (`src/auto-reply/reply/post-compaction-delegate-dispatch.ts:565-604`). If the process crashes after `spawnSubagentDirect` accepts but before `ackSessionDelivery`, the same queued delivery is replayed and spawns a new UUID child. The comment at `src/auto-reply/reply/post-compaction-delegate-dispatch.ts:549-564` covers persist-before-spawn but not crash-after-spawn/pre-ack. Best fix: derive the child run/session key from the delivery queue id and reconcile accepted live children on retry, mirroring the TaskFlow `flowId` path.

5. **Delete-mode subagent cleanup can silently swallow session-delete failures.**  
   `deleteSubagentSessionForCleanup` catches `sessions.delete` errors and only calls optional `onError` (`src/agents/subagent-session-cleanup.ts:79-91`). At least one caller uses no `onError`, so a failed delete can be silent and not retried. Best fix: log in the helper unconditionally and schedule a bounded retry on delete failure.

## Coverage gaps

- Gateway startup wiring: dispatcher/recovery units exist, but `src/gateway/server-runtime-services.ts:301-312` should have a focused test that advances the delayed recovery timer and asserts `recoverPendingContinuationDelegates`, `recoverAndReleaseStagedPostCompactionDelegates({ runningUpdatedAtOrBefore: bootTime })`, then `recoverPendingContinuationWork`.
- `spawnSubagentDirect` child seeding: no direct test proves `continuationChainState` is persisted into the child session entry (`src/agents/subagent-spawn.ts:1399-1408`).
- Admission reset entry paths: the main runner has a test (`src/auto-reply/reply/agent-runner-execution.test.ts:1411-1423`), but the new reset calls in `src/auto-reply/reply/followup-runner.ts:1200-1205` and `src/agents/command/attempt-execution.ts:898-900` are not pinned.
- Child no-op token persistence fail-closed behavior is weaker than the parent coverage; add a child-session no-op persist failure test that proves the folded basis is used and delayed delegates are not left behind with stale cost.
- Add tests for post-compaction spawn failure in `releasePostCompactionLifecycle` if the helper remains, and for crash-after-spawn/pre-ack idempotency in the session-delivery queue path.

## Comment/doc risks

- `src/auto-reply/continuation/post-compaction-release.ts:98-102` says finalization is safe after dispatch, but the code finalizes all claimed rows even if dispatch reports failures. Update the comment or the code.
- `src/auto-reply/reply/agent-runner.finally-drain-hardening.test.ts:5-7` says the `consumePendingDelegates` shim only had that caller, but `src/agents/subagent-announce.ts` also consumes it.
- `src/gateway/server-runtime-services.ts:184-186` says recovery "resets/requeued"; actual behavior considers/re-drives queued/running rows.

## Positive signals

- The PR correctly moves delegate substrate to TaskFlow with `queued`/`running` recovery states and schema validation.
- Normal `continue_delegate` recovery now has deterministic child session/run keys via `continuationDelegateFlowId` and checks live accepted children before respawn.
- `consumePendingDelegates` handles running pre-due rows so force-claimed delayed delegates are not stranded.
- Inherited silent/silent-wake policy is durably annotated for delayed delegates and covered by restart/hedge tests.
- Child-session cleanup now defers deletion for live work, recoverable delegates, and active descendant runs.

## Validation

- `node scripts/test-projects.mjs` failed after 89 Vitest shards in 705.80s.
- Failed shard digest: 10 shards failed: `gateway-server`, `agents-core`, `extension-qa`, `extensions`, `auto-reply-reply`, `extension-mattermost`, `extension-matrix`, `cli`, `plugins`, `extension-codex-app-server-support`.
- `rg "^ FAIL "` counted 26 failing test cases in the saved full-suite output.
- Changed-surface failures include:
  - `src/auto-reply/continuation/post-compaction-release.test.ts`: expected raw delegate task, received wrapped `[continuation:post-compaction] [continuation:chain-hop:1] ...`.
  - `src/auto-reply/continuation/delegate-mid-run-compaction-survival.test.ts`: same wrapped-task mismatch for two staged delegates.
- Important nearby green signal: `src/auto-reply/continuation/delegate-dispatch.test.ts` passed 59 tests, and `src/auto-reply/reply/post-compaction-delegate-dispatch.test.ts` passed 34 tests.

## Recommended action before Cael smoke

Do not proceed to Cael smoke yet. First fix the fail-open restart recovery store-load behavior, make all continuation child spawns idempotent and chain-seeded through one required helper/typed shape, either delete or repair `releasePostCompactionLifecycle`, add the missing entry-path and restart wiring tests, then rerun `node scripts/test-projects.mjs` to a clean completion signal.

https://github.com/karmaterminal/openclaw/pull/1159
