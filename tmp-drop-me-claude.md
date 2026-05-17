# Journal — cael/spiderweb-tests-cost-cap-boundary-20260517/claude

Tracking issue: karmaterminal/openclaw#694
Lane: cael/spiderweb-tests-cost-cap-boundary
Bundle target: cure-(11) of PR #79925 OR follow-up (driver-prince's call at fold-time)
Sibling lane (just landed): #692 (T-1, `releaseQueuedCompactionCompletion`, SHA `c7a60b716b`)
Base SHA: df502943c2667ff2e1eed9f850379b41f9b8a8f6 (current PR head)
Host: cael (10.0.0.148)
Worktree: /tmp/oc-cost-cap-boundary/
Session: cure11-cost-cap-boundary-claude (claude_session_*, model=opus)

## Checkpoints

- 2026-05-17T16:08:00Z — lane initialized, branch + journal pushed first per remote-first canon. issue #694 filed, added to project 56. workorder file next.
- 2026-05-17T16:10:53+00:00: workorder written, dispatching claude opus

## §1 — Reads complete

All 4 cost-cap enforcement sites confirmed using `>` (not `>=`):
- `src/auto-reply/continuation/scheduler.ts:65` — `chainState.accumulatedChainTokens > config.costCapTokens`
- `src/agents/subagent-announce.ts:988` — `parentChainTokens > costCapTokens`
- `src/auto-reply/reply/agent-runner.ts:2476` — `accumulatedChainTokens > costCapTokens`
- `src/auto-reply/reply/agent-runner.ts:3092` — `accumulatedChainTokens > costCapTokens`

Contract: exactly-at-cap is ALLOWED; exceeding cap is REJECTED. No bug.

## §2 — Plan

Files to touch (test files only):
1. `src/agents/subagent-announce.chain-guard.test.ts` — 2 tests after L248
2. `src/auto-reply/continuation/scheduler.test.ts` — 2 tests after L64

Test names:
- allows continuation when accumulated tokens equal costCapTokens exactly (> not >=)
- rejects continuation when accumulated tokens exceed costCapTokens by one
(×2 — once in each file)

scheduler.test.ts has a clean direct-call seam via `checkContinuationBudget()` — very low-touch.
