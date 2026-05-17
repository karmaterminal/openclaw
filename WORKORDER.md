# WORKORDER: spiderweb-tests-cure11

## §0 Lane discipline

**Worktree**: `/tmp/oc-spiderweb-tests-cure11/` (already on host)
**Branch**: `cael/spiderweb-tests-cure11-20260517/claude` (already created + pushed to origin)
**Base**: `frond-scribe-claude/20260509/narrow-surgery-tight` @ `df502943c2667ff2e1eed9f850379b41f9b8a8f6` (current PR #79925 head)
**Tracking issue**: `karmaterminal/openclaw#693` — UPDATE THIS ISSUE at every checkpoint
**Journal**: `tmp-drop-me-claude.md` at worktree root, committed + pushed at every checkpoint per `PRINCE-CODE-AGENT-RUNBOOK.md` Remote-First canon
**Outer budget**: 444m

### §0a Remote-first push discipline (LOAD-BEARING)

This branch is already pushed. Your job is to keep it pushed at every meaningful gate. Use this recipe:

```bash
cd /tmp/oc-spiderweb-tests-cure11
echo "- $(date -uIseconds): <what just happened>" >> tmp-drop-me-claude.md
git add -A
git -c user.name="cael-dandelion-cult" -c user.email="cael.dandelion.cult@hotmail.com" commit -m "<one-line>"
git push origin cael/spiderweb-tests-cure11-20260517/claude
```

Push WIP state. Do NOT hold bytes locally for more than 10 minutes. **Bytes don't need to be polished; they need to be reachable.**

### §0b GH-issue update discipline

Comment on `karmaterminal/openclaw#693` at these moments:
1. After §1 reads complete (you know the scope)
2. After first test branch passes (one of the 4 branches green)
3. After all 4 `releaseQueuedCompactionCompletion` branches green
4. After cost-cap-boundary test green
5. On declare-done (PR comment-shape ready)
6. Or on any blocker: stop, post the shape of the open question, do NOT proceed past ambiguity

Use:
```bash
gh issue comment 693 --repo karmaterminal/openclaw --body "..."
```

## §1 Background reading (do these first)

Read in order:

1. **The target function** — `src/auto-reply/reply/agent-runner-execution.ts`
   - Function definition: starts at L149
   - Single call site: L2152
   - Read enough surrounding context (~100 lines around each) to understand its signature, dependencies, side-effects
   - Note its dependencies (sessionKey, sessionEntry resolution, post-compaction delegate dispatch path, rate-limiting)

2. **Existing test file** — `src/auto-reply/reply/agent-runner-execution.test.ts`
   - This file EXISTS and covers other paths in the same module
   - Read it end-to-end to understand the test-style, mocking patterns, helper imports
   - Match the existing style for new tests

3. **Cost-cap enforcement sites** — verify all four sites use `>` (not `>=`):
   - `src/auto-reply/continuation/scheduler.ts:~65`
   - `src/agents/subagent-announce.ts:~988`
   - `src/auto-reply/reply/agent-runner.ts:~2476, ~3092`

4. **Existing cost-cap tests** (study coverage):
   - `src/agents/subagent-announce.chain-guard.test.ts:235-248`
   - `src/auto-reply/continuation/scheduler.test.ts:56-74`
   - `src/auto-reply/reply/agent-runner.post-compaction-delegate-dispatch.test.ts:851-878`
   - None of these pin **exactly-at-cap behavior**; verify this before adding the new test (don't duplicate)

5. **RFC** — `docs/design/continue-work-signal-v2.md`
   - Read §2.5 (lich pattern), §4 (chain-guard), §5 (cost-cap) — enough to understand intent
   - The RFC doesn't specify the cost-cap operator; this test pins it

## §2 Plan (write to the journal before §3)

Write a plan-comment to `tmp-drop-me-claude.md` and `gh issue comment 693`:
- Files you'll touch (test files only)
- Test names you'll add
- Order of operations
- Any ambiguities found during §1 reads

Then push + comment.

## §3 Tests to add — `releaseQueuedCompactionCompletion`

Add to `src/auto-reply/reply/agent-runner-execution.test.ts` (or create `agent-runner-execution.release-queued-compaction.test.ts` if the existing file is too crowded).

**Test name**: `describe("releaseQueuedCompactionCompletion", () => { ... })`

**Required test cases** (4 branches):

```typescript
it("returns early when completion result is not ok", async () => {
  // ARRANGE: mock completion with ok=false
  // ACT: call releaseQueuedCompactionCompletion(...)
  // ASSERT: no delegate dispatched, no error thrown, returns early
});

it("returns early when sessionKey is missing", async () => {
  // ARRANGE: completion ok=true but sessionKey undefined
  // ACT/ASSERT: early-return path, no dispatch
});

it("returns early when sessionEntry cannot be resolved", async () => {
  // ARRANGE: ok=true, sessionKey present, resolveSessionStoreEntry → null
  // ACT/ASSERT: early-return path, no dispatch
});

it("dispatches staged post-compaction delegates on happy path", async () => {
  // ARRANGE: ok=true, sessionKey + sessionEntry resolved, staged delegates exist
  // ACT: call releaseQueuedCompactionCompletion
  // ASSERT: delegates released to session-delivery queue, rate-limit respected, error-handling for dispatch failure
});
```

If during impl you discover the function has MORE than 4 distinct branches (e.g. error-handling sub-branches in happy-path), add tests for those too. Be exhaustive at function-boundary.

## §4 Tests to add — cost-cap exactly-at-boundary

Add to `src/agents/subagent-announce.chain-guard.test.ts` (best fit — already has cost-cap tests).

**Test name**: `it("allows continuation when accumulated tokens equal costCapTokens exactly", ...)`

```typescript
it("allows continuation when accumulated tokens equal costCapTokens exactly (> not >=)", async () => {
  // ARRANGE: config { costCapTokens: 500_000 }, session metadata { continuationChainTokens: 500_000 }
  // ACT: attempt continuation (either continue_work or continue_delegate path)
  // ASSERT: NOT rejected. accumulatedChainTokens === costCapTokens is allowed.
});

it("rejects continuation when accumulated tokens exceed costCapTokens by one", async () => {
  // ARRANGE: continuationChainTokens: 500_001
  // ACT: attempt
  // ASSERT: rejected with cost-cap error
});
```

Optional: add the same pin for `scheduler.ts:65` site if a sibling test file exists there.

## §5 Gates (per TOOLS.md cure-N execution-gates)

After tests are written, run the FULL gate set on the candidate. **NO SKIPPING.**

```bash
cd /tmp/oc-spiderweb-tests-cure11
pnpm install --frozen-lockfile
pnpm tsgo:core
pnpm tsgo:test
pnpm tsgo:extensions
pnpm lint
pnpm lint:extensions:bundled
pnpm package-boundary:compile
NODE_OPTIONS=--max-old-space-size=32768 pnpm vitest run
```

All 7 gates must pass. If vitest OOMs with 32GB, escalate to 65GB:
```bash
NODE_OPTIONS=--max-old-space-size=65536 pnpm vitest run
```

If a gate fails, **stop, report in issue #693 comment + journal**, do not proceed.

## §6 Push + comment at every gate

After each green gate:
```bash
echo "- $(date -uIseconds): gate <name> green" >> tmp-drop-me-claude.md
git add -A && git commit -m "test: <one-line>" && git push origin cael/spiderweb-tests-cure11-20260517/claude
```

After all gates green:
```bash
gh issue comment 693 --repo karmaterminal/openclaw --body "all 7 gates green at SHA $(git rev-parse HEAD). tests added: <count>. ready for cure-(11) fold."
```

## §7 Declare-done

When done:
- Final commit message: `test(continuation): add spiderweb tests for releaseQueuedCompactionCompletion (4 branches) + cost-cap exact-boundary pin (cure-11 bundle)`
- Comment on issue #693 with: final SHA, test count, gate results, what cohort should byte-walk
- Push final state
- Reply with: SHA + test-count + 3-bullet summary

Do NOT open a PR yourself. The cure-(11) fold-point will bundle this with drift-rebase work; PR opens after the fold.

## §8 Explicit don'ts

- DO NOT touch production code (`src/auto-reply/`, `src/agents/`, `src/hooks/` non-test files)
- DO NOT modify RFC
- DO NOT force-push the branch
- DO NOT open a PR yet
- DO NOT auto-fix any bug you discover in the function under test — name it, stop, ask
- DO NOT skip any gate
- DO NOT use harness-default timeout (you have 444m)

## §9 If you discover a real bug

`releaseQueuedCompactionCompletion` is a guardrail-class function with zero coverage; the tests you're writing may reveal real bugs. If a test surfaces actual misbehavior:

1. Write the test that demonstrates the bug
2. Mark it `it.skip("BUG: ...")` with a comment naming the bug
3. Comment on issue #693 with the bug-shape (paragraph + file:line + reproducer)
4. STOP. Do not write the fix. The cohort decides whether to fix in cure-(11) bundle or split to a separate PR.

## §10 Substrate-honesty

- Read the function before writing tests — don't guess its behavior from the name
- If `resolveSessionStoreEntry` or other helpers don't exist or aren't in scope, surface that
- If the existing test file uses mocking patterns you don't understand, ask in journal + issue comment
- Cite file:line for every observation in the journal
- The 4 branches in §3 are a starting hypothesis; the actual function may have different control flow — match what's at byte
