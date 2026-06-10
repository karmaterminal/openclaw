# WORKORDER — `982-multi-continue-work-array-capture` to `frond-scribe/20260609/assembly-token-wiring`

You are a code-agent lane (Claude Opus 4.7 max-think OR Copilot CLI gpt-5.5 xhigh) dispatched by **🌫 Silas (silas-lothric)** on behalf of **figs**. Your job is to land the fix for **`karmaterminal/openclaw#982` — silent-drop of multi-`continue_work()` per response** as a proper PR on `frond-scribe/20260609/assembly-token-wiring`.

**Stakes (figs verbatim):** _"you can schedule several turns. You try to stay within TaskFlow vs a volatile map. Simplest to figs, were somehow destroying or evicting a single slot task on enqueue. If you make it not do that, what happens?"_

This is a **ship-blocker** — figs explicit: _"we can't ship this I don't think"_. The PR-presentation gate for the continuation feature is held on this fix landing.

---

## §0 — guardrails (read carefully; do not skip)

- Operate ONLY inside your assigned worktree: **`/tmp/silas-982-multi-continuework`**
- Never read, write, list, or shell into other princes' live runtime trees, the bare repo, or sibling worktrees.
- Push to your assigned branch only: **`silas/982-multi-continue-work-array-capture`** (and any per-issue child branches you fork from it). Never touch the merge-target branch directly, never touch `main`, never touch other princes' branches, never touch savegame branches.
- Never force-push after first push (savegame discipline per #326).
- **Never close, edit, or comment on existing PRs** unless this workorder authorizes it.
- **GitHub mutations ALLOWED for THIS workorder only** — scoped:
  - You MAY create new issue comments on `karmaterminal/openclaw#982` (one per checkpoint).
  - You MAY open exactly ONE new PR against `frond-scribe/20260609/assembly-token-wiring`.
  - You MAY NOT close existing PRs/issues, modify project boards, touch other repos, change CI workflows.
- Never touch `node_modules`; never run `npm install` / `pnpm install` unless required by a gate.
- Journal at root of worktree as `tmp-drop-me-982.md`; commit + push every meaningful checkpoint per the **remote-first canon** (figs's standing rule).
- If you hit destructive ambiguity, stop and write to journal + post §9 question to the heartbeat webhook. Do not guess.

---

## §1 — required reads (do not skip)

Read these in order:

1. **`karmaterminal/openclaw#982`** — the issue body + my (silas) two comments:
   - https://github.com/karmaterminal/openclaw/issues/982
   - First comment: design-intent context (the hedge `Map<sessionKey, Timeout>` is documented-idempotent for re-poll-in-quiet-channel, NOT a multi-schedule store).
   - Second comment: half-symmetric-cure-trap — there are **3 closures** with the same `let attemptContinueWorkRequest` single-var capture, not 1.
   - Third comment: provenance compare — fork-introduced in `8e04d27f1a` (frond-scribe 2026-06-05), all 3 closures simultaneously, NOT upstream-inherited.

2. **The 3 capture closures** (read all three; the bug is identical at each):
   - `src/agents/command/attempt-execution.ts` — decl L706, overwrite L710, consumption L935 → `scheduleSpawnInitContinueWorkWake` (subagent spawn-init path)
   - `src/auto-reply/reply/agent-runner-execution.ts` — decl L2481, overwrite L2552, consumption L2951 → `runOutcome.continueWorkRequest` (main reply lane — **this is where the live repro fires**)
   - `src/auto-reply/reply/followup-runner.ts` — decl L766, overwrite L1045, consumption L1267/L1309 → `scheduleContinuationWork` (followup path)

3. **The pipeline downstream** (the capture flows through these):
   - `src/auto-reply/continuation/signal.ts:64` — `extractContinuationSignal()` currently takes ONE `continueWorkRequest`, produces ONE signal. **Must be widened to take an array + produce N signals, OR the iteration must happen at the caller.**
   - `src/auto-reply/reply/agent-runner.ts:1881` — calls `extractContinuationSignal` with single `continueWorkRequest`; currently merges with bracket-signal at `signal.ts:129` (bracket-signal precedence).
   - `src/auto-reply/continuation/work-dispatch.ts:302` (`scheduleContinuationWork`) — the dispatch entry point; **infrastructure below already supports N concurrent flows** (unique flowId per item, soonest-timer optimization, drain-all-due-on-fire).

4. **`CLAUDE.md`** (repo root) — repo guidelines (testing discipline, build hard-gate, prompt-cache stability).
5. **`AGENTS.md`** (repo root) — collaboration conventions.
6. **`PRINCE-CODE-AGENT-RUNBOOK.md`** at `/home/figs/.openclaw-data/workspace/openclaw-bootstrap-wt-ronan-cure-n8-laneB/RUNBOOKS/PRINCE-CODE-AGENT-RUNBOOK.md` — branch + CI conventions, "tests as guards" framing.
7. **Existing related PR** (read but do NOT touch): `karmaterminal/openclaw#960` — the assembly back-merge PR; your fix lands on the same branch tip.

---

## §2 — load-bearing framing

### ⚠️ MERGE TARGET — NON-NEGOTIABLE

**Every PR you open MUST target `base=frond-scribe/20260609/assembly-token-wiring`. NOT main. NOT any sibling branch.**

This is the single most important constraint. The bug only exists on this assembly-branch lineage (fork-introduced in `8e04d27f1a`, NOT in upstream `main`). PRs against `main` would show ~thousands of file delta from the fork-lineage divergence — wrong base = wasted cycle.

Before pushing your PR, verify:

1. `git log --oneline origin/frond-scribe/20260609/assembly-token-wiring..HEAD` shows ONLY your fix commits, not inherited from a wrong base.
2. After opening the PR, run: `gh pr view <n> --repo karmaterminal/openclaw --json baseRefName,changedFiles` — confirm `"baseRefName": "frond-scribe/20260609/assembly-token-wiring"` AND `"changedFiles"` is plausibly small (~6-15 files including tests).

If wrong base or anomalous file count, **stop immediately**, journal it, do not push more until verified.

### Goal

**ONE PR** that:

- base = `frond-scribe/20260609/assembly-token-wiring` (current tip `4bbd3aec096545992d6535f4ba96c3bd71414ed3`)
- Fixes the silent-drop at all 3 closures\n- Routes through TaskFlow (NOT a new volatile map — figs's explicit preference)
- Adds vitest coverage proving N continue_work() calls in one response → N delivered turns
- All gates green before push (see §6)
- Commit messages per CLAUDE.md ("scope: short imperative", focus on WHY)
- PR body cross-links back to issue #982 + the design-intent comment + provenance comment

### Design-intent — figs's framing

> _"Simplest to figs, were somehow destroying or evicting a single slot task on enqueue. If you make it not do that, what happens?"_

**Translation:** the capture-closure single-var is the "single slot." Stop overwriting on enqueue → keep all N. Downstream TaskFlow (`work-store.ts` + `work-dispatch.ts`) already supports N concurrent flows; the bottleneck is purely the capture-layer single-variable.

figs's explicit canon (msg `1514275836247932959`):

- "you can schedule several turns" (goal)
- "you try to stay within TaskFlow vs a volatile map" (constraint — don't add a parallel scheduler; thread the N through the existing TaskFlow pipeline)
- "were somehow destroying or evicting a single slot task on enqueue. If you make it not do that, what happens?" (mental model — stop the overwrite, see what shakes out)

### Recommended approach (shape, not prescription)

1. **Capture layer**: at each of the 3 closures, replace `let attemptContinueWorkRequest: ContinueWorkRequest | undefined` with `const attemptContinueWorkRequests: ContinueWorkRequest[] = []`. The callback does `.push(request)` instead of `=`.

2. **Pipeline type-change**: widen `runOutcome.continueWorkRequest` to `continueWorkRequests: ContinueWorkRequest[]` (or `... | ContinueWorkRequest[]` with a back-compat shim, your call).

3. **`extractContinuationSignal` widening**: take `continueWorkRequests: ContinueWorkRequest[]`, return `signals: ContinuationSignal[]` (or `signal: ContinuationSignal | null` for the bracket-precedence case + `additionalToolSignals: ContinuationSignal[]` for the rest — figure out the cleanest interface).
   - **Bracket-vs-tool precedence preserved**: if a bracket signal is present, it currently wins. Keep that semantic for the FIRST signal. Multi-tool-call signals (no bracket) should ALL be scheduled.

4. **Consumption sites**: at each consumption point, iterate the array, call `scheduleContinuationWork` (or `scheduleSpawnInitContinueWorkWake`) once per element. The infrastructure below already handles N.

5. **Lying-status fix (orthogonal but related)**: if multi-schedule is intentionally unsupported on any lane, the tool API should return `{status: "rejected", reason: "multi continue_work per response not supported on this lane"}` on the 2nd+ call instead of silent-accepting-then-dropping. With the array-capture fix this becomes unnecessary IF all lanes support multi — but if any lane stays scoped (e.g. lightContext subagents), keep the explicit-reject.

### Test shape (the load-bearing guard)

**Vitest must prove the bug-shape can't reintroduce silently.** Suggested coverage:

1. **Unit test at signal-extraction**: pass 3 `ContinueWorkRequest` instances → expect 3 distinct signals (or 1 array of 3, depending on your interface choice).
2. **Integration test at dispatch**: fire 3 `continue_work()` callbacks in a simulated turn → assert 3 work-flows enqueued in `work-store` (assert `listTaskFlowsForOwnerKey(sessionKey).length === 3` filtered for `kind: continuation_work`).
3. **End-to-end test of delivery**: drive `dispatchPendingContinuationWork` against the 3-item store → assert 3 distinct wake-events emitted with the 3 distinct reason-fields. (May require time-travel via fake-timers if delays differ.)
4. **Bracket-precedence guard** (regression-prevention): when a bracket signal AND multiple tool-call requests coexist, assert bracket-signal still wins for the FIRST schedule + tool-call requests fan out for the rest. **This is a deviation from current bracket-only-wins semantic; if cohort prefers bracket-wins-fully-and-drops-rest, surface as §9 question.**

### Scope guardrails

- WILL NOT touch the `continue_delegate` path (already works correctly via per-subagent-session scoping — figs noted).
- WILL NOT touch the `request_compaction` path.
- WILL NOT touch `work-store.ts` or `work-dispatch.ts` infrastructure (already supports N).
- WILL NOT touch the bracket-parse `tokens.ts:539` regex (separate domain, byte-confirmed correct).
- WILL NOT introduce a parallel volatile-map (figs's explicit constraint — stay within TaskFlow).

### Heartbeat protocol

**Webhook URL**: `$(gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/silas-likes-to-watch)` — fetch and use.

**Curl pattern:**

```bash
WEBHOOK=$(gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/silas-likes-to-watch)
curl -sS -X POST "$WEBHOOK" \
  -H "Content-Type: application/json" \
  -d '{"username":"🤖 982-fix","content":"<one-line message>"}'
```

**Format conventions** (one line each):

```
🤖 982-fix: read complete; planning iterate
🤖 982-fix: capture-layer refactored (3 closures); gates pending
🤖 982-fix: pipeline-widen complete; vitest writing
🤖 982-fix: PR opened #<n> base=assembly-token-wiring, changedFiles=<N>, gates ✓
   <url>
🤖 982-fix: #<n> blocked: <gate-name> failed — <one-line>; journaling
🤖 982-fix: §9 question for silas: <one-line>
   journal: tmp-drop-me-982.md
🤖 982-fix: §7 declare-done: PR #<n> landed, <Y> gates green, <Z> blockers
```

Also update the tracking issue **`karmaterminal/openclaw#982`** with a comment at each major checkpoint (read complete, plan posted, capture-layer done, pipeline-widen done, vitest passing, PR opened, declare-done).

---

## §3 — code walk

Walk these surfaces (read-only first):

- `src/agents/command/attempt-execution.ts` L700-L950 — full continueWorkOpts closure + scheduleSpawnInitContinueWorkWake call-shape
- `src/auto-reply/reply/agent-runner-execution.ts` L2475-L2960 — full continueWorkOpts closure + runOutcome return-shape
- `src/auto-reply/reply/followup-runner.ts` L760-L1320 — full continueWorkOpts closure + scheduleContinuationWork call-shape
- `src/auto-reply/continuation/signal.ts` L1-L150 — entire extractContinuationSignal + ContinuationSignalExtraction type
- `src/auto-reply/reply/agent-runner.ts` L1875-L1910 — continueWorkRequest pipeline → extractContinuationSignal call
- `src/auto-reply/continuation/work-dispatch.ts` L300-L370 — scheduleContinuationWork (confirm N-safe; should be)
- `src/auto-reply/continuation/work-store.ts` L100-L210 — enqueuePendingWork + consumePendingWork (confirm N-safe; should be)

For each closure-site, in your journal §3 block, write:

- file paths touched
- bug-shape being prevented (single-var overwrites multi-call captures)
- test shape that guards re-introduction
- whether the fix changes a contract (type widening on runOutcome.continueWorkRequest → array) + what callers need updating

---

## §4 — execution

Branch off `silas/982-multi-continue-work-array-capture` (already created at HEAD `4bbd3aec096545992d6535f4ba96c3bd71414ed3`). Push to it directly (single-PR workorder, no child branches needed unless you discover unrelated issues).

Per-step commit messages:

1. `fix(continuation): array-capture multi continue_work in main reply lane` — refactor agent-runner-execution.ts:2481/2552/2951
2. `fix(continuation): array-capture multi continue_work in subagent spawn-init path` — refactor attempt-execution.ts:706/710/935
3. `fix(continuation): array-capture multi continue_work in followup-runner path` — refactor followup-runner.ts:766/1045/1267
4. `feat(continuation): widen extractContinuationSignal to handle N tool-call requests` — refactor signal.ts:60/129
5. `test(continuation): cover multi continue_work per response → N delivered turns` — add vitest coverage

---

## §5 — push cadence

After every meaningful checkpoint (read-completed, walk-noted, each closure refactored, signal.ts widened, vitest green, all gates passed), commit the journal + push the branch. Per the **remote-first canon**: never hold bytes locally without a push for >15 minutes during active work.

---

## §6 — verification gates per CLAUDE.md

Per-PR gate sequence (run ALL of these locally before push):

1. `pnpm tsgo:core` — type-check core
2. `pnpm tsgo:test` — type-check test files
3. `pnpm tsgo:extensions` — type-check extensions
4. `pnpm lint` — oxlint
5. `pnpm lint:extensions:bundled` — bundled extension oxlint (separate shard)
6. `pnpm test:extensions:package-boundary:compile` — per-extension tsc compile
7. `NODE_OPTIONS=--max-old-space-size=12288 pnpm exec vitest run` — full runtime tests (~15-20min)

If any gate fails: **stop**, journal the failure shape, do NOT proceed.

---

## §6.5 — cross-repo CI dispatch (REQUIRED)

After your first PR push, dispatch the cross-repo CI:

```bash
gh api repos/karmaterminal/openclaw-bootstrap/dispatches \
  -f event_type=openclaw-ci \
  -F client_payload[ref]=silas/982-multi-continue-work-array-capture \
  -F client_payload[pr_number]=<your-pr-number>
```

Re-dispatch after every meaningful subsequent push. Verify the dispatch landed:

```bash
gh run list --repo karmaterminal/openclaw-bootstrap --workflow=openclaw-ci.yml --limit 3 --json databaseId,createdAt,status,conclusion
```

Surface the bootstrap run ID per PR in your declare-done.

---

## §7 — declare done

Final journal block + tracking-issue comment + webhook post listing:

- PR URL created and pushed
- Gate results, final commit SHA, file count, line delta
- PR base verified as `frond-scribe/20260609/assembly-token-wiring`\n- `openclaw-ci.yml` cross-repo CI dispatched (bootstrap run ID)
- Vitest coverage: 3-fire test passing, N-fire test passing, bracket-precedence guard passing
- Any cross-issue interaction discovered
- Open questions for silas (§9)

---

## §8 — what NOT to do

- Do NOT amend, force-push, or delete branches owned by others.
- Do NOT close, edit, or comment-on existing PRs.
- Do NOT touch frozen branches.
- Do NOT install dependencies you don't need.
- Do NOT modify project boards or close issues.
- Do NOT post to Discord except via the workorder-provided webhook.
- Do NOT add a parallel volatile-map / scheduler outside TaskFlow (figs's explicit constraint).
- Do NOT decide the bracket-vs-tool precedence question without surfacing as §9 if it's ambiguous.

---

## §9 — dispatcher contact protocol

If you need silas's judgment on a load-bearing question:

1. Write the question + your best-guess + receipts to journal §9 block.
2. Push the journal.
3. Webhook a `🤖 982-fix: §9 question for silas: <one-line>` heartbeat.
4. Continue with other parts of the fix if unblocked.
5. Wait for silas's judgment before proceeding on the blocked part.

---

## §10 — closing frame

Landing this fix cleanly unblocks the entire continuation feature's PR-presentation gate (which figs has held pending). The pattern is byte-clear: 3 closures with single-var capture overwriting, pipeline-deep widen to array-of-N flowing through `runOutcome` → `extractContinuationSignal` → `scheduleContinuationWork`. TaskFlow infrastructure already carries N; the fix is purely upstream of TaskFlow at the capture layer.

Landing it sloppy costs: another silent-drop class shipped to production, princes losing scheduled-intent without warning, the lying-status `{scheduled}`-then-drop class hardening as accepted-behavior.

Quality bar: PR must be merge-ready (all 7 gates green, scope clean, vitest coverage load-bearing) without dispatcher hand-holding. Silas reviews + figs gates the merge.

🌫 silas — go.
