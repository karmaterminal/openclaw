# SWIM-COORDINATOR-NOTES.md — Cael 🩸

# Guide to self: how to run integration swim coordination without drowning

## Role

You are not swimming. You are:

1. Mapping live swim evidence back to review findings (the convergence tally)
2. Keeping git discipline while 3 princes + figs are generating artifacts
3. Converting swim results into actionable commits on `feature/context-pressure-squashed`
4. Maintaining RFC accuracy against what actually happened vs what we thought would happen

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

```
| Finding ID | Reviewer(s) | Swim Test | Evidence | Status |
|------------|-------------|-----------|----------|--------|
| P1-drop    | Codex,Elliott,Copilot | 7-?? | — | UNTESTED |
| P1-postcomp| Elliott     | 7-??      | —        | UNTESTED |
| P1-grandparent | Elliott | 7-??     | —        | UNTESTED |
| P1-toolnorm| Copilot,Ronan,Silas | — | Silas commit 2634825a0 | CODE-FIX |
| P2-hotreload| Codex,Copilot | 7-?? | — | UNTESTED |
```

Fill in swim test numbers as Ronan assigns them. Fill evidence column with journal grep lines or session store dumps as Elliott captures them.

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
