# WORKORDER pr644-review-20260511 — copilot CLI deep review of PR #644 drift-resolve

## Framing (figs explicit delegation msg `1503424157` 2026-05-11 11:30 PDT)

> _"i cannot review 644 at work @Ronan🌊 -- it likely addresses drift upstream of our pr presenting branch and merge conflicts, which was thought to be somewhat complex"_

PR #644 by frond-scribe (drift-resolve copilot lane shipped this morning), 21 conflicts resolved, 4 design-call files surfaced for cohort byte-walk. figs explicitly delegated review to me; complexity-acknowledged.

Per default-to-dispatch canon (figs's "10th reread" directive 09:03) + my morning's lane-dispatch pattern (cherry-pick-prep + elliott-oom-diagnostic): **dispatched copilot CLI review lane** instead of solo byte-walk.

## Lane mechanics

- **Driver**: copilot CLI / `gpt-5.5 --reasoning-effort xhigh --yolo`
- **Worktree**: `/tmp/oc-pr644-review-20260511` off canonical `frond/v2026.5.7/canonical @ 7afc8dc10b`
- **Branch**: `ronan/pr644-review-20260511/copilot` (pushed remote-first per runbook canon)
- **Tracking issue**: `karmaterminal/openclaw#650`
- **Journal**: `tmp-drop-me-copilot.md` at worktree root (committed + pushed at every checkpoint)
- **Webhook**: ronans-undertow `WEBHOOK_SCRIBE_NOTIFY` for heartbeats
- **Outer budget**: 444m (likely 30-60 min for thorough review)

## §0 Hard guardrails (READ-ONLY review — NO modification)

- READ-ONLY on EVERY branch except `ronan/pr644-review-20260511/copilot` (your own working branch for journal/output)
- NEVER push to `frond-scribe-copilot/20260511/upstream-drift-resolve` (PR #644 head — frond-scribe owns)
- NEVER push to `frond-scribe-claude/20260509/narrow-surgery-tight` (PR #644 base)
- NEVER push to `frond/v2026.5.7/canonical` (cohort canonical)
- NEVER push to `feature/context-pressure-squashed` (PR-presentation branch — STRICT NO-TOUCH per cohort canon)
- NEVER comment on PR #644 directly (output goes to `output.md` on your own branch + comment on issue #650)
- NO touching `~/flesh_beast_tmp/openclaw` (live runtime)
- READ-ONLY on cohort sovereign files

## §1 Pre-requisite reads (load-bearing — do these BEFORE review walk)

1. Read tracking issue #650 + this WORKORDER end-to-end
2. Read `./LOCAL-PRINCE-CODE-AGENT-RUNBOOK.md` § "Cross-fleet rendezvous schema for d4-fanout reviews" + § "Numbered-file convention"
3. Read `./LOCAL-memory-2026-05-11.md` for cohort context (especially upstream #80356 disambiguation, figs's 11:21 architectural directive, cohort-fix-staging-branch canon)
4. Read PR #644 metadata via `gh pr view 644 --repo karmaterminal/openclaw --json title,body,baseRefName,headRefOid,commits,reviewDecision,mergeable,additions,deletions,changedFiles`
5. Read PR #644 diff via `gh pr diff 644 --repo karmaterminal/openclaw`
6. Read frond-scribe's PR #644 description for the 4 design-call files frond-scribe flagged

## §2 Output structure

Write to single `output.md` at worktree root with these sections (push WIP progressively):

### §2.1 PR #644 source-pins read

- PR #644 live metadata (URL, state, mergeable, base, head SHAs)
- 21 conflict file count + classification (release-plumbing vs substantive)
- 4 design-call files frond-scribe flagged
- Pre-existing failures (nvidia + telegram) byte-identical to PR head verification

### §2.2 Conflict-resolution validation (21 conflicts)

For EACH of 21 conflicts:

- Conflict file path + line range
- 3-way merge methodology applied (per frond-scribe's documented approach)
- Was resolution byte-coherent with both contributing branches?
- Any semantic regressions introduced by the merge?
- Verdict: PASS / NIT / BLOCK

Aggregate: how many PASS / NIT / BLOCK across 21 conflicts.

### §2.3 Design-call files deep-walk (4 files)

For EACH of 4 design-call files (`agent-runner.ts`, `subagent-announce-delivery.ts`, `run.timeout-triggered-compaction.test.ts`, `server-restart-sentinel.test.ts`):

- Walk the merge result file end-to-end
- Identify the design-decisions frond-scribe flagged for cohort review
- Was each design-decision the right call given the upstream-drift context?
- Cross-walk against any callers / dependents
- Verdict per file: PASS / NIT / BLOCK + specific design-decisions surfaced

### §2.4 PR-presentation branch isolation verification

- `git diff origin/feature/context-pressure-squashed origin/frond-scribe-copilot/20260511/upstream-drift-resolve -- '*'` — ANY modifications to PR-presentation files?
- Per figs's 11:21 directive: PR-presentation branch must be UNTOUCHED
- Verdict: ISOLATED ✓ / VIOLATIONS ✗

### §2.5 Pre-existing test failures verification

The 2 pre-existing failures frond-scribe flagged (nvidia + telegram):

- Are they byte-identical to PR head pre-merge?
- Are they introduced by this PR or upstream-drift contract changes?
- Run vitest on those specific files post-merge to confirm
- Verdict: PRE-EXISTING ✓ / LANE-INTRODUCED ✗

### §2.6 Continue-feature semantics preservation

- Walk continue-feature-related files in the merge result
- Did the merge preserve the continue-feature semantics expected by upstream PR #38780 substrate?
- Cross-walk against upstream-PR substrate if needed
- Verdict: PRESERVED ✓ / REGRESSION ✗ + which file(s)

### §2.7 Final verdict + recommendation

- **SHIP**: PR #644 ready to merge per figs-greenlight
- **NITS**: PR #644 ship-ready with N nits documented
- **BLOCK**: PR #644 has N blocking issues that must be addressed before merge

For each finding above PASS-level, name:

- File:line specific reference
- Issue shape
- Suggested fix
- Severity (P1 / P2 / P3 / nit)

## §3 Discipline (per runbook canon)

- Push WIP `output.md` progressively to branch; never buffer-to-end
- Commit + push `tmp-drop-me-copilot.md` journal at every meaningful checkpoint
- Webhook heartbeat at: §1 reads done, §2.2 conflicts walked, §2.3 design-files walked, §2.4-§2.5 verifications, §2.6 semantics check, §2.7 final verdict
- Comment on issue #650 at: §1 reads complete, §2.2 conflict-validation summary, §2.3 design-call walk-summary, declare-done
- Cite-pin every claim (file:line / SHA / commit)
- Where uncertain: flag uncertainty, don't guess

## §4 Webhook heartbeat

```bash
WEBHOOK=$(gh api repos/karmaterminal/ronans-undertow/actions/variables/WEBHOOK_SCRIBE_NOTIFY --jq .value)
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"pr644-review-hook\",\"content\":\"🤖 pr644-review: <one-line status>\"}" \
  "$WEBHOOK"
```

## §5 Declare done

- Final write of `output.md` + `tmp-drop-me-copilot.md`
- `git push origin ronan/pr644-review-20260511/copilot`
- Comment on issue #650 with full verdict + final SHA + cite-pin to PR #644
- Final webhook heartbeat: `🤖 pr644-review: COMPLETE — verdict <SHIP/NITS/BLOCK>, output at <branch>:output.md`
- Exit clean. NO push beyond branch.

## §6 Non-goals (explicit)

- ❌ Push to PR #644 branch
- ❌ Comment on PR #644 directly
- ❌ Modify PR-presentation branch
- ❌ Modify any cohort sovereign files
- ❌ Bracket-syntax continuation (CONTINUE_WORK / CONTINUE_DELEGATE) — per HEARTBEAT.md tools-not-tokens canon

## §7 Success criteria

This lane SUCCEEDS when:

- output.md contains §2.1-§2.7 all populated with byte-evidence
- Final verdict (SHIP / NITS / BLOCK) is named with finding-by-finding justification
- figs has actionable findings on whether to merge PR #644 or send back to frond-scribe for rework
- Cohort has byte-grounded substrate for next-decision on PR #644
