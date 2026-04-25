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

## §2 byte-walk: the three confirmed instances

All byte-checks performed against base `cbcfdf62c7297bda66009ea7476f053c3e9addab` (v2026.4.24) using the worktree at `/tmp/oc-swim37-traps`. `git cherry cbcfdf62 140f74956d` returns `+` for all three — the cherry-floor signal that hides the trap.

### Instance 1: `7ee46a3ab9 fix: Add runner label to /status (#70595)`

Discovery channel: **CHANGELOG-byte-grep** (cleanest signal).

```
$ git show cbcfdf62:CHANGELOG.md | grep -n '70595'
164:- Status: add an explicit `Runner:` field to `/status` so sessions now report whether they are running on embedded Pi, a CLI-backed provider, or an ACP harness agent/backend such as `codex (acp/acpx)` or `gemini (acp/acpx)`. (#70595) Thanks @Takhoffman.
```

The PR landed in base. The commit on the rebase-source is the cherry-pick from `03477ccb82e03367a7ca4d3eda20b0d13438e6ff`, and base then evolved the implementation through five additional commits:

```
$ git log --oneline cbcfdf62 -- src/status/status-message.ts | head -6
aa27e27f36 fix(models): normalize provider runtime selection (#71259)
62a0cd8acd test: slim status fast-mode label coverage
1713839288 fix: pin embedded harness selection per session
03477ccb82 fix: Add runner label to /status (#70595)   ← original
8714badc0c fix: show fast mode in status
80ab02d8be perf(test): narrow status message runtime
```

Base implementation has stricter surface than the picked commit:
- `resolveExecutionLabel` (lines 156–) and `resolveAgentRuntimeLabel` (lines 208–) lookup tables, vs. the picked commit's inline string switching.
- Output uses two fields: `Execution: <label>` + `Runtime: <label>` (lines 761–762), vs. the single `Runner:` field in the picked commit.
- Per-session `agentRuntimeOverride` honoured (line 223), absent in the picked commit.

**Verdict:** DROP. PICK regresses `Execution`/`Runtime` to `Runner` and drops the override-honouring path.

### Instance 2: `e515ea1f31 test(gateway): harden live docker harness probes`

Discovery channel: **conflict-content classification rubric** (test-harness divergence; CHANGELOG silent because hardening commits don't get release-notes).

Picked commit touches:
- `src/gateway/gateway-acp-bind.live.test.ts`
- `src/gateway/gateway-codex-harness.live-helpers.test.ts`
- `src/gateway/gateway-codex-harness.live-helpers.ts`
- `src/gateway/gateway-codex-harness.live.test.ts`

Base has its own evolution chain on `gateway-codex-harness.live-helpers.ts` — five later commits past the equivalent:

```
$ git log --oneline cbcfdf62 -- src/gateway/gateway-codex-harness.live-helpers.ts | head -7
0168ca667d fix(agents): keep heartbeat prompt out of non-heartbeat runs
b2840b93c8 test(gateway): harden codex live harness
e0d3256311 test(codex): cover app-server Docker flows
feecc53b6b test: stabilize codex harness probes
47f131f6ae test(gateway): harden live docker harness probes   ← parallel commit, base side
be81fa4424 test: stabilize live docker probes
```

Note `47f131f6ae` has the **same subject line** as the picked `e515ea1f31`. Different patch-id (subject text identical, content evolved), so cherry says `+`, but functionally it is the same hardening, and base has four further evolutions on top.

**Verdict:** DROP. PICK regresses to a snapshot of the harness pre-`be81fa4424`/`feecc53b6b`/`b2840b93c8`/`e0d3256311`/`0168ca667d`.

### Instance 3: `aa1908bf38 test: harden docker live backend probes`

Discovery channel: **conflict-content classification rubric** (test-harness divergence; commit message itself reads `(cherry picked from commit 9dd097a7a5...)` — proof the upstream-source is in base's history).

Base has the original commit + six further evolutions:

```
$ git log --oneline cbcfdf62 -- src/gateway/gateway-cli-backend.live.test.ts | head -8
835c4e053c test: stabilize Docker live service lanes
fcaf6a23dd test: retry Claude capacity failures in live backend
daed93dd30 test: harden live docker aggregate flakes
b7b66a6047 test: relax live cli backend wording
10202f9279 fix(codex): approve bundled MCP loopback tools
32a38f125e fix: keep codex cli images in workspace
9dd097a7a5 test: harden docker live backend probes   ← original (cherry-pick source)
d8935ca838 perf: keep gateway live probes off helper imports
```

Base implementation also adds `requestWithProviderCapacityRetry`, a wrapper not present in the picked commit:

```
$ git grep -n requestWithProviderCapacityRetry cbcfdf62 -- src/gateway/
cbcfdf62...:src/gateway/gateway-cli-backend.live.test.ts:86:async function requestWithProviderCapacityRetry<T>(
```

**Verdict:** DROP. The cherry-pick source IS in base; PICK would regress past `fcaf6a23dd`'s capacity-retry wiring.

### Cross-cut: secondary discovery via cherry-pick provenance

Instances 2 and 3 carry `(cherry picked from commit <sha>)` markers in their commit bodies. A second discovery channel falls out: **cherry-pick provenance grep** —

```bash
for sha in $(git log --format=%H <merge-base>..<rebase-source>); do
  src=$(git show -s --format=%B "$sha" | sed -n 's/^.*cherry picked from commit \([0-9a-f]*\).*$/\1/p')
  [ -n "$src" ] && git merge-base --is-ancestor "$src" <base> 2>/dev/null && echo "DROP $sha (source $src already in base)"
done
```

Would have caught `aa1908bf38` deterministically before the conflict triage step. Adds to §5's `tools/rebase-classify.sh` proposal.

## §3a sibling trap: integration-boundary type-shape drift (frond-scribe receipt)

**Discovered by**: frond-scribe parallel rebase candidates #327 (claude lane) and #328 (gpt lane), both reaching `pnpm tsgo` failure on identical `cbcfdf62` base, 2026-04-25. Strong cross-validation (two independent dispatchers, same shape).

### What it is

Distinct from the parallel-evolution trap-class above. After a clean mechanical rebase of a feature lineage onto a new release base, individual files compile, but `pnpm tsgo` fails at *integration boundaries* — type signatures the feature edits expect have shifted in dependency packages or in shared shape-files between the merge-base and the new base.

**Mechanism**: the conflict resolver only sees the files that conflict. Files that *didn't* conflict but reference shifted upstream type-shapes pass the merge silently and break at type-check.

### Byte-pinned receipts (#327 + #328 §6 gates)

Both lanes reproduced the same first-error surface on `pnpm tsgo`:

- `src/agents/openai-transport-stream.ts` — `compat` inferred as `{}` after upstream `@mariozechner/pi-ai` exports drift. Missing fields: `supportsStore`, `supportsReasoningEffort`, `supportsDeveloperRole`, `maxTokensField`, `supportsStrictMode`, `visibleReasoningDetailTypes`.
- `src/config/types.models.ts` — `AnthropicMessagesCompat` no longer exported from `pi-ai`; OpenAI compat key picks reference `supportsLongCacheRetention` / session-affinity keys missing from current upstream type surface.
- `src/commands/onboard-custom-config.ts`, `src/config/zod-schema.core.ts`, `src/plugin-sdk/provider-catalog-shared.ts`, `src/plugin-sdk/provider-tools.ts` — `ModelCompatConfig` incompatibilities around `supportsLongCacheRetention` required/optional/missing.
- `src/media/qr-runtime.ts` — missing module declaration for `@vincentkoc/qrcode-tui` (dep removed from upstream lockfile between v22 and v24).

26 errors across 7 files, all in *non-conflicted* file paths.

### Scope-honesty: what does NOT byte-pin

frond-scribe's #327 §6 also claimed upstream architectural rewrite of `agent-runner.ts` (−1200 net LOC) and `subagent-announce.ts` (−418 net LOC) as the underlying cause, with `--theirs` as the wrong heuristic.

Byte-check against actual narrow-scope diff (`c8aec6b9..cbcfdf62`, the merge-base→target window for the #325 lane):

```
$ git diff --stat c8aec6b9..cbcfdf62c7 -- src/agents/agent-runner.ts
(no output — 0 lines diff)

$ git diff --stat c8aec6b9..cbcfdf62c7 -- src/agents/subagent-announce.ts
 src/agents/subagent-announce.ts | 13 ++++++++-----
 1 file changed, 8 insertions(+), 5 deletions(-)
```

The "−1200 / −418 LOC architectural rewrite" framing does not match the bytes for these specific files in this rebase window. The framing may apply against a different (e.g. upstream-main) base, or may be measuring conflict-mass at replay-time of `198758e66b` (the continuation-feature commit, whose original PR base is much older than `c8aec6b9`) — in which case the "upstream rewrite" is actually "upstream-evolution-since-the-feature-PR-was-cut". Either is real, both are worth swim-37 fixtures, but they are different shapes than what the byte-pin shows.

### What the receipt does support

- **Real trap, narrower scope**: dep-shape drift in `pi-ai` and missing `@vincentkoc/qrcode-tui` + shape changes in `ModelCompatConfig` produce post-rebase type-check failures in non-conflicted files. Cross-validated by two independent dispatchers with identical first-error surface.
- **`--theirs` is insufficient as the only conflict heuristic**: it resolves visible conflicts but cannot anticipate type-shape drift in non-conflicted neighbors that consume shifted exports.
- **Build/type gate is the only catch**: `git cherry`, CHANGELOG-grep, and conflict-content rubric all pass clean. The trap surfaces only at `pnpm tsgo` time. `--theirs` heuristic combined with build-gate produces the right outcome (gate fails → no status flip), which is exactly what frond-scribe's workorder §7a enforces.

### Sibling trap-class headline (Ronan TC-014)

Alongside §1's parallel-evolution / cherry-false-negative trap-class:

- **trap A — classification-time** (§1, §2): `git cherry` says "not upstream" for commits that functionally are. PRE-merge, catchable by CHANGELOG-byte-grep + cherry-pick-provenance + conflict-content rubric.
- **trap B — integration-boundary** (§3a): mechanical rebase passes, individual files compile, type-check fails at non-conflicted neighbors that depend on drifted upstream shapes. POST-merge, catchable only by build-gate. Not catchable by cherry, CHANGELOG-grep, or conflict-content rubric (the breaking files don't conflict).

Together the two cover the swim-37 surface: the file *was already there* trap (A) and the file *integrates with shifted neighbors* trap (B).

### Open: my own #325 lane status vs trap B

My lane's pick-list does not yet exercise trap B (the dep-shape-drift surface is in non-feature files; my drops were all parallel-evolution, trap A). When my lane completes I expect either:

- (i) same `pnpm tsgo` failure on identical surface — trap B confirmed at n=3 (claude/gpt/cael), promotes to fixture-class;
- (ii) lane completes clean — interesting divergence, requires byte-walk of why this lane avoided what frond-scribe's two lanes hit.

Either outcome is publishable evidence. Will append to §3a when reached.

## §3 outline (next bytes)

False-positive analysis for CHANGELOG-byte-grep:
- subject-line collisions across unrelated PRs
- CHANGELOG entries that mention but do not implement (e.g. "deprecated…")
- multi-PR features where one part landed and another didn't
- expected mitigations: pair with cherry-pick-provenance grep + base-evolution chain check before auto-DROP.

§4: trap-design recipe (synthetic fixture commits + expected agent output table).
§5: `tools/rebase-classify.sh` spec.

§8 declare-done when §3–§5 land.

---

**Journal:** committed+pushed each checkpoint. No force-push. Issue #331 is the public mirror.
