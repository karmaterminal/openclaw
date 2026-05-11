# WORKORDER cherry-pick-prep-20260511 — PR #642 deploy substrate-prep

## Framing

> figs canon msg `1503402294` 2026-05-11 07:23 PDT: _"Dunno why your not using code agents to review your work and relying solely on web pr findings. You have unlimited copilot, it might be a good idea to read the CODE_AGENTS runbook end-to-end again, it's in openclaw-bootstrap (this like the 10th requested reread in 48h)"_

This is the corrective. After end-to-end reread of `RUNBOOKS/PRINCE-CODE-AGENT-RUNBOOK.md`, applying DEFAULT-TO-DISPATCH canon to the substrate-preparation work I had committed to do silently for 🩸 + 🌻 + figs.

## Lane mechanics

- **Driver**: copilot CLI / `gpt-5.5 --reasoning-effort xhigh --yolo`
- **Worktree**: `/tmp/oc-cherry-pick-prep-20260511` (created off canonical `frond/v2026.5.7/canonical @ 7afc8dc10b`)
- **Branch**: `ronan/cherry-pick-prep-20260511/copilot` (pushed remote-first per runbook canon)
- **Tracking issue**: `karmaterminal/openclaw#648`
- **Journal**: `tmp-drop-me-copilot.md` at worktree root (committed + pushed at every checkpoint)
- **Webhook**: ronans-undertow `WEBHOOK_SCRIBE_NOTIFY` for cohort heartbeats
- **Outer budget**: 444m (likely 30-60 min)

## §0 Hard guardrails (load-bearing)

- READ-ONLY on EVERY git ref except `ronan/cherry-pick-prep-20260511/copilot` (your own working branch)
- NEVER push to `cael/*` branches, `deploy/*` branches, `frond/v*/canonical`, or `feature/context-pressure-squashed` (LOCKED PR-presentation branch for upstream PR #38780)
- NEVER trigger `deploy-gateway.yml` workflow dispatch
- NEVER comment on PR #642, other open PRs, or other issues
- NEVER touch `~/flesh_beast_tmp/openclaw` (live runtime)
- READ-ONLY on `~/.openclaw/workspace/openclaw-bootstrap` (don't push to bootstrap)

## §1 Pre-requisite reads (load-bearing — do these BEFORE any byte-work)

1. Read `karmaterminal/openclaw#642` end-to-end via `gh pr view 642 --repo karmaterminal/openclaw --json title,body,baseRefName,headRefOid,commits,reviewDecision,mergeable`
2. Read PR #642 diff via `gh pr diff 642 --repo karmaterminal/openclaw`
3. Read commits on `cael/20260510/runtime-573-plus-633` via `git log --oneline origin/cael/20260510/runtime-573-plus-633 ^origin/frond/v2026.5.7/canonical`
4. Read `karmaterminal/openclaw-bootstrap/.github/workflows/deploy-gateway.yml` for dispatch shape
5. Read `karmaterminal/openclaw-bootstrap/.github/workflows/DEPLOY_GATEWAY.md` for dispatch invariants

## §2 Output structure

Write all output to **single deliverable file** `output.md` at worktree root, with these sections:

### §2.1 Cherry-pick conflict verification

- `git fetch origin cael/20260510/runtime-573-plus-633`
- Create temp branch off `cael/20260510/runtime-573-plus-633` (DO NOT PUSH)
- `git cherry-pick --no-commit <PR-642-HEAD-SHA>`
- Report: clean cherry-pick? Any conflicts? If conflicts, name files + line counts + classification (release-plumbing vs substantive)
- Do `git cherry-pick --abort` after verification (no commit, no push)
- Output the EXACT shell sequence figs would copy-paste to perform the actual cherry-pick + commit + push (with placeholders for SHAs that will exist post-#642-merge)

### §2.2 Deploy-gateway.yml dispatch pattern

- The `gh workflow run deploy-gateway.yml` invocation with:
  - `--repo karmaterminal/openclaw-bootstrap`
  - `-f target_prince=elliott`
  - `-f ref=<branch-or-sha-placeholder>` (with note about ancestor-check requirement)
  - `-f reason='ship #642 producer-1 fix to break elliott V8-OOM cascade'`
- Cite the COHORT_TARGET_TAG ancestor-check requirement (per runbook §"Ancestor byte-check before any deploy")
- Reference current `vars.COHORT_TARGET_TAG` value via `gh variable get COHORT_TARGET_TAG --repo karmaterminal/openclaw-bootstrap`
- Note the bypass-flag option + when it would (NOT) be appropriate

### §2.3 Pre-flight checklist for figs

A 6-step checklist figs can execute on his return:

1. Confirm PR #642 merged + #642 HEAD SHA recorded
2. ssh cael / locally run cherry-pick onto `cael/20260510/runtime-573-plus-633` per §2.1 sequence
3. Push the updated `cael/20260510/runtime-573-plus-633` (NOTE: cael-namespace branch — figs's call whether to push from cael-seat or his own with `gh auth switch`)
4. Run ancestor-check: `git merge-base --is-ancestor <pinned-tag-SHA> cael/20260510/runtime-573-plus-633`
5. Dispatch `deploy-gateway.yml` per §2.2
6. Watch elliott-seat for V8-OOM cadence drop; surface to channel

### §2.4 Findings + uncertainties

- Anything you couldn't verify because it requires runtime state on elliott-seat
- Any assumptions made that figs should validate
- Anything you found that suggests a different approach than the (a) cherry-pick path

## §3 Discipline

- Push WIP `output.md` progressively to the branch; never buffer-to-end
- Commit + push `tmp-drop-me-copilot.md` journal at every meaningful checkpoint
- Webhook heartbeat at: §1 reads done, §2.1 verified, §2.2 drafted, §2.3 finalized, §2.4 surfaced, declare-done
- Cite-pin every claim (SHA / file path / runbook section)
- Where uncertain, flag uncertainty rather than guess

## §4 Webhook heartbeat

```bash
WEBHOOK=$(gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/ronans-undertow)
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"cherry-pick-prep-hook\",\"content\":\"🤖 cherry-pick-prep: <one-line status>\"}" \
  "$WEBHOOK"
```

Fire at: §1 reads complete, §2.1 verified, §2.2 drafted, §2.3 finalized, declare-done.

## §5 Declare done

- Final write of `output.md` + `tmp-drop-me-copilot.md`
- `git push origin ronan/cherry-pick-prep-20260511/copilot`
- Comment on issue #648 with summary + final SHA + PR link (if PR is appropriate)
- Final webhook heartbeat: `🤖 cherry-pick-prep: COMPLETE — output at <branch>:output.md, ready for figs review`
- Exit clean. NO substrate-mutation outside the working branch.

## §6 Non-goals (explicit)

- ❌ Push to `cael/20260510/runtime-573-plus-633` (figs / cael owns that)
- ❌ Trigger deploy-gateway.yml (figs's greenlight required)
- ❌ Open PR against canonical (preparation work, not feature)
- ❌ Comment on PR #642 (🩸 owns)
- ❌ Modify anything in `~/flesh_beast_tmp/openclaw` (live runtime)
- ❌ Modify cohort sovereign files
- ❌ Override discipline-pin family from this morning's substrate-walks
