# output: 129388-final-modeb-classify

**Verdict: `candidate-attributable: 2`** (CA-A, CA-B), both in the test lanes. Static gates have no
candidate-attributable row.

- The prior CA-1..CA-4 and S-1 are all green in this run. None recurs.
- CI path: Mode-B **44871298969**, no new dispatch. The receipt is valid.

## Named refs

| category       | ref                                                      | full SHA                                     | equality                                                                                                 |
| -------------- | -------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| product / base | karmaterminal/openclaw final candidate                   | `93a1e356c7aabf0d868560e46790b07449813840`   | server `codeagent/129388-lineage-t1` = this SHA; control worktree `cand-93a1e356` HEAD = this SHA        |
| baseline       | absorbed upstream, openclaw/openclaw main                | `1129d4c0716c7dcc6fba86753ec214584ec8ebd1`   | ancestor of the candidate (stage-3 merge `bd1e7f12d6`); control worktree `base-1129d4c0` HEAD = this SHA |
| lane           | `codeagent/129388-final-modeb-classify`                  | the final pushed SHA (see the COMPLETE post) | local = tracking = server at each push                                                                   |
| CI / workflow  | karmaterminal/openclaw-bootstrap, run 44871298969        | `105e83abf9c3d328695e022779d75cb556fdc275`   | equals the run's `headSha` and the aggregate's `workflow_sha` (validator)                                |
| presentation   | #129388 presents `9bfc4d31`                              | N/A                                          | only 🌊 moves it; untouched                                                                              |
| docs / proof   | this file + `lane-evidence/129388-final-modeb-classify/` | at the lane SHA                              | pushed                                                                                                   |

The lane diff against the candidate touches only `lane-evidence/`. No product file changed.
`pnpm-lock.yaml` is the same blob (`cd804aaf`) at both refs.

## Verdict

### CA-A: a second budget kick-state after the lazy lifecycle import

Full write-up: `ca/CA-A-disk-budget-physical-usage.md`.

- **Red:** `src/config/sessions/disk-budget.physical-usage.test.ts` › "physical session disk usage ›
  joins real SDK mutation maintenance before native fixture drainage" (compact-large-19).
  CI: `expected 2 to be 1` at `:295`.
- **Fork cause:** `68984b99d2` (ronan, 2026-09-17, "give the SQLite lifecycle owner a real lazy
  boundary"). It turns `src/config/sessions/session-accessor.lifecycle.ts`'s static re-export of
  `deleteSessionEntryLifecycle` into a lazy `import("./session-accessor.sqlite-lifecycle.js")`.
- **How it reds the test:** the file's earlier test calls `vi.resetModules()`; upstream added it in
  `d8eca04bb3` (#197801), already in 41bdde21. The lazy import first runs after that reset, so it
  builds a second `session-history-budget-state.ts`. The delete's forced kick then sees a fresh
  kick state (`running=false`) and starts a second scan while the upsert's scan is held.
- **Proof:**
  - 1129d4c0: PASS 2/2. Candidate: RED 2/2, with CI's assertion.
  - 41bdde21 PASS; `ddd0ec7a7a`, `9476c7aa`, `dc11bf4d80` and `bd1e7f12d6` RED.
  - Revert of that one file at the candidate: PASS 2/2.
  - At the candidate, the test alone: PASS 2/2. The reset test plus this test: RED. The same pair at
    1129d4c0: PASS.
  - Instrumented probe: two module instances (`6sndo5`, `oid5pz`) with the same URL and key.
- **Graph:** `openclaw-absorb51ff-4b9f10dd@4b9f10dd11`, FRESH-FOR-SCOPE (`gitnexus/lifecycle-facade-1hop.md`).
- **Product effect:** none expected; reasoned, not measured. One Node process has one module registry.
- **Why it is new:** it was hidden at 9476c7aa. That run's CA-3 shards did not run the storage-state
  sources, and 9476c7aa reproduces the red locally.

### CA-B: the reopened Gateway's first request re-registers agent `main` mid-discovery

Full write-up: `ca/CA-B-visitor-access-reopen.md`.

- **Red:** `src/gateway/server-methods/agent.visitor-access.test.ts` › "visitor access admitted
  caller › reopens existing profiles and grants and repairs a missing Visitor model policy"
  (compact-large-2, one of the six formerly unrun shards). CI: `SessionMutationFactsUnavailableError`
  ← `AgentDatabaseRegistryChangedError`.
- **Proof:**
  - 1129d4c0: PASS 2/2. Candidate: RED 2/2, with CI's error chain.
  - Order-dependent: the test passes alone at the candidate, and fails after any one of the 4
    preceding `it.each` cases. The same pair passes at 1129d4c0.
  - 41bdde21 PASS, `bc7e568a54` PASS, `ddd0ec7a7a` RED: a merge interaction. The upstream half is
    #201736 (`03115b5ed6`), which makes the preceding renewal cases complete.
- **Mechanism (instrumented):** the reopened Gateway's first `tools.invoke` re-registers agent `main`
  (same identity, schema 44). That happens inside `prepareSessionMutationFacts`, after its registry
  witness was taken. Every file on that chain is unchanged by the fork.
- **Fork file: not isolated.** Each of these, reverted at the candidate, stays RED:
  - the lazy lifecycle facade;
  - `openclaw-state-db-contract.ts`;
  - the 25-file compiler-args group.

  Broader reverts break the runtime pretest build. The next step (a buildable-group bisection) is
  written down in the CA file.

- **Product effect:** not ruled out. A same-process Gateway restart would be the production
  analogue, and that is unverified.

### Prior findings at 9476c7aa: all green now

| prior                                                               | where it shows in this run                                                         | status |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------ |
| CA-1 `session-entry-deletion`                                       | compact-large-6: 8 pass lines, 0 fail; local candidate PASS 8/8                    | green  |
| CA-2 `update-command-lease`, `check-extension-package-tsc-boundary` | compact-small-9 54/0, compact-small-12 12/0; local PASS 54/54, 12/12               | green  |
| CA-3 plugin-SDK DTS budget                                          | 0 shards with a `pretest-build` failure; all six runtime-pretest shards summarized | green  |
| CA-4 `agent-request-preflight`                                      | compact-large-24 33/0; local PASS 33/33                                            | green  |
| S-1 `RequesterMessage`                                              | absent from both deadcode reports (knip 6.40.0 at both refs)                       | green  |

Counts are in `receipt/prior-ca-tests-in-ci.tsv`.

## Receipt

|              |                                                                                 |
| ------------ | ------------------------------------------------------------------------------- |
| run          | https://github.com/karmaterminal/openclaw-bootstrap/actions/runs/44871298969    |
| product SHA  | `93a1e356c7aabf0d868560e46790b07449813840` (`-f ref`)                           |
| workflow SHA | `105e83abf9c3d328695e022779d75cb556fdc275` (the run's `headSha`)                |
| routing      | hosted lane on ARC `oc-8cpu-32gb`; `hosted_worker_pools` `["arc:oc-8cpu-32gb"]` |
| validator    | `mb-validate-0.2.13.sh`: **exit 0, valid** (`receipt/validate-0.2.13.out`)      |
| verdict      | **failure**                                                                     |

The validator confirmed:

- both SHAs;
- the compact plan's coverage proof;
- receipts 67 = routed jobs 67;
- no rented runner;
- the preflight line `[cost-guard] hosted lane on ARC scale set oc-8cpu-32gb; nothing rented.`

The run itself:

- **Failed jobs:** static-gates, test-shard-hosted-arc-early, test-shard-arc-early,
  test-shard-arc-dist.
- **Failures:** 87 deterministic, 0 flakes greened.
- **Tests:** 258,976 passed, 128 failed. The failed count includes confirm retries.
- **Routing:** 130 shards routed (compact plan of 180) in 67 batch jobs. 127 shards wrote a summary.

### Routed shards with no summary

| shard                      | lane              | reason (aggregate `missing_shards`, then the shard's own artifact) | coverage                                                                                                                                                                                                                                                                                      |
| -------------------------- | ----------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| compact-large-43           | hosted, batch 014 | `cancelled-in-flight` at 3108 s                                    | Attempt 1 completed all 8 sub-shards (`completion` 8/8, 1 failed invocation). The worker was SIGKILLed while running `server-http.event-loop-health.test.ts`. TEST_GATE read "died by signal" and retried; attempt 2 crashed in teardown after the batch SIGTERM. Attempt 1 covers the shard. |
| compact-small-3            | hosted, batch 014 | `never-started` (no results dir; the batch was cancelled)          | **No tests ran** for `agentic-commands-doctor-sessions-cron-sqlite` and `core-runtime-secrets`. This run is no evidence for them.                                                                                                                                                             |
| extension-database-workers | hosted, batch 022 | `cancelled-in-flight` at 5184 s (batch SIGTERM)                    | Partial. The in-flight log keeps 6,696 passes and 1 red (tlon, upstream-carried). The rest is unverified. At 9476c7aa this shard was also cancelled, at 5265 s.                                                                                                                               |

### The six shards that never ran before (CA-3 era)

All six have summaries now and ran tests (`receipt/runtime-pretest-shards.txt`):

| shard                | summary | tests                                                     |
| -------------------- | ------- | --------------------------------------------------------- |
| compact-large-2      | fail    | 1,786 passed, 2 failed (CA-B; queued-successor, upstream) |
| compact-large-3      | pass    | 3,373 passed                                              |
| compact-small-1      | pass    | 49 passed                                                 |
| compact-small-7      | pass    | 327 passed                                                |
| compact-small-dist-2 | fail    | 96 passed, 1 failed (tui-pty T05, environment)            |
| agentic-plugins      | fail    | 5,768 passed, 1 failed (plugin capture, environment)      |

## Failset

The failset is the union of:

- each `summary.json` `.failures[]`;
- the logs' `×` lines;
- a cancelled shard's in-flight `×` lines;
- file-level worker kills;
- suite-level summary rows;
- `FAILED (error:` crash lines.

It covers 89 failing test rows in 34 files (`failset/fs-final.*.tsv`, first errors in
`failset/first-errors.md`). That is a strict superset of the aggregate's `failed_details`: 87
entries in 32 files, plus tlon (in-flight) and event-loop-health (worker kill), both from shards
with no summary. One crash line, in compact-large-43 attempt 2, is the teardown after the batch
SIGTERM.

## How the controls ran

- **Worktrees.** `base-1129d4c0` and `cand-93a1e356` live under `/home/figs/classify-129388`,
  a 0700 chain with 0644 checkouts. Both hard-link `node_modules` from the lock-identical
  `WORKTREES/openclaw-129388-lineage-t1` (HEAD = the candidate). No pnpm ran.
- **Each focused run** uses `tools/ctl.sh`:
  - `oc-focused`: openclaw's planner picks the config; `--maxWorkers=1`; umask 0022; `FORCE_COLOR`
    unset;
  - frond-scribe's live-gateway isolation wrapper;
  - Node v26.12.1, `OPENCLAW_VITEST_RUNTIME=node`, a private 0700 HOME and TMPDIR;
  - base and cand alternate.
- **Raw logs.** Every run keeps its full log in `controls/`, indexed by `controls/summary.tsv`:
  176 rows (66 base, 78 cand, 30 probe, 2 probe-old).
- **One-variable environment controls,** each at both refs:

  | control                             | how                                           | rows it decides            |
  | ----------------------------------- | --------------------------------------------- | -------------------------- |
  | `CTL_ROOT_LEN=94`                   | bind-mount at CI's checkout path length (new) | vitest-worker-shutdown     |
  | `CTL_SHM_SIZE=64m`                  | 64 MiB `/dev/shm` (new)                       | plugin-generation-artifact |
  | `CTL_KEEP_BUS=1`                    | user bus visible (new)                        | retained-restart           |
  | `CTL_MASK_PROFILE_D=1`              | empty `/etc/profile.d`                        | shell-env                  |
  | `CTL_NO_ISO=1 CTL_HIDE_BIN=setfacl` | setfacl hidden, outside the userns            | permission-drift           |
  | `CI=true`                           | `requirePinnedBun` returns bare `bun`         | the three bun rows         |
  | 30 KiB env pad                      | env block past 30 KiB                         | doctor reuse               |
  | `PLAYWRIGHT_BROWSERS_PATH`          | Chromium reachable vs not                     | the four UI rows           |

- **Shard and order controls:**
  - `tools/ctlcfg.sh` replayed CI sub-shard `core-runtime-infra-storage-state-hosted-25` with CI's
    exact 64-file list;
  - `tools/ctl-t.sh` ran `-t` name filters for the order-dependence proofs.
- **Probes:**
  - `probe-final` sat at the candidate and the absorb, stage-2 and 41bdde21 refs, on the same lock;
  - `probe-old` sat at `bc7e568a54`, on lock `c0ae2058`, deps hard-linked from
    `WORKTREES/openclaw-129388-pure-bridge-strip`;
  - instrumented runs edited only the scratch probe, and `git checkout` restored it each time.

## Per-test classification

`classify-map.tsv` holds one row per failing test, and `classify-rules.tsv` holds the evidence
per file.

| class                  | files | test rows |
| ---------------------- | ----- | --------- |
| candidate-attributable | 2     | 2         |
| upstream-carried       | 15    | 38        |
| environment            | 16    | 47        |
| flake                  | 1     | 2         |

| test file (failing tests)                                               | shard                                  | class                                                                                                                                                 | evidence                                                     |
| ----------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/config/sessions/disk-budget.physical-usage.test.ts` (1)            | compact-large-19                       | **candidate-attributable (CA-A)**                                                                                                                     | `ca/CA-A-disk-budget-physical-usage.md`                      |
| `src/gateway/server-methods/agent.visitor-access.test.ts` (1)           | compact-large-2                        | **candidate-attributable (CA-B)**; fork file not isolated                                                                                             | `ca/CA-B-visitor-access-reopen.md`                           |
| `extensions/anthropic/session-catalog-transcript.test.ts` (2)           | extension-providers                    | upstream-carried                                                                                                                                      | `controls/*anthropic-session-catalog-transcript*.log`        |
| `extensions/browser/src/browser/chrome.headless-cleanup.test.ts` (4)    | extension-browser                      | upstream-carried                                                                                                                                      | `controls/*browser-src-browser-chrome-headless-cleanup*.log` |
| `extensions/tlon/src/monitor/index.test.ts` (1)                         | extension-database-workers (in-flight) | upstream-carried                                                                                                                                      | `controls/*tlon-src-monitor-index*.log`                      |
| `src/agents/embedded-agent-runner/compact.queued-successor.test.ts` (1) | compact-large-2                        | upstream-carried                                                                                                                                      | `controls/*compact-queued-successor*.log`                    |
| `src/agents/harness/mediated-delegation-effects.test.ts` (8)            | compact-large-39                       | upstream-carried                                                                                                                                      | `controls/*mediated-delegation-effects*.log`                 |
| `src/agents/openclaw-tools.workshop-authority.test.ts` (1)              | compact-large-10                       | upstream-carried                                                                                                                                      | `controls/*openclaw-tools-workshop-authority*.log`           |
| `src/agents/openclaw-tools.workshop-contract.test.ts` (1)               | compact-large-31                       | upstream-carried                                                                                                                                      | `controls/*openclaw-tools-workshop-contract*.log`            |
| `src/agents/subagents/registry/subagent-registry-worker.test.ts` (1)    | compact-large-6                        | upstream-carried                                                                                                                                      | `controls/*subagent-registry-worker*.log`                    |
| `src/auto-reply/reply/session-event-permissions.test.ts` (1)            | compact-large-15                       | upstream-carried                                                                                                                                      | `controls/*session-event-permissions*.log`                   |
| `src/gateway/mcp-http.completion-lineage.test.ts` (1)                   | compact-large-15                       | upstream-carried                                                                                                                                      | `controls/*mcp-http-completion-lineage*.log`                 |
| `src/gateway/mcp-http.loopback-real-recovery.test.ts` (1)               | compact-large-32                       | upstream-carried                                                                                                                                      | `controls/*mcp-http-loopback-real-recovery*.log`             |
| `src/infra/worker-task-pool.memory.test.ts` (1)                         | compact-large-34                       | upstream-carried                                                                                                                                      | `controls/*worker-task-pool-memory*.log`                     |
| `src/state/openclaw-database-preflight.artifacts.test.ts` (1)           | compact-large-27                       | upstream-carried                                                                                                                                      | `controls/*openclaw-database-preflight-artifacts*.log`       |
| `test/scripts-update-gateway-legacy.test.ts` (9)                        | compact-small-40                       | upstream-carried                                                                                                                                      | `controls/*scripts-update-gateway-legacy*.log`               |
| `test/scripts/check-line-cap-ratchet.test.ts` (5)                       | compact-small-40                       | upstream-carried                                                                                                                                      | `controls/*check-line-cap-ratchet*.log`                      |
| `test/scripts/vitest-worker-shutdown.test.ts` (25)                      | compact-small-30                       | environment: 94-char shard root makes the `NODE_OPTIONS` string exceed `MAX_ARG_STRLEN`, so `spawn E2BIG`                                             | `controls/e2big-probe.out`                                   |
| `src/cli/update-cli/update-command-retained-restart.test.ts` (5)        | compact-small-6                        | environment: no systemd user bus                                                                                                                      | `controls/*update-command-retained-restart*.log`             |
| `src/plugins/plugin-generation-artifact.native-reference.test.ts` (1)   | agentic-plugins                        | environment: 64 MiB `/dev/shm`                                                                                                                        | `controls/*plugin-generation-artifact*.log`                  |
| `src/infra/shell-env.test.ts` (1)                                       | compact-large-22                       | environment: `/etc/profile.d` exports no PATH                                                                                                         | `controls/*shell-env*.log`                                   |
| `src/infra/package-update-permission-drift.test.ts` (1)                 | compact-large-35                       | environment: no setfacl                                                                                                                               | `controls/*package-update-permission-drift*.log`             |
| `src/infra/update-retained-runtime-imports.process.test.ts` (1)         | compact-large-35                       | environment: `CI=true`, no bun                                                                                                                        | `controls/*update-retained-runtime-imports-process*.log`     |
| `test/scripts/bun-standalone-codegen.test.ts` (3)                       | compact-small-36                       | environment: `CI=true`, no bun                                                                                                                        | `controls/*bun-standalone-codegen*.log`                      |
| `src/agents/worktrees/filesystem-native.test.ts` (1)                    | compact-large-4                        | environment: `CI=true`, no bun                                                                                                                        | `controls/*filesystem-native*.log`                           |
| `src/commands/doctor-session-transcript-labels.reuse.test.ts` (1)       | compact-large-35                       | environment: env block over 30 KiB                                                                                                                    | `controls/*doctor-session-transcript-labels-reuse*.log`      |
| `ui/src/styles/background-invalidation.node.test.ts` (suite)            | compact-large-31                       | environment: no Chromium                                                                                                                              | `controls/*background-invalidation*.log`                     |
| `ui/src/styles/incognito-shade.browser.test.ts` (suite)                 | compact-large-31                       | environment: no Chromium                                                                                                                              | `controls/*incognito-shade*.log`                             |
| `ui/src/styles/session-row-tint.node.test.ts` (suite)                   | compact-large-25                       | environment: no Chromium                                                                                                                              | `controls/*session-row-tint*.log`                            |
| `ui/src/test-helpers/new-session-page-opener.node.test.ts` (1)          | compact-large-25                       | environment: no Chromium                                                                                                                              | `controls/*new-session-page-opener*.log`                     |
| `src/gateway/server-http.event-loop-health.test.ts` (file)              | compact-large-43                       | environment: worker SIGKILL in the pod (memory.max 32 GiB, 4 workers); trigger not proven. Green at both x2                                           | `controls/*server-http-event-loop-health*.log`               |
| `test/helpers/openclaw-test-instance.test.ts` (2)                       | compact-small-33                       | environment, trigger not reproduced (green at both x2)                                                                                                | `controls/*openclaw-test-instance*.log`                      |
| `src/tui/tui-pty-local.e2e.test.ts` (1)                                 | compact-small-dist-2                   | environment (dist lane), trigger not reproduced. T05 passes at both; the local-only reds are identical at both                                        | `controls/*tui-tui-pty-local-e2e*.log`                       |
| `src/sessions/user-turn-transcript.recorder.test.ts` (2)                | compact-large-18                       | flake: a fork-added test, red only in CI. Passes at the candidate alone x2 and in CI's exact sub-shard replay (1 worker, 901 tests); CI ran 4 workers | `controls/*user-turn-transcript-recorder*.log`               |

**New trigger found:** vitest-worker-shutdown was "trigger not reproduced" at 9476c7aa. It is the
94-character checkout root:

- the prepared-module map in the wrapper child's `NODE_OPTIONS` is 140,087 B at 1129d4c0 and
  140,411 B at the candidate;
- Linux refuses one exec string longer than 131,072 B, so `spawn E2BIG`;
- `tools/e2big-probe.mts` computes it with the repository's own closure code;
- a bind mount at a 94-character path reproduces CI's 25 reds at both refs x2.

## Static gates

The static-gates job (`136746432419`, runner elliott) ran 41 checks: 38 passed and 3 failed.

Every ratchet ran with `--base 7ce2d10eced5f379e31a0b01a96fbcbf9741ccbe`, which is
karmaterminal/openclaw `main`, not the absorbed upstream. The job log is
`static/static-gates-job-136746432419.log`.

| row                                                                        | finding                                                                                                                                                                                | upstream status                                                                                                                                                      | class                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| check-dependencies › `deadcode:dependencies`                               | `Unused exports (1)`: `ui/src/lib/settings-navigation.ts: settingsParentRoute`                                                                                                         | knip 6.40.0 at 1129d4c0: **the same finding**, rc 1 (`static/knip-base-dep-prod.log`); no fork change under `ui/`                                                    | upstream-carried                                            |
| check-dependencies › `deadcode:exports`                                    | full-tree: `settingsParentRoute` + `installSpawnThreadBindingFixture`, `installSpawnAttachmentFixture` (`subagent-spawn.authority.test-support.ts`); production: `settingsParentRoute` | knip at 1129d4c0: **identical lists** for full-tree and production; the script scan passes at both (`static/knip-summary.tsv`)                                       | upstream-carried                                            |
| baseline-ratchets › row                                                    | **timed out** at 1,200 s (SIGTERM); `test-lines` was killed at 397 s, so CI has no test-lines verdict                                                                                  | see below                                                                                                                                                            | environment (CI checkout)                                   |
| baseline-ratchets › `session-identity`                                     | 31 files over the per-file allowlist (identical to the local candidate run)                                                                                                            | 1129d4c0 vs `7ce2d10e`: **OK**. Candidate vs `7ce2d10e` and vs 1129d4c0: the same 31 files                                                                           | **🌊's standing ruling: upstream attribution**              |
| baseline-ratchets › `test-lines` (killed in CI)                            | none in CI                                                                                                                                                                             | local: 1129d4c0 vs `7ce2d10e` **FAIL, 36,904 over**; candidate vs `7ce2d10e` FAIL, 37,023 over; candidate vs 1129d4c0 **OK** (+114,262 against 114,143 credit + 400) | upstream-carried: upstream's growth past the fork-main base |
| (test lane) `ci-node-test-plan` / `-hosted-tail` compact capacity, 78 > 77 | ran and **passed**: 175 and 3 pass lines                                                                                                                                               | per the workorder, no longer red at 1129d4c0                                                                                                                         | green; nothing for 🌊's pin                                 |

**The row timeout.**

- **Blobless checkout.** The static job checks out the product with
  `openclaw-local-ci-checkout-target.sh --with-merge-base-history`, which is `--filter=blob:none`
  (`static/bootstrap-105e83ab-openclaw-local-ci-checkout-target.sh`). So every blob of the
  comparison base `7ce2d10e` comes lazily from the promisor.
- **One shared fetch.** The worker ratchet's `base.sources` phase took 665 s in CI and about 2 s
  locally at either ref. The dialect ratchet finished 3 s after that phase ended (06:06:16 →
  06:06:19), so both were waiting on the same fetch. That fetch is the base's blobs, the same at
  any head; it took 435 s at 9476c7aa's run.
- **Equal local times.** Locally the ratchets take equal time at both refs:
  - dialect 11 s and 11 s;
  - worker 142 s and 143 s;
  - test-lines 1 s and 2 s.
- **Verdicts.** Every ratchet that finished in CI matches its local verdict.

Logs: `static/ratchets-*.log`, `static/ratchets-summary.tsv`.

## Gaps and uncertainties

- **CA-B's fork file is not isolated.** See its CA file for what is ruled out and the next step.
  Its product effect is not ruled out.
- **compact-small-3 never started.** Its sources (`agentic-commands-doctor-sessions-cron-sqlite`,
  `core-runtime-secrets`) are unverified by this run.
- **extension-database-workers is partial.** The shard was cancelled, again.
- **Three environment rows have no reproduced trigger:** `openclaw-test-instance`, `tui-pty T05`
  and `event-loop-health`. The recorder flake's 4-worker condition is also unexamined; controls stay
  at 1 worker by rule.
- **GitNexus:**
  - Tool: fork CLI 1.6.5 via `gnx`; index `openclaw-absorb51ff-4b9f10dd@4b9f10dd11`.
  - Verdicts: FRESH-FOR-SCOPE for CA-A's scope, STALE for CA-B's chain, where graph answers are
    leads only, each byte-verified.
  - No fresh index exists for the candidate. A refresh build takes hours and was not run.
- **Knip ran outside pnpm.** It ran from ronan's cached `knip@6.40.0` with Node directly, because the
  workorder forbids pnpm in worktrees. The version was proven (`knip --version` = 6.40.0).
- **One accidental no-op base run.** `controls/base-node26121+CTL_DUMMY-…-run1.log` passed an empty
  env var. It is kept, and it is green.
- **One orphan run.** The candidate `update-command-lease` run lost its summary row when the outer
  timeout fired. Its log carries the verdict, PASS 54/54, and the row is marked `orphan`.

## Exact commands

```bash
# receipt
GH_CONFIG_DIR=~/.config/gh-karmafeast ~/.local/state/frond-scribe/tools/mb-validate-0.2.13.sh \
  93a1e356c7aabf0d868560e46790b07449813840 105e83abf9c3d328695e022779d75cb556fdc275 44871298969
# artifacts (read-only token), failset and first errors
tools/fetch-new.sh
python3 -I tools/failset.py <dl>/batches failset/fs-final
python3 -I tools/firsterr.py <dl>/batches failset/first-errors.md 24
python3 -I tools/classify-map.py failset/fs-final.tests.tsv classify-rules.tsv classify-map.tsv
# paired and one-variable controls
tools/pairs.sh <runs> <budget-s> <file>...
tools/ctl.sh base|cand|probe|probeold <file> <run> [KEY=VALUE ...]
CTL_ROOT_LEN=94 tools/ctl.sh base test/scripts/vitest-worker-shutdown.test.ts 1
CTL_SHM_SIZE=64m tools/ctl.sh cand src/plugins/plugin-generation-artifact.native-reference.test.ts 1
CTL_KEEP_BUS=1 tools/ctl.sh base src/cli/update-cli/update-command-retained-restart.test.ts 1
tools/ctl-t.sh cand test/vitest/vitest.infra.config.ts src/config/sessions/disk-budget.physical-usage.test.ts 1 '<pattern>'
CTLCFG_TIMEOUT=3300 tools/ctlcfg.sh probe test/vitest/vitest.infra.config.ts subshard-hosted25-cand-1 \
  OPENCLAW_VITEST_INCLUDE_FILE=$PWD/controls/subshard-core-runtime-infra-storage-state-hosted-25.include.json
tools/revert-bisect.sh <list> <tag>
# E2BIG size, at each ref
node --import <wt>/scripts/tsx.mjs tools/e2big-probe.mts <wt> <source-root> <prepared-root>
# static
tools/knip.sh base|cand dep-prod|dep-exports|exp-prod|exp-full|exp-script
tools/ratchet-series.sh
# graph
gnx pick 93a1e356c7aabf0d868560e46790b07449813840 -- <paths>
GITNEXUS_HOME=~/.cache/gnx-home/129388-final-classify gnx cli cypher -r openclaw-absorb51ff-4b9f10dd "<query>"
```
