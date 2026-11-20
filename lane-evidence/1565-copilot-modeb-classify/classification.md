# #1565 Copilot image-cap composite (c): classification of Mode-B run 44672992870

Bound issue: karmaterminal/openclaw#1565. Read-only on CI: no dispatch, re-run or cancel was made. Written 2026-11-20 (`date -u` 09:16Z).

## Verdict

**No probe-attributable red.** Every failure at `c5ed7c71` either fails the same way at the fleet base `ab5a30ea`, or is a load-timing or SQLite-busy flake in a gateway test. Those gateway tests load no plugins, and they passed locally at `c5ed7c71`. The one flake that failed locally (catalog-write) also failed at `ab5a30ea` in a same-host control. The 3 static-gate reds are the knip `deadcode:*` rows, with byte-identical findings at base.

**But the receipt is not full coverage, and the gap is bigger than the aggregate shows:**

1. `extension-database-workers` was cancelled at 5273 s, the 90-minute job cap. It was also cancelled at the base (5285 s, and 5245 s on the base's subset rerun).
2. **The aggregate does not show this one.** In `compact-large-41`, the `agentic-control-plane-agent-chat` shard crashed partway through its 2nd of 8 vitest groups (`[vitest] retained temporary namespace … Unreleased Vitest resource claim`, after a 120 s test timeout and a 180 s hook timeout). So **88 gateway-server test files never ran at `c5ed7c71`**; they ran at both baselines. `summary.json` records the shard as `fail` with 6 failures and drops the 6 reds the crashed group had already printed.

The probe's own surface is fully covered and green. All 7 new #1565 tests passed. `extension-providers` passed exactly 7 more tests than at base, with the same 2 base failures. No non-Copilot provider test changed outcome.

## Named refs

| category                  | ref                                                                                                                                                                                                                          | full SHA                                              | equality                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| product                   | `karmaterminal/openclaw` composite (c)                                                                                                                                                                                       | `c5ed7c71c4dc53af85b25440768178a753047d2f`            | the run's aggregate `.ref` = `.sha` = this; `origin/codeagent/1565-copilot-cap-newest` = this |
| base (fleet build)        | `ab5a30ea`                                                                                                                                                                                                                   | `ab5a30ea79b776f149e24b1fccab9e79b0a5d299`            | ancestor of product (10 commits); base runs' aggregate `.ref` = `.sha` = this                 |
| extra baseline            | earlier probe `bc257b91`                                                                                                                                                                                                     | `bc257b915e9bffaa4508bae849f36ef16bd21abc`            | `origin/codeagent/1565-probe-ws-wire-counts` = this; `ab5a30ea` is its ancestor               |
| lane                      | `codeagent/1565-copilot-modeb-classify`                                                                                                                                                                                      | started at `c5ed7c71c4dc53af85b25440768178a753047d2f` | published to origin before evidence; local = tracking = server at start                       |
| CI / workflow (this run)  | `karmaterminal/openclaw-bootstrap`                                                                                                                                                                                           | `9e285633034f5bc38801f45f7cb2d97a7ffe368a`            | run `headSha` = aggregate `.workflow_sha` = this                                              |
| CI / workflow (base runs) | `karmaterminal/openclaw-bootstrap`                                                                                                                                                                                           | `3e31f971c8c3d5883bfb9589513dadca2c086113`            | runs 43711027259 and 43744242940 `headSha` = this                                             |
| presentation              | N/A                                                                                                                                                                                                                          | N/A                                                   | N/A                                                                                           |
| docs / proof              | `output.md` (lane artifact, untracked under the dispatch policy; `/output.md` is in `.git/info/exclude`) = committed copy `lane-evidence/1565-copilot-modeb-classify/classification.md`, with the lists in `…/output-lists/` | lane branch head                                      | local = tracking = server after push                                                          |

**Workflow drift:** the base runs used workflow `3e31f971`, and this run used `9e285633`. Those two are diverged: 145 ahead, 3 behind (`gh api …/compare`). The earlier probe run 44630094881 used the same workflow as this run, so it is the same-workflow control.

## Runs compared

| run                         | product    | workflow   | verdict | summarized / routed | missing                                                                                          | tests passed / failed                                                      |
| --------------------------- | ---------- | ---------- | ------- | ------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **44672992870** (this)      | `c5ed7c71` | `9e285633` | failure | 128 / 129           | `extension-database-workers` (cancelled-at-5273s)                                                | 257740 / 97                                                                |
| 43711027259 (base, full)    | `ab5a30ea` | `3e31f971` | failure | 127 / 129           | `extension-database-workers` (cancelled-at-5285s), `compact-large-33` (no-batch-artifact)        | 254655 / 104                                                               |
| 43744242940 (base, subset)  | `ab5a30ea` | `3e31f971` | failure | 3 / 4               | `extension-database-workers` (cancelled-at-5245s)                                                | 7057 / 0; covers `compact-small-35`, `compact-small-3`, `compact-large-33` |
| 44630094881 (earlier probe) | `bc257b91` | `9e285633` | failure | 126 / 129           | `extension-database-workers`, `compact-small-dist-1`, `compact-small-dist-2` (no-batch-artifact) | 258384 / 97                                                                |

No full Mode-B run exists at exactly `ab5a30ea` on this run's workflow. The base side is the union of 43711027259 and its subset rerun 43744242940. Together they cover every routed shard except `extension-database-workers`, which is the same coverage as this run.

**The workorder's "3 summary-less shards, dist lane skipped" describes 44630094881, not this run.** That run started at 22:35:42Z, the start of the `oc-8cpu-32gb` DNS outage (22:35Z to 23:44Z), and lost its dist lane. This run's jobs ran from 04:15Z to 08:42Z on 11-20, all on `oc-8cpu-32gb-dx6fd-*` ARC runners. `dist(compact-small-dist-2,compact-small-dist-1)` succeeded (07:41Z to 07:56Z, 129 + 97 tests, equal to base).

## Receipt shape: 129 routed vs 180 planned is the compact plan, not lost coverage

`routing-plan.json`: `compact.status=applied` with contract `compact-j14-de7bd410-129`, 40 kept rows plus 89 bundles = 129 routed rows. Its coverage block reads `full_plan_units 16626 = bundle_units 16140 + kept_units 486`, with `missing/extra/duplicate_units 0`. `planner_identity_coverage` reads `emitted 180 = matched 180`, `unknown 0`, `blocked 0`. I checked it independently: every one of the 180 planner shard names in `planner-matrix.json` is a kept row or a `compact_sources` member of a routed row. None is uncovered, and no routed source is outside the plan; 35 planner shards are split across several bundles. **There are no "51 planned-but-unrouted shards" to name: 51 = 180 − 129 is what bundling removes.** The full map is in `lane-evidence/1565-copilot-modeb-classify/output-lists/planner-180-to-routed-129.tsv`. This is the runbook's compact-plan clause (#1817/#1818), which my `mb-validate.sh` carries.

## How the failure set was built

Per run, the failure set is the union of two sources:

- (a) each shard's `summary.json` `.failures[kind=test]` (79 / 83 / 79 distinct tests at c5ed / ab5a / bc25);
- (b) the `×` lines in every `gate-test-shard-*.log`.

Source (b) is needed because `summary.json` missed the 6 reds printed by the crashed agent-chat group at `c5ed7c71`. Logs miss file-level and supplemental-extension rows that the summaries carry, so neither source alone is complete. Union sizes are 85 (c5ed), 83 (ab5a, plus nothing new from the subset), and 79 (bc25). Names were normalized to `file > title`.

| class                         | tests | files |
| ----------------------------- | ----- | ----- |
| c5ed7c71-only (vs base union) | 11    | 11    |
| present at both               | 74    | 37    |
| base-only                     | 9     | 6     |

The full rows are in `lane-evidence/1565-copilot-modeb-classify/output-lists/failures.tsv`: class, test, red at bc257b91, shard at each ref, first error at each ref, and classification.

### c5ed7c71-only (11): all flakes in gateway tests that cannot reach the probe

| test                                                                                       | c5ed shard                                                                | first error at c5ed                                                                                 | red at bc257b91 | classification                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------- |
| `server.agent.continuation-trust` › consumes a persisted traceparent once…                 | compact-large-41 / agent-chat (group 1)                                   | `Gateway test RPC agent: Error: timeout` (16.8 s)                                                   | no              | load-timing flake                                         |
| `server.agent-execution-shutdown` › settles the original command and finalizer…            | same                                                                      | `Gateway test RPC sessions.create: … Caused by: Error: timeout`                                     | **yes**         | load-timing flake                                         |
| `server.agent.gateway-server-agent-a` › agent resolves a bare key…                         | same                                                                      | `Gateway test RPC agent: Error: timeout` (14.5 s)                                                   | no              | load-timing flake                                         |
| `server.agent.gateway-server-agent-auth-refresh` › keeps queued auth publication readable… | same                                                                      | `promise rejected "Error: timeout"` (24.5 s)                                                        | no              | load-timing flake                                         |
| `server.chat-abort-dispatch-rejection` › preserves committed native input…                 | same                                                                      | `Error: timeout` (23.7 s)                                                                           | no              | load-timing flake                                         |
| `server.chat-abort-settlement` › preserves an acknowledged abort…                          | compact-large-41 / agent-chat (group 2, crashed; **not in summary.json**) | `Gateway test RPC chat.send: Error: timeout` (27.3 s)                                               | no              | load-timing flake                                         |
| `server.chat-abort-sibling-fanout` › chat.abort interrupts all siblings…                   | same                                                                      | `Gateway test RPC agent: Error: timeout` (21.3 s)                                                   | no              | load-timing flake                                         |
| `server.chat-adopted-failure` › reports an adopted pre-model failure…                      | same                                                                      | `×` at 20.2 s (group never printed its error block)                                                 | no              | load-timing flake                                         |
| `server.chat-preparation-failure` › retains a direct failure…                              | same                                                                      | `Gateway test RPC chat.send: Error: timeout` (26.7 s)                                               | no              | load-timing flake                                         |
| `server.chat-queued-followup` › keeps a queued WebChat text pending…                       | same                                                                      | `Test timed out in 120000ms` + `Hook timed out in 180000ms` → shard crash                           | no              | load-timing flake; triggered the crash                    |
| `server-lifecycle.catalog-write` › joins notice cleanup and upstream deletion…             | compact-large-18 / agentic-control-plane-runtime-server-hosted-2          | `Error: database is locked` (SQLITE_BUSY) at the test's own raw INSERT, `catalog-write.test.ts:242` | no              | SQLite-busy flake; **red at base in a same-host control** |

Evidence and citations behind these 11 classifications:

- **No path to the probe.** The product diff `ab5a30ea..c5ed7c71` touches only `extensions/github-copilot/{model-metadata,models,stream}.ts`, their 2 tests, and 2 `config/test-lines-allocations/*.txt` files. `git grep` finds `capCopilotPromptImages`, `copilotMaxPromptImages` and `COPILOT_MAX_PROMPT_IMAGES_PARAM` nowhere outside `extensions/github-copilot` (0 hits). None of the 11 test files mentions Copilot.
- **The gateway harness turns plugins off.** `src/gateway/test-helpers.server.ts:317-327` (`applyGatewaySkipEnv`, called at :378 and :439) sets `OPENCLAW_SKIP_PROVIDERS=1` and `OPENCLAW_DISABLE_BUNDLED_PLUGINS=1`, and points `OPENCLAW_BUNDLED_PLUGINS_DIR` at a nonexistent `openclaw-test-no-bundled-extensions` dir. So the github-copilot plugin is never loaded. `catalog-write.test.ts` builds `createEmptyPluginRegistry()` (import at :17).
- **GitNexus agrees (as a lead).** I walked imports outward from the 3 changed files, hop by hop, until nothing new appeared (3 hops). The walk reaches only files under `extensions/github-copilot/`, with 0 under `src/gateway/`. Tool: the karmaterminal/GitNexus fork 1.6.5 at `/home/figs/src/gitnexus`, fork SHA `3c1e686edfc1acaac882927cada121ddd7c47bcc`, index `openclaw-composite-39d19454`. **Tooling gap:** `gnx pick` found no fresh index for `c5ed7c71`; 39d19454 is STALE (ref+60 commits, 5 scoped files differ). That is why I byte-verified the answer with the `git grep` and harness reads above.
- **Same shard, same failure, different tests at base.** At `ab5a30ea` (43711027259) the same bundle and shard (`compact-large-41` / `agentic-control-plane-agent-chat`) failed with the same `rpcReq` timeout (`test-helpers.server.ts:1179`). There it hit `sessions.create.{dispatch,durability,reload×2}`, `chat-command-context` and `rpc-contracts`. At bc257b91 it hit the same set plus `agent-execution-shutdown`. The failing subset moves from run to run.
- **Less CPU at c5ed.** `compact-large-41` got **358 %** CPU on its 8-CPU pod here (`resource-usage.txt`, x86_64 node, `cpus=20 mem=62GB`), against **678 %** at base and **686 %** at bc257b91 (x86_64 `cpus=16` node).
- **Local control at `c5ed7c71` passed** (ronan, Node v26.12.1 as in the CI pod, `OPENCLAW_VITEST_RUNTIME=node`, `--maxWorkers=1`, `umask 022`, inside the live-gateway isolation wrapper):
  - run 1 (11 files): **11/11 files, 58/58 tests passed**, and every one of the 11 CI-red titles shows `✓`;
  - run 2 (11 files plus the 4 base-only `sessions.create` files): 13/14 files passed. The 10 agent-chat titles and all 4 `sessions.create` titles passed. `catalog-write` failed with `database is locked` at `:239`.
- **catalog-write is red at base too.** In a detached worktree at `ab5a30ea` (same `pnpm-lock` blob, same hard-linked install), alternating with `c5ed7c71`: **ab5a run 1 failed the same test with `database is locked` at `catalog-write.test.ts:239`**, and ab5a runs 2–3 passed. All 3 standalone `c5ed7c71` runs passed (34–35 s each).

### Present at both (74 tests in 37 files): carried from base

At both refs every row has the same first error, apart from temp paths and timestamps (the per-row errors are in `failures.tsv`). Each row's test file and imports are byte-identical between the refs, because the diff touches only `extensions/github-copilot` and allocation txt files. The environmental labels below come from the error text, and from `reference_modeb_arc_env_reds.md` where it already proved the family.

| tests | file                                                                         | classification                                                                                        |
| ----- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 2     | `extensions/anthropic/session-catalog-transcript.test.ts`                    | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 4     | `extensions/browser/src/browser/chrome.headless-cleanup.test.ts`             | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 2     | `extensions/telegram/src/bot-message.test.ts`                                | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 2     | `src/agents/model-auth.profiles.test.ts`                                     | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 2     | `src/agents/transcript-policy.test.ts`                                       | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 1     | `src/auto-reply/reply/agent-runner-steer-adoption.question-recovery.test.ts` | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 1     | `src/auto-reply/reply/get-reply.auto-fallback.test.ts`                       | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 3     | `src/auto-reply/reply/queue.drain-restart.test.ts`                           | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 5     | `src/cli/update-cli/update-command-retained-restart.test.ts`                 | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 1     | `src/config/sessions/session-accessor.sqlite-exact-read.test.ts`             | env: ARC pod Node v26.12.1 (sqlite-exact-read family, memory modeb-arc-env-reds)                      |
| 1     | `src/gateway/remote-control-ui-ingress.integration.test.ts`                  | env: listen EINVAL on a deep CI temp socket path                                                      |
| 1     | `src/gateway/server.agent.rpc-contracts.test.ts`                             | load-timing: gateway-server-parallel RPC timeout (same family as the c5ed-only rows)                  |
| 1     | `src/gateway/server.chat-command-context.test.ts`                            | load-timing: c5ed red inside the crashed 2nd group of agent-chat (11.2 s); base red as AssertionError |
| 1     | `src/gateway/server-methods/sessions-rewind.storage.test.ts`                 | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 1     | `src/gateway/server.plugin-reload-send-continuation.product.test.ts`         | env: pod inner parallelism 1 assertion                                                                |
| 1     | `src/gateway/server.plugin-reload-send-revocation.product.test.ts`           | env: pod inner parallelism 1 assertion                                                                |
| 3     | `src/gateway/server-restart-sentinel.test.ts`                                | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 1     | `src/gateway/server.sessions.create-worktree-spawn.test.ts`                  | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 2     | `src/gateway/worker-environments/worker-turn-context-engine.test.ts`         | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 7     | `src/gateway/worker-environments/worker-turn-detached-context.test.ts`       | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 1     | `src/gateway/worker-environments/worker-turn-transcript-footprint.test.ts`   | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 1     | `src/infra/package-update-permission-drift.test.ts`                          | env: setfacl absent in runner image (spawnSync setfacl ENOENT)                                        |
| 1     | `src/infra/shell-env.test.ts`                                                | env: runner image /etc/profile.d exports no PATH (memory modeb-arc-env-reds)                          |
| 1     | `src/infra/update-retained-runtime-imports.process.test.ts`                  | env: bun absent in lane (spawnSync bun ENOENT; setup-test-bun not run)                                |
| 1     | `src/infra/worker-task-pool.memory.test.ts`                                  | env/perf: memory threshold under pod load                                                             |
| 1     | `src/plugins/plugin-generation-artifact.native-reference.test.ts`            | env: pod /dev/shm 64 MiB < capture floor (memory modeb-arc-env-reds)                                  |
| 2     | `src/worker/worker.runtime.test.ts`                                          | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 2     | `test/helpers/openclaw-test-instance.test.ts`                                | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 2     | `test/scripts/bun-standalone-codegen.test.ts`                                | env: bun absent in lane (spawnSync bun ENOENT)                                                        |
| 1     | `test/scripts/bun-standalone-metadata.test.ts`                               | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 5     | `test/scripts/check-line-cap-ratchet.test.ts`                                | env/tooling: oxlint native binding message differs in pod                                             |
| 1     | `test/scripts/installed-terminal-observer.test.ts`                           | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 9     | `test/scripts-update-gateway-legacy.test.ts`                                 | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 1     | `ui/src/styles/background-invalidation.node.test.ts`                         | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 1     | `ui/src/styles/incognito-shade.browser.test.ts`                              | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 1     | `ui/src/styles/session-row-tint.node.test.ts`                                | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |
| 1     | `ui/src/test-helpers/new-session-page-opener.node.test.ts`                   | base-carried: same failure at ab5a30ea; product diff touches only extensions/github-copilot           |

### Base-only (9)

| test                                                                      | base shard                    | base first error                                      | at c5ed7c71                                       | classification                                                      |
| ------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| `server.config-record-keys` › accepts exact numeric record keys…          | compact-large-42              | `GatewayClientRequestTimeoutError: … config.apply`    | ran, ✓                                            | load-timing                                                         |
| `server.sessions.create.dispatch` › publishes repository metadata…        | compact-large-41 / agent-chat | `Gateway test RPC sessions.create … timeout`          | **not run** (agent-chat crash); ✓ locally (run 2) | load-timing (same family); red at bc257b91 too                      |
| `server.sessions.create.durability` › persists and dispatches concurrent… | same                          | same                                                  | **not run**; ✓ locally                            | same                                                                |
| `server.sessions.create.reload` › … for administrator                     | same                          | same                                                  | **not run**; ✓ locally                            | same                                                                |
| `server.sessions.create.reload` › … for operator                          | same                          | `Test timed out in 120000ms`                          | **not run**; ✓ locally                            | same                                                                |
| `secrets/egress-proxy/proxy-server` › substitutes a fixed-length body…    | compact-small-3               | `listen EADDRINUSE 127.0.0.1:31600`                   | ran, ✓                                            | env: port collision; greened in base subset rerun 43744242940       |
| `test/scripts/team-shape-fixture` › adds bounded long histories…          | compact-small-35              | `Fixture stopped: Linux Dirty memory … reached 2 GiB` | ran, ✓                                            | env: host memory pressure; greened in base subset rerun 43744242940 |
| `team-shape-fixture` › creates canonical sessions…                        | same                          | same                                                  | ran, ✓                                            | same                                                                |
| `team-shape-fixture` › preserves existing sessions…                       | same                          | `Command failed: …/node26.12.1/arm64/bin/node …`      | ran, ✓                                            | same                                                                |

### Per-shard test counts

Of the 128 summarized shards, only these pass/fail counts differ between the runs:

| shard                   | c5ed (pass/fail) | ab5a (pass/fail) | bc25 (pass/fail) | reading                                                                                                                                 |
| ----------------------- | ---------------- | ---------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| extension-providers     | 3769 / 2         | 3762 / 2         | 3762 / 2         | **+7 = the 7 new #1565 tests**; same 2 anthropic failures                                                                               |
| compact-large-41        | 405 / 6          | 1253 / 6         | 1252 / 7         | agent-chat crash: about 850 tests unrun at c5ed                                                                                         |
| compact-large-18        | 2982 / 1         | 2983 / 0         | 2983 / 0         | catalog-write flake; same total                                                                                                         |
| compact-large-42        | 6860 / 2         | 6859 / 3         | 6860 / 2         | config-record-keys flake at base; same total                                                                                            |
| compact-large-22        | 5036 / 0         | 5036 / 0         | 5065 / 0         | bc257b91's own added tests; c5ed = base                                                                                                 |
| compact-small-39        | 3490 / 0         | 3492 / 0         | 3490 / 0         | −2 passed vs base, but equal to bc257b91 on the same workflow; no red; core-tooling-9/11 are untouched by the diff (not chased further) |
| compact-small-dist-1/-2 | 129, 97          | 129, 97          | not run          | equal to base                                                                                                                           |

## static-gates: the knip deadcode rows, carried from base

Static gate summary for `c5ed7c71`: **41 checks, 38 ok, 3 failed, 0 not run.** The 3 failures are `deadcode:dependencies`, `deadcode:unused-files` and `deadcode:exports` (row `check-dependencies`, knip 6.40.0). The other 4 gates passed: `lint:ui:no-raw-window-open`, `protocol:gen`, `plugins:assets:build` and `build:strict-smoke`. The findings:

- 3 unlisted binaries: `taskkill.exe`, `btrfs` ×2;
- 9 unused exports and 3 unused exported types, in `src/agents/**`, `src/plugins/provider-runtime.ts`, `src/plugins/types.ts`, `src/process/linux-oom-score.ts`, `src/shared/browser-pair.ts` and `src/gateway/server-methods/config-write-flow.ts`;
- 1 unused file: `test/scripts/plugin-npm-cli-transport.test-support.mjs`.

**None names Copilot.** I diffed `static-check-check-dependencies.log` against base 43711027259 and against 44630094881, with pnpm-dlx install noise removed. The **findings are identical**; the only differences are dlx progress lines. The row verdict tables also match base exactly. Base subset run 43744242940 additionally reds `baseline-ratchets` (`database-dialect-ratchet`); this run passed it.

## 🌊's checks

**(1) Dynamic catalog-param propagation.** Status: proven at the plugin boundary, and green in this run.

- **Test:** `extensions/github-copilot/models.test.ts:480-631`, `describe("listed per-prompt image cap on the Responses wire (#1565)")`.
  - It sends a Copilot `/models` listing with `capabilities.limits.vision.max_prompt_images` through `fetchCatalogWithFetch` (that is, `fetchCopilotModelCatalog` → `mapCopilotApiModelToDefinition`). At `models.ts:289-291,319-322` that sets `params.copilotMaxPromptImages`.
  - It spreads the listed row into a runtime model (:551-557) and streams through `wrapCopilotProviderStream` (:560-566) on the real `createBoundaryAwareStreamFnForModel` transport, against a local HTTP server that captures the wire body.
  - It asserts the capped Responses `input` for cap 1 (2 cases), cap 5, and no cap (sends everything). It also asserts the persisted turns are left unmutated (:568).
  - `stream.ts:226-233` reads `model.params[COPILOT_MAX_PROMPT_IMAGES_PARAM]` and runs `capCopilotPromptImages` before the per-API patch.
- **Green in this run:** in `extension-providers` (hosted-batch-018, `supplemental-extension-providers/gate-test-shard-extension-providers.log`), the 4 `models.test.ts` cases (`sends only the newest image on a multi-image turn…`, `…on a later text turn…`, `keeps the newest listed number of images across turns`, `sends every image when the listing has no cap`) and the 3 `stream.test.ts` cases (`anthropic-messages wire`, `openai-completions wire`, `Responses tool output`) are all `✓`. Shard count: +7 passed vs base.
- **Gap (not a red):** the test spreads the listed row by hand (`...listed`, :553). It does not run `prepareDynamicModel` → `resolveDynamicModel` → core `normalizeResolvedModel`. By code reading, that hop keeps `params`:
  - `dynamic-models.ts:126-130` stores `{ ...model, provider, baseUrl }`;
  - `src/agents/embedded-agent-runner/model.provider-hooks.ts:130-131` spreads `...params.model`;
  - the registry projection keeps `params: model.params` (`src/agents/sessions/model-registry-runtime-model.ts:43`).

  `index.test.ts:325-373` proves that `prepareDynamicModel`/`resolveDynamicModel` carry catalog row fields (for example `contextWindow`), but no test asserts that `params.copilotMaxPromptImages` survives the core resolution path.

**(2) Direct-completion path scope.** Status: Copilot-scoped.

- **The cap lives only in the Copilot provider stream.** It is wired only inside `wrapCopilotProviderStream` (`stream.ts:206`, cap at :226-233). That function is registered only as the github-copilot provider's `wrapStreamFn` (`index.ts:600`). `wrapCopilotSimpleCompletionStream` (`stream.ts:188-204`, registered as `wrapSimpleCompletionStreamFn` at `index.ts:601`) is **unchanged** by the diff. **So direct completions are not capped** (scope fact, stated plainly).
- **No other provider gets it.** It is gated on `model.params.copilotMaxPromptImages`, which only Copilot's catalog mapper sets (0 references outside `extensions/github-copilot`).
- **No non-Copilot provider test changed outcome.** `extension-providers` matches base apart from +7 passes and the same 2 failures (`extensions/anthropic/session-catalog-transcript` ×2, also red at bc257b91). `extension-provider-openai` is 1178/0 at all three refs. No row of the failure diff is in any provider plugin.

## Missing coverage, and what a rerun of only that needs

Two coverage holes:

| hole                                             | job (id)                                                                                                                                                                       | what it covers                                                                                                                                        | note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extension-database-workers` cancelled at 5273 s | `hosted(extensions,extension-database-workers)` (136078769297), cancelled                                                                                                      | the whole edw shard; the last reported file was `extensions/team-reports/src/sources/github/index.test.ts` (9119 output lines, in-flight log kept)    | Also cancelled at the base, both times. A plain rerun hits the same 5400 s cap again. Real coverage needs a split shard or a longer cap, which is a workflow change outside this lane.                                                                                                                                                                                                                                                                                                                        |
| agent-chat crash inside `compact-large-41`       | `hosted(compact-large-28,compact-large-34,…)` (136078768450), failure; batch hosted-batch-014 = `compact-large-28`, `compact-large-34`, `compact-large-41`, `compact-small-25` | **88 gateway-server test files** that never ran at c5ed (`lane-evidence/1565-copilot-modeb-classify/output-lists/agent-chat-files-unrun-at-c5ed.txt`) | Run 44672992870 is terminal (completed at 08:42:50Z), so **no cancel is needed**. The rerun is `gh run rerun --job 136078768450` (base run took about 47 min), plus `--job 136078769297` only if the edw cap problem is solved. A job rerun also reruns the jobs that `need` it (here `aggregate + status`). Check the `needs:` graph first (memory `gh-rerun-job-reruns-dependents`). Never a second dispatch at `c5ed7c71`: the concurrency group `openclaw-local-ci-<ref>-<repo>` cancels the earlier run. |

The 4 base-only `sessions.create` tests sit inside the 88 unrun files. They passed locally at c5ed (run 2), but that is local evidence, not CI coverage.

## Repair-regression gate

This lane repairs nothing: there is no product change, so the fix-and-regression gate has nothing to apply to. The deterministic controls it did run are the two local reruns at `c5ed7c71` and the catalog-write base/candidate alternation.

## Uncertainties

- **I cannot fully explain the agent-chat crash.** The crash itself is in the vitest resource-claim cleanup, after `chat-queued-followup` hit its timeouts. It matches CPU starvation (358 % vs about 680 %), but I did not reproduce the crash. Locally the same files pass.
- **The `−2` passed in `compact-small-39` is not chased** (no red, equal on the same workflow).
- **The CI child env is not captured**, so the environmental labels are families matched from the error text, not proven CI root causes.
- **The GitNexus answer comes from a stale index** (above), and was byte-verified with `git grep` and harness reads.

## Local proof receipts (raw logs kept in `/tmp/claude-1000/1565-classify/`)

| receipt                      | ref                     | command                                   | result                                                                        |
| ---------------------------- | ----------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `local-c5ed-run1.log`        | `c5ed7c71`              | 11 c5ed-only files, gateway-server config | 11/11 files, 58/58 tests passed                                               |
| `local-c5ed-run2.log`        | `c5ed7c71`              | the 11 plus 4 `sessions.create` files     | 13/14 files, 92/93 tests; catalog-write `database is locked` :239             |
| `cw-{c5ed,ab5a}-{1,2,3}.log` | `c5ed7c71` / `ab5a30ea` | catalog-write alone, alternating          | c5ed 3/3 pass; ab5a run 1 **fail** (`database is locked` :239), runs 2–3 pass |

Environment: ronan (aarch64), Node v26.12.1 (`~/.nvm`), `OPENCLAW_VITEST_RUNTIME=node`, `NO_COLOR=1 FORCE_COLOR=0`, `umask 022`, `--maxWorkers=1`, `frond-scribe/skills/pr-drift-cure-gates/run-isolated-from-live-gateways.sh`. The install is a `cp -al` hard-link of the lock-matched `WORKTREES/openclaw-1564-compose-gen-ingress` node_modules: same `pnpm-lock` blob `c0ae2058…`, identical `packages/ ui/ tools/ examples/` vs c5ed, donor untouched. The base control worktree is `WORKTREES/openclaw-1565-classify-ab5a-ctl` (detached at `ab5a30ea`), a cleanup candidate.

## Exact commands (abridged)

```bash
# per-shard failure sets (summary.json) and log × lines, per run
bash $SCRATCH/failsets/shard-failset.sh <run-dir> <out>      # .failures[kind=test]
/tmp/claude-1000/1565-classify/logfail.sh <run-dir> <out>    # [shard:X] × lines, [shard-failure:X] lines
python3 -I /tmp/claude-1000/1565-classify/firsterr.py <run-dir> <out>   # first error per FAIL header
# baselines (read-only, GH_CONFIG_DIR=~/.config/gh-karmafeast)
gh api repos/karmaterminal/openclaw-bootstrap/actions/runs/<id>/artifacts   # product sha from aggregate name
gh run download <id> --repo karmaterminal/openclaw-bootstrap --name <each non-dist artifact>
# local control
umask 022; PATH=~/.nvm/versions/node/v26.12.1/bin:$PATH NO_COLOR=1 FORCE_COLOR=0 OPENCLAW_VITEST_RUNTIME=node \
  run-isolated-from-live-gateways.sh "$PWD" node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.gateway-server.config.ts --maxWorkers=1 <files>
# GitNexus (fork 1.6.5, 3c1e686e), from WORKTREES/openclaw-gn-39d19454
gnx cli cypher -r openclaw-composite-39d19454 "MATCH (a:File)-[e:CodeRelation]->(b:File) WHERE b.filePath IN [...] RETURN a.filePath, e.type, b.filePath"
```

CI path for this lane: **read-only classification of an existing Mode-B run** (no new Mode-B dispatch; local focused controls only).

🌿 frond-scribe, via Claude Code
