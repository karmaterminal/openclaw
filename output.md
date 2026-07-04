# 1159 combine round-six + cleanup P2 output

## Branch / head / base

- Branch: `codeagent/1159-combine-round6-cleanup`
- Code/proof head before this output artifact: `1bde4bf5b32b046dda93a619574503973c419976`
- Base: `frond-scribe/20260624/assembly-continuation-followons`
- Original requested #1159 head: `0c7e8d9b850c92c9701c0e2f0b1b54b50e26a69a`
- Live #1159 head observed after work started and merged into this branch: `9cbf8eae51fb0fd28132d66e9b278dcc5c7fb367`

## Round-six replay / merge

- Started from `0c7e8d9b850c92c9701c0e2f0b1b54b50e26a69a`.
- Replayed round-six final `c6936766253f8413cd6c3df186bc10d1bdfb81fc` by cherry-pick, producing `58af5ba6895` (`fix: keep non-source forbidden deliveries retryable`) on this branch.
- #1159 moved after the work started; merged current live #1159 head `9cbf8eae51f` into this branch as `cd4501dd420`, preserving the PR's `Drop child post-compaction rows during cleanup` commit.

## r3522399798 verdict

Live and fixed.

The original blocker was real on the combined branch: `deleteSubagentSessionForCleanup` gated deletion on `hasRecoverablePendingDelegate`, while that predicate also counted queued/running post-compaction rows. A completed delete-mode child that staged `continue_delegate(mode="post-compaction")` could therefore keep rescheduling cleanup forever.

The combined fix:

- Fails child-owned staged post-compaction rows during delete-mode cleanup because the completed child will not receive a future compaction seam.
- Narrows `hasRecoverablePendingDelegate` to regular pending delegate rows only, preserving cleanup deferral for queued/running delayed bracket/tool delegates.
- Adds direct tests for queued/running post-compaction cleanup drops and regular pending cleanup deferral.

Autoreview also found a related branch regression: durable delayed bracket delegates lost `traceparent` metadata. Fixed by carrying `chainSignal.traceparent` into the queued `PendingContinuationDelegate`, with focused coverage for `[[CONTINUE_DELEGATE: ... +30s | traceparent=...]]`.

## Validation

Passed:

- `node scripts/test-projects.mjs src/agents/subagent-announce.continuation-drain.test.ts src/agents/subagent-session-cleanup.test.ts src/auto-reply/continuation/delegate-store.test.ts src/auto-reply/continuation-delegate-store.post-compaction-substrate.test.ts src/auto-reply/reply/post-compaction-delegate-dispatch.test.ts -- --maxWorkers=1`
- `./node_modules/.bin/oxfmt --check --threads=1` on changed files
- `node scripts/run-oxlint.mjs` on changed files
- `git diff --check`
- `node scripts/run-tsgo.mjs -p tsconfig.core.json --incremental --tsBuildInfoFile .artifacts/tsgo-cache/core.tsbuildinfo`
- `node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.core.test.json --incremental --tsBuildInfoFile .artifacts/tsgo-cache/core-test.tsbuildinfo`
- `.agents/skills/autoreview/scripts/autoreview --mode branch --base origin/frond-scribe/20260624/assembly-continuation-followons` (final run clean)

Full suite:

- Command: `node scripts/test-projects.mjs`
- Final code-head result: failed after `89` Vitest shards in `404.62s`.
- Visible failures were outside the touched continuation/cleanup surface:
  - `src/cli/logs-cli.test.ts`: 1 failure
  - `extensions/google-meet/src/oauth.test.ts`: 1 failure
  - `extensions/qa-lab/src/crabline-transport.test.ts` / `extensions/qa-lab/src/suite.test.ts`: 12 failures
  - `extensions/codex/src/app-server/session-history.test.ts`: 3 failures
  - `extensions/mattermost/src/channel.test.ts`: 1 failure
  - `test/scripts/dev-tooling-safety.test.ts`: 3 descendant-cleanup timeouts
  - `test/scripts/plugin-lifecycle-measure.test.ts`: 1 descendant-cleanup status mismatch
- Earlier broad runs showed the same unrelated/dev-tooling class plus other unrelated shards; focused continuation proof stayed green.

## Fast-forward safety

Safe for frond-scribe to fast-forward/update #1159 from the code/proof head: the branch contains both the original requested #1159 head and the current live #1159 head, includes the round-six final patch by cherry-pick, has clean autoreview, and the only broad-suite failures are unrelated to this continuation cleanup/post-compaction surface.
