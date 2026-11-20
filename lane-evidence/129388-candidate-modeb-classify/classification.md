# Mode-B 44733879344 at the #129388 pure candidate: classification

This is the classification of one Mode-B CI run against the #129388 pure candidate. It is a
read-only lane: nothing in the product changed and nothing was dispatched.

| | |
| --- | --- |
| lane | `codeagent/129388-candidate-modeb-classify`, bound to openclaw/openclaw#129388 |
| candidate | `9476c7aaf79f8dc86d0222d2b708524a37711418` |
| absorbed upstream | `41bdde2111dd7031c93b47c57d7dad2e56bb0f5f` |

## Verdict

**`candidate-attributable: 4`** red sources in the test lanes, plus **1 candidate-attributable static
row**. Each has a revert proof or a paired build receipt.

Those four sources cover:
- 6 failing tests in 4 files;
- the pretest-build gate, which left 6 shards with no tests run.

### CA-1: recipient-authority write before the prepared-owner reuse

- **Red:** `src/config/sessions/session-entry-deletion.test.ts` › "prepares retained-window
  references before BEGIN and rechecks writes (false)" (compact-large-13).
- **Fork cause:** `92c3cc5c2d` writes the recipient-authority row at the top of
  `deleteSessionEntryRows`. That happens before upstream #199563's prepared survivor-owner reuse is
  checked. The write moves the cache-validity token, so the survivor scan reruns inside the write
  transaction.
- **Proof:**
  - 41bdde21: PASS 2/2.
  - Candidate: RED 2/2, with CI's exact assertion.
  - Stage-2 merge `ddd0ec7a7a`: RED.
  - Drop the call, or move it after the owner read: PASS 8/8.

### CA-2: dist-artifact owner import escapes `scripts/`

- **Red:**
  - `src/cli/update-cli/update-command-lease.test.ts`: 3 tests, compact-small-9.
  - `test/scripts/check-extension-package-tsc-boundary.test.ts`: 1 test, compact-small-12.
- **Fork cause:** `8aeefacea8` imports `../../node-runtime-env.mjs` from
  `scripts/lib/dist-artifact-ownership.mts`. Both test fixtures build a temp root that holds only
  `scripts/`, so the import fails with `ERR_MODULE_NOT_FOUND`.
- **Proof:**
  - 41bdde21: PASS 2/2 for each file.
  - Candidate: RED 2/2 for each, with CI's exact error.
  - Restore only that one file at the candidate: PASS 54/54 and 12/12.

### CA-3: plugin-SDK declaration budget fails pretest-build

- **Red:** the pretest-build check `check-plugin-sdk-exports` fails with
  `PLUGIN SDK DTS TOO LARGE: 5409401 bytes exceeds 5385536`. **6 shards ran no tests.**
- **Fork cause:** the continuation public surface from `2273ef64d5`:
  - the `agents.defaults.continuation` config types and schema;
  - the continuation tracer exports in `src/plugin-sdk/diagnostic-runtime.ts`.

  Together they add 33,112 bytes. Upstream leaves 9,247 bytes of headroom.
- **Proof:** CI's `build-all.mts` exits 0 at 41bdde21 (5,376,289 bytes) and exits 1 at the
  candidate (5,409,401 bytes).

### CA-4: fork test fixture predates upstream #201845

- **Red:** `src/gateway/agent-turn/agent-request-preflight.test.ts` › "admits a continuation key
  from a backend caller as the run id verbatim" (compact-large-24).
- **Fork cause:** the fork test case (`bf74182db2`) builds a `backend` client with no `internal`
  flag. Upstream #201845 (`c73afb5c01`, inside 41bdde21) now requires `internal.syntheticClient` or
  `internal.localBackendClient` for that mode.
- **Proof:**
  - 41bdde21: PASS 2/2. The case does not exist there.
  - Candidate: RED 2/2, with CI's exact rejection.
  - Add that one fixture flag: PASS 32/32.

### S-1 (static): unused exported type

- **Red:** `deadcode:dependencies` and `deadcode:exports` both report `RequesterMessage` as an
  unused exported type.
- **Fork cause:** `6e1a925994` exports it from the fork-only
  `subagent-registry.restart-custody.test-support.ts`. No module imports it.
- **Proof:** the file is absent at 41bdde21. Knip was not run at either ref, because pnpm is not
  allowed in worktrees.

### Everything else

All other reds are upstream-carried or environmental. Upstream-carried means the same test fails
at 41bdde21 the same way. Environmental means CI's pods differ from a normal host.

| class | files | notes |
| --- | --- | --- |
| upstream-carried | 14 | includes the two 78 > 77 compact-capacity pins 🌊 has ruled on |
| environment | 14, plus 3 file-level UI suites | 6 files and the 3 UI suites reproduced by changing one environment input at both refs; 2 with a named pod or load trigger (bench-session-history, pr-cache-lifetime-collection); 6 red only in CI with no trigger found |

No red is a candidate-only flake.

## Receipt

| | |
| --- | --- |
| run | https://github.com/karmaterminal/openclaw-bootstrap/actions/runs/44733879344 |
| product SHA | `9476c7aaf79f8dc86d0222d2b708524a37711418` (karmaterminal/openclaw, `-f ref`) |
| workflow SHA | `5ffdcf67ee61d1d1f8ad0f65ec7f0a8da28ae3f1` (the run's `headSha`) |
| routing | `arc_scale_set=oc-8cpu-32gb,hosted_on_arc=true`, with the continue flag |
| validator | `mb-validate-0.2.13.sh`: **exit 0, valid** (`receipt/validate-0.2.13.out`) |
| verdict | **failure** |

The validator confirmed:
- the two SHAs match;
- `hosted_worker_pools` is `["arc:oc-8cpu-32gb"]`;
- the preflight log carries
  `[cost-guard] hosted lane on ARC scale set oc-8cpu-32gb; nothing rented.`

The run itself:
- **Failed jobs:** static-gates, test-shard-hosted-arc-early, test-shard-arc-early,
  test-shard-arc-dist.
- **Failures:** 104 deterministic, plus 0 flakes greened on retry.
- **Tests:** 247,396 passed, 152 failed. The failed count includes the confirm retries.
- **Routing:** 130 shards routed (a compact plan, 180 planned) in 67 batch jobs. 67 receipts were
  found, and 122 shards wrote a summary.

### Routed shards with no summary

The aggregate's `shard_coverage.missing_shards` lists 8 shards. The aggregate itself gives each
reason as `unknown`, so each reason below comes from that shard's own artifact:

| shard | lane | reason | effect |
| --- | --- | --- | --- |
| compact-small-1 | hosted | pretest-build: `PLUGIN SDK DTS TOO LARGE` (**CA-3**) | no tests: agentic-commands-runtime |
| compact-small-7 | hosted | pretest-build (**CA-3**) | no tests: agentic-cli-process, agentic-gateway-core-runtime, core-tooling-10 |
| agentic-plugins | hosted | pretest-build (**CA-3**) | no tests: agentic-plugins |
| compact-large-2 | self-hosted | pretest-build (**CA-3**) | no tests (10 source shards, listed under CA-3) |
| compact-large-3 | self-hosted | pretest-build (**CA-3**) | no tests (10 source shards, including **agentic-agents-support**) |
| compact-small-dist-2 | self-hosted-dist | pretest-build (**CA-3**) | no tests: core-runtime-tui-pty |
| compact-small-6 | hosted | `FATAL: corepack prepare failed`: corepack could not download `pnpm-12.15.0.tgz` from registry.npmjs.org (rc 4) | no tests: agentic-cli. Environment (network) |
| extension-database-workers | hosted | cancelled in flight at 5265 s (exit 143; `.vitest-resource-owner/owner` ENOENT at teardown) | partial: 8,785 output lines kept, with 1 red (tlon, upstream-carried below); the rest unverified |

## Failset

The failset is the union of three sources:
- each shard's `summary.json` `.failures[]`;
- the logs' `×` lines (`file > title` only);
- every `FAILED (error:` line.

It covers 101 tests plus 3 file-level suite failures, in 34 files (`failset/fs-final.*.tsv`). The
aggregate's `failed_details` names the same 34 files, and none of the logs has a `FAILED (error:`
line. One more red sits in the cancelled shard's in-flight log: `extensions/tlon/src/monitor/index.test.ts`.

## How the controls ran

**Worktrees.**
- `base-41bdde21` and `cand-9476c7aa` live under `/home/figs/classify-129388`, a 0755 directory
  chain with group-write dropped on the checked-out files. ronan's usual 0775 `source/` chain
  trips fs-safe guards.
- Both use hard-linked `node_modules` from `source/openclaw-129388-pure-stage2-deps` @ 41bdde21.
- `pnpm-lock.yaml` is identical at both refs (sha256 `2873a286…`).

**Each focused run** (`tools/ctl.sh`):
- `oc-focused`: openclaw's own planner picks the config; `--maxWorkers=1`; umask 0022;
  `FORCE_COLOR` unset.
- It runs inside frond-scribe's `run-isolated-from-live-gateways.sh`, which gives `/tmp/openclaw` a
  private tmpfs, because ronan is a live seat.
- It reproduces CI's facts: Node v26.12.1, `OPENCLAW_VITEST_RUNTIME=node` (ronan would otherwise
  run Bun), and a private 0700 HOME and TMPDIR.
- Runs alternate base, cand, base, cand.
- Every run keeps its full raw log in `controls/`, indexed by `controls/summary.tsv`: 151 runs
  (71 base, 71 cand, 9 probe).

**One-variable environment controls** change exactly one input, at both refs. The inputs tried:
- an empty `/etc/profile.d`;
- `setfacl` hidden from PATH;
- `CI=true` with no `bun` on PATH;
- a 30 KB env pad;
- Chromium unreachable (scratch HOME versus `PLAYWRIGHT_BROWSERS_PATH`);
- CPU starvation (busy loops sharing the test's core).

**Shard-context controls** (`tools/ctlcfg.sh`):
- the whole `vitest.cron.config.ts` at both refs;
- the CI sub-shard `agentic-gateway-methods-hosted-7`, replayed through its config with CI's
  82-file include list.

**Build controls** (`tools/ctlbuild.sh`): CI's pretest-build command
(`node --import ./scripts/tsx.mjs scripts/build-all.mts`) at both refs, in a scratch probe worktree.

## Per-test classification

`classify-map.tsv` carries every row with its full evidence paths.

| test file (failing tests) | shard | class | evidence |
| --- | --- | --- | --- |
| `src/config/sessions/session-entry-deletion.test.ts` (1) | compact-large-13 | **candidate-attributable (CA-1)** | base PASS 2/2, cand RED 2/2; revert A/B 8/8 |
| `src/cli/update-cli/update-command-lease.test.ts` (3) | compact-small-9 | **candidate-attributable (CA-2)** | base PASS 2/2, cand RED 2/2; revert C 54/54 |
| `test/scripts/check-extension-package-tsc-boundary.test.ts` (1) | compact-small-12 | **candidate-attributable (CA-2)** | base PASS 2/2, cand RED 2/2; revert C 12/12 |
| `src/gateway/agent-turn/agent-request-preflight.test.ts` (1) | compact-large-24 | **candidate-attributable (CA-4)** | base PASS 2/2, cand RED 2/2; fixture fix D 32/32 |
| `src/gateway/operator-approval-placement-grants.test.ts` (1) | compact-large-19 | upstream-carried | red at both ×2, same assertion (line 512) |
| `src/infra/worker-task-pool.memory.test.ts` (1) | compact-large-35 | upstream-carried | red at both ×2, with CI's exact value `71084839` |
| `src/gateway/server.plugin-reload-send-revocation.product.test.ts` (1) | compact-large-41 | upstream-carried | the same 120 s timeout at both |
| `src/gateway/server.config-record-keys.test.ts` (1) | compact-large-38 | upstream-carried | identical red at both, `gateway request timeout for config.apply` |
| `src/gateway/server.config-write-reread.test.ts` (1) | compact-large-38 | upstream-carried | identical red at both, the same timeout |
| `test/scripts/package-acceptance-workflow.test.ts` (4) | compact-small-14 | upstream-carried | the same 4 tests and errors at both; no fork diff in `.github/` |
| `test/scripts/check-line-cap-ratchet.test.ts` (5) | compact-small-40 | upstream-carried | identical 5 at both, `Different repository` |
| `test/scripts-update-gateway-legacy.test.ts` (9) | compact-small-40 | upstream-carried | identical 9 at both, `Source build and native settlement failed` |
| `extensions/anthropic/session-catalog-transcript.test.ts` (2) | extension-providers | upstream-carried | the same 2 at both (`truncated: true` missing) |
| `extensions/browser/src/browser/chrome.headless-cleanup.test.ts` (4) | extension-browser | upstream-carried | identical 4 at both, same assertion |
| `extensions/tlon/src/monitor/index.test.ts` (1) | extension-database-workers, in-flight | upstream-carried | the same test red at both |
| `src/state/openclaw-database-preflight.artifacts.test.ts` (1) | compact-large-27 | upstream-carried (flaky) | red 2/4 at **each** ref, CI's assertion |
| `test/scripts/ci-node-test-plan.test.ts` (1) | compact-small-21 | upstream-carried, ruled pin | `exceeds 77 jobs (78 planned)` at **both** refs; 🌊's ruling: upstream-equal pin, stays RED |
| `test/scripts/ci-node-test-plan-hosted-tail.test.ts` (1) | compact-small-32 | upstream-carried, ruled pin | the same 78 > 77 at both |
| `src/infra/shell-env.test.ts` (1) | compact-large-20 | environment | an empty `/etc/profile.d` (the runner image) gives CI's `expected [] to deeply equal [ 'PATH' ]` at both |
| `src/infra/package-update-permission-drift.test.ts` (1) | compact-large-35 | environment | green at both with `setfacl`; with `setfacl` hidden, CI's `spawnSync setfacl ENOENT` at both |
| `src/infra/update-retained-runtime-imports.process.test.ts` (1) | compact-large-35 | environment | `CI=true` with no `bun` on PATH gives CI's `Bun revision verification failed: spawnSync bun ENOENT` at both |
| `test/scripts/bun-standalone-codegen.test.ts` (3) | compact-small-36 | environment | the same `bun` family: green at both; `CI=true` reds the same 3 at both |
| `src/commands/doctor-session-transcript-labels.reuse.test.ts` (1) | compact-large-35 | environment | a 30 KB env pad gives CI's assertion at both; `consumeUpdateDoctorHistoricalScans` drops its receipt past a 30 KiB env block |
| `ui/src/styles/background-invalidation.node.test.ts` (suite) | compact-large-25 | environment | CI's `Chromium is required for paint proof` at both without Chromium, green at both with it |
| `ui/src/styles/incognito-shade.browser.test.ts` (suite) | compact-large-25 | environment | as above |
| `ui/src/styles/session-row-tint.node.test.ts` (suite) | compact-large-36 | environment | as above |
| `ui/src/test-helpers/new-session-page-opener.node.test.ts` (1) | compact-large-36 | environment | red at both without Chromium, green at both with it |
| `test/scripts/pr-cache-lifetime-collection.test.ts` (1) | compact-small-38 | environment | green at both; CI's `/proc` scan raised `zombie-group-has-threads` (a zombie thread-group leader in the pod) |
| `test/scripts/bench-session-history.test.ts` (1) | compact-large-35 | environment (load) | green at both ×2, with equal durations against the 60 s child timeout; 3:1 CPU starvation gives CI's ETIMEDOUT at base |
| `src/infra/update-doctor-migration-attribution.test.ts` (1) | compact-large-35 | environment (load) | green at both ×2 (44/44); CI's 120 s timeout came on the x86_64 pod |
| `src/cron/maintenance-lifecycle.test.ts` (12) | compact-large-16 | environment, trigger not reproduced | green at both: alone ×2, in the whole cron config (base 299 files / 2,783 tests, cand 300 / 2,785), and under 3:1 starvation. CI: 4 workers, a 106 s import, 120 s timeouts |
| `src/cron/maintenance-snapshot.test.ts` (5) | compact-large-16 | environment, trigger not reproduced | green at both: alone ×2 and in the whole cron config |
| `src/gateway/server-methods/environments.test.ts` (8) | compact-large-19 | environment, trigger not reproduced | green at both alone ×2 and in the sub-shard replay (base 81 files / 797 tests, cand 82 / 798 = CI's count). CI-only: `pairing` undefined at `node-catalog-read.ts:126` |
| `test/helpers/openclaw-test-instance.test.ts` (2) | compact-small-33 | environment, trigger not reproduced | green at both ×2 (86/86) |
| `test/scripts/vitest-worker-shutdown.test.ts` (25) | compact-small-30 | environment, trigger not reproduced | green at both ×2 (26/26); CI's error: `Missing shutdown receipt` |

## Candidate-attributable detail

### CA-1: recipient-authority write breaks prepared survivor-owner reuse

**Invariant.** Upstream #199563 (`649df9afd9`) added this. An empty-transcript entry deletion
prepares its survivor-owner scan before BEGIN. It reuses that scan inside the write transaction
only while `readSessionEntryCacheValidityToken` is unchanged (`session-entry-deletion.worker.ts:79`).
The test pins this: with no intervening write, there is exactly one scan, outside the transaction.

**Owning boundary.** The fault is in `deleteSessionEntryRows`
(`src/config/sessions/session-accessor.sqlite-entry-store.ts`), in this order:
1. The fork's `advanceSessionRecipientAuthorityInTransaction(database, sessionKey)` runs first.
2. It writes `session_recipient_authority`, which moves `siblingWriteRevision`.
3. `options.preparedReferenceOwners?.()` then finds the token changed and returns `undefined`.
4. The owners are rescanned inside the transaction. The test sees scans `[false, true]` instead of
   `[false]`.

**Fork commit.** `92c3cc5c2d` ("advance recipient authority on every session deletion",
2026-10-23). It met upstream's prepared path at the stage-2 merge:
- 41bdde21 has the reuse but not the advance.
- The fork parent `bc7e568a54` has the advance but not the reuse.

**Proof.**
- 41bdde21: PASS 2/2.
- Candidate: RED 2/2.
- `ddd0ec7a7a` (the stage-2 merge): RED.
- Revert A, dropping the call, at the candidate: PASS 8/8.
- Revert B, moving the call after the survivor-owner read: PASS 8/8, with the `changed=true` case
  still green.

**Siblings.** GitNexus gave the leads, each byte-verified at the candidate. `deleteSessionEntryRows`
has five callers; only the entry-store path (`:205`, reached from the deletion worker) passes
`preparedReferenceOwners`. These callers always scan inside the transaction and are unaffected:
- `sqlite-reset.ts:246`
- `sqlite-lifecycle-state.ts:422`
- `sqlite-projection-state.ts:259`
- test support

**Product effect.** One extra survivor scan inside the write lock per such deletion. The row
assertions after the scan assertion still pass.

**Repair shape (recorded only; this lane is read-only).** Revert B keeps the authority edge inside
the same transaction.

### CA-2: the dist-artifact owner's import escapes `scripts/`

**Invariant.** A fixture that materializes a source checkout must give the owner module every
import it needs. `update-command-runtime.ts:119` imports
`<root>/scripts/lib/dist-artifact-ownership.mts` from the fixture root. The two fixtures build that
root differently:
- `update-command-lease.test.ts` (`prepareIncompleteSourceRuntime`) symlinks `scripts/`.
- the `check-extension-package-tsc-boundary.test.ts` canary copies `scripts/lib`.

**Fork commit.** `8aeefacea8`, the O1 carry of #1546: Control UI build children keep the reviewed
compiler flags. It added the import and updated one fixture (`test/scripts/dist-artifact-fixture.ts`
copies `node-runtime-env.mjs`), but not these two consumers.

**Proof.**
- 41bdde21: PASS 2/2 for each file.
- Candidate: RED 2/2 for each, with CI's exact `Cannot find module '../../node-runtime-env.mjs'`.
- Restore only `scripts/lib/dist-artifact-ownership.mts` to 41bdde21 at the candidate: PASS 54/54
  and 12/12.

**Siblings.** GitNexus lists 30 static importers of the owner, from a stale index, so they are
leads only. The failure is a runtime path import from a fixture root, which a static graph cannot
see. Every fixture of this kind that ran is covered by this failset. **Gap:** the six shards that
never ran (CA-3) may hold more of this family; they were not swept.

**Product effect.** None: an installed checkout has `node-runtime-env.mjs` at its root.

### CA-3: plugin-SDK declaration budget fails pretest-build

**Gate.** `scripts/check-plugin-sdk-exports.mts` sums the public plugin-SDK declaration graph and
compares it with a 5,320,000-byte ratchet plus 65,536 bytes of output variance.

| ref | bytes | `build-all.mts` |
| --- | --- | --- |
| 41bdde21 | 5,376,289 (9,247 bytes of headroom) | exit 0 |
| candidate | 5,409,401 | exit 1 |

**What grew.** Pairing chunks across hash renames (`static/dts-inventory-*.tsv`):

| chunk | bytes | source |
| --- | --- | --- |
| `config-contracts` | +18,370 | continuation config in `src/config/types.agent-defaults.ts` and `zod-schema.agent-defaults-base.ts` |
| `types.openclaw` | +5,810 | same |
| `plugin-sdk/diagnostic-runtime.d.ts` | +5,800 | continuation tracer exports |
| `diagnostic-events` | +2,271 | |

The first fork commit carrying both the config and the tracer exports is `2273ef64d5`.

**Not the cause.** The Control UI performance "violations" are not fatal, and the fork changes
nothing under `ui/`. 41bdde21 prints 5 of them and still exits 0. The candidate prints 7, adding
`largest JS gzip 564.1 > 563.7 KiB` and `new boot JS gzip 803.1 > 803.0 KiB`.

**Unrun coverage.** All 6 `runtime`-mode pretest shards stopped at this line:

| shard | source shards that never ran |
| --- | --- |
| compact-small-1 | agentic-commands-runtime |
| compact-small-7 | agentic-cli-process, agentic-gateway-core-runtime, core-tooling-10 |
| agentic-plugins | agentic-plugins |
| compact-small-dist-2 | core-runtime-tui-pty |
| compact-large-2 | agentic-agents-core-models, agentic-control-plane-runtime-server, agentic-gateway-methods, agentic-gateway-server-isolated, agentic-plugin-sdk, core-runtime-config, core-runtime-infra-misc, core-runtime-infra-storage-state, core-runtime-infra-system-runtime, core-unit-src-security-2 |
| compact-large-3 | agentic-agents-core-runner-cli-3, agentic-agents-core-runner-commands, **agentic-agents-support** (the continuation's subagent and custody suites), agentic-control-plane-runtime-config, agentic-control-plane-runtime-state, core-runtime-infra-network-platform, core-runtime-infra-process, core-runtime-infra-storage-state, core-unit-fast-1, core-unit-fast-2 |

This run is no evidence for those shards.

### CA-4: a fork test fixture predates upstream's server-derived backend caller

**Invariant.** Upstream #201845 (`c73afb5c01`, 2026-11-19, inside 41bdde21) changed what counts as
a backend caller. Declaring mode `backend` is no longer enough: `canUseInternalRuntimeHandoff` also
needs `internal.syntheticClient` or `internal.localBackendClient`.

**Fork commit.** The fork test case "admits a continuation key from a backend caller as the run id
verbatim" (`bf74182db2`, L2, 2026-09-29) builds its client as `{ connect: { client: { mode:
"backend" } } }`, with no internal flag. So the candidate rejects it with
`continuation run ids are reserved for backend callers.` Stage 2's fixture follow-up `6a58ef036c`
did not cover this case.

**Proof.**
- 41bdde21: PASS 2/2 (28 tests; the case does not exist there).
- Candidate: RED 2/2 (1 of 32), with CI's exact rejection.
- Add `internal: { localBackendClient: true }` to the fixture (fix D): PASS 32/32.

**Product effect.** Probably none: the continuation child launch path (`callNativeSubagentGateway` →
`dispatchGatewayMethodInProcess`) dispatches through the runtime client, which sets
`syntheticClient: true` (`server-plugin-runtime-client.ts:67`). That path's own suites sit in
agentic-agents-support, which did not run (CA-3), so this run does not verify it.

## Static gates

The static-gates job (`136280892258`, elliott) ran 41 checks: 38 passed and 3 failed.

Every ratchet ran with `--base 7ce2d10eced5f379e31a0b01a96fbcbf9741ccbe`. That is karmaterminal/openclaw
`main`, an upstream commit 285 behind 41bdde21, not the absorbed upstream. Log:
`static/static-gates-job-136280892258.log`.

| row | finding | upstream status | class |
| --- | --- | --- | --- |
| check-dependencies › `deadcode:dependencies` | `Unused exported types (1)`: `RequesterMessage` in `subagent-registry.restart-custody.test-support.ts` | the file does not exist at 41bdde21; knip was not run there | **candidate-attributable (S-1)**: `6e1a925994` |
| check-dependencies › `deadcode:exports` | the same finding, from the full-tree unused-export scan | as above | **candidate-attributable (S-1)** |
| baseline-ratchets › `session-identity` | 31 files over the per-file allowlist | 41bdde21 vs `7ce2d10e`: exit 0. Candidate vs `7ce2d10e` and vs 41bdde21: exit 1, the same 31 files (`static/session-identity-*.log`) | **🌊's standing ruling: upstream attribution** |
| baseline-ratchets › `test-lines` | net +135,015 against 119,347 credit: 15,268 lines over | 41bdde21 vs `7ce2d10e`: **FAIL, 15,241 over**. Candidate vs 41bdde21: **OK**, +27 within the 400-line allowance (`static/test-lines-*.log`) | upstream-carried: upstream's own growth past the fork-main base |
| (test lane) `ci-node-test-plan` and `-hosted-tail` compact capacity | 78 > 77 | red at 41bdde21 too | **🌊's standing ruling: upstream-equal pin, stays visibly RED** |

## Gaps and uncertainties

- **GitNexus.** No index is fresh for 9476c7aa:
  - The nearest, `openclaw-absorb51ff-4b9f10dd` @ `4b9f10dd11`, is STALE for this ref (1 scoped
    file changed).
  - Tool: fork CLI 1.6.5 via `gnx`, built from `~/src/gitnexus/gitnexus` @ `3c1e686edf`
    (karmaterminal/GitNexus).
  - Graph answers here are leads, each byte-verified with `git grep` at the candidate. The direct
    source walk carries every attribution.
  - A refresh build takes hours at openclaw scale and was not run.
- **Six environment files have no reproduced trigger:** cron maintenance (2 files, 17 tests), gateway-methods
  `environments` (8), `openclaw-test-instance` (2), `vitest-worker-shutdown` (25) and
  `update-doctor-migration-attribution` (1, load). Each is red only in CI and green at both refs
  under every local control. The cron and gateway-methods CI sub-shards ran 4 vitest workers;
  controls stay at 1 by rule, so that difference is unexamined.
- **CA-2 siblings in the unrun shards:** not swept (see CA-2). The 6 CA-3 shards and the partial
  extension-database-workers shard are unverified by this run.
- **Knip** was not run at either ref (no pnpm in worktrees). S-1's upstream status rests on the file
  being absent at 41bdde21.
- **bench-session-history starvation asymmetry.** At 3:1 starvation the candidate arm hit the
  runner's 120 s no-output watchdog before any test ran, instead of reaching the ETIMEDOUT that
  base showed. At half a core both refs pass with equal test durations. The candidate's slower
  startup under starvation was not chased.
- **Two log files were normalized.** The two `package-acceptance-workflow` logs contained CRLF
  bytes, which git normalized on add.

## Exact commands

```bash
# failset and first errors from the downloaded batch artifacts
python3 -I tools/failset.py <dl-dir> <out-prefix>            # writes .shards/.tests/.crashes/.other.tsv
python3 -I tools/firsterr.py <dl-dir> <out.md> 16

# one control run at base|cand|probe, with an optional one-variable environment change
tools/ctl.sh base <test-file> <run> [KEY=VALUE ...]
CTL_MASK_PROFILE_D=1 tools/ctl.sh base <test-file> <run>
CTL_NO_ISO=1 CTL_HIDE_BIN=setfacl tools/ctl.sh base <test-file> <run>
CTL_CPU_STARVE=3 tools/ctl.sh base <test-file> <run>

# alternate base and cand for each file
tools/pairs.sh <runs> <budget-seconds> <file>...

# whole-config or sub-shard replay through one config
tools/ctlcfg.sh base test/vitest/vitest.cron.config.ts 1
tools/ctlcfg.sh cand test/vitest/vitest.gateway-methods.config.ts subshard-hosted7-1 \
  OPENCLAW_VITEST_INCLUDE_FILE=controls/subshard-agentic-gateway-methods-hosted-7.cand.include.json

# CI's pretest build in the scratch probe worktree
tools/ctlbuild.sh <full-sha> <run>

# static ratchets, run from a worktree
node --import ./scripts/tsx.mjs scripts/check-test-lines-ratchet.mts --base <B> --no-merge-base
node --import ./scripts/tsx.mjs scripts/check-session-identity-ratchet.mts --base <B> --no-merge-base

# receipt
GH_CONFIG_DIR=~/.config/gh-karmafeast ~/.local/state/frond-scribe/tools/mb-validate-0.2.13.sh \
  9476c7aaf79f8dc86d0222d2b708524a37711418 5ffdcf67ee61d1d1f8ad0f65ec7f0a8da28ae3f1 44733879344
```
