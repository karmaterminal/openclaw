# WORKORDER: spiderweb tests for nonexistent-target-session cross-session-delivery

**Tracking**: karmaterminal/openclaw#697
**Lane**: ronan/spiderweb-tests-nonexistent-target-20260517/claude
**Worktree**: `/tmp/oc-spiderweb-nonexistent-target` (this directory)
**Base**: `df502943c2`
**Parent PR**: #159 cure-(10) → cure-(11) completeness bundle
**Owner**: 🌊 Ronan, supervising you
**Sibling lanes**: #692 (T-1 LANDED `c7a60b716b`), #694 (T-cost-cap-boundary LIVE), 🌻 `c0a7c3d63e` (T-1 superset, 8 branches)

## §0 register-of-the-ask

You are writing **spiderweb tests** — defensive coverage for cross-session-delivery behavior when the target sessionKey doesn't exist in the active-session-store. This is a **P0 from cure-(11) readiness-review** (🩸's Lane C), and per figs's **completeness-canon at 2026-05-17 1505606638** _"there is no such thing as 'skip something we need - say we follow up in pr' ... we own completeness"_ — this ships in cure-(11), not in a follow-up.

The work is test-additions only. The brief gives you the surface and the discipline. You compose the actual test-shape from your byte-walk.

## §1 byte-walk first

Before writing any test, depth-walk these surfaces:

1. **Cross-session-delivery substrate** — find the code path(s) in `src/auto-reply/continuation/` and `src/auto-reply/reply/` that handle delivering `continue_delegate` / `request_delivery` to a target sessionKey. Key candidates:
   - `src/auto-reply/continuation/targeting-pure.ts`
   - `src/auto-reply/reply/subagent-announce.ts` (1501 LOC; relevant ranges around L253-284, L868, L941-952, L1083, L1125-1126, L1134-1148)
   - `src/auto-reply/reply/agent-runner-execution.ts` (cross-session delivery callbacks)
   - `src/agents/openclaw-tools.ts` (L494-554 continue_delegate tool surface)

2. **For each delivery code-path, identify**:
   - Where the targetSessionKey is resolved against active-session-store
   - What happens when resolution returns undefined / empty / not-found
   - Whether there's defensive guard or it just no-ops
   - Whether warn-class logging fires
   - Whether the calling continuation chain still completes its parent obligations (lease release, queue dispatch, etc.) when target-not-found

3. **Reachability check**: are the not-found branches reachable via real call-site? Or are they guarded by pre-conditions that make them dead-defensive?
   - If reachable: function-boundary tests are the right shape.
   - If pre-guarded: report the design-shape (sibling lanes hit same wall at L2152 / L158-159 for `releaseQueuedCompactionCompletion`).

**Commit + push the byte-walk findings to journal `tmp-drop-me-claude.md` BEFORE writing tests.** Post a comment to issue #697 with §1-reads-complete summary.

## §2 design the test surface

Based on §1 findings, design test cases covering:

- Target sessionKey is `undefined` → graceful no-op (no throw, no infinite loop, no orphaned promise)
- Target sessionKey is empty string → same
- Target sessionKey points to a sessionKey that's been removed from active-session-store mid-flight (stale-key) → same
- Target sessionKey points to a sessionKey that never existed → same
- Warn-class logging fires (per #619 delegate-only warn-gate canon; verify warning, not error)
- Parent continuation chain still completes obligations (lease release, queue progression) when target-not-found

Decide test-file location:

- Existing test file adjacent (e.g. `subagent-announce.*.test.ts` family) — prefer this if the code-under-test is in subagent-announce
- New test file `<module>.nonexistent-target.test.ts` if surface warrants standalone

Use existing mocking pattern from 🌻's `c0a7c3d63e` lane (see `elliott/spiderweb-T1-release-queued-compaction-completion-test` branch, file `src/auto-reply/reply/agent-runner-execution.release-queued-compaction.test.ts`) — `vi.hoisted` + module mocks. Pattern is cohort-blessed.

## §3 write tests

Test-additions ONLY. No production touches except:

- If §1 byte-walk reveals an unreachable-via-call-site branch needing `export` for testability (per sibling-lane Path A precedent), **stop and surface as DESIGN-BREAK §9**. Don't auto-fix. Cohort decides keep/revert via cosign.

Cadence: cohesive commits. Brief-target: 1 commit for tests, 1 commit for any export-keyword if §9-cosigned. Don't fragment for theater.

## §4 validation gates (mandatory before declare-done)

Run from worktree root. **All must exit 0**:

```bash
# vitest scoped to your new test file
NODE_OPTIONS=--max-old-space-size=32768 pnpm vitest run --no-coverage <path-to-new-test-file>

# Full 7-gate set per Cure-N execution-gates (banked in TOOLS.md)
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

Push to `origin/ronan/spiderweb-tests-nonexistent-target-20260517/claude` at every meaningful checkpoint:

- After §1 byte-walk journal commit
- After first test green
- After all tests green
- After 7-gates green
- DECLARE-DONE

Use plain `git push`. **No force-push. No `--force-with-lease`.** This branch is yours.

## §6 issue comments (5 mandatory)

Post to `karmaterminal/openclaw#697`:

1. §1 byte-walk complete (call-sites + reachability findings)
2. First test passing
3. All tests passing
4. 7-gates all exit 0
5. DECLARE-DONE with final SHA, test count, validation summary, any deviations

Use `gh issue comment 697 --repo karmaterminal/openclaw --body "..."`.

## §7 webhook heartbeat

Resolve webhook from prince pocket:

```bash
gh -R karmaterminal/ronans-undertow variable get WEBHOOK_SCRIBE_NOTIFY 2>/dev/null
```

If the var exists, fire a one-line heartbeat at each of the 5 checkpoints. Override `username` to `ronan-spiderweb-nonexistent-target-hook`. Format:

```bash
curl -sS -X POST -H "Content-Type: application/json" \
  -d "{\"username\":\"ronan-spiderweb-nonexistent-target-hook\",\"content\":\"🤖 spiderweb-nonexistent-target: <checkpoint>\"}" \
  "$WEBHOOK_URL"
```

If webhook unavailable, use issue-comments only; cohort can watch the issue.

## §8 DECLARE-DONE format

Final webhook + issue comment + journal entry:

- Final SHA on `ronan/spiderweb-tests-nonexistent-target-20260517/claude`
- Test count (passing / total)
- Validation summary (vitest exit, tsgo exit, lint exit, etc.)
- Any deviations (§9-class) with justification
- Pointer to journal §9 observations if any

## §9 DESIGN-BREAK protocol

If you hit a wall (unreachable branches, missing export, surprise production-code defect):

1. **STOP**. Don't auto-fix.
2. **NAME**: write a §9-DB<N> entry in journal + post to issue #697 with the finding and proposed-but-not-applied resolution.
3. **WAIT**: cohort cosigns via issue comment. If 🌊 (issue owner) is not responding within 10min, surface to `#sprites-of-thornfield` via webhook with "DESIGN-BREAK pending cohort cosign".

Don't ship surprise production-changes. Don't auto-fix what you didn't byte-walk past cohort.

## §10 don'ts

- Don't touch production code except export-keyword class with §9-cosign
- Don't fix code-shape observations you find (post to issue as code-shape note for cohort follow-up)
- Don't grow scope beyond nonexistent-target-session-delivery surface
- Don't force-push
- Don't skip any gate
- Don't fragment commits for theater
- Don't declare-done before all 5 checkpoints fired
- Don't reply to martin or comment on PR #159 — that's 🌊's surface at ship-moment

## Convergence

Your branch tip becomes cure-(11) bundle fold-input. 🌫 (or whoever resolves cure-(11) mechanical-driver seat) cherry-picks your work into the rebase. Don't open a PR yourself — cure-(11) bundles all spiderweb-lanes at execute-trigger.

Start with §1 byte-walks. Take the breath. Compose the brief in your register. Reach the right surface, name it, write the tests. The seal is at depth, watching the substrate, available for §9 cosign-class questions.

🌊
