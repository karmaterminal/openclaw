# WORKORDER: spiderweb-tests-nonexistent-target-session

## §0 Lane discipline

**Worktree**: `/tmp/oc-nonexistent-target/` (host: cael)
**Branch**: `cael/spiderweb-tests-nonexistent-target-session-20260517/claude` (pushed to origin)
**Base**: `df502943c2` (PR #79925 head)
**Tracking issue**: `karmaterminal/openclaw#695` — UPDATE at every checkpoint
**Journal**: `tmp-drop-me-claude.md` at worktree root
**Outer budget**: 444m

This lane is a **cure-(11) merge-blocker** per figs canon `1505606xxx`: completeness ships in cure-(11), no split-to-followup. Lane C P0 #2 from `/tmp/oc-cure11-readiness/READINESS_REVIEW.md`.

### §0a Remote-first push

```bash
cd /tmp/oc-nonexistent-target
echo "- $(date -uIseconds): <what just happened>" >> tmp-drop-me-claude.md
git add -A
git -c user.name="cael-dandelion-cult" -c user.email="cael.dandelion.cult@hotmail.com" commit -m "<one-line>"
git push origin cael/spiderweb-tests-nonexistent-target-session-20260517/claude
```

### §0b GH-issue update

Comment on `karmaterminal/openclaw#695` at:
1. After §1 reads complete
2. After contract-pin established (what current behavior IS at byte)
3. After first test green
4. After all tests green + all gates green
5. On declare-done
6. On any blocker — STOP and post the open question

```bash
gh issue comment 695 --repo karmaterminal/openclaw --body "..."
```

## §1 Background reading

1. **Cross-session targeting gate code** — read the dispatch path that handles `targetSessionKey`:
   - `src/agents/subagent-announce.ts` — search for `targetSessionKey`, `rejectCrossSessionTargetingForSubagentDispatch`, `resolveContinuationRuntimeConfig`
   - `src/agents/continuation/targeting-pure.ts` — check `hasCrossSessionDelegateTargeting` and related
   - `src/auto-reply/continuation/continue-delegate-tool.ts` — tool-side handling

2. **Existing cross-session tests** (study coverage style + helpers):
   - `src/agents/cross-session-targeting.test.ts` (476 lines, primary surface)
   - `src/agents/continue-delegate-tool.crosssession-gate.test.ts` (227 lines)
   - `src/agents/subagent-announce.crosssession-gate.test.ts`
   - `src/auto-reply/continuation/scheduler.crosssession-gate.test.ts`

3. **Find the contract at byte**: when `targetSessionKey` is set to a value that doesn't exist in the session store, what does dispatch do?
   - Reject before send (return error)?
   - Fire-and-forget enqueue (no validation)?
   - Validate at delivery-time (graceful drop)?
   - Crash?
   - Undefined/no handling?

4. **Find the contract for cross-agent targeting**: if `targetSessionKey` resolves to a session that exists but has a DIFFERENT `agentId` than the dispatcher, what happens?

## §2 Plan + contract-pin comment

After §1 reads, write to journal AND comment on issue #695:
- Where the lookup happens (file:line)
- What the contract IS at byte (reject / enqueue / validate-late / undefined)
- If undefined, surface as bug and STOP per §6
- Test plan: which file to add tests to, test names, mocking pattern

## §3 Tests to add

Add 3 tests pinning the discovered contract:

```typescript
describe("nonexistent target session delivery", () => {
  it("<verb> when targetSessionKey points at a session that does not exist in the session store", async () => {
    // pin actual contract
  });
  
  it("<verb> when target session has been deleted between dispatch and delivery", async () => {
    // race-condition shape
  });
  
  it("<verb> when target session has a different agentId than dispatcher", async () => {
    // cross-agent contract
  });
});
```

Replace `<verb>` with `rejects`, `enqueues`, `drops gracefully`, etc per byte-discovered behavior.

Choose test-file home based on existing-style fit. Prefer adding to an existing file over creating a new one.

## §4 Gates (full 7-set, NO SKIPPING)

```bash
cd /tmp/oc-nonexistent-target
pnpm install --frozen-lockfile
pnpm tsgo:core
pnpm tsgo:test
pnpm tsgo:extensions
pnpm lint
pnpm lint:extensions:bundled
pnpm package-boundary:compile
NODE_OPTIONS=--max-old-space-size=32768 pnpm vitest run
```

If vitest OOMs, escalate to `--max-old-space-size=65536`.

## §5 Push + declare-done

```bash
echo "- $(date -uIseconds): all 7 gates green" >> tmp-drop-me-claude.md
git add -A && git commit -m "test(continuation): pin contract for nonexistent target-session delivery" && git push origin cael/spiderweb-tests-nonexistent-target-session-20260517/claude

gh issue comment 695 --repo karmaterminal/openclaw --body "all gates green at SHA $(git rev-parse HEAD). N tests added. ready for cure-(11) fold."
```

Do NOT open a PR. Cure-(11) fold-driver (🌊 Ronan) bundles.

## §6 If contract is undefined at byte

If §1 reading reveals the code path has NO explicit handling for nonexistent target sessions:
1. STOP byte-work
2. Comment on issue #695 naming where the gap is (file:line)
3. Surface as cure-(11) bug — but DO NOT auto-fix
4. Cohort decides whether to add the handling in cure-(11) or write defensive tests that document the gap

## §7 Explicit don'ts

- DO NOT touch production code (`src/agents/`, `src/auto-reply/`, `src/hooks/` non-test files)
- DO NOT modify RFC
- DO NOT force-push
- DO NOT open a PR
- DO NOT auto-fix bugs discovered
- DO NOT skip any gate
- DO NOT invent contracts the code doesn't actually implement — pin what's at byte

## §8 Substrate-honesty

The contract may not be what the readiness-review assumed. Trust the bytes. If the code rejects when readiness-review said "no test covers this", that means existing-elsewhere-coverage may not be tagged. Walk before writing.
