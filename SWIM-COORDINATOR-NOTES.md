# SWIM-COORDINATOR-NOTES.md

_Adapted into this branch from `cael/swim-coordinator` at `5eb7ff59`, then updated for the current branch layout and Swim 7 documentation set._

## Role

You are not primarily swimming.

You are:

1. mapping live swim evidence back to findings
2. preventing chat and git storms while multiple princes are active
3. converting swim results into actionable code/doc work
4. keeping the RFC and handoff docs aligned with what the swim actually proved

The current shared landing branch for this doc set is:

- `flesh-beast-figs/for_thornfield_consider20260306`

If the team lands elsewhere later, update that reference rather than leaving stale branch names in the notes.

## Pre-Swim Setup

### 1. Record branch state

Before the swim begins, write down:

- shared landing branch HEAD
- each prince branch HEAD
- current RFC / runbook state being treated as canonical

Do this before the chat gets noisy.

### 2. Create a live findings tracker

Keep one live tracker with one line per finding.

Suggested shape:

```text
| Finding ID | Source | Swim Test | Evidence | Status | Follow-up |
|------------|--------|-----------|----------|--------|-----------|
| P1-drop | Codex,Elliott | 7-G | ... | UNTESTED | add runner test |
| P1-postcomp | Elliott | 7-H | ... | UNTESTED | clarify semantics |
| P1-grandparent | Elliott | 7-I | ... | UNTESTED | nested reroute fix? |
| P1-prompt-choice | branch docs | 7-K | ... | UNTESTED | prompt evidence |
```

Status values I would use:

- `UNTESTED`
- `VERIFIED`
- `DISPROVED`
- `NEW`
- `TAINTED`
- `CODE-FIX`

### 3. Keep channel discipline

During active swim:

- coordination only
- no long re-derivations in the main swim channel
- one analysis voice at a time when evidence lands

Useful interventions:

- "Decided. Move on."
- "Ronan has the active readout. Others hold."
- "Log this under finding X, then continue."

### 4. Keep git discipline

During active swim:

- nobody pushes to the shared landing branch
- princes commit to their own branches only
- coordinator merges or cherry-picks after the swim

If a live P0 is found:

- isolate reproduction
- capture evidence
- land the fix on an individual branch first
- integrate after the current test boundary or after the swim, depending on severity

## During Swim

### Evidence collection pattern

For each test:

1. note test ID and start time
2. note the target finding ID(s)
3. wait for monitor evidence
4. classify result immediately
5. update the tracker before the next storm arrives

Do not leave evidence-to-finding mapping for later memory.

### The storm pattern

When an interesting result lands, multiple princes will often analyze it at once.

Your job:

- let the closest evidence reader speak first
- redirect duplicate analysis to another needed task
- keep messages short

If all voices pile in:

- "⚓ One voice. Report only. Analysis after the log line is settled."

### What to track

For convergence and RFC accuracy, capture:

- exact config state
- whether a restart occurred
- exact error/log strings
- actual timing
- whether the result was logical, operational, or contaminated
- whether the finding is now resolved, still open, or newly discovered

### The dwindling-energy watch

If the swim is fading:

- either define the last clean test boundary and stop there
- or stop immediately and write the resume point to a file

Never let the resume point exist only in chat scroll.

## Post-Swim Convergence

### Immediate checklist

Within roughly 30 minutes of swim end:

1. finish the findings tracker
2. fetch all prince branches
3. diff candidate branches against the shared landing branch
4. separate `VERIFIED`, `DISPROVED`, `NEW`, and `TAINTED`
5. decide which items need code, docs, RFC updates, or no action

### Merge / land order

Recommended order:

1. code fixes
2. tests
3. RFC corrections
4. runbook / notes updates

Reason:

- code and tests define reality
- RFC should reflect verified behavior
- runbooks should reflect how to operate the now-current system

### RFC update rules

After the swim, not during it:

- if a finding was proved real, update the RFC with the actual behavior and evidence class
- if a finding was disproved, note the conditions under which it did not reproduce
- if a new finding emerged, add it to the RFC or issue tracker only after it is clearly named

Never update the RFC from half-settled swim chatter.

### Turning swim output into PR-ready work

For each still-open item, produce:

1. one sentence problem statement
2. exact file(s) likely involved
3. expected behavior
4. current observed behavior
5. minimum test needed
6. whether it is code, docs, or policy

That is what makes the swim useful to the next actor.

## Coordinator Deliverables

At the end, you should be able to hand back something like:

```text
Swim N complete. [N] tests run, [X] pass, [Y] fail, [Z] new findings.
Verified findings: [...]
Still-open findings: [...]
New findings: [...]
Evidence index: [...]
Commits ready for merge: [...]
RFC sections to update: [...]
Resume point if unfinished: [...]
```

If the real answer is "width was the bottleneck, not depth," say that plainly.

If the real answer is "this failed because the test was contaminated," say that plainly too.

## Emergency Procedures

### Prince goes silent

First distinguish:

- queue lag
- process death
- channel scroll loss

Do not create recovery churn in the middle of an active test unless the test is already burned.

### Scope-expanding directive mid-swim

If figs expands scope mid-swim:

- acknowledge it
- write it down
- decide whether it is for now or post-swim

Do not silently convert the whole swim into a different project.

### Live P0

If a genuine P0 appears:

1. stop the current sequence cleanly
2. capture full evidence
3. write minimal reproduction
4. tag it in the findings tracker
5. decide whether the remaining swim can continue without invalidating results

## Lessons Worth Keeping

- dedicated coordinator role is real work, not ceremonial work
- one variable per test prevents hours of fake ambiguity
- "decided, move on" is coordination, not rudeness
- config verification before deploy is non-optional
- lag and scroll loss can look like disagreement when they are just transport noise
