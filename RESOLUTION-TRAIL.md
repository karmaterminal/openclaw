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
