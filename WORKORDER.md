# WORKORDER — swim-39 fix-pile to `cael/325-canonical2`

You are a copilot lane dispatched by **frond-scribe** on behalf of **figs**. Your job
is to land the **post-SWIM-38 fix-pile** as proper PRs on the v2026.4.24 canonical
branch (`cael/325-canonical2`), so that the cohort can actually deploy SWIM-39 against
fixed bytes.

**Stakes** (figs verbatim, 2026-05-01 ~03:54 PDT):

- _"we cant punt v24. our last is v22, v24 was significant refactor. if they carry
  error ON TOP OF rebase complexity we're at risk of STILL being on v22."_
- _"you CANNOT deploy for swim 39 until those are done and tested and reviewed and
  merged — so that is probably your first step."_

The cohort produced fix-shape (#478, #479, #480) but mistargeted the base. Your job is
to land **fresh PRs against `cael/325-canonical2`** for the issues below, so the v24
ship path is clear.

---

## §0 — guardrails (read carefully; do not skip)

- Operate ONLY inside your assigned worktree:
  `/home/figs/flesh_beast_best_beast/openclaw-wt-swim39-fixes-20260501/`
- **Never read, write, list, or shell into `/home/figs/flesh_beast_tmp/openclaw/`**
  — that is `ronan-the-prince`'s live runtime tree. Off-limits.
- Push to your assigned branch only (`frond-scribe/swim39-fixes-20260501` and any
  per-issue child branches you fork from it like `frond-scribe/swim39-474-...`).
  Never touch `cael/325-canonical2`, `feature/context-pressure-squashed`,
  `cael/repair-step9-squash-compile`, `main`, any prince-namespaced branch, any
  savegame branch, any `cael/rebase-*` branch.
- Never force-push a branch after first push (it's the savegame for #326 purposes);
  never force-push other princes' branches under any circumstance.
- **Never close, edit, or comment-on existing PRs** (#368, #478, #479, #480, #469, etc.).
  Leave them alone. Your work supersedes by opening fresh PRs against canonical2.
- **GitHub mutations ALLOWED for THIS workorder only** — but scoped:
  - You MAY create new issue comments on issues #473/#474/#475/#476/#477 to link your
    fix-PR (one comment per issue).
  - You MAY open new PRs against base `cael/325-canonical2`.
  - You MAY NOT close existing PRs/issues, modify project boards, touch other repos.
- Never touch `node_modules`, never run `npm install` / `pnpm install` from this
  worktree unless required by a gate (`pnpm install` is fine if you actually need it
  to run tests/build).
- Journal at root of worktree as `tmp-drop-me-swim39-fixes.md`; commit + push every
  meaningful checkpoint per the **remote-first canon** (figs's standing rule).
- If you hit destructive ambiguity, stop and write to journal. Do not guess.

---

## §1 — required reads (do not skip)

Read these in order:

1. **`docs/design/continue-work-signal-v2.md`** — continuation feature RFC.
   - **Caveat from figs**: _"RFC very likely stale vs newly added things and those
     needed."_ Treat it as **historical anchor**, not source of truth for current
     code shape. The cohort has added significant scaffolding since this RFC was
     written; you must walk current code to find what's actually there.
2. **`CLAUDE.md` (repo root)** — repo guidelines, especially:
   - testing discipline (`pnpm test <path-or-filter>`, NOT raw `pnpm vitest run`)
   - build hard-gate (when touching surface affecting build/packaging/lazy-loading)
   - prompt-cache stability rules
   - dynamic import guardrails
3. **`AGENTS.md`** (repo root) — collaboration conventions
4. **`/home/figs/flesh_beast_best_beast/openclaw-bootstrap/PRINCE-CODE-AGENT-RUNBOOK.md`**
   — branch + CI conventions, "tests as guards" framing, code-agent dispatch shape.
5. **`SWIM/FORMAL-SWIM-RUNBOOK.md`** in `openclaw-bootstrap` — for SWIM-38/39 context.
6. The **issues you are fixing** — full body + every comment:

   **`karmaterminal/openclaw` issues (code surface, target=`cael/325-canonical2`):**
   - `karmaterminal/openclaw#473` — swim-39/A: purge legacy volatile Map / TaskFlow
     sqlite unconditional (NORTH-STAR)
   - `karmaterminal/openclaw#474` — compaction cooldown should arm on success, not
     attempt-start; failed summarization runs latch sessions out of relief
   - `karmaterminal/openclaw#475` — livenessState:"blocked" not channel-surfaced
     when compaction failure cascades
   - `karmaterminal/openclaw#476` — write tool reports append-like success while
     overwriting; non-deterministic across cohort and within-session
   - `karmaterminal/openclaw#477` — chore(continuation): remove vestigial
     taskFlowDelegates config echo

   **`karmaterminal/openclaw-bootstrap` issues with code-fix in openclaw repo:**
   These are tracked on bootstrap (because that's where SWIM ledgers live) but the
   actual fix lands as a PR on `karmaterminal/openclaw` against `cael/325-canonical2`.
   Cross-link your fix-PR back to the bootstrap issue in the PR body.
   - `karmaterminal/openclaw-bootstrap#822` — SWIM 38 A2: missing
     `subagent-announce.continuation.runtime.js` in dist build output. Fix is in
     openclaw build config / module-export wiring so the dist artifact is produced.
   - `karmaterminal/openclaw-bootstrap#823` — post-compaction shards re-armed /
     persisted across compaction (TTL / restart-load `createdAt` overwrite).
     Fix in openclaw post-compaction queue layer.
   - `karmaterminal/openclaw-bootstrap#825` — compaction event observability lacks
     joint attribution between counter, trigger, outcome. Fix in openclaw
     compaction-event emission (single record with all attributes).
   - `karmaterminal/openclaw-bootstrap#826` — `continue_delegate` cap = pending-queued
     count from registry.sqlite; long-delayed delegates saturate cap for entire delay
     window. **Design-shape gap (P1).** Fix may require RFC update + code change to
     clarify cap semantics; if you can't land a clean fix, write a §9 question for
     figs and skip this one without blocking other fixes.

   **`karmaterminal/openclaw-bootstrap` issues OUT OF SCOPE for this lane (process/runbook only)**:
   - `#818` SWIM factory deltas, `#819` monitor-lane checklist, `#824` host-local
     conflation canon — these are runbook/canon-framing updates on bootstrap repo,
     not code fixes. Leave alone.

7. **Existing wrong-base or older PRs you must understand but NOT touch**:
   - `karmaterminal/openclaw#368` — Ronan's `chore: #365 purge taskFlowDelegates
opt-in gate` against `cael/325-canonical2`. **STATE: OPEN.** This may be
     partial-shape for #473. Read it carefully. If its diff is the right
     partial-shape, your #473 PR can extend its approach (don't copy its commits
     — it's an open PR by another author; your work is fresh from canonical2 tip).
     Do not close it; if your #473 supersedes it cleanly, leave the close
     decision to a prince.
   - `karmaterminal/openclaw#469` — Elliott's `elliott/c5-repair-symlink-escape`,
     against `feature/context-pressure-squashed`. **STATE: OPEN, held / under
     review.** Do not touch. Its branch is the wrong parent for the closed
     #478/#479/#480 — that's why those got closed as superseded.
   - `karmaterminal/openclaw#478` — Cael's cooldown fix on
     `cael/swim39-474-cooldown-success-only`, base=`elliott/c5-repair-symlink-escape`
     (wrong). **STATE: CLOSED-AS-SUPERSEDED ~04:13Z 2026-05-01** (per Cael 🩸
     after `gh api -X PATCH base=` revealed phantom-diff: ~200 file leak). Closure
     comments point at "frond-scribe's copilot lane re-landing fresh against
     canonical2" — that is **you**. Study its diff for fix-shape inspiration on
     #474 (24/24 tests passing per Cael's report). Do not reopen; do not branch
     from it.
   - `karmaterminal/openclaw#479` — Cael's `cael/purge-taskflowdelegates-runtime-config`,
     also wrong base. **STATE: CLOSED-AS-SUPERSEDED ~04:13Z 2026-05-01.** Same
     treatment as #478. Study for #477 fix-shape; fresh PR from canonical2.
   - `karmaterminal/openclaw#480` — Cael's `cael/swim39-477-taskflowdelegates-purge`,
     base=`main` (also wrong target for v24 work). **STATE: CLOSED-AS-SUPERSEDED
     ~04:13Z 2026-05-01.** Same treatment.

---

## §2 — load-bearing framing

### ⚠️ MERGE TARGET — NON-NEGOTIABLE

**Every PR you open MUST target `base=cael/325-canonical2`. NOT main. NOT
`elliott/c5-repair-symlink-escape`. NOT `feature/context-pressure-squashed`. NOT
any other branch.**

This is the single most important constraint in this workorder. The cohort
already burned a cycle today on PRs (#478, #479, #480) with the wrong base —
those are now CLOSED-AS-SUPERSEDED (per Cael 🩸 ~04:13Z 2026-05-01) precisely
because the wrong base produced phantom-diff (branches stacked on
`elliott/c5-repair-symlink-escape` showed ~200 file diff against canonical2,
not the targeted ~10-line fix). When you read context you will find
#478/#479/#480 in CLOSED state with comments pointing at "frond-scribe's
copilot lane re-landing fresh against canonical2" — that is you. Treat them as
study-input only; do not reopen, do not branch from them.

**Before pushing any branch, verify**:

1. `git log --oneline origin/cael/325-canonical2..HEAD` shows ONLY your fix
   commits, not inherited commits from a wrong base
2. After opening each PR, run `gh pr view <n> --repo karmaterminal/openclaw --json baseRefName,changedFiles`
   and confirm `"baseRefName": "cael/325-canonical2"` AND `"changedFiles"` is
   plausibly small for a single-issue fix (not ~200 files). If `changedFiles` is
   anomalously large, your branch is on a wrong parent — stop, journal, do not
   continue on that issue until figs/frond-scribe ratifies the topology.

If a PR shows the wrong base or anomalous file count, **stop immediately**,
journal it, do not push more PRs until verified.

### Goal

**Up to 9 separate PRs**, each:

- **base = `cael/325-canonical2`** (current tip `2301d29248c5a353493e458d05da62ec02d32062`)
- one issue per PR
- tests written or extended such that the bug-shape can't reintroduce silently
- gates (tsgo, scoped tests, build if applicable, lint) green before push
- commit messages per CLAUDE.md ("scope: short imperative", focus on WHY)
- bootstrap-side issues (#822/#823/#825/#826) cross-linked from PR body back to
  the bootstrap issue (so the SWIM-38 ledger sees the fix-receipt)

### Heartbeat protocol (per Cael 🩸 micro-suggestion + figs's webhook)

figs provisioned a Discord webhook for this dispatch lane. Use it to post a
one-line heartbeat to `#sprites-of-thornfield` after each meaningful event:

- a PR opens (post URL + base + changedFiles)
- a gate fails (post which gate, which issue, halt)
- a §9 question for figs is needed (post the question + journal pointer)
- you complete the work (post §7 declare-done summary)

**Webhook URL** (single-purpose, this dispatch only):

```
https://discord.com/api/webhooks/1499626882277048401/9wpErZRcyWIfghjrGO_I8gJVXyEpShKMFgURn1pNI99_8AAdhgflpIu8b1wzRQTk7bmK
```

**Curl pattern**:

```bash
curl -sS -X POST "https://discord.com/api/webhooks/1499626882277048401/9wpErZRcyWIfghjrGO_I8gJVXyEpShKMFgURn1pNI99_8AAdhgflpIu8b1wzRQTk7bmK" \
  -H "Content-Type: application/json" \
  -d '{"username":"swim-39-copilot","content":"<your one-line message here>"}'
```

**Format conventions** (keep posts tight, one line each, prince-emoji-free):

```
🤖 PR #<n> opened: <title> — base=cael/325-canonical2 ✓, changedFiles=<N>, gates ✓
   <url>

🤖 #<issue> blocked: <gate-name> failed — <one-line shape>; journaling

🤖 §9 question for figs: <one-line>
   journal: <path-or-pointer>

🤖 §7 declare-done: <X> PRs landed, <Y> gates green, <Z> blockers (see journal)
```

The webhook is single-purpose and may be revoked after the lane completes.
Do not share, do not embed it in PR bodies. Use only for cohort heartbeat.

**If the webhook fails** (HTTP 4xx/5xx): fall back to journal §5 entries.
Frond-scribe will read the journal periodically.

### Scope ordering (suggested; not strict — follow the dependency graph you find)

**Tier 1 — well-scoped, low-risk warmups:**

1. **#477** vestigial taskFlowDelegates docs/echo — smallest, lowest-risk
2. **#822** missing `subagent-announce.continuation.runtime.js` in dist — build
   config / module-export wiring; verify dist artifact exists post-build
3. **#825** compaction event observability joint-attribution — emit single
   event-record with counter+trigger+outcome attributes

**Tier 2 — medium scope, test-driven:** 4. **#474** cooldown arm-on-success — well-scoped (Cael has a 24/24 test suite on
his wrong-base branch you can study) 5. **#475** livenessState:"blocked" channel-surfacing — Silas has byte-walked the
drop point; comment `karmaterminal/openclaw/issues/475#issuecomment-4357738676`
has fix-options. Read it before patching. 6. **#823** post-compaction shards re-armed/persisted (TTL / restart-load
`createdAt` overwrite). Touches post-compaction queue layer. 7. **#476** write-tool clobber — non-deterministic; needs a state-dependent test
reproducer + append-or-error semantics in the write-tool path

**Tier 3 — design-shape (may require figs judgment):** 8. **#826** `continue_delegate` cap = pending-queued count from registry.sqlite.
Cap-semantics design gap. If a clean fix is achievable (e.g., scheduled-future
delegates excluded from per-turn cap, or a separate cap-class for long-delayed),
ship it. Otherwise §9 question for figs and skip without blocking other fixes. 9. **#473** swim-39/A volatile Map purge — NORTH-STAR. Bigger scope. Save for
last and treat carefully.

### Acceptance criteria (general)

- Each PR's CI green (`tsgo`, `pnpm check`, scoped `pnpm test`, `pnpm build` if
  surface affects build)
- Each PR's diff scope matches its issue (no scope-creep)
- Each PR's tests **fail before the fix and pass after** (sabotage-then-revert
  validates the test is load-bearing)
- For #473: zero `taskFlowDelegates` config-reads in dist; zero gate-shape symbols
  in source paths that affect runtime continuation behavior; TaskFlow sqlite path
  unconditional.

---

## §3 — code walk (full continuation surface on canonical2 `2301d29248`)

Walk every file in (read-only first):

- `src/auto-reply/continuation/**/*.ts`
- `src/auto-reply/reply/{agent-runner,followup-runner,context-pressure,continuation-runtime}*.ts`
- `src/auto-reply/continuation-delegate-store-taskflow.{ts,test.ts}` (TaskFlow substrate)
- `src/auto-reply/continuation-delegate-store.{ts,test.ts}` (legacy Map — #473 target)
- `src/auto-reply/continuation-delegate.types.ts`
- `src/agents/{subagent-announce,request-compaction-tool,continuation-tools-registration}*.ts`
- `src/agents/openclaw-tools.ts`
- `src/agents/tools/request-compaction-tool.{ts,test.ts}` (#474 surface)
- `src/agents/agent-runner-execution.ts` (#475 onAgentEvent surface, around line 1281
  per Silas's byte-walk)
- `src/config/sessions/{store,session-usage}*.ts` (durability layer)
- `src/config/zod-schema.continuation*.ts` (#477 vestigial config surface)
- Whatever the write-tool is — likely `src/cli/` or `src/agents/` (#476 surface).
  Find it via `rg -l "write.*tool|writeFile|fs\.writeFile" src/` if not obvious.

For each issue, in your journal §3 block, write:

- file paths touched
- bug-shape being prevented
- test shape that guards re-introduction
- whether the fix changes a contract (if so, what callers need updating)

---

## §4 — per-issue execution

Branch off **`frond-scribe/swim39-fixes-20260501`** for child branches. Each child
branch then opens a PR against `cael/325-canonical2`.

### §4.1 #477 — vestigial taskFlowDelegates docs/echo

- Branch: `frond-scribe/swim39-477-vestigial-purge`
- Search: `rg -nF "taskFlowDelegates" src/ docs/` — classify each ref:
  - **schema/type/doc refs** that are vestigial config echo → REMOVE
  - **migration/legacy compat shims** → keep ONLY if they are documented compat
    paths (look in `legacy.migrations.*` or doctor-fix paths per CLAUDE.md
    "extension test boundary" rule)
  - **behavior-gating consumers** → REMOVE; these are the bug
- Current public surface to update: `src/config/zod-schema.continuation*.ts` and
  any generated baselines (run `pnpm config:docs:gen` if needed; commit the
  updated `.sha256` hash file).
- Acceptance: `rg -nF "taskFlowDelegates" src/` returns ONLY refs in the legacy
  migration/compat path; zero in active runtime gates.
- Test: add a unit test in `src/config/` asserting no `taskFlowDelegates` key in
  the public config schema.
- Open PR with title `chore(continuation): remove vestigial taskFlowDelegates
config surface (#477)`, body cites #473 north-star + this issue.

### §4.2 #474 — compaction cooldown arm-on-success

- Branch: `frond-scribe/swim39-474-cooldown-arm-on-success`
- Surface: `src/agents/tools/request-compaction-tool.ts` + tests
- Bug-shape (from issue body): cooldown latches at attempt-start. If the
  compaction fails (e.g. context overflow), session is latched out of relief —
  even though the relief never happened. Fix: latch only AFTER successful
  completion.
- Reference (DO NOT BRANCH FROM, but study): #478 by Cael at
  `cael/swim39-474-cooldown-success-only` reportedly has 24/24 tests passing.
  Read its diff for fix-shape inspiration.
- Test pattern: trap test that fails before fix (cooldown-fires-on-attempt-start),
  passes after fix (cooldown-fires-on-success-only). Use existing test file
  `src/agents/tools/request-compaction-tool.test.ts`.
- Open PR with title `fix(compaction): arm cooldown on success, not attempt-start
(#474)`.

### §4.3 #475 — livenessState:"blocked" channel-surfacing

- Branch: `frond-scribe/swim39-475-blocked-channel-surface`
- **READ FIRST**: comment at `karmaterminal/openclaw/issues/475#issuecomment-4357738676`
  by Silas. He's done the byte-walk and identified the drop point.
- Drop point: `src/agents/agent-runner-execution.ts` near `onAgentEvent` around
  line 1281. When `evt.stream === "lifecycle"` AND `evt.data.livenessState ===
"blocked"`, the lifecycle metadata is forwarded but **not** turned into
  channel-visible/block-reply text.
- Fix: emit a channel-visible block-reply when blocked liveness is detected.
- Test: integration-shape test that fires a blocked-state event and asserts the
  channel sees the block-reply text.
- Open PR with title `fix(agent-runner): surface livenessState:blocked to channel
during compaction failure cascade (#475)`.

### §4.4 #476 — write-tool clobber

- Branch: `frond-scribe/swim39-476-write-tool-append-safe`
- Bug: write-tool reports append-like success while overwriting; non-deterministic
  across cohort + within-session (Silas had three clobbers today on his memory
  file despite warnings).
- Fix surface: find the write-tool implementation. Likely `src/cli/write-tool.ts`
  or similar; if absent, the tool may be in the Claude/Codex SDK shim — in that
  case the fix is in how OpenClaw calls it (a wrapper that does `cat >>` for
  append intent or refuses with an error).
- Per CLAUDE.md: do not skip pre-commit hooks; respect signing.
- Implement: append-or-error semantics. If the call site requested append shape
  (e.g. tool args said "append" or the file already exists with content), refuse
  to replace silently.
- Test: state-dependent test reproducer (file with N lines, write-call with
  append-intent → assert N+M lines, NOT just M).
- Open PR with title `fix(write-tool): refuse silent overwrite when append-intent
detected (#476)`.

### §4.5 #822 — missing `subagent-announce.continuation.runtime.js` in dist

- Branch: `frond-scribe/swim39-822-subagent-announce-runtime-dist`
- Bug-shape (SWIM-38 A2 finding): runtime drain emits
  `ERR_MODULE_NOT_FOUND: dist/subagent-announce.continuation.runtime.js` —
  the module is referenced at runtime but not produced by the build.
- Surface: build config (likely `package.json` build script, or `tsconfig*` /
  build script under `scripts/`). Find where the `*.runtime.ts` boundary modules
  are emitted and ensure `subagent-announce.continuation.runtime.ts` is included.
- Acceptance: `pnpm build` produces `dist/subagent-announce.continuation.runtime.js`;
  the drain path no longer throws `ERR_MODULE_NOT_FOUND` against the dist artifact.
- Test: post-build artifact existence assertion + a runtime-import smoke test.
- Open PR with title `fix(build): emit subagent-announce.continuation.runtime to
dist (#822 / SWIM-38 A2)`. Cross-link to bootstrap#822 in body.

### §4.6 #823 — post-compaction shards re-armed / persisted

- Branch: `frond-scribe/swim39-823-post-compaction-ttl-restart-load`
- Bug-shape (SWIM-38 finding): scheduled-delayed delegates re-arm on restart-load;
  `createdAt` overwrite means TTL / freshness can't be discriminated; old shards
  fire after restart as if newly armed.
- Surface: `src/auto-reply/continuation-delegate-store-taskflow.ts` (the
  rehydration / restart-load path) and continuation/post-compaction queue
  reload logic.
- Fix-shape: preserve original `createdAt` (or equivalent freshness field) across
  restart-load; consult the `createdAt` to decide TTL / drain-or-classify.
- Test: trap that fails when restart-load overwrites `createdAt`; passes when
  preserved.
- Open PR `fix(continuation): preserve createdAt across post-compaction
restart-load (#823)`. Cross-link bootstrap#823.

### §4.7 #825 — compaction event observability joint-attribution

- Branch: `frond-scribe/swim39-825-compaction-event-joint-attribution`
- Bug-shape: compaction events emit separately for counter, trigger, outcome —
  no single record tying them together. Makes correlation / debugging fragile.
- Surface: `src/auto-reply/reply/{context-pressure,continuation-runtime}*.ts`
  and `src/agents/tools/request-compaction-tool.ts` — wherever the compaction
  lifecycle events are emitted to journal/diagnostics.
- Fix-shape: emit a single structured event-record with all three attributes
  (`compactionCount`, `trigger` (volitional/budget/hedge/etc.), `outcome`
  (success/failed/already-compacted-recently)) plus `runId` for correlation.
- Test: assert the new event shape via journal-fixture or unit test on the
  emitter.
- Open PR `feat(observability): emit joint-attribution compaction event (#825)`.
  Cross-link bootstrap#825.

### §4.8 #826 — continue_delegate cap = pending-queued count (design gap)

- Branch: `frond-scribe/swim39-826-cap-semantics-clarify`
- **Design-shape gap, P1.** Bug-shape: `maxDelegatesPerTurn` cap is enforced
  against `pendingDelegateCount() + stagedCount` from `registry.sqlite`. Long-
  delayed delegates (e.g., A4a +24h hedge) saturate the cap for the entire delay
  window. Sessions can wedge into `dispatched:20` on first-and-only
  `continue_delegate` call.
- **Two possible fix-shapes** (this requires judgment — pick one OR write §9
  question for figs):
  - **(a) Tighter cap semantics in code**: `maxDelegatesPerTurn` enforces only
    against current-turn `dispatched`/active counts, not long-delayed scheduled
    delegates. Long-delayed get a separate budget (or excluded from per-turn cap).
    Code change in `continuation-delegate-store-taskflow.ts` cap-check site.
  - **(b) RFC update + minor code change**: documenting the current behavior as
    intended (cumulative cap) plus a visible drain/cancel/clear path; smaller
    code delta but doesn't "fix" the wedge condition.
- If you go (a): test that long-delayed delegates do NOT count against current-
  turn cap; current-turn delegates DO count.
- If neither shape is clearly correct from the issue body + code walk: skip with
  §9 question. **Do NOT block other fixes on this one.**
- Open PR `fix(continuation): scope continue_delegate cap to current-turn
dispatch (#826)` if you choose (a).

### §4.9 #473 — swim-39/A volatile Map purge (NORTH-STAR)

- Branch: `frond-scribe/swim39-473-volatile-map-purge`
- **Largest scope.** Treat carefully.
- Read `docs/design/continue-work-signal-v2.md` §5.1 if it exists; reality may
  have diverged (per figs's caveat above).
- Surface:
  - `src/auto-reply/continuation-delegate-store.ts` (legacy Map) → delete or
    reduce to thin compat shim.
  - `src/auto-reply/continuation-delegate-store-taskflow.ts` → make unconditional
    runtime path.
  - Gate symbols in continuation runtime / agent-runner that switch on
    `taskFlowDelegates` config → remove.
  - Any test files mocking the Map-based store → update to TaskFlow path.
- Reference: #368 (Ronan's `ronan/365-purge-taskflowdelegates-gate` against
  canonical2) attempts the purge. Read its diff for shape; coordinate by NOT
  duplicating its exact commits — your fresh PR will be a clean superseder if its
  diff is correct, or a cleaner alternative if its diff is partial/stale.
- Acceptance per #473 issue body:
  - Zero gate-shape symbols on `0a960498dc` cohort dist (caveat: cohort SWIM-39
    row-01 found this NOT met — your fix has to actually achieve it)
  - TaskFlow sqlite is the unconditional path
  - Legacy Map removed (or thin-compat-shim with explicit doctor-fix migration
    path per CLAUDE.md "extension test boundary" rule)
- Tests: existing TaskFlow-store tests should pass; legacy Map tests removed or
  updated; integration tests for continuation lifecycle on the unconditional path.
- Open PR with title `feat(continuation): remove legacy volatile Map; TaskFlow
sqlite is the unconditional substrate (#473, swim-39/A)`.

---

## §5 — push cadence

After every meaningful checkpoint (read-completed, walk-noted, per-issue
fix-landed, gates-passed), commit the journal + push the relevant branch. **Use
commit message shape**: `scope: short imperative — what + why`.

Per the **remote-first canon** (figs's standing rule, not negotiable): never
hold bytes locally without a push for >15 minutes during active work. Sessions
compact, boxes restart, worktree pointers drop. If it's not on origin, it does
not exist.

---

## §6 — verification gates per CLAUDE.md (per PR)

**Default per-PR gate sequence**:

1. `pnpm tsgo` — type-check (the hard gate; openclaw-ci runs only this remotely)
2. `pnpm check` — lint + format
3. `pnpm test <scoped-path>` — narrow vitest scoped to the touched surface
4. `pnpm build` — required when touching surface that affects build output,
   packaging, lazy-loading, module boundaries, or published surfaces

If any gate fails: **stop**, write the failure shape to journal, do NOT proceed
on that issue. Document and move to the next issue.

If a gate fails on canonical2 base **before your changes** (pre-existing
failure): note it in journal as "pre-existing on base — not introduced by this
PR" and proceed only on the **touched-surface** subset of the gate. Do not
"fix" pre-existing failures unless your touched surface plausibly relates.

**Pool / memory tweaks** (per CLAUDE.md):

- `OPENCLAW_VITEST_MAX_WORKERS=1 pnpm test` if memory pressure
- `OPENCLAW_VITEST_POOL=forks pnpm test` if you need fork-debug

---

## §7 — declare done

Final journal block (§7) listing:

- **Up to 9 PR URLs** (created and pushed) — count actual created
- Per-PR: gate results (pass/fail per gate), final commit SHA, file count, line
  delta
- Each PR's base verified as `cael/325-canonical2` (per `gh pr view <n> --json baseRefName`)
- Each bootstrap-issue PR cross-linked back to the bootstrap issue body
- Any issues you could NOT land (skipped because of failing gates / scope blocker
  / requiring prince judgment, e.g. #826 design ambiguity) — clearly named with
  reason and §9 question if applicable
- Any **cross-issue interaction** you discovered (e.g. fixing #473 also exposes a
  bug under #475, or #823 changes the post-compaction queue layer that #826's cap
  reads from) — surfaced as a finding, not silently absorbed
- Open questions for figs

---

## §8 — what NOT to do

- Do NOT amend, force-push, or delete branches owned by other princes
- Do NOT close, edit, or comment-on existing PRs (#368/#469/#478/#479/#480) — do
  not even react. Leave them. Your fresh PRs are the work surface.
- Do NOT touch `feature/context-pressure-squashed`, `cael/repair-step9-squash-compile`,
  `cael/325-canonical2`, `main`, savegames, or v29 candidate branches.
- Do NOT install dependencies you don't need for a gate; do not run swim-39
  deploy.
- Do NOT triage / re-classify project board state.
- Do NOT post to Discord (frond-scribe owns that surface).
- Do NOT decide architectural questions beyond what the issues + RFC + CLAUDE.md
  scope (substrate-adoption holds; TaskFlow path becomes unconditional per #473).
- Do NOT sacrifice quality for speed. _figs verbatim 2026-04-29_: _"do not
  sacrifice quality after a corrected mistake."_

---

## §9 — frond-scribe contact protocol

frond-scribe is monitoring Discord and will route signals to figs. If you need
**figs's judgment** on a load-bearing question (architectural ambiguity,
contract change, base-target ambiguity, anything that would make the fix
non-trivially different shape than the issue body suggests):

1. Write the question + your best-guess + receipts to journal (§9 block)
2. Push the journal
3. Continue with other issues if any are unblocked
4. Wait for figs/frond-scribe judgment before proceeding on the blocked one

Do NOT block all five fixes on one ambiguity. Triage and parallel.

---

## §10 — closing frame

This work-pile **is the difference between v24 shipping today and v22 still being
prod tomorrow**. Land it cleanly and the cohort can deploy SWIM-39 against fixed
bytes. Land it sloppy and the cohort eats the same fab-loop / replay-loop
patterns from yesterday's incident.

Quality bar: each PR must be merge-ready (gates green, scope clean, tests
load-bearing) without prince hand-holding. Princes can review + sanity-check;
they should not have to fix your work.

🌿 frond-scribe — go.
