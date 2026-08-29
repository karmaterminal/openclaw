# Independent Review of Covenant Assembly `b8a16fd7`

Issue binding: `openclaw/openclaw#129388`

Reviewed PR: https://github.com/openclaw/openclaw/pull/129388

By: Gwydion Nanashi Ferrinas Solidor (`@karmafeast`, account 2011-06-30) |
OpenClaw: 13 PRs, 5 issues, 1 default-branch commit in the last 12 months |
GitHub contribution graph: 20,550 commits, 9,977 PRs, 488 issues, 53 reviews
in the last 12 months (token-visible; may include private repositories).

## Named refs

No merge evidence below is credited until every applicable ref is resolved and
the local, tracking, and server identities agree.

| Category                  | Named ref                                                            | Full SHA                                   | Identity                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product/base              | `karmaterminal/openclaw@b8a16fd74f1803e85ff9bb8f7ca7cee4fafe0f25`    | `b8a16fd74f1803e85ff9bb8f7ca7cee4fafe0f25` | Local `HEAD`; commit tree is `f1e2ef3a59f29e165b99fe76b3e8e98c706fde23`; parents are `0109521b0c2b8a2c81c9f901789a81c5316074a7` and `93f7152b098beeb9ac64cb9b2437fc45a7558adf` |
| Absorb/source safe branch | `scribe/129388-covenant-upstream-absorb-20260828`                    | `b8a16fd74f1803e85ff9bb8f7ca7cee4fafe0f25` | Local = tracking = server                                                                                                                                                      |
| This review lane          | `codeagent/129388-b8a16fd7-independent-review-20260829`              | `b8a16fd74f1803e85ff9bb8f7ca7cee4fafe0f25` | Published unchanged; local = tracking = server before review evidence                                                                                                          |
| Savegame                  | `savegame/129388-covenant-upstream-absorb-b8a16fd7-20260829T040739Z` | `b8a16fd74f1803e85ff9bb8f7ca7cee4fafe0f25` | Local = tracking = server                                                                                                                                                      |
| CI/workflow               | N/A                                                                  | N/A                                        | Workorder calls for serial focused local proof, not broad acceptance CI                                                                                                        |
| Presentation              | N/A                                                                  | N/A                                        | Explicitly out of scope; `codeagent/85651-upstream-1ba243c8-gates` is not evidence for this review                                                                             |
| Docs/proof input          | N/A                                                                  | N/A                                        | This report is the requested output artifact, not an input ref                                                                                                                 |

## Findings

### 1. Blocking: recipient authority can change after the only prompt-adoption check

**Invariant and owner.** An authority-bound trusted system event must remain
bound to the same `session_recipient_authority` epoch through the final
model-visible prompt-adoption boundary. The owning composition boundary is
system-event preparation plus reply-run admission, not the later queue
acknowledgement.

`prepareFormattedSystemEvents` checks the epoch once at
`src/auto-reply/reply/session-system-events.ts:294-315`. It then crosses the
awaited transcript read at
`src/auto-reply/reply/session-system-events.ts:325-334`, performs further
awaited queue settlement, consumes the selected event, and constructs
`promptEvents` at `src/auto-reply/reply/session-system-events.ts:575-587`
without revalidating. The adoption callback at
`src/auto-reply/reply/session-system-events.ts:557-562` is only a queue ack.

There is another async window after preparation:
`executePreparedReplyRun` awaits current-turn image resolution at
`src/auto-reply/reply/get-reply-run-execute.ts:162-170`, then stamps the stale
delivery ID onto the persisted user turn at
`src/auto-reply/reply/get-reply-run-execute.ts:297-305`. Its adopted callback
at `src/auto-reply/reply/get-reply-run-execute.ts:353-365` again only settles
the recorded ID.

Restrictive sharing changes can commit during those windows.
`runExclusiveSharingMutation` does not interrupt or wait for active work
admissions (`src/gateway/server-methods/sessions-sharing.ts:43-53`), while
owner reassignment advances the epoch synchronously in the storage transaction
at `src/config/sessions/session-accessor.sqlite-owner.ts:68-79`. Member removal,
session deletion, and restrictive visibility changes have equivalent epoch
advances.

**Deterministic reproduction.** A Node 24 real-store probe:

1. created a real durable `systemEvent` row carrying
   `recipientAuthority` plus `awaitPromptAdoption: true`;
2. queued its trusted in-memory event;
3. reassigned the session owner in a microtask reached by the awaited
   transcript read; and
4. allowed `prepareFormattedSystemEvents` to finish.

Observed result:

```json
{
  "reassigned": true,
  "authorityCurrentAfter": false,
  "durableRowPending": true,
  "blocks": [
    {
      "key": "session-delivery:<id>",
      "text": "System: [...] stale durable delegate result"
    }
  ],
  "managedDeliveryIds": ["<id>"]
}
```

The exact stale epoch was false while its trusted text and adoption ID were
still returned. A removed member's or prior owner's continuation return can
therefore become model-visible and be recorded as adopted after revocation.
This is fail-open authorization behavior.

**Existing-test gap.**
`src/auto-reply/reply/session-system-events.recipient-authority.test.ts:37-102`
invalidates only before calling preparation and queues no
`sessionDeliveryAckId`; it cannot enter the awaited adoption path. The nearest
correct siblings do revalidate after async work:
`src/auto-reply/continuation/targeting.ts:138-203` checks before and after the
durable enqueue, and
`src/gateway/server-restart-sentinel-delivery.ts:49-104` removes a replayed
event if authority changes before wake.

**Provenance.** Clear: `d6e346b43a2a261099cf75135170cd614f43e6fd`
(Silas, author and committer, 2026-08-27) introduced the single early check on
the first-parent line. `434244b8b4e3a8d8b1ee15b0dce2f47a0fa89c01`
added the before-preparation tests. No separate landed PR or merger is
traceable; the work is carried by #129388. The merge preserves this first
parent behavior byte-for-byte, so this is not a manual-resolution regression,
but it violates a required invariant of the reviewed assembly.

**Best fix.** Keep authority facts structured and closure-bound until one
adoption owner can synchronously revalidate them after all awaited prompt
preparation and immediately before constructing/persisting `userTurnInput`.
On stale authority, withhold the keyed block, remove the delivery ID, and reuse
the existing stale-event ack/consume path. Merely adding another check inside
`prepareFormattedSystemEvents` is too early because
`resolveCurrentTurnImages` awaits afterward. Add a deterministic owner-boundary
regression that defers the real transcript-read boundary, commits owner/member/
delete revocation, and proves no block or adoption ID survives while the
durable stale row is settled.

**Confidence:** 10/10.

### 2. Blocking gate: first-parent test growth remains over the max-lines limit

The full changed-path gate reaches a single lint failure:

```text
src/gateway/server-methods/usage.sessions-usage.test.ts:1118:4
error eslint(max-lines): File has too many lines (1003). Maximum allowed is 1000.
```

Exact-ref controls with the same pinned Oxlint 1.78.0 and
`.oxlintrc.json` produced:

| Ref                                                        | Effective lines | Oxlint |
| ---------------------------------------------------------- | --------------: | -----: |
| First parent `0109521b0c2b8a2c81c9f901789a81c5316074a7`    |            1003 | exit 1 |
| Upstream parent `93f7152b098beeb9ac64cb9b2437fc45a7558adf` |            1000 | exit 0 |
| Merge `b8a16fd74f1803e85ff9bb8f7ca7cee4fafe0f25`           |            1003 | exit 1 |

The three extra lines at
`src/gateway/server-methods/usage.sessions-usage.test.ts:963-965` came from
`00c7f721a55554d0b9228337cc8bc6bec88f9e9f`
(`test(ci): follow covenant schema and usage targets`, scribe-dandelion-cult,
2026-08-28). This is an inherited first-parent regression, not a silent
upstream revert or a new merge-resolution defect. It still leaves the exact
candidate red.

**Best fix.** Split the oversized test at its existing usage-timeseries/cache
owner boundary while retaining the three setup lines. Do not add a
`max-lines` suppression or baseline entry.

**Confidence:** 10/10.

## Merge-resolution review

The parents diverge from merge base
`b98e0dfe4f5731c906f07c409b122d1d8795729c`. Forty-eight paths were changed on
both sides. `git show --remerge-diff` identifies ten resolution paths:

1. `src/agents/embedded-agent-subscribe.handlers.messages.lifecycle.ts`
2. `src/agents/embedded-agent-subscribe.handlers.messages.replies.ts`
3. `src/agents/embedded-agent-subscribe.handlers.tools.completion.ts`
4. `src/agents/embedded-agent-subscribe.handlers.tools.ts`
5. `src/agents/embedded-agent-subscribe.ts`
6. `src/auto-reply/reply/streaming-directives.ts`
7. `src/cli/update-cli/update-command-post-update.test.ts`
8. `src/gateway/chat-display-projection.core.ts`
9. `src/gateway/server-chat.agent-events.test.ts`
10. `src/gateway/server-chat.ts`

No blocking defect was found in those ten resolutions:

- Message lifecycle retains first-parent commentary/continuation
  reconciliation and upstream managed-media projection.
- The extracted `createEmbeddedToolLifecycle` remains the single owner and
  carries upstream `replaySafe` effect receipts, including exact no-start
  provenance. The apparently dropped inline upstream code was relocated, not
  reverted.
- `streaming-directives.ts` keeps upstream line-aware MEDIA buffering while
  retaining the continuation-prefix capture that requires `expectDefined`.
- Chat display projection keeps both raw validation-output suppression and
  qualified sender identity.
- The update test keeps the fixed system-account home plus upstream's tracked
  temporary directories; service ownership assertions remain intact.
- The remaining 38 overlap paths are automatic merge unions. Independent
  parent-delta comparison found no upstream-deleted file resurrected and no
  substantive upstream test or fix removed.

### Deferred terminal-text repair

The merge-only repair is correct and is the best ownership split.
`src/gateway/server-chat.ts:774-799` always enters `emitChatTerminal` while an
active `chat.send` owns only the terminal frame. The helper resolves and flushes
display-safe buffered text, clears the run buffer, then returns before terminal
broadcast when `terminalFrameOwnedElsewhere` is set
(`src/gateway/server-chat.ts:1155-1173`). Post-dispatch `chat.send` therefore
retains terminal-frame ownership and advances the preserved lifecycle sequence.

A synthetic exact negative-control commit
`1aadb9a5f0ec4dc31d4f2c5085b8508a1e24497a` was made outside the lane by
reverse-applying only the `server-chat.ts` remerge repair while retaining
`src/gateway/server-chat.agent-events.test.ts:4865-4919`. The focused test
failed exactly as intended:

```text
expected [] to deeply equal [ 'MEDIA:chart.png' ]
```

The same test passes on `b8a16fd7`. Its sibling coverage also passes:

- already-streamed text is not emitted twice;
- yielded terminals remain lifecycle-owned;
- active `chat.send` errors and validation aborts retain terminal ownership;
- managed MEDIA directives and internal/runtime control text are display
  projected before the flush; and
- final sequence order is delta then one terminal frame.

The repair is production `+9/-2` (net `+7`) and tests `+56/-0`. The positive
production delta is justified by the explicit buffer-projection versus
terminal-frame ownership boundary. A net-neutral alternative would either
duplicate the display-safe flush at the caller or let two owners broadcast a
terminal.

## Required-invariant evidence

| Invariant                                                                      | Evidence                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Message lifecycle, dynamic tools, live model switching, transcript redaction   | Resolved subscribe modules preserve both parents; focused subscribe, terminal-outcome, Code Mode, model-switch, Codex dynamic-tool, and redaction tests pass.                       |
| Chat projection, directives, and terminal ownership                            | Gateway agent-event, display-projection, managed-media, directive-tag, and terminal negative/positive controls pass.                                                                |
| Cron, session cost, TUI, and update                                            | Focused cron delivery/tool-policy, session-cost, TUI attachment/stream/backend, and update post-finalization tests pass.                                                            |
| Continuation trigger, traceparent, delivery generation, post-compaction return | Continuation dispatch/recovery, trace integration, subscribe generation, and restart tests pass. Parent-delta inspection found no merge edits to the owning paths.                  |
| Schema v19 from both physical v18 lineages                                     | `src/state/openclaw-agent-participants-migration.test.ts:430-616` passes both `covenant` and `upstream` physical-v18 cases; the focused upstream-v18 DB migration test also passes. |
| `/new`, reset, fallback, compaction, restart, session-ID continuity            | `src/config/sessions/session-recipient-authority.test.ts` passes logical-mailbox rollover/fallback/compaction/reopen and `/new`/`/reset` materialization cases.                     |
| Delete, owner reassignment, member removal, restrictive visibility revocation  | Storage mutations correctly rotate the epoch, but Finding 1 proves the prompt consumer fails to revalidate after await; this invariant is not satisfied end-to-end.                 |
| Managed-artifact exact-session binding                                         | Managed artifact returns remain mutually exclusive with logical recipient authority and preserve exact recipient session ID through enqueue/replay/adoption tests.                  |

## Dependency-contract proof

The reviewed Codex plugin pins `@openai/codex` `0.150.1`. I directly inspected
the sibling `openai/codex` source at tag `rust-v0.150.1`, commit
`90854393966b21e9ebfd21b122334eb09a20c93d`:

- `codex-rs/app-server-protocol/src/protocol/v2/thread.rs:62-144` exposes
  `dynamicTools` on `thread/start`;
- `codex-rs/app-server/src/request_processors/thread_processor.rs:278-365`
  validates names and input schemas, and `:1387-1430` binds tools into the
  thread;
- `codex-rs/core/src/tools/handlers/dynamic.rs:108-161` forwards parsed
  arguments and returns the client response; and
- `codex-rs/core/src/tools/handlers/dynamic.rs:171-213` registers each pending
  call on the exact active turn.

That contract confirms OpenClaw must enforce the scheduled Gateway/node target
in its host-owned tool projection. The merged
`extensions/codex/src/app-server/dynamic-tool-build.ts` still requires the
closure-bound projection factory, and `src/agents/exec-tool-target-pinning.ts`
removes caller-controlled host/security/approval fields from both schema and
execution arguments.

## Commands and results

### Identity and topology

```text
git rev-parse HEAD HEAD^{tree}
git rev-list --parents -n 1 HEAD
git ls-remote origin <review-lane> <safe-branch> <savegame>
git show --remerge-diff --name-only b8a16fd7
git diff-tree -c --name-only -r b8a16fd7
git diff --check 0109521b b8a16fd7
git diff --check 93f7152b b8a16fd7
```

Result: exact commit/tree/parents matched the workorder; local/tracking/server
refs matched before evidence; 10 remerge paths and 48 both-parent overlap
paths; both parent-edge whitespace checks passed.

The linked worktree did not install or reconcile dependencies. It used the
clean safe lane's same-host `node_modules` and `ui/node_modules`, whose
`package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` hashes match the
reviewed product. All focused commands ran under Node `v24.20.0`, one worker.

### Focused tests

Each row used:

```text
node scripts/run-vitest.mjs run --config <config> --maxWorkers=1 <paths>
```

| Config                                                                   | Effective paths                                                                                                   |                                                                    Result |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------: |
| `test/vitest/vitest.agents-core.config.ts`                               | subscribe message lifecycle/update/tools, deferred delivery, continuation reconciliation, chunking/text-end files |                                                      15 files, 367 passed |
| `test/vitest/vitest.agents-core.config.ts`                               | `agent-command.live-model-switch.test.ts`, `transcript-redact.test.ts`                                            |                                                       2 files, 205 passed |
| `test/vitest/vitest.agents-embedded-agent-run.config.ts`                 | terminal resolution/preparation, message-tool terminal, deferred lifecycle                                        |                                                        4 files, 83 passed |
| `test/vitest/vitest.unit-fast.config.ts`                                 | reply/media helpers, tool terminal outcome, embedded terminal outcome, compaction live-model selection            |                                                        5 files, 56 passed |
| `test/vitest/vitest.agents.config.ts`                                    | Code Mode lifecycle, scheduled exec target                                                                        |                                                        2 files, 26 passed |
| `test/vitest/vitest.agents-embedded-agent-overflow-compaction.config.ts` | provider ceiling / overflow compaction                                                                            |                                                          1 file, 5 passed |
| `test/vitest/vitest.gateway-server.config.ts`                            | agent events, server chat, continuation trust, restart sentinel                                                   |                                                       4 files, 394 passed |
| `test/vitest/vitest.gateway-core.config.ts`                              | chat display, media projection, managed image attachments                                                         |                                                       3 files, 157 passed |
| `test/vitest/vitest.gateway-methods.config.ts`                           | chat directive tags                                                                                               |                                                        1 file, 203 passed |
| `test/vitest/vitest.auto-reply-reply.config.ts`                          | streaming/reply directives                                                                                        |                                                        1 file, 125 passed |
| `test/vitest/vitest.auto-reply-reply.config.ts`                          | 13 authority, delivery, trace, restart, post-compaction, and reset files                                          |                                                      13 files, 148 passed |
| `test/vitest/vitest.unit-src.config.ts`                                  | physical-v18 participant/schema convergence                                                                       |                                                         1 file, 18 passed |
| `test/vitest/vitest.unit-src.config.ts`                                  | `openclaw-agent-db.test.ts -t "upgrades upstream v18 recipient authority..."`                                     |                                                     1 passed, 120 skipped |
| `test/vitest/vitest.runtime-config.config.ts`                            | session recipient authority continuity/revocation                                                                 |                                                          1 file, 7 passed |
| `test/vitest/vitest.cron.config.ts`                                      | current-session delivery and scheduled-tool policy                                                                |                                                       2 files, 168 passed |
| `test/vitest/vitest.infra.config.ts`                                     | four session-cost usage/cache/reporting files                                                                     |                                                        4 files, 80 passed |
| `test/vitest/vitest.agents-core.config.ts`                               | delegate artifact policy and continuation-return routing                                                          |                                                         2 files, 4 passed |
| `test/vitest/vitest.infra.config.ts`                                     | managed artifact session delivery binding                                                                         |                                                          1 file, 2 passed |
| `test/vitest/vitest.gateway-methods.config.ts`                           | managed artifact lifecycle and stale-ID routing                                                                   |                                                          1 file, 2 passed |
| `test/vitest/vitest.tui.config.ts`                                       | embedded backend                                                                                                  |                                                        1 file, 107 passed |
| `test/vitest/vitest.tui.config.ts`                                       | attachment failures and stream assembler                                                                          |                                                        2 files, 40 passed |
| `test/vitest/vitest.extension-codex-app-server-tools.config.ts`          | Codex dynamic-tool build                                                                                          |                                                         1 file, 96 passed |
| `test/vitest/vitest.extension-codex.config.ts`                           | Codex model catalog                                                                                               |                                                          1 file, 8 passed |
| `test/vitest/vitest.gateway-server.config.ts`                            | deferred-terminal regression only                                                                                 | 1 passed on `b8a16fd7`; 1 expected failure on negative control `1aadb9a5` |

This is focused owner proof, not a broad-suite tally. No Mode-B run was
dispatched because the workorder selected focused-only review proof and the
candidate already has blocking findings.

### Changed-path checks

```text
node scripts/check-changed.mjs -- <48 both-parent overlap paths>
```

After linking the safe lane's exact UI dependency tree (no install), the rerun
reported:

- conflict markers, format, max-lines suppression ratchet, assertion-safety,
  dependency/package/Plugin SDK/boundary/generated guards: passed;
- dead export scan and database-first/runtime-sidecar/static guards: passed;
- complete core/UI/extension/scripts/test TypeScript graphs: passed; and
- lint: failed only on Finding 2.

Exact parent control:

```text
./node_modules/.bin/oxlint --config .oxlintrc.json \
  src/gateway/server-methods/usage.sessions-usage.test.ts
```

Result: first parent exit 1, upstream parent exit 0, merge exit 1.

## Review metrics

Raw remerge resolution delta:

```text
Production: +33/-163 (net -130) | Tests: +56/-5 (net +51)
```

Most production deletions are conflict-marker/duplicate-inline cleanup. The
only novel runtime behavior is the deferred-terminal repair:

```text
Production: +9/-2 (net +7) | Tests: +56/-0 (net +56)
```

## Best-fix verdict

- Deferred terminal text: **best fix** at the correct projection/terminal
  ownership boundary.
- Recipient authority: **too early and incomplete**; the check must move or be
  carried to the final adoption sink after all awaits.
- Oversized usage test: **candidate must be split**; suppression would be the
  wrong fix.

Alternatives rejected:

1. Restoring the old active-`chat.send` early return drops deferred visible
   text.
2. Letting lifecycle and `chat.send` both broadcast terminal frames duplicates
   output and breaks sequence ownership.
3. Adding only another check inside system-event preparation leaves the later
   image-resolution await open.
4. Weakening or delaying epoch rotation preserves stale authority and is not
   acceptable.

## Remaining uncertainty

- No live Gateway/channel run and no Mode-B broad acceptance were credited.
  Both are unnecessary to establish the two deterministic blockers, and the
  workorder selected focused-only proof.
- Presentation, corpus/deploy evidence, and later upstream are explicitly out
  of scope.
- The whole feature PR was not re-reviewed; this report is bound to the exact
  merge commit and its two parents.
- No product source or test file was modified by this review.

## Verdict

`REQUEST_CHANGES`

The merge-only deferred-terminal repair and the ten manual resolutions are
sound, and the focused preservation evidence is strong. The reviewed product
cannot be confirmed because it still permits a stale authority-bound trusted
system event to cross a restrictive recipient change into the model prompt,
and its exact changed-path gate remains red on an inherited first-parent
max-lines regression.
