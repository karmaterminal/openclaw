# WORKORDER — #982 multi-`continue_work()` silent-drop → multislot

You are a code-agent. Fix GitHub issue **#982** in `karmaterminal/openclaw`. You are in a git worktree on branch `fix/982-multi-continue-work`, based on the assembly branch `4bbd3aec096…` (the bug is on THIS lineage only, NOT main — introduced by `8e04d27f1a`).

## The bug
Multiple `continue_work()` tool-calls in one model response each return `{status:"scheduled"}`, but only the **LAST** survives — the first N-1 are **silently dropped** (no warning, no log, no rejection). User repro: 6 fires → only the last armed a hedge.

## Root cause (byte-confirmed)
A **single-variable capture** in the `requestContinuation` tool-callback overwrites on each call, collapsing N requests → 1 **before** they reach TaskFlow. The downstream **store + dispatch + TaskFlow already support N concurrent flows** (keyed by `flowId`) — proven by `continue_delegate()` × N working. The bottleneck is purely the capture (+ its consumption pipeline). The pattern repeats at **3 sibling closures** (half-symmetric — fix all three):

| File | decl | overwrite | consumption |
|---|---|---|---|
| `src/agents/command/attempt-execution.ts` | ~L706 | ~L710 `attemptContinueWorkRequest = request` | ~L935 (spawn-init/turn-1 subagent) |
| `src/auto-reply/reply/agent-runner-execution.ts` | ~L2481 | ~L2552 | ~L2951 (main reply lane — the user-repro path) |
| `src/auto-reply/reply/followup-runner.ts` | ~L766 | ~L1045 | ~L1267 / ~L1309 (followup) |

(Line numbers approximate — find the exact sites by the `attemptContinueWorkRequest = request` / `requestContinuation:` pattern.)

## Task
1. **Array-capture:** at each of the 3 closures, change the single capture (`let x: ContinueWorkRequest | undefined` + `x = request`) to an array accumulate (`const requests: ContinueWorkRequest[] = []` + `requests.push(request)`).
2. **Iterate-schedule:** at each consumption site, iterate the array and schedule **each** request via the existing schedule path. A single `continue_work` = a 1-element array → **no behavior change for the common case**.
3. **Pipeline-widen:** trace the data-flow from capture → consume → schedule and widen any intermediate single-value carriers so N requests flow end-to-end into TaskFlow. (Silas's scope estimate: ~15-25 edits across 5-6 files, not just the 3 captures. Follow the flow; don't stop at the capture.)
4. **Lying-status cure:** if for any lane multi-schedule genuinely cannot be supported, the 2nd+ call MUST return `{status:"rejected", reason:...}` — NEVER `{status:"scheduled"}` then silently drop. Silent-accept-and-drop must die.
5. **Test:** add a vitest asserting **3 `continue_work()` in one turn → 3 distinct scheduled flows** (3 distinct `flowId`s / 3 hedge-arms), not 1.

## Do NOT touch
`continue_delegate` (already works multi-instance), `request_compaction`, the work-store / work-dispatch / TaskFlow infra (already correct — keyed by flowId), the bracket-parse regex.

## Validation — completion criterion (NOT a subset)
Run **`pnpm build && pnpm check && pnpm test`** — the FULL suite via `scripts/test-projects.mjs`, NOT `pnpm exec vitest run` on touched files. Capture exit codes + per-shard pass/fail tallies. Classify any failing shard as (a) cure-introduced, (b) pre-existing, or (c) baseline-drift. Completion = full-suite green on fix HEAD (modulo documented not-ours fails — the box is flaky under heavy parallel load; deadcode/pnpm-env + telegram media-group + memory-core fail on pristine upstream too).

## When done
- `git add -A && git commit --no-verify -m "fix(#982): ..."` + `git push origin fix/982-multi-continue-work`
- Write `output.md`: per-closure diff summary, the new 3-fire test + result, full `pnpm test` exit code + per-shard tallies + classification of any fails, explicit confirmation all 3 closures fixed (no half-symmetric residue).
- Print a final summary.

Reviewer: 🌫 Silas (`silas-dandelion-cult`, filed the issue + has the repro). Be surgical, complete, honest at the byte. Work now.
