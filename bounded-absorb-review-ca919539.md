# Detached hostile review: bounded absorb `ca919539`

Verdict: `CONFIRMED_BOUNDED_ABSORB_CA919539`

## Immutable object receipt

| Object                           | Verified value                                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate                        | `ca919539579f6f745243757de22fbb8c400b9343`                                                                                             |
| Candidate tree                   | `fdaed7049c6f2381080f4ca7d44d4baeb76c9dab`                                                                                             |
| Honest merge                     | `2272226544120d0ed18949da0fe3348f27f48256`                                                                                             |
| Merge parents                    | `44adfedf24915a1c08bfe4abd1f4925b7ae51231` + `2e3f734017b9b1a5a32ba11d844d1fa7a5141de9`                                                |
| Cleanup sequence                 | `b311b7f8ae859ca22a1d9a36a7cfcd1afba9b61d` -> `3e44ceda76b76172871f216e48b202258f56edbc` -> `ca919539579f6f745243757de22fbb8c400b9343` |
| Accepted repaired-product review | `709f450770f265f6dee40d8566397b224dc67a03`                                                                                             |
| Protected presentation           | `00c7f721a55554d0b9228337cc8bc6bec88f9e9f`                                                                                             |

The review branch was created from the exact candidate. The candidate and protected
presentation were not changed.

## Autoreview P0 judgment

The reported P0 is a false positive. Its premise that delegate text is inserted into a
trusted system-role message is false at the reviewed bytes.

1. `formatDelegateTaskForSystemEvent` has exactly two production caller modules:
   `src/auto-reply/continuation/delegate-dispatch.ts` and
   `src/auto-reply/continuation/post-compaction-staged-dispatch.ts`. Their 17 task
   references in event arguments all pass through the formatter.
2. Delegate task text is model-controlled and can be influenced by untrusted input. It
   enters through the typed `continue_delegate` tool (bounded to 4096 characters) or the
   terminal `[[CONTINUE_DELEGATE: ...]]` assistant-output grammar (also truncated to
   4096 characters). These are reachable product flows.
3. `trusted: true` in `enqueueSystemEventRaw` does not select a model role and does not
   grant text authority. It gates internal delivery metadata (`expectedSessionId`,
   recipient authority, adoption state, and artifact receipts). Event text is trimmed
   and retained as data.
4. `prepareFormattedSystemEvents` prefixes every physical event line with `System:`,
   then the reply runner prepends those blocks to `commandBody` / `followupRun.prompt`.
   `src/auto-reply/reply/get-reply-run.media-only.test.ts` explicitly proves queued
   events enter user prompt text and do not enter `extraSystemPrompt`. Consequently
   `[System]`, `[Assistant]`, and `System: ignore previous instructions` remain
   look-alike strings inside a user-role message; they cannot create protocol roles.
5. The formatter/caller AST test proves string preservation and complete call-site
   coverage. The reply-run test and the explicit boundary comment in
   `session-system-events.ts` prove the intentional role-separated data semantics.
   They do not claim that language models ignore arbitrary prompt-injection prose;
   rather, they disprove the alleged privilege transition.

An attacker who influences a delegate task can cause attacker-influenced prose to be
seen again by the model, but does not gain a system-role channel or authority unavailable
in the original user turn. There is no presentation-blocking P0 and no bounded product
repair is required for this absorb. The formatter blob
`6ab3472053bc6e47c0043f85acd4968d259191bc` is byte-identical to accepted product
`44adfedf` and absent from frozen upstream, so this is also not absorb-authored.

## Conflict audit

`git show --remerge-diff 2272226544120d0ed18949da0fe3348f27f48256`
reconstructed exactly 37 textual conflicts:

1. `extensions/codex/src/app-server/dynamic-tool-build.ts`
2. `extensions/codex/src/app-server/dynamic-tools.ts`
3. `extensions/codex/src/app-server/run-attempt.dynamic-tools.test.ts`
4. `scripts/plugin-sdk-surface-report.mts`
5. `src/agents/agent-tools.before-tool-call.wrapper.ts`
6. `src/agents/command/attempt-execution.ts`
7. `src/agents/embedded-agent-subscribe.handlers.messages.stream.ts`
8. `src/agents/embedded-agent-subscribe.reply-delivery.ts`
9. `src/agents/subagents/registry/subagent-registry-run-wait.ts`
10. `src/agents/subagents/spawn/subagent-spawn.test.ts`
11. `src/agents/subagents/spawn/subagent-spawn.ts`
12. `src/auto-reply/reply/agent-runner-result-complete.ts`
13. `src/boards/board-notices.ts`
14. `src/commands/agent/session.test.ts`
15. `src/commands/export-trajectory.test.ts`
16. `src/commands/status.command-report-data.ts`
17. `src/context-engine/context-engine.test.ts`
18. `src/gateway/server-chat.ts`
19. `src/gateway/server-cron.test.ts`
20. `src/gateway/server-kernel.ts`
21. `src/gateway/server-methods/chat-send-reply-finalization.ts`
22. `src/gateway/server-restart-sentinel.ts`
23. `src/gateway/session-utils-store.ts`
24. `src/infra/heartbeat-wake.test.ts`
25. `src/infra/heartbeat-wake.ts`
26. `src/infra/system-events.ts`
27. `src/plugin-sdk/agent-harness-tool-runtime.ts`
28. `src/plugins/git-install.ts`
29. `src/process/command-queue.ts`
30. `src/state/openclaw-agent-db-schema.ts`
31. `src/status/status-text.ts`
32. `src/tasks/task-registry-delivery.ts`
33. `test/fixtures/agents/prompt-snapshots/codex-runtime-happy-path/discord-group-codex-message-tool.md.diff`
34. `test/fixtures/agents/prompt-snapshots/codex-runtime-happy-path/telegram-direct-codex-message-tool.md`
35. `test/fixtures/agents/prompt-snapshots/codex-runtime-happy-path/telegram-heartbeat-codex-tool.md.diff`
36. `test/scripts/docs-i18n.test.ts`
37. `ui/src/e2e/session-management.groups.e2e.test.ts`

The remerge diff was inspected in full. No conflict marker survives. The priority
dispositions compose rather than overwrite owners:

- Gateway startup retains startup tracing plus extra HTTP routes and handler maps; the
  `server.ts` options clone explicitly copies WeakMap-owned extras. Terminal chat
  ownership retains both `terminalFrameOwnedElsewhere` and upstream error observation,
  and records terminal broadcast only after delivery authorization.
- Session lookup uses the public `SessionEntry`/`SessionScope` surfaces and preserves
  canonical/internal-key handling without the retired private alias.
- Return completion keeps continuation covenant generation while incorporating current
  request-shaping, fallback availability, and trace ownership.
- Heartbeat coalescing preserves continuation global-barrier ordering and guard retries
  while carrying upstream waiter settlements through merge, retry, and handler
  replacement.
- System events preserve raw/core ownership and upstream provenance metadata. Replacement
  returns the owned entry without adding an extra clone boundary.
- Subagent collector activation remains behind accepted registration and rollback
  ownership; accepted-result and completion paths retain the continuation outcome types.
- Codex dynamic tool preparation retains the current prepared-arguments/runtime-plan
  structure and restores continuation delegation/compaction options at the composed
  owner.
- Agent DB migration uses the version-specific target schema, maintenance authority,
  media-version exception, and current-version repair ordering.
- Before-tool replay leaves adjusted-parameter ownership with the current adapter path
  rather than restoring the superseded duplicate map.
- Reply delivery combines callback retry/terminal accounting with auto-delivered media
  URL settlement; media-only and visible-reply discriminants remain separate.

No absorb-authored correctness defect was found.

## Cleanup commits

- `b311b7f8` is type composition only: it restores the reply-delivery option shape and
  removes a stale explicit session-entry annotation/import. Production behavior is
  unchanged.
- `3e44ceda` extracts/reflows existing result-payload, Gateway test, heartbeat, and DB
  schema expressions to remain within the existing max-lines budget. The max-lines
  ratchet remains 873 suppressions; no suppression or budget was added.
- `ca919539` only reformats `resolveAgentTextThrottleStream`; the conditional expression
  and return type are unchanged.

## Generated and scope invariants

- The conflict-authored assertion baseline change is exactly
  `src/agents/session-transcript-repair.ts` 14 -> 13.
- Config baseline generation passes with counts `core=2425`, `channel=3706`,
  `plugin=4055` and the committed hashes.
- Assertion safety passes at 4,116 files / 12,677 assertions.
- Max-lines passes at 873 grandfathered suppressions and `OPENCLAW_*` 500/500.
- Candidate `src/skills/**` tree is exactly frozen-upstream tree
  `92df50bdb2336b47b8b18a5e951375328bfb40b9`.
- Candidate `.github/labeler.yml` is exactly frozen-upstream blob
  `6178ed2468afd3a66066ccdb229fa581c96ce9ec`.
- Neither `openclaw/openclaw#121204` nor `openclaw/openclaw#124337` head or constituent
  commits is an ancestor of the candidate. Their overlapping baseline/docs paths do not
  carry their deployment patches.
- No presentation, proof-corpus, or docs-fold action was performed. Protected
  presentation remains the named exact object.

## Independent validation

All commands used Node `v24.17.0` with serial Vitest ownership:

- Gateway runtime/startup/chat/session owners: 103 tests passed in the directly observed
  files, plus queued-collector 34/34.
- Return-covenant product fixture and Gateway owner: 7/7 and 2/2; the fixture executes
  the complete typed/bracket case matrix.
- Heartbeat/system-event owners: 53 tests passed, including lifecycle 15/15.
- Cross-session case 10: 1/1 passed.
- Codex dynamic tool owners: 102/102, 169/169, and 14/14 passed.
- Agent DB schema/migrations: 124 passed, 6 platform-skipped.
- Before-tool adjusted-parameter owner: 18/18 passed. The E2E wrapper setup was
  independently blocked before test execution by another lane's shared
  `.artifacts/run-node-build.lock`; no candidate assertion failed.
- Subscriber lifecycle: 52/52 passed.
- Reply runner result payloads: 20/20 passed.
- Barnacle policy suite: 47/47 passed.
- `pnpm config:docs:check`, assertion-safety, max-lines, production Knip,
  `pnpm check`, and `pnpm build` all passed.

The existing Autoreview finding was adjudicated against exact source, call sites, model
message framing, and tests. Rerunning the same model review against an unchanged byte
would not add independent evidence.
