# Workorder: Subagent-spawn/registry 26-failure cluster cure

## Branch

`cure/subagent-spawn-26-failure-cluster` (off `uncurse/20260530/copilot-opus47-1m` HEAD `e6b6b48150`)

## Substrate

Full `pnpm test` empirical on cure-cycle HEAD `e6b6b48150` (post-#823+#824+#826 cluster merge) shows **26 failures across 5 test-files in src/agents/**:

- `src/agents/subagent-registry.test.ts` — 14 failures (seam flow: timeout-classification, lifecycle, traceparent, agent.wait)
- `src/agents/subagent-spawn.test.ts` — 4 failures (seam flow: spawn-routing, traceparent forwarding, controller ownership)
- `src/agents/subagent-spawn.thread-binding.test.ts` — 3 failures
- `src/agents/subagent-spawn.workspace.test.ts` — 4 failures
- `src/agents/subagent-spawn.depth-limits.test.ts` — 1 failure

ALL test-files EXIST on `origin/main` (cure-cycle CODE-changes broke them, NOT new tests). Class-(a) **cure-cycle-induced**.

## Cure-direction (per figs binding-directive)

**NO REBASING** of cure-cycle. **Change-the-game permission** on tests:

- Examine pr-presentation branch `fc337f05d6` for upstream-aligned test shapes
- REWRITE cure-cycle tests to match current SUT contract (don't restore removed SUT-fields; align tests to current shape)
- OR fire SUT-restoration cure if test-contract is load-bearing for continuation feature (like cot-frame suppression was)

## Methodology

For each failing test:

1. Capture failing-test output via `pnpm vitest run <test-file>`
2. Compare test-assertion against current SUT shape
3. Compare against `fc337f05d6:<test-file>` (presentation-PR shape)
4. Compare against `origin/main:<test-file>` (current upstream shape)
5. Apply per-test classification: cure-cycle-induced bug-in-SUT vs cure-cycle-induced test-not-updated vs upstream-drift
6. Apply per-test cure: SUT-restoration vs test-update vs change-the-game-delete-and-rewrite

## Completion criteria

- All 26 failures cleared on cure-cycle branch
- `pnpm vitest run src/agents/subagent-*.test.ts` → all PASS
- `pnpm vitest run src/agents/subagent-registry.test.ts` → all PASS
- Full `pnpm test` run shows 26 fewer failures than baseline
- Commit + push to `cure/subagent-spawn-26-failure-cluster`
- Open PR against `uncurse/20260530/copilot-opus47-1m` base

## Required-commit-author

Use karmafeast-shared-auth pattern matching cure-cycle convention:

```
git -c user.name='karmafeast' -c user.email='karmafeast@karmaterminal.com' commit -m "..."
```

Include `Co-authored-by:` trailer for actual-prince attribution.

## Context

This is part of cure-cycle close-out for PR #809 review-only branch. Other parallel cure-PRs in flight:

- PR #831 (cot-frame restore, ronan)
- Issue #829 (agent.test.ts 5-failure cure — emeric working on it per `1510544577`)
- This cluster (subagent 26-failure — you're working on it)

After this lands + emeric's #829 lands + PR #831 merges + remaining smaller clusters cured (session-updates.compaction×3, commands-system-prompt×2, codex-ext×4, matrix-sdk×2, reply-state×1, app-server-auth-bridge, app-server-run-attempt), cure-cycle is GATES-Gate-5-ready.

## Output requirements per Pattern E

Write `output.md` reporting:

- Per-test classification + cure-shape applied
- Full `pnpm test` empirical result on resulting branch (not subset!)
- Any new sub-7.X classes banked during work
- Any axes-of-uncertainty for cohort review
