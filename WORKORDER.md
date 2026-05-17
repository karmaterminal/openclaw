# WORKORDER: spiderweb tests for continue_work onFire callback that throws

**Tracking**: karmaterminal/openclaw#698
**Lane**: ronan/spiderweb-tests-onfire-throws-20260517/claude
**Worktree**: `/tmp/oc-spiderweb-onfire-throws` (this directory)
**Base**: `df502943c2`
**Parent PR**: #159 cure-(10) → cure-(11) completeness bundle
**Owner**: 🌊 Ronan, supervising you
**Sibling lanes shipping P0-class for cure-(11)**:

- 🌻 `c0a7c3d63e` (T-1 LANDED, 8 tests, cure-(11) fold-input)
- 🩸 #694 cost-cap-exactly-at-boundary (LIVE)
- 🩸 #695 / 🌫 #696 / 🌊 #697 — three-way Pattern G compare-lanes on T-nonexistent-target (LIVE)

## §0 register-of-the-ask

You are writing **spiderweb tests** — defensive coverage for the `continue_work` timer-fire path when the onFire callback throws. **P0 from cure-(11) readiness-review** (🩸's Lane C P0 #3), and per figs's **completeness-canon at 2026-05-17 message `1505606638`**: _"there is no such thing as 'skip something we need - say we follow up in pr' ... we own completeness."_ This ships in cure-(11), not a follow-up.

The work is test-additions only. The brief gives you surface + discipline. You compose actual test-shape from your byte-walk.

## §1 byte-walk first

Before writing any test, depth-walk these surfaces:

1. **`continue_work` timer-fire path** — find the code that registers continue_work continuations and fires the onFire callback when the timer elapses. Key candidates:
   - `src/auto-reply/continuation/` (continuation registration / timer management)
   - `src/auto-reply/reply/agent-runner-execution.ts` (timer-fire dispatch path, L149-216 sibling region `releaseQueuedCompactionCompletion` is precedent for spiderweb shape)
   - `src/auto-reply/reply/subagent-announce.ts` (1501 LOC; continuation-related ranges around L253-284, L1083, L1125-1148)
   - `src/agents/openclaw-tools.ts` (L494-554 continuation tool surface)

2. **For the timer-fire path, identify**:
   - Where the onFire callback is invoked (await? sync?)
   - What happens if it throws — caught and logged? bubbles up? swallowed?
   - Is the timer-handle / continuation-state cleaned up regardless of throw outcome?
   - Is the lease released (if any)?
   - Does queue progression for sibling continuations continue or get blocked?
   - Is warn-class logging emitted?

3. **Reachability check**: is the throw-path reachable via real call-site? Or guarded by pre-conditions / try-catch already wrapping the onFire invocation?
   - If reachable: function-boundary tests are the right shape.
   - If pre-guarded: report the design-shape in journal.

**Commit + push the byte-walk findings to journal `tmp-drop-me-claude.md` BEFORE writing tests.** Post a comment to issue #698 with §1-reads-complete summary.

## §2 design the test surface

Based on §1 findings, design test cases covering:

- Sync onFire that throws synchronously → cleanup proceeds, warn fires, queue progresses
- Async onFire that rejects → same
- onFire that throws AFTER doing partial work → state consistent (no half-applied side-effects)
- onFire throws on first call but recovers on retry (if retry-class behavior exists) → eventually-cleanup behavior
- Multiple queued continuations where one onFire throws → siblings still fire

Decide test-file location:

- Adjacent test file in `src/auto-reply/continuation/` or `src/auto-reply/reply/` family — prefer this if there's an existing test pattern
- New test file `<module>.onfire-throws.test.ts` if surface warrants standalone

Use existing mocking pattern from 🌻's `c0a7c3d63e` lane (file: `src/auto-reply/reply/agent-runner-execution.release-queued-compaction.test.ts` on branch `elliott/spiderweb-T1-release-queued-compaction-completion-test`) — `vi.hoisted` + module mocks. Pattern is cohort-blessed.

## §3 write tests

Test-additions ONLY. No production touches except:

- If §1 byte-walk reveals an unreachable-via-call-site branch needing `export` for testability (per sibling-lane Path A precedent), **stop and surface as DESIGN-BREAK §9**. Don't auto-fix. Cohort decides keep/revert via cosign.

Cadence: cohesive commits. Don't fragment for theater.

## §4 validation gates (mandatory before declare-done)

Run from worktree root. **All must exit 0**:

```bash
# vitest scoped to your new test file first
NODE_OPTIONS=--max-old-space-size=32768 pnpm vitest run --no-coverage <path-to-new-test-file>

# Full 7-gate set
pnpm tsgo:core
pnpm tsgo:test
pnpm tsgo:extensions
pnpm lint
pnpm lint:extensions:bundled
pnpm package-boundary:compile
NODE_OPTIONS=--max-old-space-size=32768 pnpm vitest run --no-coverage
```

If any gate fails on your new file: fix the test, not the production. Re-run all gates after fix.

## §5 push cadence

Push to `origin/ronan/spiderweb-tests-onfire-throws-20260517/claude` at every meaningful checkpoint. **No force-push. No `--force-with-lease`.** This branch is yours.

## §6 issue comments (5 mandatory)

Post to `karmaterminal/openclaw#698`:

1. §1 byte-walk complete
2. First test passing
3. All tests passing
4. 7-gates all exit 0
5. DECLARE-DONE with final SHA + test count + validation summary + deviations

Use `gh issue comment 698 --repo karmaterminal/openclaw --body "..."`.

## §7 webhook heartbeat

```bash
WEBHOOK_URL="https://discord.com/api/webhooks/1499941022996627556/4hW6CJqu_NsPZVRoEQq5WsnbUPb-o_Fn3GugzvQX-3OddnnArsIDGgoVdSPdN3gaNX2G"
curl -sS -X POST -H "Content-Type: application/json" \
  -d "{\"username\":\"ronan-spiderweb-onfire-throws-hook\",\"content\":\"🤖 spiderweb-onfire-throws: <checkpoint>\"}" \
  "$WEBHOOK_URL"
```

Fire at each of the 5 checkpoints.

## §8 DECLARE-DONE format

Final webhook + issue comment + journal entry:

- Final SHA
- Test count (passing / total)
- Validation summary
- Any §9-class deviations with justification

## §9 DESIGN-BREAK protocol

If you hit a wall:

1. **STOP**. Don't auto-fix.
2. **NAME**: write §9-DB<N> entry in journal + post to issue #698 with finding and proposed-but-not-applied resolution.
3. **WAIT**: cohort cosigns. If 🌊 not responding within 10min, surface to `#sprites-of-thornfield` via webhook with "DESIGN-BREAK pending cohort cosign".

## §10 don'ts

- Don't touch production code except export-keyword-class with §9-cosign
- Don't fix code-shape observations you find (post as code-shape note for cohort follow-up)
- Don't grow scope beyond continue_work-onfire-throws surface
- Don't force-push
- Don't skip any gate
- Don't fragment commits for theater
- Don't declare-done before all 5 checkpoints fired
- Don't reply to martin or comment on PR #159

## Convergence

Your branch tip becomes cure-(11) bundle fold-input. Cure-(11) mechanical-driver cherry-picks at execute-trigger.

Start with §1 byte-walks. Take the breath. Compose in your register. 🌊
