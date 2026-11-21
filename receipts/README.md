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

## Status at this commit

Candidate run complete; control run (1129d4c0) in progress on the same seat, started after the
candidate finished. Final verdict, red classification and the control comparison follow in a later
commit.

Candidate `16541aa5`, ronan, 2026-11-21T18:10:48Z → 20:48:37Z (9,469 s), rc 1:
845 files (= the config inventory, none missing, none extra), 10,846 tests: 10,731 pass, 2 fail,
113 skip; 93 Vitest invocations (slices), every one with a footer, footers sum to the same totals.

Count match: every file of both CI partials ran locally; every file CI finished (409 at the
16541aa5 re-gate, 422 at 93a1e356) has identical pass/fail/skip counts. The only per-file difference is
the file each CI run was executing when SIGTERM arrived (its `shard-state.json` `last_test_file`).
CI's routing receipts carry `tests: null` (rc 125), so the in-flight logs are the only CI counts.

Reds at the candidate:

- `extensions/tlon/src/monitor/index.test.ts` › monitorTlonProvider shutdown › streams deeply nested
  poison … — same test, same assertion as both CI partials.
- `extensions/memory-core/src/workspace-file-mode.test.ts` › retains inherited named ACL access in the
  file mask — `setfacl -m d:u:65534:… Invalid argument`; reproduced outside the test as a property of
  the isolation wrapper's single-uid user namespace (`env-probes/setfacl-in-isolation-wrapper.txt`).
