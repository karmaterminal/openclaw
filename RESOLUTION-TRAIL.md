# PR #85651 Drift-Cure-N+1 Resolution Trail

Lane: `ronan-seat-copilot`

Base: `f91e45d02fb368b9e1ba1ee304b780fb4fddb3b4`
Target: `c9d4f7e35c49fa1afb0138acfc50ad6785863f5f`

## Preservation mandate

Cherry-pick upstream delta; do not wholesale file-replace. PR-head continuation feature additions are preserved unless a deletion is explicitly classified with replacement proof.

## Pre-flight

The seven base preservation-surface greps passed on `f91e45d02fb368b9e1ba1ee304b780fb4fddb3b4` before branch mutation:

1. `src/agents/agent-command.ts`: `runWithDiagnosticTraceparent` import and call site.
2. `src/agents/command/attempt-execution.ts`: `runWithDiagnosticTraceparent` import and call sites.
3. `src/agents/command/attempt-execution.cli.test.ts`: inherited traceparent child-run test.
4. `src/gateway/server-methods/agent.ts`: `senderIsOwner = clientHasAdminScope(client)` and ingress option.
5. `src/gateway/server-methods/agent.ts`: `continuationTrigger` type and request extraction.
6. `src/gateway/server-methods/agent.ts`: `sessionContinuationTraceparent` declaration, assignment, and use.
7. `src/agents/pi-embedded-runner/run/assistant-failover.ts`: `timedOutDuringToolExecution`, consumer timeout throw branch, and `LLM request timed out.`.

Receipt: `gates/ronan-gate-preflight-base-grep-v2.log`.

## Modify/delete trio decisions

All three paths were deleted by `f91e45d02fb368b9e1ba1ee304b780fb4fddb3b4`, whose commit body tied the deletion to the needle-thread cure: production-side restoration of the throw-to-rotate contract in `src/agents/pi-embedded-runner/run/assistant-failover.ts` under harness-owned cross-provider timeout, conditioned on `!timedOutDuringCompaction && !timedOutDuringToolExecution`.

| Path                                       | Upstream delta                                                                                                                      | Decision                       | Proof                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `scripts/e2e/mcp-connect-timeout.ts`       | Added `MCP_TIMEOUT_CLOSE_GRACE_MS` and bounded awaited timed-out transport cleanup.                                                 | RESTORE + ADAPT upstream file. | Needle-thread failover covers LLM request timeout/failover rotation, not MCP stdio initialize cleanup. |
| `test/scripts/mcp-connect-timeout.test.ts` | Added tests that cleanup is awaited before rejection and cleanup rejection preserves the original timeout error.                    | RESTORE + ADAPT upstream file. | No replacement test exists if this file stays deleted.                                                 |
| `ui/src/ui/app.exec-approval.test.ts`      | Changed test app construction to `Object.create(OpenClawApp.prototype)` with explicit properties to avoid constructor side effects. | RESTORE + ADAPT upstream file. | This is Control UI exec-approval coverage, not covered by the needle-thread failover cure.             |

Receipts: `gates/ronan-trio-f91-delete.patch`, `gates/ronan-trio-upstream-diffs.patch`, and `gates/ronan-conflict-trio-history.log`.

## Content conflicts

| Path                                                            | Resolution                                                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHANGELOG.md`                                                  | Kept upstream current changelog entries; PR continuation entry remains represented by the candidate commit rather than an extra changelog edit.                     |
| `docs/.generated/plugin-sdk-api-baseline.sha256`                | Kept upstream generated baseline.                                                                                                                                   |
| `docs/plugins/sdk-channel-turn.md`                              | Kept upstream redirect/removal wording for removed channel-turn runtime aliases.                                                                                    |
| `docs/plugins/sdk-subpaths.md`                                  | Kept upstream deprecated-subpath wording aligned to current SDK exports.                                                                                            |
| `extensions/googlechat/src/monitor.test.ts`                     | Kept upstream DM reply-context test.                                                                                                                                |
| `extensions/googlechat/src/monitor.ts`                          | Kept upstream `core.channel.inbound.buildContext` API rename and DM thread handling.                                                                                |
| `scripts/e2e/mcp-channels-harness.ts`                           | Kept upstream MCP helper imports and `connectMcpWithTimeout` usage, consistent with restored helper.                                                                |
| `scripts/lib/plugin-sdk-deprecated-public-subpaths.json`        | Kept upstream deprecated public subpath list.                                                                                                                       |
| `src/acp/control-plane/manager.test.ts`                         | Kept upstream simplified persistence option assertions.                                                                                                             |
| `src/agents/pi-embedded-runner/run.overflow-compaction.test.ts` | Kept upstream expanded external CLI auth overlay coverage.                                                                                                          |
| `src/agents/pi-embedded-runner/run.ts`                          | Kept upstream external CLI auth overlay logic.                                                                                                                      |
| `src/channels/inbound-event/context.test.ts`                    | Kept upstream async supplemental-context and inbound API coverage.                                                                                                  |
| `src/channels/inbound-event/context.ts`                         | Kept upstream inbound context implementation with supplemental finalization and untrusted group prompt handling.                                                    |
| `src/cli/capability-cli.test.ts`                                | Kept upstream capability CLI parsing and embedding provider coverage.                                                                                               |
| `src/flows/doctor-core-checks.runtime.ts`                       | Restored upstream target runtime tool schema detection plus skill detector after Gate E proved the minimal PR-head side broke `doctor-core-checks.runtime.test.ts`. |
| `src/flows/doctor-health-contributions.test.ts`                 | Kept upstream heartbeat repair ordering; runtime tool schema behavior is covered in `src/flows/doctor-core-checks.runtime.test.ts`.                                 |
| `src/gateway/server-restart-sentinel.test.ts`                   | Kept upstream restart-sentinel test shape using current channel-message compatibility path.                                                                         |
| `src/plugin-sdk/test-helpers/plugin-runtime-mock.test.ts`       | Kept upstream `channel.inbound` mock coverage and removed `channel.turn` alias expectations.                                                                        |
| `src/plugin-sdk/test-helpers/plugin-runtime-mock.ts`            | Kept upstream `channel.inbound` mock implementation.                                                                                                                |
| `test/scripts/kitchen-sink-rpc-walk.test.ts`                    | Kept upstream readiness-log scanner coverage.                                                                                                                       |
| `test/scripts/openclaw-e2e-instance.test.ts`                    | Kept upstream hardened macOS/package timeout harness coverage.                                                                                                      |

## CI drift folded after rebase

1. Control UI chat tool-error badges now use `t("chat.toolReturnedError")` and `t("chat.error")` in `ui/src/ui/chat/grouped-render.ts` and `ui/src/ui/chat/tool-cards.ts`.
2. `ui/src/i18n/locales/en.ts` defines the new chat keys and `pnpm ui:i18n:sync` regenerated locale bundles plus `.i18n` metadata.
3. `src/agents/agent-command.live-model-switch.test.ts` now mocks `prepareInternalSessionEffectsTranscript`, so the internal session-effects test can assert the call and use a deterministic internal transcript path.
4. Gate E typecheck merge fixes restored target/PR-head-compatible type bytes: `untrustedGroupSystemPrompt` on channel supplemental facts, compaction failure context threading in `runEmbeddedPiAgent`, and the current `resolveSessionKeyForRequest` call shape.
5. Gate E lint fix removed an unnecessary `OutboundReplyPayload` assertion in `src/channels/message/inbound-reply-dispatch.ts`.
6. Gate E unit failure fixed a wrong conflict resolution by restoring upstream target `src/flows/doctor-core-checks.runtime.ts` plus `src/agents/tool-schema-projection.ts` and its test; these are the runtime tool-schema doctor check surface required by `doctor-core-checks.runtime.test.ts`.
7. Gate E full-shard failures fixed remaining conflict fallout:
   - restored `doctor:runtime-tool-schemas` and read-only hooks model catalog behavior in `src/flows/doctor-health-contributions.ts`;
   - restored Control UI exec-approval stale-resolution helpers and handler behavior in `ui/src/ui/controllers/exec-approval.ts` and `ui/src/ui/app.ts`;
   - kept PR-head ACP test cleanup for stale clone/cache-ownership assertions that no longer match current manager behavior;
   - restored PR-head context-pressure system-event/log anchors for timeout and overflow compaction paths in `src/agents/pi-embedded-runner/run.ts`.
8. Gate E follow-up restored the `core/doctor/runtime-tool-schemas` health check registration and conversion-plan entry so the restored doctor contribution has a registered target.
9. Gate E shrinkwrap guard failed after npm registry drift floated `lru-cache@^11` to 11.5.1 while `pnpm-lock.yaml` pins 11.5.0. `scripts/generate-npm-shrinkwrap.mjs` now emits parent-scoped npm overrides from the pnpm lock for multi-major transitives, preserving separate `lru-cache@6` consumers, and regenerated the stale Slack/Twitch shrinkwraps.
10. Gate E support-boundary timeout exposed real merge fallout in E2E helper scripts. Restored target `scripts/e2e/kitchen-sink-rpc-walk.mjs` and `scripts/lib/openclaw-e2e-instance.sh` so HTTP probes are bounded, Gateway teardown releases stalled handles, OpenClaw CLI wrapping remains timeout-protected, and PTY scripts run under the configured timeout.

## Gate D replacement proof

`git diff --diff-filter=D f91e45d02f..HEAD -- '*.test.ts'` reported one deleted test:

| Deleted test                                | Replacement proof                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pairing/allow-from-store-read.test.ts` | Upstream commit `1507a9701b83f35be98b6a3dfc017a9df359034e` removed the unused `allow-from-store-read` helper. Equivalent public-reader behavior is covered in `src/pairing/pairing-store.test.ts` by `reads allowFrom variants with account-scoped isolation`, which exercises both `readChannelAllowFromStore` and `readChannelAllowFromStoreSync`, including non-default account scoped reads and default/undefined account legacy merges. |

Receipt: `gates/ronan-gate-D-replacement-proof.log`.

## Origin drift note

The exact workorder target `c9d4f7e35c49fa1afb0138acfc50ad6785863f5f` resolved locally and was used for the rebase. During Gate A, `git fetch origin main` advanced `origin/main` to `5bf1f168d403236d111a14d7f8e4202b13630a85`, so both the literal moving-`origin/main` Gate A receipt and the exact-target Gate A receipt were saved.

Focused receipts:

- `gates/ronan-focused-ui-i18n-check.log`
- `gates/ronan-focused-agent-command-live-model-switch.log`
- `gates/ronan-ui-i18n-sync.log`
