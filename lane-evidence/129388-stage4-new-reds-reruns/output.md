# output: 129388-stage4-new-reds-reruns

**Verdict: `candidate-attributable: 0`.** Of the four new reds in stage-4 Mode-B 44990430565:

- **3 upstream-baseline**:
  - `zod-schema.core` and `installed-terminal-observer` are deterministic. Each is red 10/10 at both
    a329243b and the absorbed upstream 5a3e6b1c, with CI's exact assertion, and green 10/10 at
    16541aa5. In each case an upstream source change came in with the stage-4 absorb and left its
    pinned test stale. Upstream has since fixed both tests (#203416, #203415).
  - `sessions.dispatch.device` is timing-dependent. Alone it is green 10/10 at all three refs. In
    CI's exact sub-shard order it goes red at **5a3e6b1c** (2 of 4 replays) and at a329243b (1 of 4),
    with CI's exact error. The holder is named: a short-lived read-only SQLite child process whose
    `sqlite-maintenance` lease races the test's own shared-state read. No fork change sits on the
    lease or read path. Not candidate-attributable.
- **1 environment**: `setup.memory-import.owner`. It is green everywhere: 10/10 per ref alone, 5/5
  per ref on CI's exact 20-file list, and 2/2 per ref with a 94-character root plus CI's env.
  Trigger: **not reproduced**.

No product file changed. No Mode-B dispatch. The lane diff against a329243b touches only
`lane-evidence/129388-stage4-new-reds-reruns/`.

## Named refs

| category | ref | full SHA | equality |
| --- | --- | --- | --- |
| product / candidate | karmaterminal/openclaw candidate (pins fix on the stage-4 absorb) | `a329243bd1aa4e8677517a5eaf4a67aa30ca8647` | control worktree `cand-a329243b` HEAD = this SHA; server `codeagent/129388-stage4-pins-deletion-fix` = this SHA |
| prior head | #129388 presentation head before stage 4 | `16541aa5a8ee81f1e505a414e2d21a758c43cbc2` | control worktree `prior-16541aa5` HEAD = this SHA |
| upstream baseline | openclaw/openclaw main absorbed by stage 4 | `5a3e6b1cb09bb886c4f9760d5d155353131e823a` | control worktree `up-5a3e6b1c` HEAD = this SHA; ancestor of the candidate |
| CI source run | karmaterminal/openclaw-bootstrap Mode-B 44990430565 | product `8fbf29f25f3fba75a2ed964f4fabc611598b9e52`, workflow `105e83abf9c3d328695e022779d75cb556fdc275` | from `receipts/openclaw-129388-stage4-absorb/modeb-full.txt` and the job logs (`OPENCLAW_CI_SHA`) |
| lane | `codeagent/129388-stage4-new-reds-reruns` | published unchanged at `a329243b`; receipts on top (final SHA in the COMPLETE post) | local = tracking = server at each push |
| CI / workflow for this lane | N/A | N/A | read-only lane, local focused controls only, no dispatch |
| presentation | N/A | N/A | untouched |
| docs / proof | `lane-evidence/129388-stage4-new-reds-reruns/` | at the lane SHA | pushed |

8fbf29f2..a329243b changes four files (`session-agent-purge.ts` + test, `store-maintenance-preserve.ts`,
a test-lines record); none is on the four tests' paths except possibly session maintenance for the
device row, which is green at a329243b anyway.

Dependencies: no pnpm ran. Each control worktree hard-links `node_modules` (oc-focused
`--link-deps-from`) from a same-host tree at the same commit and lock, and each donor's installed
`node_modules/.pnpm/lock.yaml` equals its `pnpm-lock.yaml` minus the leading pnpm env document:

| control | donor | `pnpm-lock.yaml` sha256 |
| --- | --- | --- |
| `cand-a329243b` | `WORKTREES/openclaw-129388-stage4-pins-deletion-fix` (HEAD a329243b) | `8fb9f6aa1ebf045a…` |
| `up-5a3e6b1c` | `WORKTREES/openclaw-129388-stage4-config-readiness-up` (HEAD 5a3e6b1c) | `8fb9f6aa1ebf045a…` |
| `prior-16541aa5` | `WORKTREES/openclaw-129388-final-fix` (HEAD 16541aa5) | `2873a286fde987bf…` |

(The lane worktree's own `node_modules` is a symlink to `source/openclaw/node_modules`, a September
install on another lock; it was not used.)

## Per-test table

Counts are interleaved ×10 runs per ref; the starting ref rotates each round.

| # | test (CI shard) | a329243b cand | 16541aa5 prior | 5a3e6b1c upstream | class | evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `src/config/zod-schema.core.test.ts` › projects schema-owned field documentation… (runtime-config; compact-large-5) | **red 10/10** | pass 10/10 | **red 10/10** | **upstream-baseline** (deterministic) | `controls/*-zod-schema-core-ts-run*.log` |
| 2 | `src/gateway/server-methods/sessions.dispatch.device.test.ts` › synthesizes the core device-provider target… (gateway-methods; compact-large-31) | alone: pass 10/10; CI order: **red 1/4** | alone: pass 10/10; CI order: pass 4/4 | alone: pass 10/10; CI order: **red 2/4** | **upstream-baseline** (order- and timing-dependent race) | `controls/*-sessions-dispatch-device-ts-run*.log`, `controls/*-cfg-node26121-gateway-methods-*.log`, `samples/*-prefix13-run*.tsv` |
| 3 | `src/wizard/setup.memory-import.owner.test.ts` › keeps terminal memory import with accept (wizard; compact-large-30) | pass 10/10 | pass 10/10 | pass 10/10 | **environment**, trigger not reproduced | `controls/*-setup-memory-import-owner-ts-run*.log`, `controls/*-list-ci-wizard-cl30-run*.log` |
| 4 | `test/scripts/installed-terminal-observer.test.ts` › qualifies only successful package-owned pre-handoff Node entries (historical=false) (tooling; compact-small-39) | **red 10/10** | pass 10/10 | **red 10/10** | **upstream-baseline** (deterministic) | `controls/*-installed-terminal-observer-ts-run*.log`, `probe-blobs/hashes.txt` |

Here "CI order" means CI's gateway-methods sub-shard order, replayed with `ctlcfg.sh`: the full
87-file list once, plus three runs of its first 13 files. Every red matches CI.

Extra controls, all at 1 worker:

| control | cand | prior | upstream | 8fbf29f2 (CI's product SHA) |
| --- | --- | --- | --- | --- |
| device, 94-char root + `CI=true GITHUB_ACTIONS=true npm_command=exec OPENCLAW_TMP_DIR=…` | pass 2/2 | pass 2/2 | pass 2/2 | — |
| device alone | (above) | (above) | (above) | pass 2/2 |
| device, CI's 87-file gateway-methods list (1004 tests = CI's count; prior 86 files / 991 tests, one file is post-absorb) | pass 1/1 | pass 1/1 | **red 1/1** | — |
| device, first 13 files of that order (328 tests) | **red 1/3** | pass 3/3 | **red 1/3** | pass 0 red / 3 |
| wizard, 94-char root + CI env | pass 2/2 | pass 2/2 | pass 2/2 | — |
| wizard, CI's exact 20-file wizard list (236 tests = CI's count) | pass 5/5 | pass 5/5 | pass 5/5 | — |
| wizard alone | (above) | (above) | (above) | pass 2/2 |

## Row details

### 1. `zod-schema.core`: upstream-baseline, deterministic

- **CI** (compact-large-5, gate log): `AssertionError: expected { label: 'Templates', …(2) } to match
  object { label: 'Templates', …(1) }`. The expected value is `"help": StringContaining "default: false"`;
  the received value is `"Allow ClawHub discovery and one-way Add through the web app and Gateway
  (default: true). …"`, at `src/config/zod-schema.core.test.ts:67:74`.
- **Local**: the same assertion at a329243b and 5a3e6b1c, 10/10 each.
- **Cause**: upstream `a81218e17a` (#203096, "move Code Mode, Tool Search and Templates out of
  Labs") changed `src/config/schema.help.runtime.ts:237` to `(default: true)` and left the test as
  it was. The commit is in 5a3e6b1c and not in 16541aa5. At 16541aa5 the help text still says
  `(default: false)`.
- **Fork**: the test file and `schema.help.runtime.ts` are byte-identical at a329243b and 5a3e6b1c.
  No semantic conflict with any fork change.
- **Upstream later** (context only): `40c780bd2f` (#203416, "test(config): expect Templates to
  default on in schema help") changes the test to `"default: true"` on `upstream/main` `31c9a9a90f`.

### 4. `installed-terminal-observer`: upstream-baseline, deterministic

- **CI** (compact-small-39): `expected 'a33dc774…' to be 'ed25993c…'` at
  `test/scripts/installed-terminal-observer.test.ts:1786:70`. The test pins the sha256 of
  `DAEMON_RUNTIME_PROBE_SOURCE` from `src/infra/daemon-runtime-probe.generated.mjs`.
- **Local**: the same received hash at a329243b and 5a3e6b1c, 10/10 each.
- **Cause**: upstream `9b0e696264` ("fix: restore macOS setup detection with bundled Bun")
  regenerated the probe (blob `57dd04ce` → `bfa1fb82`) and left the pin as it was. The commit is in
  5a3e6b1c and not in 16541aa5.
- **Hash proof** (`probe-blobs/hashes.txt`, Node 26.12.1): the old blob hashes to
  `ed25993c504b1a383e6b152164c854e170972579cb8ebe547df568aff5435188`, which is the test's pin. The new
  blob hashes to `a33dc77494f30fd3a3119cab4708397bd49f49829e764388ba52c98606dd0a4e`, which is CI's
  received value.
- **Fork**: the test file and the generated file are identical at a329243b and 5a3e6b1c.
- **Upstream later** (context only): `cb77c4ffe2` (#203415, "fix(ci): recognize the current
  installed daemon runtime probe") updates the pin on `upstream/main` `31c9a9a90f`.

### 2. `sessions.dispatch.device`: upstream-baseline, order- and timing-dependent

- **CI** (compact-large-31, sub-shard `agentic-gateway-methods-hosted-4`, 87 files, 4 workers):
  - error: `StateDatabaseAccessError: OpenClaw state at <worker test home>/.openclaw/state/openclaw.sqlite
    is undergoing offline maintenance by sqlite-maintenance process 165766, started
    2026-11-22T08:42:35.988Z … last renewed 0 s ago`;
  - stack: `createError` (`openclaw-state-worker-error-identity.ts:256`, the generic `case "error"`)
    ← `decodeOpenClawStateReadReply` (`openclaw-state-read-worker.ts:52`) ← `query`
    (`openclaw-state-read-operation.ts:288`).
- **Local reproduction**: at 1 worker, in CI's file order, `ctlcfg.sh` gives the same error and the
  same stack frames:
  - 5a3e6b1c: full 87-file list red 1/1; 13-file prefix red 1/3;
  - a329243b: 13-file prefix red 1/3 (the full list passed 1/1);
  - 16541aa5: 0 of 4 runs red;
  - 8fbf29f2: 0 of 3 prefix runs red.

  The file alone never reddened: 30 runs on the three refs, plus 2 at 8fbf29f2 and 6 under CI env.
- **Holder, named**: `tools/proc-sampler.py` recorded every descendant process during the prefix
  runs. In both sampled reds the holder pid in the error is a child of the Vitest worker:
  `node --no-maglev --no-concurrent-sparkplug …/dist/infra/sqlite-readonly-location.worker.js
  --openclaw-sqlite-readonly-child session`.
  - At 5a3e6b1c (prefix run1) it was alive 12:26:54.276 to 12:26:54.391 (about 115 ms), and its
    lease started at 12:26:54.376.
  - At a329243b (prefix run2) the holder has the same command line.
  - The worker spawns about 150 such children during a prefix run. CI's holder pid (165766) is
    later than the worker pids in that log (161951/161952), which is consistent with such a child.
- **Mechanism**:
  - The test home is per worker process (`test/setup.shared.ts` → `withIsolatedTestHome`). Every
    file in a non-isolated worker, and every child process, shares one
    `<home>/.openclaw/state/openclaw.sqlite`.
  - A read-only session child writes a `sqlite-maintenance` owner record on that database for a few
    milliseconds.
  - The record is written by a different pid. So the test's shared-state read, running on a worker
    thread, does not skip it (`gateway-state-owner-record.ts:124`, same-pid-off-main-thread rule).
    Instead it throws `StateDatabaseAdmissionPendingError` or `StateDatabaseOfflineMaintenanceError`
    (`:140-145`). Both are named `StateDatabaseAccessError`.
  - The worker-error codec has no case for those classes, so the error crosses the read-worker
    boundary as a plain `Error`, and the test fails.
  - The 12 preceding files only make the overlap likely; they do not hold the lease.
- **Why upstream-baseline**:
  - It is red at 5a3e6b1c with the identical error.
  - Every file on the chain is byte-identical at a329243b and 5a3e6b1c: the test,
    `gateway-state-owner-record.ts`, `openclaw-state-read-worker.ts`, `openclaw-state-read-operation.ts`
    and `sessions-dispatch.test-support.ts`. The one fork difference near it is in
    `src/infra/sqlite-readonly-worker.ts`: `feb5010a15` and `d5aec4746f` drop
    `resolveForwardedNodeCompilerArgs()` from the child argv, which the argv owner already supplies.
    It is not on the lease path, and the child shows the same V8 flags at both refs.
- **Why 16541aa5 never reddened.** The samplers show the stage-4 upstream window added the holder's
  population to this test:
  - At every post-absorb ref (a329243b, 5a3e6b1c, 8fbf29f2) a prefix run spawns 122-123
    `--openclaw-sqlite-readonly-child session` children, 8 of them in its last 30 s, which is the
    device file's phase.
  - At 16541aa5 it spawns 114, with none in its last 60 s.
  - The device test, `sessions-dispatch.test-support.ts` and `sessions.dispatch.native-device.suite.ts`
    are identical at 16541aa5 and 5a3e6b1c. So the extra session children come from product code
    that changed in 1129d4c0..5a3e6b1c.
  - The fork carries that code at a329243b, where the children appear, but does not add it. At
    16541aa5 (fork + 1129d4c0) they are absent.
  - Which upstream commit added it is not bisected.
- **Not settled**: which function inside the child writes the owner record (see Gaps).

### 3. `setup.memory-import.owner`: environment, trigger not reproduced

- **CI** (compact-large-30, sub-shard `core-runtime-media-ui-support`, wizard config, 20 files,
  4 workers): `AssertionError: expected +0 to be 1` at `setup.memory-import.owner.test.ts:136:40`
  (`fixture.state.applyCalls`), in the `accept` case only. The other five cases in the file passed.
- **What the signature means**: `runSetupMemoryImportStep` returns `status: "completed"` even when
  `offer.apply()` throws (`src/wizard/setup.memory-import.ts:150-170`). So the line-126 status
  assertion passed with zero provider applies. Most likely the Gateway handler refused the apply
  before `provider.apply` ran. Candidate refusals in `migrations.memory.apply`
  (`src/gateway/server-methods/migrations.ts:208-345`):
  - the module-level `activeApplies` set;
  - the plan fingerprint changing;
  - the `owner.run` dispatch in the test's transport.

  CI printed no failure note (the prompter is mocked), so which one it was is unknown.
- **Controls**:
  - alone, 10/10 per ref;
  - CI's exact 20-file wizard list (236 tests), 5/5 per ref;
  - 94-char root + CI env, 2/2 per ref;
  - 8fbf29f2, 2/2.

  All green.
- **The device race is ruled out for this file**: a sampled run spawned **zero** read-only SQLite
  children.
- **Not reproduced**: CI's 4-worker interleaving. CI ran `setup.migration-resources.test.ts`, which
  uses the same fixture family, concurrently on another worker. Controls stay at 1 worker by rule.
  The test file is byte-identical at all three refs.

## How the controls ran

- **`tools/ctl.sh REF FILE RUN [ENV...]`**: `oc-focused` (openclaw's own planner picks the config,
  `--maxWorkers=1`, umask 0022, `FORCE_COLOR` unset) inside frond-scribe's
  `run-isolated-from-live-gateways.sh` (private `/tmp/openclaw`, no host systemd/dbus), Node
  v26.12.1 (CI's version, from the job log), `OPENCLAW_VITEST_RUNTIME=node`, a private 0700 HOME and
  TMPDIR per run. Every run keeps its full log in `controls/`, one row in `controls/summary.tsv`.
- **`tools/rounds.sh FILE FROM TO`**: one round = all three refs; the first ref rotates by round.
- **`CTL_ROOT_LEN=94`**: `tools/long-root.sh` bind-mounts the worktree at a 94-character path in a
  private namespace (CI's shard roots: `…/ci-batch-work-44990430565-1-hosted-batch-012/shard-3-compact-large-31`
  = 94, `…-local-batch-047/shard-0-compact-large-30` = 93).
- **`tools/ctlcfg.sh REF CONFIG INCLUDE RUN`**: replays one CI sub-shard invocation:
  `node scripts/run-vitest.mjs run --config CONFIG --maxWorkers=1` with
  `OPENCLAW_VITEST_INCLUDE_FILE` = CI's file list for that invocation (`lists/*.include.json`,
  extracted from the CI gate log in run order).
- CI ran these invocations with **4 Vitest workers** (`"workers":4` in the shard header). Controls
  stay at 1 worker by rule; that condition is not replayed.

## CI artifacts read

`ci/artifacts-used.tsv` lists the four batch artifacts (IDs, names, sizes) downloaded read-only;
`ci/artifact-files.sha256` hashes the gate logs and summaries used. The raw artifacts stay on ronan
under `/home/figs/classify-129388-s4nr/dl-44990430565/` (openclaw-bootstrap is private).

## Exact commands

```bash
# control worktrees (umask 022, detached, deps hard-linked by the first ctl.sh run per ref)
git worktree add --detach /home/figs/classify-129388-s4nr/cand-a329243b a329243bd1aa4e8677517a5eaf4a67aa30ca8647
git worktree add --detach /home/figs/classify-129388-s4nr/prior-16541aa5 16541aa5a8ee81f1e505a414e2d21a758c43cbc2
git worktree add --detach /home/figs/classify-129388-s4nr/up-5a3e6b1c 5a3e6b1cb09bb886c4f9760d5d155353131e823a
git worktree add --detach /home/figs/classify-129388-s4nr/probe 8fbf29f25f3fba75a2ed964f4fabc611598b9e52
# CI artifacts (read-only gh-scribe token)
GH_CONFIG_DIR=~/.config/gh-scribe gh run download 44990430565 --repo karmaterminal/openclaw-bootstrap \
  --name openclaw-local-ci-batch-<batch>-8fbf29f25f3f --dir dl-44990430565/batches/<name>
# interleaved x10 (rotating first ref)
tools/rounds.sh src/config/zod-schema.core.test.ts 1 10        # (run1 via ctl.sh per ref)
tools/rounds.sh test/scripts/installed-terminal-observer.test.ts 2 10
tools/rounds.sh src/wizard/setup.memory-import.owner.test.ts 2 10
tools/rounds.sh src/gateway/server-methods/sessions.dispatch.device.test.ts 2 10
# CI conditions, single file
CTL_ROOT_LEN=94 tools/ctl.sh <ref> <file> <n> CI=true GITHUB_ACTIONS=true npm_command=exec OPENCLAW_TMP_DIR=/tmp/oc-s4nr-ci/openclaw-tmp
# CI sub-shard replays
tools/rounds.sh @lists/ci-wizard-cl30.files 2 5               # (run1 via ctl.sh per ref)
tools/ctlcfg.sh <ref> test/vitest/vitest.gateway-methods.config.ts lists/ci-gwmethods-cl31.include.json 1
tools/prefix-rounds.sh 1 1 cand prior probe && tools/prefix-rounds.sh 2 3 cand prior up probe
# holder sampling and the observer hash proof
python3 -I tools/proc-sampler.py <run-pid> samples/<ref>-prefix13-run<N>.tsv 0.1
node --input-type=module -e '<sha256 of DAEMON_RUNTIME_PROBE_SOURCE>' probe-blobs/<blob>.mjs
```

## Gaps and uncertainties

- **The device holder's call site is not pinned.** The holder is named by process and command line,
  not by function. Pinning it needs instrumentation in a control tree, and this read-only lane did
  not edit any tree. The read-only child's lease could come from `acquireStateDatabaseSchemaLease` or
  from a maintenance scope; the owner file's `stateOwnerKind` was not captured.
- **Rates are small-sample.** device in CI order: 5a3e6b1c 2/4, a329243b 1/4, 16541aa5 0/4,
  8fbf29f2 0/3. The holder population being absent at 16541aa5 (sampler counts above) is the stronger
  evidence that the stage-4 upstream window brought the race in. The upstream commit is not bisected.
  1129d4c0 itself was not run.
- **CI's 4-worker condition is not replayed**, by rule (1 worker). It is the remaining untested
  difference for the wizard row.
- **The CI run was at 8fbf29f2, not a329243b.** 8fbf29f2..a329243b changes only session-agent-purge,
  store-maintenance-preserve and a test-lines record, none on these paths. Local 8fbf29f2 controls:
  device 2/2 alone and 0 red of 3 in CI order; wizard 2/2.
- **One refused run is kept.** `controls/cand-node26121-list-ci-gwmethods-cl31-run1.log`: oc-focused's
  planner splits the 87 files across two configs and refuses the run (correct behavior). The
  replays use `ctlcfg.sh` with CI's config and include file instead.
- **GitNexus**: not used. Every cross-module claim above was read from source at the named SHAs.
