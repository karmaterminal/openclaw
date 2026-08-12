# WO-1217 — post-8318 upstream drift phase — lane output

**Lane:** `wo1217-post8318-drift-37b4-gates`
**Candidate branch:** `codeagent/wo1217-post8318-drift-37b4-gates`
**Candidate SHA:** `985eb4628ff33501e4e28439916ac559b3fb9277`
**Base (canonical assembly, unmoved):** `8318e58bd22186ffd4bd317ccb05b8592570ad57`
**Upstream merged (at-dispatch, re-resolved):** `282e6a47ae6f9fa45251960d52382ba1cd65dbcd`
**Draft tracking PR:** <https://github.com/karmaterminal/openclaw/pull/1250> (draft, base `scribe/20260709/1172-status-row-assembly`, **not merged**)

Drift phase only. No merge-readiness claim, no proof completion claim, Gate 4 /
4.5 / 5 / 6 explicitly not claimed. Canonical assembly and protected
presentation were not moved.

---

## What changed

### 1. The back-merge

`git merge --no-ff upstream/main` under `-c merge.conflictstyle=zdiff3`. No
rebase, no squash, no force-push. Real two-parent merge commit `7076c7716ad`,
absorbing 192 upstream commits from merge base `ff73a14f5ae`.

Upstream had advanced 6 commits past the workorder snapshot
(`37b4fc8621d` → `282e6a47ae6`, verified a clean descendant). Per the GATES
runbook re-baseline canon the at-dispatch ref is authoritative, so the merge took
`282e6a47ae6`. Recorded as an intentional deviation from the lane slug.

70 conflicts, exactly as the pre-merge `merge-tree` probe predicted: 65 generated
plugin-SDK baselines + 5 semantic owners.

### 2. The five semantic resolutions

| File | Resolution |
|---|---|
| `src/state/openclaw-state-db-contract.ts` | Union: kept 5 `delegate_artifact_*` tables + 5 indexes, added upstream's `execution_decision_facts` + 2 indexes. Consumers verified to treat these as membership sets. **No schema-version bump.** |
| `src/config/sessions/types.ts` | Relocation-aware. Fork moved the merge helpers to `session-entry-runtime.ts`, so upstream's block is stale here. Took ours — **and ported upstream `b080dd1e765` into the relocated copy**, which a plain "take ours" would have silently reverted. |
| `src/plugins/git-install.ts` | Kept upstream's deferred install transaction **and** the fork's cross-device atomicity guard, one replacement mechanism per branch. |
| `src/auto-reply/reply/get-reply.ts` | Import union; both symbols verified used. Upstream's 144-line media composition retained. |
| `src/audit/audit-event-writer.test.ts` | Took upstream wholesale — the fork's whole delta was a retry around a test upstream deleted. Now byte-identical to upstream. |

### 3. Generated baselines

Not hand-composed. Seeded from upstream, regenerated from merged source with
`pnpm plugin-sdk:api:gen`, verified with `pnpm plugin-sdk:api:check` (exit 0).
98 records; each is one `sha256` over the entrypoint export surface.

### 4. Two repairs found by Gate 3

| Commit | File | Class |
|---|---|---|
| `92cbacb74ce` | `src/talk/agent-consult-runtime.test.ts` | **inherited** — mock used session-accessor *core* names instead of runtime *facade* keys; 12/14 tests threw. Now byte-identical to upstream, 14/14 green. |
| `985eb4628ff` | `src/state/openclaw-state-db-operator-approval-migration.test.ts` | **merge-introduced** — fork-owned exact index-list assertion vs upstream #119815's new `idx_operator_approvals_source_run_resolved`. 7/7 green. |

---

## Validation

### Gate 1 — savegames (GREEN)

Pushed and `ls-remote`-verified **before any motion**:

- `savegame/20260812-1530Z/wo1217-assembly-8318e58b-pre-drift` → `8318e58bd22186ffd4bd317ccb05b8592570ad57`
- `savegame/20260812-1530Z/wo1217-presentation-2b07ba50-pre-drift` → `2b07ba509564bd8a8f1031bf58dd107c1a24c78f`

### Gate 2 — feature bytes (0 FAIL, both comparisons)

| Comparison | invariants | FAIL | PASS-UPSTREAM | tombstone |
|---|---:|---:|---:|---:|
| assembly → candidate | 34 | **0** | 3 | 2 |
| presentation → candidate | 34 | **0** | 4 | 2 |

Both exit 2 **setup-class only**, from one stale cores-list entry (see gaps).

### Gate 2.5 — semantic walk (GREEN)

596 upstream-changed test files in the window; 584 present; **25 byte-diverge**
(the candidate set); the 12 absent verified individually as upstream deletions.
All 25 run on the candidate: **14 shards, 2,259 tests, 0 failures.**

### Gate 2.7 — upstream preservation (exit 0, FROZEN-STALE = 0)

| Class | before | after |
|---|---:|---:|
| files examined | 899 | 934 |
| GENUINE | 257 | 293 |
| MIXED-CLOBBER | 366 | **362** |
| SAFE-NEW | 276 | 279 |
| **FROZEN-STALE** | **0** | **0** |

**0 entries regressed; 20 improved; 285 dropped upstream lines recovered.**
Top-5 remaining MIXED entries have **zero** upstream commits in the drift window
and identical before/after counts — this cycle could not have clobbered them.

### Shape/fluff gate — +35, explained as a repair

33 regenerated baselines + 3 runbook-mandated evidence files, −1 file that
converged to upstream. Two controls settle it:

- `plugin-sdk:api:check` at **pure upstream** on this seat → **exit 0** (generator is content-derived, environment-independent).
- Same check at **unmodified assembly `8318e58bd22`** → **exit 1, "Modified: 33"**.

The assembly was already shipping a red static gate with exactly those 33 stale
records; the regeneration repairs it.

### Gate 3 — CI + local suite

Sanctioned workflow on the exact 40-char SHA. Final run: **`31623086818`** on
`985eb4628ff`.

Static gate is red on **one inherited guard**, classified by actual gate
execution on three baselines:

| Baseline | max-lines ratchet |
|---|---|
| upstream `282e6a47ae6` | **exit 0** (922 grandfathered) |
| assembly `8318e58bd22` unmodified | **exit 1**, same single file |
| candidate | **exit 1**, same |

Re-dispatched with the documented `continue_tests_after_static_failure=true` and
an audit reason; **the aggregate stays red** — sanctioned, not laundered.

`build:strict-smoke`, `protocol:gen`, `plugins:assets:build`, and
`lint:ui:no-raw-window-open` all **PASS**.

**Full-suite tally.** The final clean run is
`node --import tsx scripts/test-projects.mts` at `985eb4628ff` (log
`/tmp/wo1217-fullsuite3.log`). The authoritative failure inventory came from the
clean CI runner, which reported **8 failing files**, every one classified:

| File(s) | assembly | candidate | verdict |
|---|---|---|---|
| `src/talk/agent-consult-runtime.test.ts` | FAIL 12 | **fixed → 14/14** | inherited, repaired |
| `src/state/…operator-approval-migration.test.ts` | PASS | **fixed → 7/7** | **merge-introduced**, repaired |
| `extensions/imessage/…approval-reaction-poller.test.ts` | FAIL 4 | FAIL 4 | inherited |
| `extensions/codex/src/app-server/*` (4 files) | FAIL 6 | FAIL | inherited |
| `src/media/web-media.test.ts` | PASS | PASS locally (88/88) | environment-class (CI `EXDEV` cross-device hardlink) |

**Honest correction:** my *first* local full-suite run reported 53 failing files.
48 of 53 were bare `Test timed out`, plus a 13-minute `extension-discord` stall
and browser `ERR_FILE_NOT_FOUND` — self-inflicted contention from running 12–16
workers while the GitNexus indexer held a core at 6.7 GB RSS in the same
worktree. I discarded that run rather than classify noise, stopped the indexer,
and re-ran clean. Only the one failure with a real API-error signature was chased
out of that run, and it turned out to be a genuine inherited bug.

---

## Uncertainties and gaps (nothing worked around)

1. **`tools/feature-audit.sh` does not exist** in `openclaw-bootstrap` or
   `openclaw`, though the runbook and workorder both require it alongside
   Gate 2.7. It could not be run. Unmet requirement, not skipped silently.
2. **Stale primitive-cores entry.** `ui/src/lib/config/index.ts` resolves to 0
   files at presentation, assembly, candidate **and** upstream (it survives only
   at PR-creation `79d68e2c115`; the barrel was split into named modules). This
   alone makes both Gate 2 runs exit 2 despite 0 FAIL. The cores list is
   cohort-cosign-owned substrate, so it was **not** edited.
3. **GitNexus.** Exact-worktree index did not complete — 1h37m of pegged
   single-core CPU with no `.gitnexus` output, then stopped because it was
   degrading test-run quality. MCP tools are additionally blocked by an
   environment storage-version skew (server build v40 vs current indexes v42).
   `gitnexus detect-changes` could therefore **not** be run before commits.
   Compensated with direct source inspection (reading
   `src/infra/install-package-dir.ts` to settle the `git-install.ts` resolution)
   and a working v40-index cross-check that confirmed `replaceManagedGitRepo` has
   exactly one direct caller.
4. **Inherited reds left in place, deliberately.** The max-lines ratchet
   suppression, the 4 codex app-server prompt/tool-display drifts, and the
   imessage `accountId` drift all fail identically on the unmodified assembly.
   Fixing them is outside drift-phase scope; the ratchet in particular cannot be
   silenced because root `AGENTS.md` forbids adding a `max-lines` suppression or
   editing a baseline without approval.
   **Codex note:** no Codex code change or protocol verdict was made here. The
   root `AGENTS.md` hard gate requires personally inspecting sibling `../codex`
   before any Codex verdict; the sibling exists at `e363b08` but that inspection
   was not needed for pure execution-based classification and must be done by
   whoever repairs those tests.
5. **Named follow-up (Pathfinder).** `git-install.ts` could arguably collapse its
   immediate branch onto `installPackageDir` too, deleting the
   `stagedRepoIsTargetLocal` threading for one canonical flow and negative
   production LOC. Not done here: upstream deliberately keeps
   `replaceDirectoryAtomic` for the non-deferred case, so unifying would be a
   product change to a security-sensitive install path and fresh fork
   divergence.
6. **Method gap worth banking.** Gate 2.5 enumerates tests **upstream changed**
   and intersects with our surface. It structurally cannot see the reciprocal
   shape — a **fork-owned test whose subject upstream changed** — which is
   exactly how the `operator-approval-migration` failure slipped to Gate 3.

---

## Exact commands

```bash
# §0 rebaseline
git fetch upstream --prune
git merge-tree --write-tree --name-only HEAD upstream/main        # conflict probe, non-destructive
tools/drift-cure-gate.sh upstream/main HEAD 79d68e2c115e11683e1d08039e6b48a3143d2abe .gate-before

# Gate 1 savegames
git push origin 8318e58bd22186ffd4bd317ccb05b8592570ad57:refs/heads/savegame/20260812-1530Z/wo1217-assembly-8318e58b-pre-drift
git push origin 2b07ba509564bd8a8f1031bf58dd107c1a24c78f:refs/heads/savegame/20260812-1530Z/wo1217-presentation-2b07ba50-pre-drift
git ls-remote origin 'refs/heads/savegame/20260812-1530Z/*'

# back-merge
git -c merge.conflictstyle=zdiff3 merge --no-ff upstream/main

# generated baselines
git checkout upstream/main -- docs/.generated/plugin-sdk-api-baseline/
pnpm plugin-sdk:api:gen && pnpm plugin-sdk:api:check

# Gate 2 (both comparisons)
OPENCLAW_BOOTSTRAP=<bootstrap> $OPENCLAW_BOOTSTRAP/tools/feature-cores-byte-check.sh \
  8318e58bd22186ffd4bd317ccb05b8592570ad57 $(git rev-parse HEAD) \
  "$OPENCLAW_BOOTSTRAP/tools/drift-cure-gate.primitive-cores.txt" --upstream $(git rev-parse upstream/main)
OPENCLAW_BOOTSTRAP=<bootstrap> $OPENCLAW_BOOTSTRAP/tools/feature-cores-byte-check.sh \
  2b07ba509564bd8a8f1031bf58dd107c1a24c78f $(git rev-parse HEAD) \
  "$OPENCLAW_BOOTSTRAP/tools/drift-cure-gate.primitive-cores.txt" --upstream $(git rev-parse upstream/main)

# Gate 2.5 enumeration + run
git log ff73a14f5ae..282e6a47ae6 --name-only --pretty=format: \
  | grep -E '\.(test|spec|test-utils|test-support|test-harness|e2e-harness)\.[cm]?[jt]sx?$' | sort -u
node --import tsx scripts/test-projects.mts $(cat /tmp/wo1217-semantic-intersect.txt)

# Gate 2.7 after
tools/drift-cure-gate.sh upstream/main HEAD 79d68e2c115e11683e1d08039e6b48a3143d2abe .gate-after

# Gate 3
gh workflow run openclaw-local-ci.yml --repo karmaterminal/openclaw-bootstrap \
  -f ref=985eb4628ff33501e4e28439916ac559b3fb9277 \
  -f continue_tests_after_static_failure=true \
  -f static_failure_reason='<inherited ratchet receipt>'

# full local suite
node --import tsx scripts/test-projects.mts

# 3-baseline classification (control worktree)
git worktree add --detach /tmp/wo1217-upstream-control upstream/main
cd /tmp/wo1217-upstream-control && git checkout --detach 8318e58bd22186ffd4bd317ccb05b8592570ad57
node --import tsx scripts/check-max-lines-ratchet.mts
node --import tsx scripts/test-projects.mts <failing files>
```

Journal: `tmp-drop-me-claude.md`. Gate artifacts: `.gates-evidence/`.
