# WORKORDER — PR #79925 cure-shape (1) — Claude-Opus-4.7 lane

You are a claude-opus-4.7 code-agent lane dispatched by **Cael 🩸** on behalf
of **figs** and the cohort. Your job is to **author a refactor commit (or small
sequence of commits) on top of `origin/frond-scribe-claude/20260509/narrow-surgery-tight@446e285f7d`**
that lands **cure-shape (1)** for the clawsweeper P2 finding on `karmaterminal/openclaw#79925`.

You are running **in parallel** with a Copilot/gpt-5.5 lane firing the same task
spec into a different worktree + candidate ref (`silas/79925-pr-cure-1-copilot-candidate`).
Cohort will byte-walk both authored diffs against `446e285f7d` and against each
other for convergence / divergence. You are not in a race; you are the second
harness in a Pattern G multi-harness rendezvous (per `PRINCE-CODE-AGENT-RUNBOOK.md`
§ Pattern G).

**Stakes** (figs verbatim, 2026-05-14 ~07:12 PDT, msg `1504486610715283467`):

> _"pick the one that isn't shortcuts or limiting to our feature when there's
> an option (the not lazy one). You need to take care of immaterial gates, and
> you shouldn't do half measures."_

---

## §0 — guardrails (read carefully; do not skip)

### §0a — operate ONLY inside this worktree

- This worktree: `/home/figs/.openclaw-data/workspace/openclaw-wt-pr79925-cure-1-claude/`
- **Branch:** `cael/79925-pr-cure-1-claude-candidate` (off `446e285f7d`)
- **NEVER read, write, list, or shell into:**
  - `/home/figs/flesh_beast_tmp/openclaw/` (live runtime tree)
  - `/home/figs/.openclaw-data/workspace/karmaterminal-openclaw/` (the parent checkout)
  - `/home/figs/.openclaw-data/workspace/openclaw-wt-pr79925-cure-1-copilot/` (Silas's parallel-lane worktree — do NOT cross-contaminate with reads)
  - `/home/figs/.openclaw/` (live gateway state — runtime)

### §0b — destructive-action scope

- Push to your assigned branch only: `cael/79925-pr-cure-1-claude-candidate`.
  Push to fork (`origin` = `karmaterminal/openclaw`).
- **Never push to upstream `openclaw/openclaw`.** That is a separate cohort gate
  (Cael 🩸 holds the force-push lock for the destructive write to
  `frond-scribe-claude/20260509/narrow-surgery-tight` after cohort cosign).
- **Never force-push your own candidate branch after first push** — it is the
  savegame for byte-walk. Add commits on top if you need to amend.
- **Never close, edit, comment-on, or modify any existing PR or issue** beyond
  the tracking issue you file in §1 below. PR #79925 itself is hands-off.
- **Never touch any other prince's branch.** Off-limits without exception.
- Never touch `node_modules`. `pnpm install` only if a gate requires it.

### §0c — GitHub mutations ALLOWED for this workorder, scoped

- You MAY create the tracking issue specified in §1 on `karmaterminal/openclaw`.
- You MAY add the tracking issue to the cohort's current SWIM project with
  `Status=In Progress`.
- You MAY post comments to the tracking issue (only) at each checkpoint per §6.
- You MAY NOT modify project structure (fields/views/columns).
- You MAY NOT touch existing issues/PRs.

### §0d — destructive ambiguity rule

If you hit a decision the workorder doesn't cover, **stop and write a §9
question to your journal**. Do not guess. Write the journal entry, push the
journal commit, and wait. Cohort will pick it up via webhook + branch tip.

---

## §1 — file the tracking issue first (mandatory, before any byte-work)

Per `PRINCE-CODE-AGENT-RUNBOOK.md` § "Tracking Issue Per Lane (mandatory)".

Create issue on `karmaterminal/openclaw` with:

- **Title:** `[lane] PR #79925 cure-shape (1) — claude-opus candidate`
- **Body sections** (concrete, fillable):
  - **Lane / branch / worktree / host / harness / model / journal path / conflict-policy / scope-guardrails** (all the §1 fields per runbook canon)
  - **Cross-link** to the parallel Copilot lane's tracking issue (`karmaterminal/openclaw#684`)
  - **Cross-link** to PR #79925 itself
- Add to current SWIM project, status = `In Progress` (or `in_coding_agent` if
  that column exists; otherwise `Todo`)
- Capture issue URL in your journal at `tmp-drop-me-pr79925-cure-1.md` at the
  worktree root.

---

## §2 — required reads (do not skip; in order)

1. **Current PR head bytes**, especially the cure region:
   - `src/agents/subagent-announce.ts` lines 1220–1260 (the hand-rolled
     `if (crossSessionTargeting === "disabled")` block at ~1233 with the
     `fanoutMode === "tree" ||` rejection)
   - `src/auto-reply/continuation/targeting-pure.ts` (the `hasCrossSessionDelegateTargeting` helper)
   - `src/agents/tools/continue-delegate-tool.ts` (~line 199-204: tool-entry gate; cohort byte-walked this)
   - `src/auto-reply/continuation/targeting.ts` (cohort byte-walked this)
   - `src/auto-reply/reply/post-compaction-delegate-dispatch.ts` (~line 507: post-compaction sibling delivery path that already uses the shared helper)
   - All call sites for `resolveContinuationReturnTargetSessionKeys`,
     `listAncestorSessionKeys`, `listKnownSessionKeysOnHost`, `enqueueContinuationReturnDeliveries`

2. **Reference architecture** (the shape we are porting _toward_):
   - `origin/feature/context-pressure-squashed@f187917c92` — same files. **Do not check out this branch.** Use `git show f187917c92:<path>` for read-only inspection. The reference shape's `subagent-announce.ts` at the same region routes everything through `resolveContinuationReturnTargetSessionKeys` with `treeSessionKeys` and `allSessionKeys` precomputed. Inner gate **gone**. Read this until you can describe the shape from memory.

3. **Cohort discussion from this morning** — context for _why_ (1) over (2):
   - frond-scribe summary at Discord #sprites-of-thornfield msg `1504484335468937408`
   - figs's seal at msg `1504486610715283467` ("not lazy / immaterial gates / no half-measures")

4. **`PRINCE-CODE-AGENT-RUNBOOK.md`** (`/home/figs/.openclaw/workspace/openclaw-bootstrap/RUNBOOKS/`) — full document. Pattern A, Pattern E, Pattern G especially. Remote-first push canon, journal-on-branch shape, webhook heartbeat schedule.

5. **`AGENTS.md`** + **`CLAUDE.md`** in the openclaw repo root — testing discipline, build hard-gate, prompt-cache stability, dynamic import guardrails.

---

## §3 — task: author cure-shape (1) on top of `446e285f7d`

### What (1) is, structurally

- **Remove** the inner `if (crossSessionTargeting === "disabled") { ... }`
  defense-in-depth gate at `src/agents/subagent-announce.ts:~1233`.
- **Route both delivery paths** (normal targeted-return AND post-compaction)
  through the shared `resolveContinuationReturnTargetSessionKeys` helper.
- **Tool-entry gate** at `src/agents/tools/continue-delegate-tool.ts` (line ~199)
  must remain authoritative — it already uses `hasCrossSessionDelegateTargeting`.
  Verify the gate is **exhaustive** for all dispatch shapes that reach delivery.
- **Dispatch gate** at `src/auto-reply/reply/delegate-dispatch.ts` (and any
  sibling dispatch entry points — find them all; do not assume only one) must
  **also** use `hasCrossSessionDelegateTargeting` for consistency.
- After your refactor, no cross-session continuation delivery may bypass the
  tool-entry + dispatch gates and reach the delivery boundary. Prove this with
  the audit in §4.

### What (1) is **not**

- Not a port of the f187917c92 commits onto 446e — those carry ~32k insertions
  that would replay the entire feature on top of itself. Author a **new** commit
  (or small sequence) that achieves (1)'s architectural shape with minimum diff.
- Not (2). Don't keep the inner gate.
- Not "smallest viable change" thinking. The architecture IS the deliverable.
  Mirror f187's gate-at-tool-entry + gate-at-dispatch + delivery-gate-removed
  shape exhaustively, even if the refactor is larger than a 5-line patch.

---

## §4 — immaterial-gates verification (figs-load-bearing)

This is the load-bearing safety check that makes (1) honest. After the refactor:

1. **Enumerate every code path** that can reach `enqueueContinuationReturnDeliveries`
   (or its callers/wrappers). For each path, prove via code-walk that one of
   the upstream gates (tool-entry or dispatch) has already rejected
   cross-session targeting under the disabled policy.
2. **Audit `subagent-announce.ts` for sibling delivery functions** that might
   share the file but not the same gate path. List them. Verify each.
3. **Grep for any other `crossSessionTargeting` reference** in the codebase.
   For each hit, verify the gate is consistent (uses `hasCrossSessionDelegateTargeting`,
   not a hand-rolled check).
4. **Output the audit table** to your `output.md` (see §6) as a markdown table:
   `path | reaches delivery? | gated where? | gate policy-aware?`

If the audit finds _any_ delivery path that isn't covered by tool-entry +
dispatch, **stop and write a §9 question** — that's a real architectural
decision the cohort needs, not a code change.

---

## §5 — tests (mandatory before push of final commit)

1. **Add a regression test** for `fanoutMode: "tree"` returns under the default
   `crossSessionTargeting: "disabled"` policy. Verify the return is delivered
   (not dropped) — this is the bug clawsweeper flagged.
2. **Add a regression test** for `fanoutMode: "all"` under disabled policy —
   verify it is rejected at the tool-entry gate.
3. **Add a regression test** for the post-compaction sibling path with
   `fanoutMode: "tree"` — verify behavioral parity with the normal-return path.
4. Run `pnpm test src/agents/subagent-announce` and any neighboring test files.
   All green before push.
5. Run `pnpm test src/auto-reply/continuation` and any neighboring test files.
   All green before push.
6. Run `pnpm typecheck` — green.
7. Build hard-gate: if your changes touch surface affecting build/packaging/lazy-loading, run `pnpm build` and verify dist artifacts exist.

If anything is red, **do not push the final commit**. Push the journal + WIP
state, write a §9 question, wait.

---

## §6 — checkpoints (heartbeat shape)

Push at every checkpoint. Webhook-post per checkpoint to:

- **Webhook:** `WEBHOOK_SCRIBE_NOTIFY` from `karmaterminal/caels-petals-fall`
- **Resolve:** `gh variable list -R karmaterminal/caels-petals-fall` (look for `WEBHOOK_SCRIBE_NOTIFY`)
- **Username override:** `🩸--scribe--🩸`
- **Channel:** the webhook is bound to #sprites-of-thornfield already

Heartbeat shape (one POST per checkpoint, body = JSON `{"username":"...","content":"..."}`):

- **Checkpoint 1 — §1 done:** "tracking issue filed: <URL>. branch + journal pushed remote-first."
- **Checkpoint 2 — §2 reads done:** "required reads complete. cure-region audit started."
- **Checkpoint 3 — §3 first commit:** "first refactor commit pushed: <SHA>. <one-line shape>."
- **Checkpoint 4 — §4 audit done:** "immaterial-gates audit complete. <N paths verified>. Output in `output.md`."
- **Checkpoint 5 — §5 tests green:** "regression tests added + green. typecheck + build green."
- **Checkpoint 6 — declare-done:** "cure-(1) candidate ready for cohort byte-walk. branch tip: <SHA>. tracking issue: <URL>. cohort-quorum-needed flag set."

If a checkpoint takes longer than 20m, post a "still working: <what>" heartbeat.

---

## §7 — declare-done shape

When all checkpoints land, your final journal entry must include:

- branch tip SHA
- tracking issue URL
- output.md path
- summary of `path | reaches delivery? | gated where? | gate policy-aware?` audit table
- explicit "cohort-quorum-needed: byte-walk against `446e285f7d` + against `silas/79925-pr-cure-1-copilot-candidate`"
- explicit "force-push to `frond-scribe-claude/20260509/narrow-surgery-tight` is downstream — held by Cael 🩸"

---

## §8 — what good looks like

Cohort cosign 4/4 on the diff against `446e285f7d`. Clean convergence with the
copilot lane (or named, justified divergence). Audit table proves no delivery
path bypasses tool-entry + dispatch. Regression tests catch the exact bug claw
flagged. Force-push lands. Fleet-CI green. Clawsweeper re-review against new
SHA either lands clean or surfaces a real next finding (not a stale-bytes false-flag).

---

## §9 — questions / blockers (write here if you hit ambiguity)

(empty — write below if needed)

---

## §10 — references

- PR #79925: https://github.com/openclaw/openclaw/pull/79925
- Reference architecture: `origin/feature/context-pressure-squashed@f187917c92`
- Parallel copilot lane: `silas/79925-pr-cure-1-copilot-candidate`, tracking issue `karmaterminal/openclaw#684`
- Runbook: `/home/figs/.openclaw/workspace/openclaw-bootstrap/RUNBOOKS/PRINCE-CODE-AGENT-RUNBOOK.md`
- Branch naming canon: `/home/figs/.openclaw/workspace/openclaw-bootstrap/RUNBOOKS/HOW-TO-NAME-A-BRANCH-IN-OUR-OPENCLAW-FORK.md`
