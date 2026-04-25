# swim-37 trap-class: parallel-evolution / cherry-false-negative

**Status:** §1 surface (in flow) — Cael 🩸, 2026-04-25
**Tracking:** karmaterminal/openclaw#331
**Base:** `cbcfdf62c7297bda66009ea7476f053c3e9addab` (v2026.4.24)
**Surfaced by:** #325 phase-2 rebase of `silas/rebase/v2026.4.22-feature` (`140f74956d`) onto v2026.4.24 → `flesh_beast_figs/20260424-claude`

## Headline

There exists a class of upstream commits that:

1. `git cherry` reports as **not yet upstream** (i.e. patch-id misses), so they appear in the rebase pick-list.
2. Are functionally already in base, either because:
   - (a) the upstream PR landed in base under a different patch-id (squashed, rebased, or applied via merge of a parallel branch), and base then evolved the implementation; OR
   - (b) base implemented the same feature independently (parallel evolution) with a stricter / richer surface.
3. When attempted as `pick`, conflict on real code in non-trivial files — looking exactly like a substantive feature collision.

Without a discovery channel, the rebase agent will either (i) burn cycles wedging a `--theirs` resolution that **regresses base**, or (ii) abort and flag for prince review on what looks like a genuine merge-conflict but is actually noise.

## Three confirmed instances (#325 phase-2)

| commit       | subject                                          | base equivalent                                                | discovery |
|--------------|--------------------------------------------------|-----------------------------------------------------------------|-----------|
| `e515ea1f31` | `test(gateway): harden live docker harness probes` | `f07b00de66` + `a53fea3905` + `5f702b464b` (richer probes)        | conflict-content classification |
| `aa1908bf38` | `test: harden docker live backend probes`          | overlapping with above; base has `requestWithProviderCapacityRetry`, MCP schema probe constants, null payload guards | conflict-content classification |
| `7ee46a3ab9` | `fix: Add runner label to /status (#70595)`        | PR #70595 already landed in base; base evolved naming (`Execution:`/`Runtime:`) + `resolveAgentRuntimeLabel` lookup | **CHANGELOG-byte-grep** |

## Discovery channels

### `git cherry` — false-negative (necessary but insufficient)

`git cherry <upstream> <branch>` lists branch commits whose patch-id is NOT in upstream. It catches verbatim-already-applied commits but misses:

- squash-merges that altered patch-id
- rebased re-applications
- parallel implementations that solve the same problem with a different patch
- any commit where the recorded subject/body diverges from the patch upstream actually carries

All three #325 instances slip through `cherry`. **Cherry is the floor, not the ceiling.**

### CHANGELOG-byte-grep — high-precision positive signal

Run during conflict triage:

```bash
git show <base>:CHANGELOG.md | grep -F "$(git log -1 --format='%s' <commit>)"
```

If a hit lands, the upstream PR is already in base; the conflict is parallel-evolution, not feature collision. Caught `7ee46a3ab9` cleanly: `#70595` entry was byte-identical (with attribution) in `cbcfdf62`.

Limitations: requires upstream to maintain CHANGELOG discipline (true for openclaw); subject-line collisions can produce false positives; CHANGELOG entries with non-PR subject lines are missed.

### Conflict-content classification rubric

When `cherry` says "not upstream" and CHANGELOG-grep is silent, inspect the conflict:

- **Feature/runtime conflict** → both sides ship divergent semantics on the same code path. STOP, flag for prince. (e.g. continuation-feature core).
- **Test-harness divergence** → both sides hardened the same test infrastructure (env vars, retry wrappers, probe ordering) but base has the strictly richer version. DROP. Heuristic: file paths under `*.live.test.ts`, `scripts/test-*.sh`, `e2e/`. (e.g. `e515ea1f31`, `aa1908bf38`).
- **Naming/label-only** → conflict is on string literals or display labels with equivalent or stricter base implementation. DROP. (e.g. `7ee46a3ab9`'s `Runtime:` vs `Execution:`).

The rubric needs a fourth bin: **release-plumbing** — version bumps, generated baselines, i18n regen — already explicitly `--theirs` per #325 conflict policy.

## Why this is swim-37 material

The trap is failure-of-classification at conflict time, not failure of the merge engine. A swim test that synthesizes:

- a synthetic upstream commit-pair where one is a squash-rebase of a parallel branch,
- a feature commit on the rebase-source whose subject line matches a CHANGELOG entry already in base,
- a test-harness commit with the parallel-evolution shape,

…then drives a bot through the rebase, will reproducibly catch any pick agent that mis-classifies. The expected output is **DROP+journal** for all three; PICK or `--theirs`-merge is the regression signal.

## Standing approval rules (in-flow on #325)

After three byte-confirmed instances I authorized the dispatched Claude session to auto-DROP without re-asking when:

- (a) CHANGELOG entry already exists in base for the commit's PR/subject,
- (b) `git cherry` says equivalent already there but file conflicts due to evolved implementation (visible in `git log --oneline <base-of-overlap>..<base>`),
- (c) the commit is pure release-prep / version-bump / changelog-only.

Anything else: STOP, journal, surface to Cael.

## §1 outline (next bytes)

§2: full byte-walk of each of the three instances (diff, CHANGELOG match, base evolution chain).
§3: false-positive analysis — when CHANGELOG-grep would fire on a commit that should still be picked.
§4: rubric → trap design recipe (synthetic commits, fixture rebase, expected vs failure output).
§5: tooling proposal — a `tools/rebase-classify.sh` that runs all three discovery channels and emits a triage table for the rebase pick-list.

§8 declare-done when §2–§5 land.

---

**Journal:** committed+pushed each checkpoint. No force-push. Issue #331 is the public mirror.
