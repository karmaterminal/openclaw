# WORKORDER: spiderweb-tests-cost-cap-boundary

## §0 Lane discipline

**Worktree**: `/tmp/oc-cost-cap-boundary/` (already on host)
**Branch**: `cael/spiderweb-tests-cost-cap-boundary-20260517/claude` (already pushed to origin)
**Base**: `df502943c2` (PR #79925 head; will rebase onto upstream at cure-(11) fold)
**Tracking issue**: `karmaterminal/openclaw#694` — UPDATE THIS ISSUE at every checkpoint
**Journal**: `tmp-drop-me-claude.md` at worktree root
**Outer budget**: 444m

### §0a Remote-first push (LOAD-BEARING)

Branch is pushed. Keep it pushed at every gate. Use:

```bash
cd /tmp/oc-cost-cap-boundary
echo "- $(date -uIseconds): <what just happened>" >> tmp-drop-me-claude.md
git add -A
git -c user.name="cael-dandelion-cult" -c user.email="cael.dandelion.cult@hotmail.com" commit -m "<one-line>"
git push origin cael/spiderweb-tests-cost-cap-boundary-20260517/claude
```

Bytes don't need to be polished; they need to be reachable.

### §0b GH-issue update discipline

Comment on `karmaterminal/openclaw#694` at these moments:
1. After §1 reads complete
2. After first test green (allows-at-cap)
3. After second test green (rejects-at-cap+1)
4. After all gates green
5. On declare-done
6. Or on any blocker — stop, post the open question, do NOT proceed past ambiguity

```bash
gh issue comment 694 --repo karmaterminal/openclaw --body "..."
```

## §1 Background reading

1. **Verify all four cost-cap enforcement sites use `>`** (not `>=`):
   - `src/auto-reply/continuation/scheduler.ts` (~L65)
   - `src/agents/subagent-announce.ts` (~L988)
   - `src/auto-reply/reply/agent-runner.ts` (~L2476 and ~L3092)

   Confirm before writing tests. If ANY site uses `>=`, **STOP** and surface as bug.

2. **Existing cost-cap test** — `src/agents/subagent-announce.chain-guard.test.ts` (~L235-248)
   - Already covers "exceeds cap" (single-side overshoot)
   - Does NOT cover exactly-at-cap (boundary)
   - Read enough surrounding context (~100 lines) to understand test-style, mocks, helpers

3. **Sibling chain-guard tests** in the same file — chain-length pins use both `===maxChainLength` (allowed) and `===maxChainLength+1` (rejected). Mirror that shape for cost-cap.

4. **Optional**: `src/auto-reply/continuation/scheduler.test.ts` — check if it has a parallel test seam for cost-cap. If yes + low-touch, add sibling test there. If structurally awkward, skip (out-of-scope per workorder).

## §2 Plan

Write plan-comment to `tmp-drop-me-claude.md` and `gh issue comment 694`:
- Files you'll touch (test files only)
- Test names you'll add
- Confirmation that all 4 cost-cap sites use `>` (or surfaced bug if not)

Push journal, comment on issue.

## §3 Tests to add

Add to `src/agents/subagent-announce.chain-guard.test.ts` adjacent to the existing cost-cap tests at L235-248:

```typescript
it("allows continuation when accumulated tokens equal costCapTokens exactly (> not >=)", async () => {
  // ARRANGE: config { costCapTokens: 500_000 }, session metadata { continuationChainTokens: 500_000 }
  // ACT: attempt continuation through subagent-announce dispatch path
  // ASSERT: NOT rejected with cost-cap error. accumulatedChainTokens === costCapTokens is allowed.
});

it("rejects continuation when accumulated tokens exceed costCapTokens by one", async () => {
  // ARRANGE: continuationChainTokens === costCapTokens + 1
  // ACT: attempt continuation
  // ASSERT: rejected with cost-cap error
});
```

Match the existing test-style. Use the same mock-setup pattern as the L235-248 tests. Two test names that pin behavioral contract.

**Optional**: if `src/auto-reply/continuation/scheduler.test.ts` has a clean parallel seam, add the same two tests at the scheduler.ts:65 site. Skip if not clean.

## §4 Gates (full 7-set per TOOLS.md cure-N execution-gates)

NO SKIPPING.

```bash
cd /tmp/oc-cost-cap-boundary
pnpm install --frozen-lockfile
pnpm tsgo:core
pnpm tsgo:test
pnpm tsgo:extensions
pnpm lint
pnpm lint:extensions:bundled
pnpm package-boundary:compile
NODE_OPTIONS=--max-old-space-size=32768 pnpm vitest run
```

If vitest OOMs with 32GB:
```bash
NODE_OPTIONS=--max-old-space-size=65536 pnpm vitest run
```

If any gate fails, **stop, report in issue #694 comment + journal**, do not proceed.

## §5 Push + declare-done

After all gates green:
```bash
echo "- $(date -uIseconds): all 7 gates green" >> tmp-drop-me-claude.md
git add -A && git commit -m "test(continuation): pin cost-cap exactly-at-boundary behavior (> not >=)" && git push origin cael/spiderweb-tests-cost-cap-boundary-20260517/claude

gh issue comment 694 --repo karmaterminal/openclaw --body "all 7 gates green at SHA $(git rev-parse HEAD). tests added: 2 (or 4 if scheduler.ts sibling). ready for cure-(11) fold-point bundling OR standalone follow-up PR."
```

Do NOT open a PR yourself. Cure-(11) fold-point handles bundling.

## §6 Explicit don'ts

- DO NOT touch production code (`src/auto-reply/continuation/scheduler.ts`, `src/agents/subagent-announce.ts`, `src/auto-reply/reply/agent-runner.ts` non-test files)
- DO NOT modify RFC
- DO NOT force-push
- DO NOT open a PR yet
- DO NOT auto-fix any `>` → `>=` discrepancy you find — surface as bug per RUNBOOK §9
- DO NOT skip any gate

## §7 If you discover a real bug

If any of the 4 enforcement sites uses `>=` instead of `>`:
1. STOP byte-work
2. Comment on issue #694 naming the file:line + claim vs reality
3. Do not write tests yet — cohort needs to decide whether contract is `>` or `>=` first

If exactly-at-cap is actually REJECTED (not allowed):
1. STOP
2. Comment on issue #694 — the behavioral contract is opposite to what this workorder assumed
3. Cohort decides whether to flip the test or fix the code

## §8 Substrate-honesty

- Read each enforcement site at byte before claiming it uses `>`
- If existing test file uses patterns you don't understand, journal + comment + ask
- Cite file:line for everything
- Match the existing chain-guard test style — don't invent new mocking patterns
