# #1091 CI responsibility triage

## Outcome

- Code review of #1091 vs `frond-scribe/20260624/assembly-continuation-followons` found one continuation-owned timer bug: a queued busy retry could re-arm the session timer without considering an earlier running-work recovery deadline.
- Patched the continuation timer re-arm path so retry/schedule timers preserve the earliest of the requested due time, queued work, and running recovery.
- No current #1091 local-CI failures are classified as `#1091-local`. Remaining red is upstream-baseline, assembly/tooling drift, or runner/flake-unproven.

## Patch

- Commit: `e8f37c39d6` (`fix(continuation): preserve running recovery timers`)
- Files: `src/auto-reply/continuation/work-dispatch.ts`, `src/auto-reply/continuation/work-dispatch.test.ts`
- Behavior: `requeueWorkForRetry` and `scheduleContinuationWork` now share `armNextWorkTimer`, which includes `peekSoonestRunningWorkRecoveryDueAt(...)` when choosing the next hedge timer. Regression coverage proves a slow busy hedge cannot delay a sooner running recovery.

## Local-CI sources

| Ref | Run | Summary |
| --- | --- | --- |
| #1091 after review fixes | `28216157033` | `/tmp/oc-local-ci-28216157033/openclaw-local-ci-results-1db0afeae473442942369c0cb9fa4673cb3d2c9b/summary.md` |
| upstream baseline | `28214155662` | `/tmp/oc-local-ci-28214155662/openclaw-local-ci-results-6830aa39eaa16429daec9e03688e6e04e9e75841/summary.md` |
| assembly base | `28195101614` | `/tmp/oc-local-ci-28195101614/openclaw-local-ci-results-f27e2483608a3c8520ab5728506b5cae0ce7fcb0/summary.md` |

## Current #1091 failure classification

| # | Classification | Failure | Evidence |
| --- | --- | --- | --- |
| 1 | `runner/flake-unproven` | `src/gateway/server-reload-handlers.test.ts > gateway Gmail hot reload handlers > aborts an in-flight managed Gmail restart when the reloader stops` | #1091-only in local-CI run `28216157033`, but focused command `node scripts/run-vitest.mjs run --config test/vitest/vitest.gateway-server.config.ts --maxWorkers=1 src/gateway/server-reload-handlers.test.ts -t 'aborts an in-flight managed Gmail restart when the reloader stops'` passed on lane, assembly, and upstream. |
| 2 | `runner/flake-unproven` | `extensions/codex/src/app-server/run-attempt.test.ts > runCodexAppServerAttempt > does not leak unhandled rejections when shutdown closes before interrupt` | #1091-only in local-CI run `28216157033`, but focused command `node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-codex-app-server-attempt.config.ts --maxWorkers=1 extensions/codex/src/app-server/run-attempt.test.ts -t 'does not leak unhandled rejections when shutdown closes before interrupt'` passed on lane, assembly, and upstream. |
| 3 | `upstream-baseline` | `extensions/codex/src/app-server/run-attempt.test.ts > runCodexAppServerAttempt > keeps managed web_search for provider-qualified Codex model overrides` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 4 | `upstream-baseline` | `extensions/memory-core/src/cli.test.ts > memory cli > records short-term recall entries from memory search hits` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 5 | `upstream-baseline` | `src/infra/exec-authorization-render.test.ts > exec authorization renderer > renders dispatch-wrapper safe-bin commands without quote-all argv rendering` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 6 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > uses the auto-enabled config snapshot for inspect policy summaries` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 7 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > preserves raw config activation context when compatibility notices build their own report` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 8 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > preserves raw config activation context for compatibility-derived reports` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 9 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > normalizes bundled plugin versions to the core base release` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 10 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > marks snapshot-loaded plugin modules as imported during full report loads` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 11 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > marks errored plugin modules as imported when full diagnostics already evaluated them` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 12 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > builds an inspect report with capability shape and policy` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 13 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > builds inspect reports for every loaded plugin` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 14 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > treats a CLI-command-only plugin as a plain capability` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 15 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > treats a context-engine plugin as a plain capability` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 16 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > builds compatibility warnings for legacy compatibility paths` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 17 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > warns external plugins off deprecated memory embedding provider registration` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 18 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > warns when external plugins register memory embedding providers at runtime only` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 19 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > does not surface bundled memory embedding migration debt as user warnings` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 20 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > builds structured compatibility notices with deterministic ordering` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 21 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > does not warn for explicit startup-lazy metadata` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 22 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > returns no compatibility warnings for modern capability plugins` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 23 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > 'populates bundleCapabilities from plu…'` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 24 | `upstream-baseline` | `src/plugins/status.test.ts > plugin status reports > 'returns empty bundleCapabilities and …'` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 25 | `upstream-baseline` | `extensions/ollama/provider-discovery.test.ts > Ollama provider > discovers per-model context windows from /api/show` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 26 | `upstream-baseline` | `extensions/ollama/provider-discovery.test.ts > Ollama provider > auto-registers ollama provider when models are discovered locally` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 27 | `upstream-baseline` | `extensions/ollama/provider-discovery.test.ts > Ollama provider > falls back to default context window when /api/show fails` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 28 | `upstream-baseline` | `extensions/ollama/provider-discovery.test.ts > Ollama provider > caps /api/show requests when /api/tags returns a very large model list` | Present in #1091 run `28216157033` and upstream baseline run `28214155662`. |
| 29 | `assembly/tooling-drift` | `src/scripts/test-projects.test.ts > test-projects args > routes top-level test helpers to importing repo tests` | Focused command failed on lane and assembly, passed on upstream. This is not in continuation surfaces and belongs to #1090/tooling. |
| 30 | `assembly/tooling-drift` | `test/scripts/plugin-sdk-surface-report.test.ts > plugin SDK surface report > keeps default public surface budgets pinned to current source counts` | Focused command failed on lane and assembly, passed on upstream. This is not in continuation surfaces and belongs to #1090/tooling. |

## Focused repro matrix

| Probe | Lane | Assembly | Upstream |
| --- | --- | --- | --- |
| Codex shutdown unhandled rejection | pass (`/tmp/1091-focused-repros/lane-codex-shutdown.log`) | pass (`/tmp/1091-focused-repros/assembly-codex-shutdown.log`) | pass (`/tmp/1091-focused-repros/upstream-codex-shutdown.log`) |
| Gateway Gmail hot reload abort | pass (`/tmp/1091-focused-repros/lane-gateway-gmail.log`) | pass (`/tmp/1091-focused-repros/assembly-gateway-gmail.log`) | pass (`/tmp/1091-focused-repros/upstream-gateway-gmail.log`) |
| `test-projects` helper routing | fail (`/tmp/1091-focused-repros/lane-test-projects.log`) | fail (`/tmp/1091-focused-repros/assembly-test-projects.log`) | pass (`/tmp/1091-focused-repros/upstream-test-projects.log`) |
| plugin SDK wildcard budget | fail (`/tmp/1091-focused-repros/lane-plugin-sdk-budget.log`) | fail (`/tmp/1091-focused-repros/assembly-plugin-sdk-budget.log`) | pass (`/tmp/1091-focused-repros/upstream-plugin-sdk-budget.log`) |

## Validation

Commands run:

```bash
./node_modules/.bin/oxfmt --write --threads=1 src/auto-reply/continuation/work-dispatch.ts src/auto-reply/continuation/work-dispatch.test.ts
node scripts/run-oxlint.mjs src/auto-reply/continuation/work-dispatch.ts src/auto-reply/continuation/work-dispatch.test.ts
node scripts/run-tsgo.mjs -p tsconfig.core.json --incremental --tsBuildInfoFile .artifacts/tsgo-cache/core.tsbuildinfo
node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply.config.ts --maxWorkers=1 src/auto-reply/continuation/work-dispatch.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1 src/auto-reply/continuation/volatile-map-allowlist.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.agents-tools.config.ts --maxWorkers=1 src/agents/tools/continue-work-tool.test.ts src/agents/tools/continue-work-tool.boundary.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.agents.config.ts --maxWorkers=1 src/agents/command/attempt-execution.continue-work-opts.test.ts src/agents/command/attempt-execution.continue-work-token.test.ts
.agents/skills/autoreview/scripts/autoreview --mode branch --base origin/frond-scribe/20260624/assembly-continuation-followons
node scripts/test-projects.mjs
```

Results:

- `work-dispatch.test.ts`: 69 passed.
- `volatile-map-allowlist.test.ts`: 1 passed.
- `continue-work-tool*`: 15 passed.
- `attempt-execution.continue-work-*`: 17 passed.
- `tsgo`, `oxlint`, and `oxfmt`: passed.
- Autoreview: clean, no accepted/actionable findings.
- Full suite (`node scripts/test-projects.mjs`): failed after 89 Vitest shards in 621.60s. Tally from the local run: 27 failed tests, all matching upstream-baseline or assembly/tooling-drift classes; no continuation test failed. Failed shard digest: `extension-memory`, `infra`, `extension-providers`, `tooling`, `plugins`.

## Recommendation

#1091 is continuation-scope clean after the timer patch and focused validation. Remaining local-CI red should not block #1091 on continuation responsibility: #1090 or another tooling lane should own `test-projects` helper routing and plugin SDK budget drift; upstream/main baseline fixes should own memory, infra, plugin status, Ollama, and Codex managed web_search failures; Codex shutdown and Gmail hot reload should stay `runner/flake-unproven` unless a deterministic repro appears.
