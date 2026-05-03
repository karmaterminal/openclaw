# resurrect continue_delegate cross-session targeting journal

## §1 P0 issue

- Filed before code as required: karmaterminal/openclaw#550.
- Heartbeat sent after filing using `gh variable list` because this `gh` build lacks `gh variable get`.

## §2 required reads

- `docs/design/continue-work-signal-v2.md` §2.4 and future seams still described `targetSessionKey` / `targetSessionKeys` as unshipped future work.
- Current `src/agents/tools/continue-delegate-tool.ts` exposed only `task`, `delaySeconds`, and `mode`; runtime enqueued delegates only for the dispatching session.
- Current `src/agents/tools/continuation-tools-registration.test.ts` pinned the #463 regression: exact keys `[task, delaySeconds, mode]` and explicit `targetSessionKey` absence.
- `origin/cael/355-multi-recipient` stage-1 added descriptor and validation for plural `targetSessionKeys` and snake-case `target_session_keys`, but did not contain v52 runtime targeting, `tree`, or `all`.
- Current `src/auto-reply/continuation/types.ts` and `delegate-store.ts` did not retain the targeting fields described by the roadmap memory, so the v52 TaskFlow payload must be extended.
- `src/auto-reply/tokens.ts` bracket syntax accepted task, mode, and delay only; target syntax must be added.
- Session-delivery queue storage already supports addressable `systemEvent` payloads with `sessionKey`, `text`, and `idempotencyKey`.
- Discord receipt scan retried with the provided channel command shape, but Discord returned `{"message":"Invalid Form Body","code":50035}` instead of a message array; no receipt text was available from the API response in this worktree session.

## §3 resurrection strategy

- Strategy: careful extract + transpose, not naive cherry-pick.
- Cael #355 intent being preserved: descriptor advertises multi-recipient targeting, tool input accepts camel/snake plural, and tests assert the descriptor presence.
- v52 transpose decisions:
  - Old volatile delegate paths have moved to `src/auto-reply/continuation/delegate-store.ts`; targeting must persist in TaskFlow state.
  - Completion return is now mediated by subagent spawn registry + announce flow; targeting must be carried from delegate enqueue to `SpawnSubagentParams`, `SubagentRunRecord`, and `runSubagentAnnounceFlow`.
  - Bracket delegates and tool delegates share the same nested chain spawn points in `src/agents/subagent-announce.ts`; both must propagate target fields.
  - `tree` / `all` were not found in continuation branch history, so they will be implemented fresh against the current session-store/subagent-registry seams.

## §4 implementation notes

- Added shared continuation targeting helpers in `src/auto-reply/continuation/targeting.ts`.
- Extended `continue_delegate` schema and descriptor with `targetSessionKey`, `targetSessionKeys`, and `fanoutMode`.
- Tool input now accepts camel/snake singular/plural targeting fields, preserves #355-style strict plural array validation, and rejects explicit-target plus `fanoutMode` conflicts.
- TaskFlow delegate state now persists targeting metadata for pending and post-compaction delegates.
- Bracket syntax now accepts:
  - `[[CONTINUE_DELEGATE: task | target=session-key]]`
  - `[[CONTINUE_DELEGATE: task | targets=key1,key2,key3]]`
  - `[[CONTINUE_DELEGATE: task | fanout=tree]]`
  - `[[CONTINUE_DELEGATE: task | fanout=all]]`
- Runtime metadata now threads through delegate dispatch, subagent spawn params, subagent registry records, lifecycle announce calls, and post-compaction dispatch.
- Targeted completion returns enqueue byte-identical session-delivery `systemEvent` payloads, immediately inject them as system events, and ack the queue entry after injection; crash-before-ack remains restart-recoverable.
- `fanoutMode: "tree"` resolves through subagent-registry ancestor lookup; `fanoutMode: "all"` enumerates all known host session stores.

## §5 RFC notes

- Rewrote §2.4 to document shipped `continue_delegate()` return targeting modes.
- Removed the stale “future seam / non-goal” wording for `targetSessionKey` and `targetSessionKeys`.
- Updated future work to keep SeedLink / Binary Canticle as the layer above shipped same-host (a)-shape addressing.
- Updated implementation summary, comparison table, and failure-mode wording where they depended on old single-recipient behavior.

## §6 verification

- `pnpm test src/agents/tools/continuation-tools-registration.test.ts src/agents/tools/continue-delegate-tool.test.ts src/auto-reply/continuation/cross-session-targeting.test.ts src/auto-reply/continuation/delegate-store.test.ts src/auto-reply/continuation/delegate-dispatch.test.ts src/auto-reply/tokens.continuation.test.ts src/agents/subagent-announce.continuation-drain.test.ts` — passed, 3 Vitest shards.
- `pnpm test src/auto-reply/continuation/` — passed, 10 files / 95 tests.
- `pnpm tsgo` — passed.
- `pnpm check` — passed after local lint fixes.
- `pnpm test src/auto-reply/ src/agents/tools/` — passed, 191 auto-reply files/tools shards total: 142 auto-reply files / 1962 passed + 1 todo, 49 agents files / 601 passed.

## §7 push / heartbeat

- Pending.

## §8 PR / done

- Pending.
