# Detached hostile review: bounded absorb `ca919539`

Verdict: `CONFIRMED_BOUNDED_ABSORB_1A13E801`

## Additive rereview of repair `1a13e801`

This section supersedes the request-changes verdict below while preserving the
original candidate and review history. The exact repair commit is
`1a13e80181232f58bf43cc4deda9ce6ae3325344`, tree
`3309ccc3870a9f81d26a009818e667e63b26f6e5`, with sole parent
`ca919539579f6f745243757de22fbb8c400b9343`. The named producer branch resolved
to that exact commit. Its additive delta is exactly four files, 38 insertions
and 9 deletions:

1. `src/agents/embedded-agent-subscribe.handlers.messages.lifecycle.ts`
2. `src/agents/embedded-agent-subscribe.handlers.messages.update.ts`
3. `src/auto-reply/reply/agent-runner-result-payloads.ts`
4. `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`

### Commentary identity repair

The update and final lifecycle paths now compute the same `commentaryItemId`.
Both prefer the provider/state-owned `lastAssistantStreamItemId`; only
non-Responses messages fall back to the existing
`resolveAssistantStreamItemId({ message })` signature parser. Responses
messages retain their prior state/content-index identity path and are not
assigned a generic signature fallback.

The derived ID is used both to scope cumulative provider content and to emit the
resolved commentary display. No new cast, type assertion, identity parser, or
fallback row is introduced. The existing generic-commentary owner drives
message start, update, and final emission with signed ID
`generic-commentary-item`. It now passes. The update emits one keyed preamble;
the final sees the same resolved text and `emitCommentaryDisplayTransition`
suppresses the equal snapshot, so no duplicate live/fallback row is emitted.
The adjacent Responses, Anthropic, stream-item, and phase owners also pass.

### Heartbeat silence repair

`buildTerminalEmptyInteractiveReplyPayload` now accepts an explicit boolean.
The ordinary no-visible-payload fallback passes the live `isHeartbeat`, so an
empty heartbeat with the reasoning presentation lane enabled returns no payload
and remains silent. The later post-stream fallback retains explicit `false`,
preserving the intentional interactive failure when a non-heartbeat turn
streams reasoning or commentary but produces no terminal payload.

The new heartbeat regression passes, as do the existing empty interactive,
disabled presentation-lane, and explicit streamed reasoning/commentary
fallback cases. The test helper adds typed optional booleans and conditional
option construction only; it does not weaken assertions or production types.

### Validation and invariant receipt

All direct tests ran serially under Node `v24.17.0`:

- commentary delivery: 26/26;
- update/commentary identity owners: 47/47;
- focused heartbeat, empty-interactive, and disabled-lane cases: 6/6;
- explicit non-heartbeat streamed reasoning/commentary fallback: 2/2.

`pnpm check`, `pnpm build`, production Knip, config baseline check, assertion
safety, max-lines, and Barnacle 47/47 all pass. Build emitted no
`INEFFECTIVE_DYNAMIC_IMPORT` warning. A bounded commit-mode Autoreview at P1
returned scoped-clean with no accepted P0/P1 finding.

The prior Gate 2, Gate 2.5, and Gate 2.7 receipts remain applicable by exact
ancestry and materiality: the repair is a one-commit overlay on the reviewed
candidate, its complete four-file delta was inspected, and every changed
runtime owner plus the relevant changed/existing tests was rerun directly.
There is no generated, composite, proof, documentation, deployment, or
presentation delta to reclassify. `src/skills/**` remains exact at tree
`92df50bdb2336b47b8b18a5e951375328bfb40b9`; `.github/labeler.yml` remains
exact at blob `6178ed2468afd3a66066ccdb229fa581c96ce9ec`; protected presentation remains
`00c7f721a55554d0b9228337cc8bc6bec88f9e9f`, tree
`55e2dc3b66ae909b37f948f4f96ebe9988cb8aae`.

The two absorb-authored defects recorded below are repaired without collateral
behavior change. The trusted-system-text Autoreview finding remains a false
positive and is unaffected by this repair.

## Additive correction after delayed audit completion

The replacement conflict auditor completed after the initial report commit and found two
absorb-authored defects. Both findings were independently reproduced at the exact
candidate. This section and the corrected verdict supersede the earlier no-defect
conclusions below while preserving the original receipt history.

### P0: generic commentary item identity dropped

The merge resolution for
`src/agents/embedded-agent-subscribe.handlers.messages.stream.ts` took the first-parent
implementation and failed to forward-port upstream's generic commentary identity from
`2e3f7340`. Upstream derives the generic commentary `itemId` with
`resolveAssistantStreamItemId({ message })`; the candidate's relocated
`emitResolvedCommentaryDisplay` callers pass only
`ctx.state.lastAssistantStreamItemId`, which is absent for this generic signed segment.

Reachable behavior: generic commentary reaches preamble delivery without its stable
`itemId`, so the live row cannot be keyed to the persisted fallback row and may survive
as a duplicate. The absorbed upstream regression test fails at the candidate:

`src/agents/embedded-agent-subscribe.subscribe-embedded-agent-session.reasoning-delivery.test.ts:371`

Expected `itemId: "generic-commentary-item"`; the emitted preamble has no `itemId`.

Smallest repair envelope: forward the generic non-Responses identity derivation into the
relocated commentary emission path, preserving the Responses item behavior, and make the
existing absorbed regression test pass.

### P1: heartbeat silence lost by max-lines extraction

`3e44ceda` extracted `buildTerminalEmptyInteractiveReplyPayload` in
`src/auto-reply/reply/agent-runner-result-payloads.ts:204` but hardcoded
`isHeartbeat: false` at line 210. The replaced call site passed the live `isHeartbeat`
value. On heartbeat turns the earlier `emptyInteractiveReplyPayload` is intentionally
undefined, so the new fallback executes with the wrong value and can emit the interactive
"I finished the turn, but it did not produce a visible reply" failure instead of
remaining silent.

Smallest repair envelope: parameterize the extracted helper with `isHeartbeat` (or retain
the original live value at the first call site) while keeping the intentionally
non-heartbeat second call explicit, and add a heartbeat no-visible-reply regression test.

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

Two absorb-authored correctness defects were found after the delayed audit completed; see
the additive correction above.

## Cleanup commits

- `b311b7f8` is type composition only: it restores the reply-delivery option shape and
  removes a stale explicit session-entry annotation/import. Production behavior is
  unchanged.
- `3e44ceda` extracts/reflows result-payload, Gateway test, heartbeat, and DB schema
  expressions to remain within the existing max-lines budget. The max-lines ratchet
  remains 873 suppressions and no suppression or budget was added, but the
  result-payload extraction is not behavior-neutral because it hardcodes
  `isHeartbeat: false`.
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
- Subscriber lifecycle: the selected lifecycle suite passed 52/52, but the absorbed
  generic-commentary identity regression fails 1/1 when run directly.
- Reply runner result payloads: 20/20 passed.
- Barnacle policy suite: 47/47 passed.
- `pnpm config:docs:check`, assertion-safety, max-lines, production Knip,
  `pnpm check`, and `pnpm build` all passed.

The existing trusted-system-text Autoreview finding remains a false positive after exact
source, call-site, model-role, and test adjudication. The independent conflict audit,
however, found the two separate absorb-authored defects recorded above.
