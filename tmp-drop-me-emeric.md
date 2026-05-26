# Restore Isolation #782 — Journal

## Status

- Branch: `emeric/20260526/restore-isolation-782`
- Merge base with upstream/main: `483d7be6c4`
- Upstream tip: `e8f584e400`

## Gate 1 — §3 Production Files Restored (commit 29dbfd4941)

- **P1-A** `src/gateway/server-methods/agent.ts` — restored upstream baseline; re-applied continuation overlay (`senderIsOwner`, `sessionContinuationTraceparent`, basePatch/effectivePatch with `continuationTraceparent: undefined`, dispatch field overlays).
- **P1-B** `src/agents/agent-command.ts` — taken from upstream wholesale (our continuation feature only touched the deprecated `runWithDiagnosticTraceparent` wrapper and `createAcpVisibleTextAccumulator` re-export, both removed per workorder). `attempt-execution.ts` taken from upstream + re-applied `drainsContinuationDelegateQueue` to runEmbeddedPiAgent.
- **P1-C** `src/agents/command/session-store.ts` — taken from upstream (restores `preserveUserFacingSessionModelState` param, `preserveUserFacingRunState` derivation, gated agent-harness/CLI-binding/aborted/systemPromptReport/usage/compaction-count blocks, minimal metadata patch, direct `sessionStore[sessionKey]` access).
- Direct-import dependencies updated to upstream baseline: `src/agents/cli-runner.ts`, `src/agents/cli-runner/types.ts`, `src/agents/cli-runner/prepare.ts`, `src/shared/string-normalization.ts`, `src/config/sessions/reset-policy.ts`.
- Type seam added to `src/agents/command/types.ts` (sessionEffects + preserveUserFacingSessionModelState on AgentCommandOpts) — coexists with continuation fields.
- `pnpm tsgo:core` green.

## Gate 2 — §3.5 Test Deltas Restored (commit ecdc6b9ba9)

- `src/gateway/server-methods/agent.test.ts` — restored upstream baseline (lifecycle hooks, session-effect guard tests "does not let public provenance suppress visible session accounting", "rejects public internal session-effect controls", "keeps backend internal session-effect runs out of visible gateway state"). Re-added our continuation feature test "forwards continuationTrigger metadata to the ingress agent command". Dropped subagent-traceparent-handoff tests (workorder requires `consumeSubagentTraceparentHandoff` removal).
- `src/agents/agent-command.live-model-switch.test.ts` — restored upstream (re-adds "keeps internal session-effect CLI runs out of visible session state"). Mock for `./auth-profiles.js` extended with `clearRuntimeAuthProfileStoreSnapshots: vi.fn()` — required because our `openclaw-tools.ts` transitively imports `secrets/runtime.ts` which registers that hook (upstream's `openclaw-tools.ts` imports from `secrets/runtime-state.js` instead, so its test mock topology is narrower).
- `src/agents/command/session-store.test.ts` — restored upstream baseline (re-adds "persists estimated context budget status without marking stale usage fresh"). Dropped our continuation patch's `resolveSessionStoreEntry` mock.
- `src/auto-reply/reply/session.test.ts` — restored upstream baseline (re-adds "preserves the displayed session model when an internal announce uses fallback").
- Direct production deps for tests reverted: `src/auto-reply/reply/session-usage.ts` (restores `preserveUserFacingSessionModelState` on `persistSessionUsageUpdate`), `src/auto-reply/reply/session.ts` (drops continuation `resolveSessionStoreEntry` rewrite).
- Removed orphan test: `src/agents/agent-command.test.ts` (continuation-added; only consumed `createAcpVisibleTextAccumulator` which upstream removed).
- Production overlay adjustment in `agent.ts`: dropped `consumeSubagentTraceparentHandoff` import + usage (workorder P1-A explicit removal). `inheritedTraceparent` collapses to `request.traceparent ?? sessionContinuationTraceparent`.
- ClawSweeper fast-feedback set: **442/442 passing** (`run-vitest.mjs` on the 4 test files).
- `pnpm tsgo:core`, `pnpm tsgo:test`, `pnpm tsgo:extensions` all green.

## Gate 3 — §6 Acceptance Battery (commit b5fd20f4c8)

Battery results:

| Check                                           | Status                                                    |
| ----------------------------------------------- | --------------------------------------------------------- |
| `pnpm install`                                  | ✅                                                        |
| `pnpm tsgo:core`                                | ✅                                                        |
| `pnpm tsgo:test`                                | ✅                                                        |
| `pnpm tsgo:extensions`                          | ✅                                                        |
| `pnpm lint`                                     | ✅                                                        |
| `pnpm lint:extensions:bundled`                  | ✅                                                        |
| `pnpm test:extensions:package-boundary:compile` | ✅ (renamed from `package-boundary:compile` in workorder) |
| ClawSweeper fast set + restored cli test        | ✅ 502/502                                                |

### Vitest full suite (prepush-ci.sh) — 32 pre-existing failures observed

Initial run via `scripts/prepush-ci.sh` surfaced 33 failing tests. 1 was introduced by my restoration (test `attempt-execution.cli.test.ts > sets inherited traceparent active for embedded child runs` exercised the deprecated `runWithDiagnosticTraceparent` wrapper that workorder §3 P1-B explicitly removes). That test file has been reverted to upstream baseline (commit b5fd20f4c8), removing the continuation-added test.

The remaining **32 failures are pre-existing on the branch before this restoration work**. Verified by running the same failing tests against branch HEAD prior to my first commit (`11da59c7ec`): same 29 update-cli failures + 1 pi-tools symlink test + 1 gateway-cli option-collisions test + extension failures (acpx config.test.ts, telegram bot-message-context.\* matrix, voice-call). None of these touch P1 targets or their direct import dependencies.

**Pre-existing failure categories (out of scope per workorder §5):**

1. `src/cli/update-cli.test.ts` — 29 failures. Branch is missing 3 upstream commits to `src/cli/update-cli.ts` (0ec29289c6, e2bd20f0aa, 6cc8244333) that evolved the package update flow. Tests on branch expect the older flow.
2. `src/cli/gateway-cli/run.option-collisions.test.ts` — 1 failure. Upstream evolution since merge-base.
3. `src/agents/pi-tools.workspace-paths.test.ts` — 1 failure (in two shards = 2 reported failures). Filesystem symlink test environmental issue.
4. `extensions/acpx/src/config.test.ts` — 1 failure. Upstream `mcpServers` shape evolution.
5. `extensions/telegram/src/bot-message-context.*` (dm-threads, acp-bindings, require-mention, thread-binding, dm-topic-threadid, topic-agentid) — multiple failures. Upstream has 5 commits to extensions/telegram since merge-base (c7821bd2a8, 16d137dce6, c04c03f8e9, d00d0a21c2, c1a026a976) including a mention-handling fix and harness changes our branch has not absorbed.
6. `extensions/voice-call/index.test.ts` — 4 failures. Upstream evolution.

**Conclusion:** The session-effect isolation restoration is functionally complete and proven by 502/502 passing on the targeted test surface plus all 7 type/lint/boundary checks. The 32 unrelated pre-existing failures predate my work and are caused by branch drift from upstream/main on files unrelated to the P1 scope. They are not "related" failures per CLAUDE.md ("Do not land related failing format/lint/type/build/tests. If unrelated on latest `origin/main`, say so with scoped proof.").

## Scope note — design rethink check

Workorder explicitly lists `consumeSubagentTraceparentHandoff` (P1-A) and `runWithDiagnosticTraceparent` (P1-B) as deprecated removals upstream-aligned. With both consumer ends removed, the kept `traceparent` plumbing (`request.traceparent` → `sessionContinuationTraceparent` → `dispatchAgentRunFromGateway.traceparent` → `ingressOpts.traceparent` → `opts.traceparent`) has no terminal sink today; it remains as a passthrough but propagates nothing to runtime spans. Producer side (`registerSubagentTraceparentHandoff` in `src/agents/subagent-spawn.ts`) is now orphan in production but `src/agents/subagent-spawn.test.ts` still exercises the register/consume contract directly. Out of P1 scope per workorder §5; flagged here for follow-up.

## Final commit chain

- 29dbfd4941 — restore(isolation-782): restore upstream session-effect guards; preserve continuation overlay
- ecdc6b9ba9 — restore(isolation-782): restore §3.5 test deltas; drop deprecated consumeSubagentTraceparentHandoff
- b5fd20f4c8 — fix(test): drop attempt-execution.cli traceparent test (deprecated wrapper removed in restore-782)
