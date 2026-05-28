# PR #85651 drift-cure-N+3 Lane B resolution trail

Base: `792bff46b30aeb8c80a4a8a07a7d477a2808701c`
Target used: `00fb15253cbdfacec3cd2c34a22ace4d753c6184` (`origin/main` advanced beyond the workorder target)
Lane: `copilot/pr85651-driftcure-N3-20260528-062600`

## Preservation mandate handling

- Rebase was a single cherry-pick of the PR-head feature commit onto the current target. No wholesale file replacement was used for conflicted production files.
- The modify/delete conflict for `.agents/skills/openclaw-changelog-update/SKILL.md` was surfaced to `karmaterminal/openclaw#796` before resolution. Final resolution keeps the current upstream file instead of reapplying the PR-head deletion because the deletion is not part of the continuation feature surface and keeping upstream deletes no PR-head bytes from that absent file.
- i18n metadata conflicts keep upstream locale-refresh metadata (`generatedAt`, `provider`, `model`) while merging the PR-head feature key state (`chat.error`, `chat.toolReturnedError`, total/source hash/fallback counts).

## Substantive conflict decisions

- `extensions/codex/src/app-server/dynamic-tools.ts`: kept upstream dynamic-tool schema quarantine and diagnostics, while retaining the PR-head searchable/deferred dynamic tool loading behavior by passing projected schemas into the deferred spec builder.
- `extensions/codex/src/app-server/dynamic-tools.test.ts`: kept upstream quarantine coverage and PR-head direct/deferred dynamic-tool coverage; restored the missing `embeddedAgentLog` import required by the upstream test.
- `package.json`: kept upstream test-only plugin-sdk package exclusions; no continuation feature bytes were involved in that hunk.
- `src/agents/embedded-agent-runner/run-state.ts`: combined upstream abandoned-run maps with PR-head active session key/file state so both restart recovery and continuation targeting maps survive.
- `src/agents/embedded-agent-runner/runs.ts`: kept upstream abandoned-run helpers and reset cleanup, plus PR-head active key cleanup and session-file key tracking.
- `src/agents/utils/tools-manager.ts`: kept the PR-head `Date.now()` plus `generateSecureToken(6)` extraction-directory suffix. Upstream's `randomUUID()` served the same uniqueness purpose, but the PR-head secure-token byte was preserved.
- `src/config/sessions.cache.test.ts`: kept upstream mutable-cache ownership regression tests; no continuation feature bytes were involved in that hunk.
- `src/gateway/server-restart-sentinel.ts`: combined upstream `expectedSessionId` restart-continuation guard with PR-head `postCompactionDelegate` and `traceparent` propagation by extending `enqueueRestartSentinelWake` to carry traceparent.
- `src/llm/providers/openai-codex-responses.ts`: kept upstream local `crypto` fallback and error text for secure request-id generation; no continuation feature bytes were involved.
- `test/scripts/crabbox-wrapper.test.ts`: combined upstream fake-Crabbox caching/artifact coverage with the PR-head node-helper fake runner and Azure/AWS proof tests.

## Mechanical conflicts

- `ui/src/i18n/.i18n/{ar,de,es,fa,fr,id,it,ja-JP,ko,nl,pl,pt-BR,th,tr,uk,vi,zh-CN,zh-TW}.meta.json`: merged generated metadata as described above.

## Gate E iteration 1 fix

- `src/agents/embedded-agent-runner/runs.ts`: removed duplicate active session file helper left by the three-way merge and restored `resolveEmbeddedSessionFileKey` import so upstream abandoned-run handling and PR-head session-file normalization share the same canonical helper.
- `src/plugin-sdk/agent-harness-runtime.ts`: restored the current-target `projectRuntimeToolInputSchema` export group required by upstream Codex dynamic-tool schema quarantine; this preserves the target SDK surface rather than adding a new subpath.
- `src/gateway/probe.close-drain.test.ts`: removed stale `no-underscore-dangle` oxlint suppression after Gate E iteration 2 showed it is now unused under the current lint rules.

## Gate E iteration 5 fixes

- `scripts/crabbox-wrapper.mjs` / `test/scripts/crabbox-wrapper.test.ts`: restored current-target Azure preference for unqualified Windows Crabbox runs while preserving the PR-head fake Crabbox helper improvements.
- `scripts/lib/plugin-sdk-private-local-only-subpaths.json`: restored current-target private local-only SDK test subpaths so boundary constants and generated package-boundary path config agree.
- `src/config/sessions.cache.test.ts`: restored the missing `updateSessionStoreEntry` import for the upstream writer-owned entry cache test.
- `extensions/codex/src/app-server/attempt-startup.test.ts`: updated the top-level logical startup error test to opt into the new `retireSharedClientOnLogicalStartupError` path used by production top-level attempts.
- `extensions/imessage/src/monitor.media-policy.test.ts`: waited for the async inbound policy check before asserting attachments were not staged.

## Gate E iteration 7 fixes

- `package.json`: re-synced plugin-sdk exports so private local-only test/helper subpaths are not published.
- `scripts/lib/plugin-sdk-entries.mjs` and `src/plugin-sdk/entrypoints.ts`: restored the current-target split where public dist artifacts and private local-only artifacts are listed separately.
- `scripts/test-projects.test-support.mjs`: raised only the full-extensions shard no-output watchdog to 15 minutes after Gate E proved the shard can pass with verbose output but remains silent for ~470s under the default reporter.
- `test/vitest/vitest.extension-slack.config.ts`: disabled Slack test file parallelism because the Slack monitor tests share one mocked Bolt handler map; Gate E exposed message-handler overwrites in the full-extensions shard.
- `test/vitest/vitest.test-shards.mjs`: split Slack out of the all-extension project shard into `vitest.full-extension-slack.config.ts` after Gate E showed Slack is healthy alone but unstable inside the very large multi-project extensions shard.

## Comparison-discovered fix before final handoff

- `src/agents/embedded-agent-runner/runs.ts`: restored `resolveEmbeddedSessionFileKey(...)` in active-run session-file lookup after lane comparison exposed that my candidate stored canonical session-file keys but looked them up with raw trimmed paths. Added regression coverage in `runs.test.ts`.
