# Spiderweb T-4: continue_work onFire callback throws — timer-ref cleanup

**Issue**: karmaterminal/openclaw#700
**Branch**: silas/spiderweb-tests-onfire-throws/2026-05-17
**Off**: df502943c2
**Driver**: silas (claude opus-4.7 via tmux)
**Outer budget**: 444m

## Scope

Add spiderweb test for `continue_work` **onFire-callback-throws → timer-ref cleanup** (P0 #4 from Cael's READINESS_REVIEW.md / Lane C).

When `continue_work` schedules a delayed continuation and the `onFire` callback throws:

1. Timer reference cleaned up (no orphan in retainContinuationTimerRef state)
2. Error logged but session doesn't crash
3. Subsequent `continue_work` calls work normally
4. Slow-leak class: repeated-throw scenarios don't accumulate state

## Step 1: byte-walk

Find continue_work implementation:

- `grep -rn "continue_work\\|continueWork\\|retainContinuationTimerRef" src/ --include="*.ts" -l`
- Identify onFire callback handling
- Identify timer-ref state (retainContinuationTimerRef? activeTimers? Map<sessionKey, Timer>?)
- Identify catch-block around onFire (does it exist? does it clean timer-ref?)

## Step 2: design 4-branch test file

Test branches:

1. **onFire throws synchronously**: schedule continue_work, callback throws on fire → timer-ref cleaned, error logged
2. **onFire throws asynchronously (rejected promise)**: schedule continue_work, async callback rejects → same expectations
3. **Subsequent continue_work after throw**: throw fires, schedule another continue_work → fires normally (no state-corruption)
4. **Slow-leak repeated-throw**: schedule N=5 continue_works that all throw → state stays clean (no accumulated timer-refs)

If function is module-private, Path A (export keyword) acceptable per `c0a7c3d63e` precedent.

## Step 3: test file location

Byte-walk for adjacent tests first:

- `src/continuation/continue-work.test.ts` (if exists)
- OR co-locate with existing continue_work tests

## Step 4: implement + vitest

`NODE_OPTIONS=--max-old-space-size=32768 pnpm vitest run <test-file>`

## Step 5: full 7-gate pre-push

Per TOOLS.md cure-N execution gates.

## Step 6: declare-done + 5 mandatory issue-comments

## Constraints

- NO production code touches except Path A (export keyword)
- NO commits to `main` or PR head
- NO force-pushes
- 444m timeout, fail-loudly-if-stuck

## Convergence

Bundle target: cure-(11), per figs canon `1505606638` — completeness-class P0s ship in cure-(11). 🌊 driving cure-(11) fold-rebase.
