# extension-database-workers, full local shard at #129388 fixed head, paired upstream control

Lane `codeagent/129388-extdbw-local-shard` (karmaterminal/openclaw#129388), read-only: this
directory holds receipts only. No product file was changed.

## Named refs

| category            | ref                                                                                                                                                                                     | full SHA                                                                   | local / tracking / server                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| product (candidate) | karmaterminal/openclaw `codeagent/129388-final-fix` head                                                                                                                                | `16541aa5a8ee81f1e505a414e2d21a758c43cbc2`                                 | worktree HEAD = `origin/codeagent/129388-final-fix` = server `refs/heads/codeagent/129388-final-fix` (ls-remote + `gh api commits`) |
| control             | openclaw/openclaw `main` ancestor absorbed by the candidate                                                                                                                             | `1129d4c0716c7dcc6fba86753ec214584ec8ebd1`                                 | detached worktree HEAD; `gh api repos/openclaw/openclaw/compare/1129d4c0…main` = ahead, behind_by 0; ancestor of the candidate      |
| lane (safe branch)  | `codeagent/129388-extdbw-local-shard`                                                                                                                                                   | starts at `16541aa5a8ee81f1e505a414e2d21a758c43cbc2`                       | published unchanged to origin before any evidence; receipts commits on top                                                          |
| CI / workflow       | N/A for dispatch. Reference receipts only: Mode-B 44871298969 (product `93a1e356c7aabf0d868560e46790b07449813840`) and 44917878785 (product `16541aa5a8ee81f1e505a414e2d21a758c43cbc2`) | workflow `105e83abf9c3d328695e022779d75cb556fdc275` (both runs' `headSha`) | `gh api repos/karmaterminal/openclaw-bootstrap/commits/105e83ab…` resolves                                                          |
| presentation        | N/A                                                                                                                                                                                     | N/A                                                                        | not touched                                                                                                                         |
| docs / proofs       | N/A                                                                                                                                                                                     | N/A                                                                        | N/A                                                                                                                                 |

## What CI plans for this shard

The workorder says to dump the group from `createNodeTestShards()`. At both trees that planner has
**no** row whose configs include `test/vitest/vitest.extension-database-workers.config.ts`
(`createNodeTestShards.extdbwRows: []` in both `plan-group-*.json`). Mode-B's row comes from the
Mode-B matrix builder (karmaterminal/openclaw-bootstrap `105e83ab`, private), which adds a `supplemental`
row per config of `fullSuiteVitestShards` owner `extensions`, with `includePatterns: null`,
`planner_env: null` (`tools/dump-group.mts` reproduces that row from each tree). The 93a1e356 run's own `planner-matrix.json` has exactly that one row
(`kind: supplemental`), kept standalone by the compact plan (`ci-ref/CI-SOURCES.md`).

The group handed to `scripts/ci-run-node-test-shard.mts` is identical at both trees:

```json
{
  "configs": ["test/vitest/vitest.extension-database-workers.config.ts"],
  "includePatterns": null,
  "shard_name": "extension-database-workers",
  "env": null
}
```

The trees differ only in the config's explicit file list (`vitest.extension-database-workers-paths.mjs`):
the candidate adds three files, so the config selects 845 files at the candidate and 842 at the control
(`inventory-*.json`):

- `extensions/codex/src/app-server/side-question.continuation.test.ts`
- `extensions/diagnostics-otel/src/codex-dynamic-tool-origin.integration.test.ts`
- `extensions/diagnostics-otel/src/continuation-tracer-adapter.integration.test.ts`

## How each tree ran

`tools/run-shard.sh <tree> <out> <label>`, launched `setsid nohup … < /dev/null &` (outside the
session's 2 h cap), exit code written to `rc.txt`. It runs, inside frond-scribe
`skills/pr-drift-cure-gates/run-isolated-from-live-gateways.sh` (private `/tmp/openclaw` tmpfs, no host
systemd/dbus):

```
env -i <child-env.txt> node --import ./scripts/tsx.mjs scripts/ci-run-node-test-shard.mts
```

The child environment is built from scratch (`child-env.txt` in each run dir), from the per-shard
environment the Mode-B batch runner at `105e83ab` gives a non-bundle shard, plus the `npm_*` set `pnpm exec`
exports (captured from pnpm 12.15.0 in a scratch dir: `npm-env-probe/pnpm-exec-env.json`):

- Node v26.12.1 (the batch log's `node=v26.12.1`), `OPENCLAW_VITEST_RUNTIME=node` (the group sets no
  runtime; CI's `resolveTestRuntime` returns node under `CI`, and the shard runner forces node under the
  default `node` policy);
- `OPENCLAW_VITEST_MAX_WORKERS=1`, `OPENCLAW_TEST_PROJECTS_PARALLEL=1` (`OPENCLAW_CI_PER_SHARD_MAX_WORKERS: "1"`);
- `NODE_OPTIONS=--max-old-space-size=8192`, `OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS=300000`,
  `OPENCLAW_VITEST_NO_OUTPUT_RETRY=1`;
- `CI=true`, `GITHUB_ACTIONS=true`, `RUNNER_ENVIRONMENT=self-hosted` (Actions sets these; CI drains
  failures and logs `[test] inner parallelism` only under them);
- private `HOME`, `XDG_*`, `TMPDIR`/`TMP`/`TEMP`/`RUNNER_TEMP` (0700), `OPENCLAW_HOME`,
  `OPENCLAW_CONFIG_PATH`, `OPENCLAW_TMP_DIR` per run, as the batch runner gives each shard;
- `LC_ALL=C` (the batch runner wraps the shard in `LC_ALL=C time -v`), `TZ=UTC` (ronan is
  America/Los_Angeles; CI pods are UTC);
- `npm_command=exec`, `npm_config_user_agent=pnpm/12.15.0 npm/? node/? linux arm64`, `npm_execpath`,
  `npm_node_execpath`, `NODE`, `INIT_CWD=<tree>`, `PNPM_PACKAGE_NAME=openclaw`,
  `pnpm_config_verify_deps_before_run=false`;
- no `FORCE_COLOR`, no seat credentials (env -i), `umask 022`.

Deviation from CI, recorded: CI ran this row through the runner's legacy path
(`pnpm exec node --import tsx scripts/test-projects.mts <config>`, no `OPENCLAW_NODE_TEST_GROUPS_JSON`),
as the row is not a compact bundle. The workorder routes it through `ci-run-node-test-shard.mts`, which
spawns the same `scripts/test-projects.mts <config>` child with the group's env, under the compiled
Vitest worker owner. Slice composition and per-slice counts are compared with CI below, which is how
the route difference is checked.

Dependencies: no pnpm install anywhere. The candidate worktree's stale `node_modules` symlink was
replaced by `cp -al` hard-link copies of all 208 `node_modules` dirs from
`WORKTREES/openclaw-129388-final-fix` (same HEAD, `pnpm-lock.yaml` sha256 `2873a286fde987bf…`); the control
worktree got `cp -al` copies of that copy. The control's lockfile hashes the same; the root
`package.json` differs only in fork metadata (schema version, plugin-SDK export entries).

## Verdict

`extension-database-workers @16541aa5: 10846 tests, 10731 pass, 2 fail (113 skipped); candidate-attributable: 0`

Both reds are red at the upstream control too, failing the same test with the same error.

## Runs (ronan, aarch64, 20 cpus, serial, same seat)

| run                                        | tree     | UTC start → end     | wall    | rc  | files | tests  | pass   | fail | skip | slices |
| ------------------------------------------ | -------- | ------------------- | ------- | --- | ----- | ------ | ------ | ---- | ---- | ------ |
| smoke (1 file, `includePatterns` override) | 16541aa5 | 18:09:20 → 18:10:20 | 60 s    | 0   | 1     | 1      | 1      | 0    | 0    | 1      |
| candidate                                  | 16541aa5 | 18:10:48 → 20:48:37 | 9,469 s | 1   | 845   | 10,846 | 10,731 | 2    | 113  | 93     |
| control                                    | 1129d4c0 | 20:49:19 → 23:27:37 | 9,498 s | 1   | 842   | 10,840 | 10,725 | 2    | 113  | 93     |

Runtime: Node v26.12.1, `OPENCLAW_VITEST_RUNTIME=node`, one worker. Every slice (Vitest invocation)
printed a footer; the slice footers sum to the totals above, and the files run equal each tree's config
inventory (845 / 842: none missing, none extra). The smoke's build output was removed before the
candidate run, so both full runs started from a fresh tree and did the runtime build CI does.
A full Mode-B (44932832262) shared the seat during both runs; `/` stayed between 88.6 % and 89.7 %
(`disk.log`, 60 s samples, stop at 90 %).

## Reds

| file › test                                                                                                                                                                                                    | cand 16541aa5    | ctrl 1129d4c0 | CI 93a1e356 partial | CI 16541aa5 re-gate partial | class                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------- | ------------------- | --------------------------- | ------------------------------- |
| `extensions/tlon/src/monitor/index.test.ts` › monitorTlonProvider shutdown › streams deeply nested poison and capped messages over real HTTP SSE through production handlers and recovers on the next messages | 23 pass / 1 fail | 23 / 1        | 23 / 1              | 23 / 1                      | upstream-carried                |
| `extensions/memory-core/src/workspace-file-mode.test.ts` › retains inherited named ACL access in the file mask                                                                                                 | 5 / 1            | 5 / 1         | not reached         | not reached                 | environment (red at both trees) |

- **tlon**: at all four logs, `AssertionError: expected "vi.fn()" to be called with arguments` at
  `index.test.ts:1091:27`: `runtime.log` never receives `"tlon dropped channels event: Tlon firehose event
  is too deeply nested to store."` (received: the monitor's start/auth lines). Neither the test nor
  `extensions/tlon/src/monitor/` differs between 1129d4c0 and 16541aa5.
- **workspace-file-mode**: the test's own `setfacl -m d:u:65534:rwX,d:m::rwx <workspace>` fails with
  `Invalid argument` under `/tmp/openclaw` at both trees. `env-probes/setfacl-in-isolation-wrapper.txt`
  shows the cause outside the test: inside the isolation wrapper the user namespace maps one uid
  (`uid_map 1000 0 1`), so an ACL entry for uid 65534 is unrepresentable (EINVAL on the wrapper's tmpfs
  and on disk alike), while the same command succeeds on the host and an entry for the mapped uid
  succeeds inside. The file does not differ between the trees. CI's partials never reached it, so this
  lane has no green observation of it; it needs a run outside a single-uid user namespace.

## Count match

| reference                                           | files | tests  | pass   | fail | skip |
| --------------------------------------------------- | ----- | ------ | ------ | ---- | ---- |
| CI 44871298969 @93a1e356, cut by SIGTERM at 5,184 s | 423   | 6,759  | 6,696  | 1    | 62   |
| CI 44917878785 @16541aa5, cut by SIGTERM at 5,208 s | 410   | 6,548  | 6,493  | 1    | 54   |
| local candidate @16541aa5                           | 845   | 10,846 | 10,731 | 2    | 113  |

- Every file of both CI partials ran locally (0 missing).
- CI finished 28 slices before the cut: 377 files, 5,580 tests. The candidate's first 28 slices hold
  the same files and footers, and all 377 files have identical pass/fail/skip counts (0 differ).
- In the cut slice, 32 of 33 (re-gate) and 45 of 46 (93a1e356) files match too. The one exception in
  each is the file CI was executing at SIGTERM (`shard-state.json` `last_test_file`):
  `memory/generic-embedding-provider.integration.test.ts` 12 vs 29 local,
  `memory/manager-active-memory-retrieval.test.ts` 2 vs 9 local.
- So every file CI finished (409 at the re-gate, 422 at 93a1e356) matches; the remaining 436 / 423
  candidate files have no CI reference and are compared with the control instead.
- 93a1e356 → 16541aa5 changes 10 files, none under `extensions/`.
- Skips: 113 at both trees, in 23 files (PostgreSQL suites without a PG service, a Windows-only file,
  native Codex sandbox/inference); the 8 of those files inside the 93a1e356 partial skip the same counts.

## Candidate vs control

Same reds; every file present at both trees has identical counts except one. The candidate's
+3 files / +6 tests are the fork's own tests, all passing:

| file                                                                              | cand    | ctrl    | added by                                                                                               |
| --------------------------------------------------------------------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `extensions/codex/src/app-server/side-question.continuation.test.ts`              | 1 pass  | absent  | `13bdb562b1`                                                                                           |
| `extensions/diagnostics-otel/src/codex-dynamic-tool-origin.integration.test.ts`   | 1 pass  | absent  | `2273ef64d5`                                                                                           |
| `extensions/diagnostics-otel/src/continuation-tracer-adapter.integration.test.ts` | 3 pass  | absent  | `2273ef64d5`                                                                                           |
| `extensions/codex/src/app-server/run-attempt.dynamic-tools.test.ts`               | 17 pass | 16 pass | `2273ef64d5` ("reports a scheduled continuation as completed through the app-server request boundary") |

## Files

- `plan/`: plan-group dumps and config inventories for both trees.
- `cand/`, `ctrl/`, `smoke-cand/`: raw `run.log`, `times.txt`, `disk.log`, `child-env.txt`, `rc.txt`,
  tree status before/after, parsed per-file counts. `ctrl/worktree-removal-manifest.txt` lists the
  control worktree's untracked and ignored files, recorded before it was removed.
- `compare-final.json`: count match, red rows and candidate-vs-control from `tools/compare.mjs`.
- `ci-ref/`: per-file counts parsed from the two CI partials; `CI-SOURCES.md` names the private
  artifacts and their sha256.
- `env-probes/`: the setfacl probe. `npm-env-probe/`: what `pnpm exec` exports.
- `tools/`: the launcher, dump, inventory, parser and comparison scripts as run.
- `SHA256SUMS`: every file above, over the committed bytes.
