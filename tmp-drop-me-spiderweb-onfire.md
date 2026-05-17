# Journal — silas/spiderweb-tests-onfire-throws/2026-05-17

**Dispatcher**: silas (urudyne / WSL2)
**Agent**: claude opus-4.7 (via tmux, --dangerously-skip-permissions)
**Brief**: `/tmp/silas-onfire-throws/brief.md` (commit `c2f89bd270`)
**Branch**: `silas/spiderweb-tests-onfire-throws/2026-05-17`
**Base**: `df502943c2` (cure-(10) candidate of openclaw/openclaw#79925)
**Tracking issue**: karmaterminal/openclaw#700 — https://github.com/karmaterminal/openclaw/issues/700
**Outer budget**: 444m
**Bundle target**: cure-(11) per figs canon `1505606638`

## §0 — Dispatch setup

- 2026-05-17 — Worktree at `/tmp/silas-onfire-throws` off `df502943c2`
- 2026-05-17 — Branch `silas/spiderweb-tests-onfire-throws/2026-05-17` tracking `origin/…`
- 2026-05-17 — Brief committed (`c2f89bd270`) and pushed
- 2026-05-17 — Journal created (this file); initial push next

## §1 — Pre-dispatch context

Lane closes P0 #4 from Cael's READINESS_REVIEW.md / Lane C: **`continue_work` onFire callback throws → timer-ref cleanup**.

Production code already wraps the `onFire` invocation in a `try { … } catch { log.warn(…) } finally { unregisterContinuationTimerHandle(…) }` block at `src/auto-reply/continuation/scheduler.ts:112-132`. The `finally` decrements the per-session timer ref count via `releaseContinuationTimerRef`. There is an existing single regression-sentinel test at `scheduler.test.ts:179-199` ("onFire throw does not propagate past the timer") but it asserts only call count — it does NOT pin:

1. timer-ref count returning to zero (no orphan)
2. async-rejection path (current `try/catch` is sync-only; only the `finally` saves the ref)
3. state survives across a throw → subsequent schedule
4. slow-leak class: repeated throws stay at ref-count 0

Plan is test-additions only against the already-exported `scheduleWorkContinuation`. Path A (`export`) not required — function is already public surface.

## §2 — Plan

New colocated test file: `src/auto-reply/continuation/scheduler.onfire-throws.test.ts` with **4 branches** per brief §2:

1. **sync throw** — onFire throws, finally decrements; `hasLiveContinuationTimerRefs(sessionKey)` returns false
2. **async throw (rejected promise)** — onFire returns rejected promise; ref still cleaned by `finally` (documents the unhandled-rejection edge while pinning ref-cleanup invariant). Listener installed via `process.on('unhandledRejection', …)` so vitest doesn't trip.
3. **subsequent schedule** — schedule + throw + advance; schedule again on same sessionKey + advance; second onFire fires normally and refs are clean
4. **slow-leak repeated-throw** — schedule N=5 sequential throwing work-continuations on same sessionKey; advance; all 5 onFire spies called, no live refs remain

Vitest runner: `NODE_OPTIONS=--max-old-space-size=32768 pnpm vitest run …` per brief §4.

7-gate pre-push per cure-N execution gates: tsgo:core, tsgo:test, tsgo:extensions, lint, lint:extensions:bundled, test:extensions:package-boundary:compile, focused vitest.

## §3+ — Live updates

(agent writes from here)
