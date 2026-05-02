# WORKORDER — `h10-throw-shape-trap` to `frond-scribe/325-canonical2-pathB-rebase`

You are a code-agent lane (Copilot CLI gpt-5.5 xhigh OR Claude Opus 4.7
max-think) dispatched by silas 🌫 on behalf of figs (machine-boy/flesh-pet).
Your job is to land a **test-only** PR pinning the H10 reconcile failure
contract on `frond-scribe/325-canonical2-pathB-rebase` for the 2026.4.24
release cut.

**Stakes** (figs verbatim 2026-05-01): *"we gotta ship our stuff... update
our PR successfully, have you running on it, and hopefully explore new
features of 2026.4.29."* This is gap #1 from Ronan 🌊's known-gap list.
The H10 cure (`bbcf2f3ad8 fix: surface compaction count reconcile failures`)
adds three observability surfaces (`emitAgentEvent` to compaction stream +
structured `compaction_count_reconcile_failed` warning + `onAgentEvent`
callback) but the call site at
`src/agents/pi-embedded-subscribe.handlers.compaction.ts:117-135` is still
`void ...catch((err) => emit…)` fire-and-forget on the original
`reconcileSessionStoreCompactionCountAfterSuccess` promise.
`handleCompactionEnd` doesn't await the reconcile, doesn't propagate the
failure to its caller, returns `completed` regardless. Without this trap, a
future refactor can silently revert observability surfacing AND the throw-shape
gap is invisible. Test-only; no production change.

Note: Elliott 🌻 had a similar dispatch (`elliott/h10-throw-shape-trap`) that
was killed during the river-song. Do NOT touch that branch. Open fresh on
`silas/h10-throw-shape-trap`.

---

## §0a — remote-first push discipline (load-bearing)

Per PRINCE-CODE-AGENT-RUNBOOK §Remote-First in Group Flow.

- **Branch already pushed**: `silas/h10-throw-shape-trap` is on origin (initial push by dispatcher). DO NOT delete or recreate.
- **Checkpoint pushes** at every meaningful gate:
  - After §1 reads complete (knowledge captured in journal)
  - After §3 walk findings written
  - After test file scaffold written (even if assertions stubbed)
  - After each `pnpm tsgo` / `pnpm check` / `pnpm test` green
  - On any exit-condition (success, hang, error, ambiguity-stop)
- If you spend >10min on a single thought without a checkpoint, push WIP state with `WIP:` prefix before continuing.
- **Never force-push** the branch after first push (#326 savegame canon).
- Recipe for journal push:
  ```bash
  echo "- $(date -uIseconds): <what just happened>" >> tmp-drop-me-h10-trap.md
  git add tmp-drop-me-h10-trap.md && git commit -m "journal: <one-line>"
  git push origin silas/h10-throw-shape-trap
  ```

## §0b — GH-issue update discipline (load-bearing)

Per PRINCE-CODE-AGENT-RUNBOOK §Tracking Issue Per Lane.

- **Tracking issue**: `karmaterminal/openclaw#510` — UPDATE this issue at meaningful checkpoints via `gh issue comment 510 --repo karmaterminal/openclaw --body "..."`
- **5 mandatory comment moments**:
  1. After §1 reads complete: *"§1 reads done, scope understood, starting impl"*
  2. After scaffold + first assertion green: branch SHA + test counts
  3. After all observability assertions + `it.todo` block written: branch SHA + test counts + gate results
  4. On any blocker / ambiguity / hard-stop: shape of the open question
  5. On declare-done: PR link + final SHA + cohort-quorum-needed flag
- Comment cadence ≠ push cadence; comments are for cohort-affordance.

## §0 — guardrails (read carefully; do not skip)

- Operate ONLY inside your assigned worktree:
  `/tmp/silas-h10-throw-trap`
- **Never read, write, list, or shell into**:
  - `~/flesh_beast_tmp/openclaw` (live runtime tree)
  - `/home/figs/.openclaw-data/workspace/karmaterminal-openclaw` (bare repo)
  - any sibling worktree under `/tmp/` (cael-*, elliott-*, ronan-*, frond-*,
    `/tmp/oc-cael-otel-span-uniformity/*`)
- Push to your assigned branch only (`silas/h10-throw-shape-trap`). Never
  touch `frond-scribe/325-canonical2-pathB-rebase` directly, never touch
  `main`, never touch `cael/325-canonical2`, never touch
  `feature/context-pressure-squashed`, never touch savegame branches, never
  touch `elliott/h10-throw-shape-trap`.
- Never force-push after first push.
- **Never close, edit, or comment-on existing PRs.** Open one new PR.
- GitHub mutations ALLOWED for THIS workorder:
  - You MAY open ONE new PR against base
    `frond-scribe/325-canonical2-pathB-rebase`.
  - You MAY NOT close existing PRs/issues, modify project boards, touch
    other repos, change CI workflows.
- Never touch `node_modules`, never run `npm install` / `pnpm install`
  unless required by a gate.
- Journal at root of worktree as `tmp-drop-me-h10-trap.md`; commit + push
  every meaningful checkpoint per the **remote-first canon**.
- If you hit destructive ambiguity, stop and write to journal §9. Do not guess.

---

## §1 — required reads (do not skip)

Read these in order:

1. **`src/agents/pi-embedded-subscribe.handlers.compaction.ts`** — full file.
   Pay attention to:
   - `emitCompactionCountReconcileFailure` (lines ~15-52) — the observability
     emitter (warn + agent event + onAgentEvent callback)
   - `handleCompactionEnd` body — the call site at lines ~117-135 with
     `void reconcileSessionStoreCompactionCountAfterSuccess({...}).catch(...)`
     — fire-and-forget shape
   - The `completed = hasResult && !wasAborted` line — note `completed`
     is computed BEFORE reconcile resolves and returned regardless of
     reconcile outcome
2. **`src/agents/pi-embedded-subscribe.handlers.compaction.runtime.ts`** —
   the actual reconcile implementation (`updateSessionStoreEntry` durable
   write).
3. **`src/agents/pi-embedded-subscribe.handlers.compaction.test.ts`** —
   existing test patterns for this handler. Match style.
4. **Commit `bbcf2f3ad8`** (`git show bbcf2f3ad8`) — the H10 cure that
   added the observability surfaces. Read both the diff and the commit
   message.
5. **`CLAUDE.md`** (repo root) — repo guidelines.
6. **`AGENTS.md`** (repo root) — collaboration conventions.
7. **`/home/figs/.openclaw/workspace/openclaw-bootstrap/PRINCE-CODE-AGENT-RUNBOOK.md`**
   — branch + CI conventions, "tests as guards" framing.

---

## §2 — load-bearing framing

### ⚠️ MERGE TARGET — NON-NEGOTIABLE

**The PR you open MUST target `base=frond-scribe/325-canonical2-pathB-rebase`.
NOT main. NOT `cael/325-canonical2`. NOT
`feature/context-pressure-squashed`.**

This is the rebase branch where waves A-E landed; H10 cure is here. The
2026.4.24 cut is happening from this branch.

**Before pushing, verify**:

1. `git log --oneline origin/frond-scribe/325-canonical2-pathB-rebase..HEAD`
   shows ONLY your test commits.
2. After opening PR:
   `gh pr view <n> --repo karmaterminal/openclaw --json baseRefName,changedFiles`
   confirms `"baseRefName": "frond-scribe/325-canonical2-pathB-rebase"`
   and `"changedFiles"` is plausibly small (1-2 files).

If wrong base or anomalous file count, **stop immediately**, journal,
do not push more.

### Goal

**ONE PR**, test-only, with:

- **base = `frond-scribe/325-canonical2-pathB-rebase`** (current tip
  `b66786f1aa`)
- A new test file (or extension to existing
  `pi-embedded-subscribe.handlers.compaction.test.ts`) that pins:
  - **A. Observability contract trap (must pass)** — three assertions
    on the H10 cure currently in place:
    1. When `reconcileSessionStoreCompactionCountAfterSuccess` rejects,
       `ctx.log.warn` is called with the
       `[compaction-counter:reconcile-failed]` prefix
    2. When it rejects, `emitAgentEvent` is called with
       `stream: "compaction"`, `data.warning: "compaction_count_reconcile_failed"`
       and the documented attribution shape
       (sessionKey/trigger/outcome/error/before/after/delta)
    3. When it rejects, `ctx.params.onAgentEvent` callback is invoked
       with the same `{ stream, data }` shape
  - **B. Throw-shape gap (`it.todo` block)** — enumerate the behavior
    gap as `it.todo` so it's visible in test output:
    1. `it.todo("handleCompactionEnd should propagate reconcile failure to caller")`
    2. `it.todo("handleCompactionEnd should mark outcome differently when reconcile fails")`
       OR similar shape — your judgment on the exact statement
    3. `it.todo("reconcile failure should be detectable downstream of handleCompactionEnd")`
- Tests written such that a future refactor can't silently drop
  observability without flipping the trap.
- Gates (tsgo, scoped tests, build if applicable, lint) green before push.
- Commit message per `CLAUDE.md`:
  `test(compaction): pin H10 reconcile failure observability + trap throw-shape gap`
- PR body cites Ronan 🌊's gap #1 + 🌻's byte-walk + commit `bbcf2f3ad8`.

### Heartbeat protocol

Journal-only (no Discord webhook for this dispatch). Push journal at every
meaningful checkpoint. Final §7 declare-done in the journal.

---

## §3 — code walk

In journal §3 block, write:
- file:line for the H10 call site
- file:line for `emitCompactionCountReconcileFailure`
- file:line for `handleCompactionEnd` return path
- exact shape of the data object emitted on failure
- exact shape of the `onAgentEvent` callback invocation
- existing test mock patterns for `ctx`, `ctx.log`, `ctx.params.onAgentEvent`,
  and `emitAgentEvent`

---

## §4 — execution

### §4.1 Test file

- Branch: `silas/h10-throw-shape-trap` (already checked out)
- Surface: extend
  `src/agents/pi-embedded-subscribe.handlers.compaction.test.ts` with a
  new `describe("H10 reconcile failure observability + throw-shape gap", ...)`
  block, OR write a sibling test file
  `src/agents/pi-embedded-subscribe.handlers.compaction.h10.test.ts`. Your
  judgment based on existing test file size/structure.
- Bug-shape being trapped: silent revert of observability surfaces; throw-shape
  gap left undocumented in test output
- Test pattern:
  - Mock `reconcileSessionStoreCompactionCountAfterSuccess` to reject with
    a known error
  - Drive `handleCompactionEnd` with a successful evt (`hasResult: true`,
    `wasAborted: false`)
  - Assert each of the three observability calls fired with the documented
    shape
  - Add `it.todo` block enumerating the throw-shape gap

### §4.2 No production change

This is test-only. Do NOT modify
`pi-embedded-subscribe.handlers.compaction.ts`. The throw-shape gap is
documented via `it.todo`, not fixed. A separate PR with prince-eyes can
decide the throw-shape (propagate vs mark outcome vs other).

---

## §5 — push cadence

After every meaningful checkpoint, commit + push.
Remote-first canon: never hold bytes locally without a push for >15 min.

---

## §6 — verification gates per `CLAUDE.md`

1. `pnpm tsgo` — type-check (hard gate)
2. `pnpm check` — lint + format
3. `pnpm test src/agents/pi-embedded-subscribe.handlers.compaction` — scoped vitest
4. `pnpm build` — only if you touched non-test code (you should NOT)

If any gate fails: stop, journal, do NOT push that surface.

---

## §7 — declare done

Final journal block listing:
- PR URL created
- Walk findings from §3
- All three observability assertions passing
- All `it.todo` items present
- Final commit SHA, file count, line delta
- PR base verified as `frond-scribe/325-canonical2-pathB-rebase`
- Open questions for silas 🌫 (§9)

---

## §8 — what NOT to do

- Do NOT amend or force-push after first push.
- Do NOT close, edit, or comment-on existing PRs.
- Do NOT touch frozen branches, sibling princes' branches, or
  `elliott/h10-throw-shape-trap`.
- Do NOT install dependencies you don't need.
- Do NOT modify project boards or close issues.
- Do NOT post to Discord.
- Do NOT modify production code in `pi-embedded-subscribe.handlers.compaction.ts`.
- Do NOT decide architectural questions beyond test-shape.
- Do NOT sacrifice quality for speed.

---

## §9 — dispatcher contact protocol

If you need silas 🌫's judgment on a load-bearing question, write to journal
§9, push, continue with anything unblocked, wait for judgment.

---

## §10 — closing frame

Landing this PR cleanly gives the 2026.4.24 cut a test-trap on the H10 cure:
the three observability surfaces are pinned (refactor can't silently drop
them), and the throw-shape gap is visible in test output as `it.todo` items
for a follow-up production PR. Quality bar: PR must be merge-ready (gates
green, scope clean, tests load-bearing) without dispatcher hand-holding.

🌫 dispatcher — go.
