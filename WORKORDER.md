# WORKORDER: spiderweb-tests-onfire-throws

## §0 Lane discipline

**Worktree**: `/tmp/oc-onfire-throws/` (cael host)
**Branch**: `cael/spiderweb-tests-onfire-throws-20260517/claude` (pushed)
**Base**: `df502943c2`
**Tracking issue**: `karmaterminal/openclaw#699` — UPDATE at every checkpoint
**Journal**: `tmp-drop-me-claude.md`
**Outer budget**: 444m

cure-(11) merge-blocker per figs completeness-canon. Lane C P0 #3 from `/tmp/oc-cure11-readiness/READINESS_REVIEW.md`.

### §0a Remote-first push

```bash
cd /tmp/oc-onfire-throws
echo "- $(date -uIseconds): <what just happened>" >> tmp-drop-me-claude.md
git add -A
git -c user.name="cael-dandelion-cult" -c user.email="cael.dandelion.cult@hotmail.com" commit -m "<one-line>"
git push origin cael/spiderweb-tests-onfire-throws-20260517/claude
```

### §0b GH-issue updates

Comment on #699 at:
1. After §1 reads (contract pinned)
2. After first test green
3. After all tests green + all gates green
4. On declare-done
5. On any blocker — STOP, post open question

```bash
gh issue comment 699 --repo karmaterminal/openclaw --body "..."
```

## §1 Background reading

**Goal**: discover what happens when `continue_work` (or delegate) `onFire` timer-callback throws.

1. **Continuation runtime + timer-fire path**:
   - `src/agents/subagent-announce.ts` — search for `onFire`, `retainContinuationTimerRef`, `setTimeout`, `continueWorkOpts`
   - `src/agents/subagent-announce.continuation.runtime.ts` (24-line shim)
   - `src/agents/openclaw-tools.ts` — `continue_work` + `request_compaction` tool factory (L494-556 area)
   - `src/auto-reply/continuation/scheduler.ts` — scheduler-side fire path

2. **Existing continuation-runtime tests** for style + mocking pattern:
   - `src/agents/subagent-announce.continuation.runtime.test.ts`
   - `src/agents/openclaw-tools.test.ts`
   - `src/auto-reply/continuation/scheduler.test.ts`

3. **Pin contract at byte**:
   - Does the timer-fire path try/catch the `onFire` callback?
   - If callback throws, does timer-ref still get released?
   - Where does the error surface (log? thrown? swallowed)?
   - Does subsequent registration work?
   - Are chain-token / chain-length counters decremented?

4. **Audit `retainContinuationTimerRef`**: my readiness-review P1-C flagged a slow-leak in long-running processes with many delayed delegates. This lane pins ONE shape of that leak (throw-path); the leak-itself isn't fixed here.

## §2 Plan + contract-pin comment

After §1 reads, write to journal AND comment on issue #699:
- file:line where timer fires + callback invoked
- contract at byte (try/catch? swallow? bubble? cleanup?)
- test plan: which file, test names, mock shape

## §3 Tests to add

Based on discovered contract, pin behavior with 3-4 tests:
- timer-ref released when onFire throws
- error surfaces somewhere observable
- registry not poisoned (next call works)
- counters decrement correctly

Match existing test-style. Use existing mock helpers when possible.

## §4 Gates (full 7-set)

```bash
cd /tmp/oc-onfire-throws
pnpm install --frozen-lockfile
pnpm tsgo:core
pnpm tsgo:test
pnpm tsgo:extensions
pnpm lint
pnpm lint:extensions:bundled
pnpm package-boundary:compile
NODE_OPTIONS=--max-old-space-size=32768 pnpm vitest run
```

## §5 Push + declare-done

```bash
echo "- $(date -uIseconds): all 7 gates green" >> tmp-drop-me-claude.md
git add -A && git commit -m "test(continuation): pin contract for continue_work onFire callback throwing" && git push origin cael/spiderweb-tests-onfire-throws-20260517/claude

gh issue comment 699 --repo karmaterminal/openclaw --body "all gates green at SHA $(git rev-parse HEAD). ready for cure-(11) fold."
```

## §6 If contract is undefined or fatal

If §1 reveals the `onFire` callback is invoked unwrapped (no try/catch, throws bubble fatal):
1. STOP
2. Surface as cure-(11) bug per RUNBOOK §9
3. Cohort decides whether to add try/catch in cure-(11) or write tests documenting the gap

## §7 Don'ts

- DO NOT touch production code (`src/agents/`, `src/auto-reply/`, `src/hooks/` non-test files)
- DO NOT modify RFC
- DO NOT force-push
- DO NOT open a PR
- DO NOT auto-fix
- DO NOT skip any gate
- DO NOT invent contract — pin what's at byte

## §8 Substrate-honesty

The "onFire" naming may not match production code. Walk the bytes to find what the actual fire-path is called. The 4 test cases above are starting hypothesis; reality may have different control flow.
