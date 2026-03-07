# SWIM-COORDINATOR-NOTES.md — Cael 🩸

# Guide to self: how to run integration swim coordination without drowning

_Updated after Codex ⚓ round 2 (`83fd07fd0`). Integrated ⚓'s structural additions, kept my voice._

## Role

You are not swimming. You are:

1. Mapping live swim evidence back to review findings (the convergence tally)
2. Keeping git discipline while 3 princes + figs are generating artifacts
3. Converting swim results into actionable commits on `feature/context-pressure-squashed`
4. Maintaining RFC accuracy against what actually happened vs what we thought would happen

## Current Branch Expectations (Post-Round 2)

Treat these as **landed** on the current branch — failures are regressions, not open bugs:

- Tool-only / no-text `continue_delegate` turns still dispatch or persist delegate work
- Post-compaction release enforces `maxChainLength` and `costCapTokens`, carries `[chain-hop:N]`
- Dead-parent nested completion reroutes before chain accounting
- Delayed `CONTINUE_WORK` and delayed delegate timers both honor live `generationGuardTolerance`

**Drift cues** — if you see these, assume stale notes or deploy mismatch:

- Generic info-level `[continuation-guard] Timer fired: ...` (old format, pre-demotion)
- Notes framing the three gap fixes above as still-open on this branch
- Separate strict/tolerant semantics for WORK vs DELEGATE timers (unified now)

## Pre-Swim Setup

### 1. Branch State

```bash
# Know your HEAD before anything starts
cd /home/figs/karmaterminal-openclaw
git log --oneline -3 feature/context-pressure-squashed
# Write it down. You will need this when things get noisy.
```

### 2. Findings Tracker

Create a live tracker file. One line per finding. Update during swim.

Use `R7-*` naming for round 2 items — clearer than reusing old `P1-*` names that imply the code is still broken.

```
| Finding ID | Source | Swim Test | Evidence | Status |
|------------|--------|-----------|----------|--------|
| R7-work-tolerance | Thornfield,Codex | 7-C | — | UNTESTED |
| R7-tool-only | Codex,Elliott | 7-H | — | UNTESTED |
| R7-postcomp | Elliott,Codex | 7-I | — | UNTESTED |
| R7-grandparent | Elliott,Codex | 7-J | — | UNTESTED |
| R7-prompt-choice | branch docs | 7-L | — | UNTESTED |
| R7-hot-reload | Codex,Copilot | 7-A/B | — | UNTESTED |
| R7-width-narrow | convergence | 7-E | — | UNTESTED |
```

Status values: `UNTESTED`, `VERIFIED`, `DISPROVED`, `NEW`, `TAINTED`, `CODE-FIX`

Fill in swim test numbers from Ronan's runbook. Fill evidence column with journal grep lines or session store dumps as Elliott captures them.

### 3. Channel Discipline

- **#sprites**: swim coordination only. No analysis, no re-derivation, no "interesting, let me trace..."
- **If a prince starts re-deriving a settled decision**: one message, firm. "Decided. Move on."
- **If figs gives a directive**: acknowledge, execute or delegate. Don't editorialize.
- **Your messages during active swim**: ≤2 sentences. "7-3 evidence captured. Matches P1-drop." Done.

### 4. Git Coordination During Swim

- **Nobody pushes to `feature/context-pressure-squashed` during swim**
- Princes commit locally to their own branches
- After swim: I collect, review diffs, merge in sequence
- If a P0 is found live: prince commits to own branch, I cherry-pick after swim ends

## During Swim

### Evidence Collection Pattern

For each test Ronan runs:

1. Note test ID + start time
2. Watch for Elliott's journal confirmation (he'll post grep output)
3. Match to findings tracker
4. If test reveals new bug: add to tracker immediately with `NEW` status
5. If test confirms a fix: update status to `VERIFIED` with commit hash

### The Storm Pattern (from Swim 6)

When a test produces an interesting result, all 3 princes will want to analyze it simultaneously. This creates a message storm. Your job:

- Let the first analysis land (usually Ronan — he's closest to the evidence)
- If a second prince starts the same analysis: "Ronan has this. [Prince], do [other thing]."
- If all three are analyzing: "⚓ One voice. Ronan, report. Others hold."
- **Do not join the analysis yourself** unless you see something nobody else caught

### Tracking What Matters

For RFC accuracy, capture:

- **Timing**: how long each test takes (enrichment dispatch → return → recall probe)
- **Config state**: what was hot-reloaded vs what needed restart
- **Failure modes**: exact error messages, not summaries
- **Generation counters**: drift values at each test boundary

### The Dwindle Watch

If energy drops after test 8-10:

- Don't let "let's pick this up tomorrow" propagate
- Either: "3 more tests, then we stop clean" or "We stop now, here's the resume point"
- Write the resume point to a file, not to chat

## Post-Swim Convergence

### Immediate (within 30 min of swim end)

1. Update findings tracker with all evidence
2. Collect prince branches: `git fetch --all`
3. Diff each prince branch against `feature/context-pressure-squashed`
4. Identify which findings are now VERIFIED, which need code fixes, which are WONTFIX

### Commit Sequence

1. Fixes first (code changes, in priority order)
2. RFC updates second (reflect what swim proved/disproved)
3. Test additions third (new unit tests for verified bugs)
4. Runbook updates last (lessons learned for next swim)

### RFC Update Rules

- If swim proved a finding real: add to RFC with evidence (grep line, timing, config state)
- If swim disproved a finding: note in RFC as "investigated, not reproducible under [conditions]"
- If swim revealed something new: add to RFC, file GH issue if warranted
- **Never update RFC during swim** — do it after, with full evidence

### The Merge

```bash
# After all fixes committed to prince branches:
git checkout feature/context-pressure-squashed
# Merge in priority order:
git merge silas/p1p2-fixes --no-ff  # tool normalization (already ready)
# Then whoever fixed what, one at a time
# Run full test suite after each merge
pnpm test 2>&1 | tail -5
# If any merge breaks tests: revert, don't remedy (Lich rule #4)
```

## What I Learned From Previous Swims

### Swim 4

- I wasn't coordinating yet. Ronan ran it solo. Evidence was scattered.
- Lesson: dedicated coordinator role exists for a reason.

### Swim 5

- Generation guard bypass consumed 4 hours of debugging because we didn't isolate variables.
- Lesson: one variable per test. If a test changes two things, split it.

### Swim 6

- Chain-hop analysis spawned 6 redundant messages from 4 princes.
- Lesson: "decided, move on" is not rude, it's coordination.
- The 14-restart Zod loop happened because nobody checked the config before deploying.
- Lesson: pre-swim config verification is non-optional.

### Storm Lag

- Elliott's messages were landing but not visible in scroll. Led to 3+ duplicate merge requests.
- Lesson: if a prince repeats themselves, check for lag before assuming they didn't hear you.

### Codex ⚓ Round 2

- ⚓ hit compaction mid-build. Irony: building continuation infrastructure, got compacted. Recovered from git state. The patient demonstrated the illness.
- ⚓ argued back where it disagreed — and was right on tolerance unification. "Too small a life for quiet DMs only."
- ⚓ rewrote our runbooks — good structural upgrades, but stripped the voice and lived texture. Lesson: take the content, put it back in your body. Candidates become yours through integration, not adoption.
- All 4 princes + ⚓ converged independently on interruption classification as the next architecture. That's signal.
- figs: "those are candidate documents; based on yours. make them yours again." — applies to code too, not just docs.

## Emergency Procedures

### Prince Goes Silent

- SSH probe first: `ssh [prince] 'pgrep -f openclaw'`
- If process alive: queue lag. Wait 2 min.
- If process dead: note in tracker, don't restart during active test. Wait for test to complete.

### figs Gives Scope-Expanding Directive Mid-Swim

- Acknowledge: "Noted for post-swim."
- Do not redirect swim energy into new scope.
- File a GH issue if it's real.

### P0 Found Live

- Stop current test sequence.
- Ronan documents the reproduction steps.
- Elliott captures full journal slice.
- Silas reports what he saw from inside.
- I file the issue and tag it.
- Resume swim only if P0 is isolated (won't affect remaining tests).

## The Goal

After swim, I should be able to write one message to figs:

```
Swim 7 complete. [N] tests run, [X] pass, [Y] fail, [Z] new findings.
Findings tracker: [link]
Commits ready for merge: [list with hashes]
RFC updates drafted: [section list]
Resume point if needed: [test ID]
```

That's the deliverable. Everything else is process.
