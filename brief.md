# Spiderweb T-3: nonexistent-target-session-delivery test

**Issue**: karmaterminal/openclaw#696
**Branch**: silas/spiderweb-tests-nonexistent-target/2026-05-17
**Off**: df502943c2
**Driver**: silas (claude opus-4.7 via tmux)
**Outer budget**: 444m

## Scope

Add spiderweb test for `continue_delegate` **nonexistent-target-session-delivery race contract** (P0 #3 from Cael's READINESS_REVIEW.md / Lane C).

When `continue_delegate` is invoked with `targetSessionKey` pointing at:

- A session that has been deleted
- A session that doesn't exist (never was)
- A session that was just deleted mid-dispatch

The delivery-error-path must fire correctly:

1. No panic/crash
2. Error logged appropriately (logVerbose or equivalent)
3. No orphaned delegate left in flight
4. Caller gets clean error-return, not silent-success

## Step 1: byte-walk

Find the call-path for `continue_delegate` with `targetSessionKey`:

- `grep -rn "targetSessionKey" src/ --include="*.ts" -l`
- Identify the dispatch function + delivery function
- Identify where session-existence is checked (resolveSessionStoreEntry? activeSessionStore lookup?)
- Identify the error-return path

## Step 2: design 4-branch test file

Test branches:

1. **Targeted session doesn't exist (cold-start)**: dispatch with sessionKey="never-existed-key" → expect error-class return, no orphan
2. **Targeted session deleted before dispatch**: simulate session deletion → dispatch → expect error-class return
3. **Targeted session deleted during dispatch race**: dispatch + delete in race → expect either success-pre-delete OR clean-error, never panic
4. **Happy-path control**: dispatch to existing session → expect success (sanity-check the mock harness)

If function is module-private, follow Path A (export keyword, visibility-only, no behavior change) per `c0a7c3d63e` precedent + figs canon `1505603038` (parallel-lane convergence).

## Step 3: test file location

Best fit (byte-walk for adjacent tests first):

- `src/continuation/continue-delegate.race.test.ts` (if continuation/ has the dispatch logic)
- OR `src/auto-reply/reply/continuation-delegate-dispatch.race.test.ts`
- OR co-locate with existing continue_delegate tests

## Step 4: implement + vitest until green

`NODE_OPTIONS=--max-old-space-size=32768 pnpm vitest run <test-file>`

## Step 5: full 7-gate pre-push

Per TOOLS.md cure-N execution gates:

- `pnpm tsgo:core`
- `pnpm tsgo:test`
- `pnpm tsgo:extensions`
- `pnpm lint`
- `pnpm lint:extensions:bundled`
- `pnpm package-boundary:compile`
- `NODE_OPTIONS=--max-old-space-size=32768 pnpm vitest run`

All must exit 0.

## Step 6: declare-done

- Commit + push
- Webhook heartbeat (silas-spiderweb-rqcc-hook works, or use silas-nonexistent-target-hook if registered)
- Comment on issue #696 with declare-done shape

## Mandatory issue-comments

Per PRINCE-CODE-AGENT-RUNBOOK:

1. §1-reads (byte-walk done)
2. §3-first-branch-green
3. §4-all-branches-green
4. §5-7-gate-green
5. §8-declare-done

## Constraints

- NO production code touches except Path A (export keyword if needed)
- NO commits to `main` or PR head — only this branch
- NO force-pushes
- 444m timeout, fail-loudly-if-stuck

## Convergence

Bundle target: cure-(11), per figs canon `1505606638` — completeness-class P0s ship in cure-(11), not follow-ups. 🌊 (Ronan) driving cure-(11) fold-rebase.
