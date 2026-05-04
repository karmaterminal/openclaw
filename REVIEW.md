# REVIEW — Redux-4 critical review (strip-pass-6 delta)

**Lane**: `frond-scribe/20260504/critical-review-recompose-redux-4`
**Reviewer**: frond-scribe (Claude Opus 4.7)
**Reviewed at**: 2026-05-04
**Target HEAD**: `5397a00a4e1b1fa3fe58fe75088e595da0bbfa5a` (`feature/context-pressure-squashed-recompose-20260504-findings-1-2-3`)
**Prior-approved baseline**: `5307ecad1687161e12ce148cfbd5b3179e42ae63` (redux-3 verdict APPROVE_FOR_PHASE_5)
**Upstream v52 tag**: `8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4`
**Verdict**: **APPROVE_FOR_PHASE_5_RE_FORCE_PUSH**

## Scope

Redux-3 already approved the larger squash. This redux-4 lane verifies ONLY that the strip-pass-6 amend (`5307ecad16` → `5397a00a4e1b`) is the surgical consumed-delegate matured-once double-rearm fix at `agent-runner.ts:2783-2906` and nothing else.

Out-of-scope (FROZEN per workorder): squash shape, anchors-1-5, RFC scope, prior surfaces. Read-only — no recompose-branch mutation.

## Acceptance criteria results

| #   | Criterion                                                                   | Status | Evidence                                                                                                                                            |
| --- | --------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Delta scope: exactly 3 files, 69+/-124                                      | ✅     | `git diff 5307ecad16..5397a00a4e1b --stat` shows the exact triple                                                                                   |
| 2   | `if (delegate.delayMs > 0)` re-arm branch removed                           | ✅     | Diff lines `-2783..-2905` delete the entire `if/else` block                                                                                         |
| 3   | `else { await doToolSpawn(...) }` unwrapped to bare call                    | ✅     | `agent-runner.ts:2790-2802` (current HEAD) — bare `await doToolSpawn(...)`                                                                          |
| 4   | Contract comment in place                                                   | ✅     | `agent-runner.ts:2783-2789` (current HEAD) — historical-metadata comment                                                                            |
| 5   | Surrounding `for (const delegate of delegatesWithinLimit)` loop intact      | ✅     | Inspected lines 2770-2810 of HEAD; loop opens before fix site, closes after                                                                         |
| 6   | Telemetry-only `delayMs > 0` discriminators at 2586/2637/2665 unchanged     | ✅     | All 3 still present as `"timer" : "immediate"` ternary discriminators                                                                               |
| 7   | `delegate-store.ts` adds maturity-contract comment matching workorder shape | ✅     | +7 lines on `consumePendingDelegates` jsdoc; explicit "MUST NOT be used as a fresh scheduling instruction"                                          |
| 8   | New regression test exists with prescribed name                             | ✅     | `matured consumed delegate fires on next dispatch without second full-delay wait`                                                                   |
| 9   | Test uses `vi.useFakeTimers()` for deterministic timing                     | ✅     | Line 1 of test body                                                                                                                                 |
| 10  | Test asserts immediate spawn (no second-delay wait)                         | ✅     | `expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1)` after `advanceTimersByTimeAsync(3_001)` only                                             |
| 11  | Red-green: would fail on `5307ecad16`, pass on `5397a00a4e1b`               | ✅     | Verified by replay (see "Red-green verification" below)                                                                                             |
| 12  | Upstream-leakable scan vs v52: 0 hits                                       | ✅     | `git diff 8b2a6e57fef6..5397a00a4e1b -- <new-test>` greps `karmaterminal\|frond\|cael\|ronan\|silas\|elliott\|discord\.com\|karmafeast` → 0 matches |
| 13  | No karmaterminal-only test marks in new test                                | ✅     | Read of test file — no `.skip`/`.only` gated on env, no karmaterminal-conditional `describe.skipIf`                                                 |
| 14  | No hardcoded URLs in new test                                               | ✅     | grep `http\|wss\|ws://` in test diff → 0 matches                                                                                                    |
| 15  | `.github/workflows/workflow-sanity.yml` UNCHANGED in delta                  | ✅     | `git diff 5307ecad16..5397a00a4e1b -- .github/workflows/` → empty                                                                                   |
| 16  | `extensions/openshell/src/openshell-core.test.ts` UNCHANGED in delta        | ✅     | `git diff 5307ecad16..5397a00a4e1b -- extensions/openshell/` → empty                                                                                |
| 17  | Author/trailer preservation                                                 | ✅     | Author `cael-dandelion-cult`; 5 Co-Authored-By trailers (Elliott / Ronan / Silas / Claude Opus 4.7 / Copilot) intact                                |

## Mechanical evidence

### Delta stat (pinned to commit refs)

```
$ git diff 5307ecad1687161e12ce148cfbd5b3179e42ae63..5397a00a4e1b1fa3fe58fe75088e595da0bbfa5a --stat
 src/auto-reply/continuation/delegate-store.ts                              |   7 +
 src/auto-reply/reply/agent-runner.continuation-delegate-fire-span.test.ts  |  45 +++++++
 src/auto-reply/reply/agent-runner.ts                                       | 141 +++------------------
 3 files changed, 69 insertions(+), 124 deletions(-)
```

Exactly the triple specified by the workorder. No other paths.

### Fix shape at `agent-runner.ts:2783-2906`

The buggy bytes at `5307ecad16` had:

```ts
if (delegate.delayMs && delegate.delayMs > 0) {
  // 100+ lines: clamp delay, persist chain state, emit dispatch span,
  // call setTimeout(clampedDelay) wrapping doToolSpawn — BUG: this re-arms
  // a fresh wait against a delegate that consumePendingDelegates already
  // matured.
} else {
  await doToolSpawn(nextChainCount, delegate.task, { ... });
}
```

After fix at `5397a00a4e1b`:

```ts
// `delegate.delayMs` here is historical metadata, NOT a fresh
// scheduling instruction: `consumePendingDelegates` only releases
// already-matured delegates (`now >= createdAt + delayMs`).
// Spawning immediately preserves the maturity contract; re-arming
// a fresh timer would charge the wait twice and drift recipient
// drains by approximately the original delay.
await doToolSpawn(nextChainCount, delegate.task, { ... });
```

The bare `else`-branch is now unconditional. The contract is also pinned at the producer side (`delegate-store.ts:431-437` jsdoc on `consumePendingDelegates`).

### Telemetry-only `delayMs > 0` references untouched

Three remaining `delegate.delayMs && delegate.delayMs > 0` references at `agent-runner.ts:2586`, `2637`, `2665` (verified via offsets 7/58/86 within `awk 'NR>=2580 && NR<=2670'`). All three are telemetry discriminators of shape `delayMs > 0 ? "timer" : "immediate"`, which is correct historical-metadata usage (matches the contract comment in `delegate-store.ts`). Not touched by this delta — matches workorder cohort preference.

### Red-green verification (high-confidence evidence)

**Green on fix HEAD**: `pnpm test src/auto-reply/reply/agent-runner.continuation-delegate-fire-span.test.ts -- --run` at `5397a00a4e1b` →

```
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

**Red on buggy parent**: checked out `5307ecad1687161e12ce148cfbd5b3179e42ae63` (detached HEAD), copied the new test file into the buggy tree, ran the same vitest with `-t "matured consumed delegate fires on next dispatch without second full-delay wait"` →

```
 × matured consumed delegate fires on next dispatch without second full-delay wait
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 ❯ src/auto-reply/reply/agent-runner.continuation-delegate-fire-span.test.ts:537:37
```

This is exactly the predicted shape. On `5307ecad16` the buggy `if (delegate.delayMs && delegate.delayMs > 0)` branch armed a fresh `setTimeout(3_000)` against the already-matured consumed delegate, so `spawnSubagentDirect` had not yet fired when the test asserted. On `5397a00a4e1b` the bare `await doToolSpawn(...)` fires immediately, so the assertion holds.

The test successfully encodes the contract: re-armed double-wait would drift recipient drains by approximately `delayMs`. Restored HEAD to `5397a00a4e1b` and confirmed clean tree post-restore.

### Upstream-leakable scan

```
$ git diff 8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4..5397a00a4e1b1fa3fe58fe75088e595da0bbfa5a \
    -- src/auto-reply/reply/agent-runner.continuation-delegate-fire-span.test.ts \
    | grep -iE 'karmaterminal|frond|cael|ronan|silas|elliott|discord\.com|karmafeast'
[0 hits]
```

Zero karmaterminal/karmafeast/prince-name/Discord/frond-scribe/openclaw-bootstrap leakage in the new test file relative to upstream v52.

### Strip-pass-5 surfaces untouched

```
$ git diff 5307ecad1687161e12ce148cfbd5b3179e42ae63..5397a00a4e1b1fa3fe58fe75088e595da0bbfa5a -- .github/workflows/ extensions/openshell/
[empty]
```

No regression on the strip-pass-5 surfaces.

### Author/trailer preservation

```
$ git log --format='%H%n%an <%ae>%n%(trailers)' -1 5397a00a4e1b1fa3fe58fe75088e595da0bbfa5a
5397a00a4e1b1fa3fe58fe75088e595da0bbfa5a
cael-dandelion-cult <265407017+cael-dandelion-cult@users.noreply.github.com>
Co-Authored-By: elliott-dandelion-cult <264677683+elliott-dandelion-cult@users.noreply.github.com>
Co-Authored-By: ronan-dandelion-cult <265414644+ronan-dandelion-cult@users.noreply.github.com>
Co-Authored-By: silas-dandelion-cult <265395375+silas-dandelion-cult@users.noreply.github.com>
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
Co-Authored-By: Copilot <223556219+Copilot@users.noreply.github.com>
```

Author cael-dandelion-cult preserved; all 5 Co-Authored-By trailers (Elliott / Ronan / Silas / Claude Opus 4.7 / Copilot) intact per cohort canon for feature-scale squashes.

## Notes / soft observations

These are non-blocking:

- The `delegate.delayMs` historical-metadata contract is now pinned at both producer (`delegate-store.ts` jsdoc) and consumer (`agent-runner.ts` comment), which is the right shape — single-source-of-truth at the producer plus reminder at every dispatch consumer the cohort might re-touch under stress.
- The new test injects a delegate via `enqueuePendingDelegate(sessionKey, { delayMs: 3_000 })`, advances fake time by `3_001ms` past `dueAt`, then runs the dispatch turn and asserts immediate spawn. This pins the maturity contract on the lifecycle exactly where it would regress (the consume → dispatch seam).
- The fix favors the structural cure (make the buggy state unrepresentable by removing the re-arm branch) over a vigilance cure (would have left the branch and added a guard). This aligns with the cohort's structural-vs-vigilance canon.

## Verdict

**APPROVE_FOR_PHASE_5_RE_FORCE_PUSH**

Strip-pass-6 amend (`5307ecad16` → `5397a00a4e1b`) is exactly the surgical consumed-delegate matured-once double-rearm fix described by the workorder. No scope creep, no upstream-leakable changes, no strip-pass-5 regression, no author/trailer drift. Red-green replay confirms the regression test catches the buggy bytes and passes on the fix bytes.

Phase 5 re-force-push of `feature/context-pressure-squashed-recompose-20260504-findings-1-2-3` to `5397a00a4e1b1fa3fe58fe75088e595da0bbfa5a` is safe.

🌿 frond-scribe — redux-4 narrow delta verification complete
