# JOURNAL: Vitest regression fixes

Branch: silas/drift-cure-20260522-69255f8f
HEAD at start: 39d0f1a12276950ccc3be2a2daa509de92375a76
PR-head reference for diffs: 642a33df

## Note on workorder vs current state

- Workorder claims HEAD 647e82fda6; actual HEAD is 39d0f1a122.
- Working tree clean except for untracked WORKORDER-vitest-regressions.md.
- Current HEAD commit message: "feat(continuation): context-pressure-aware continuation".
- `git add -A && git commit --amend --no-edit` would fold all fixes + WORKORDER + JOURNAL into the continuation feat commit. Following the explicit user instruction verbatim.

---

## File 1: src/agents/subagent-registry.announce-loop-guard.test.ts

### Reported error

- 2 failed / 8 passed
- Test: "announce rejection resets cleanupHandled so retries can resume"
- Expected true to be false (cleanupHandled not reset after rejection)

### Investigation

PR-head reference 642a33df not in local clone. Used `git log -S 'announce rejection resets cleanupHandled'` to find originating commit `4258a3307f refactor(agents): unify subagent announce delivery pipeline`. That commit's `.catch()` in `startSubagentAnnounceCleanupFlow` called `finalizeSubagentCleanup(runId, entry.cleanup, false)` directly. After rebase, current code routes through `finalizeAnnounceCleanup(false)` which adds `await hasPriorRequesterDeliveryMirror(entry)` (always-async fn). That extra `await` pushes `cleanupHandled = false` past the test's 2 `await Promise.resolve()` ticks. Mirror check has no meaning when the announce promise outright rejects — there is no delivery to credit.

### Fix

`src/agents/subagent-registry-lifecycle.ts` lines 971-976: in the `.catch` handler of `runSubagentAnnounceFlow(...)`, call `finalizeSubagentCleanup(runId, entry.cleanup, false)` directly with the same error fallback that `finalizeAnnounceCleanup` uses. Keeps `finalizeAnnounceCleanup` intact for the `.then` (deferred-but-maybe-delivered) path.

### Result

10/10 pass. Sibling tests `subagent-registry-lifecycle.test.ts` + `subagent-registry-cleanup.test.ts` still green (61/61).

---

## File 2: src/agents/agent-command.live-model-switch.test.ts

### Error

`[vitest] No "classifySessionKeyShape" / "scopeLegacySessionKeyToAgent" export is defined on the "../routing/session-key.js" mock.`

### Root cause

Upstream commit `eb7f3b7b50 fix(agent): support explicit CLI session keys (#85121)` added `classifySessionKeyShape`, `isUnscopedSessionKeySentinel`, `scopeLegacySessionKeyToAgent`, `resolveAgentIdFromSessionKey` to `src/routing/session-key.ts` and used them in `prepareAgentCommandExecution` (agent-command.ts:358-385). The conflict resolution kept the new agent-command.ts usage but left the old test mock that only stubbed `isSubagentSessionKey`/`normalizeAgentId`/`normalizeMainKey`.

### Fix

Expanded the `vi.mock("../routing/session-key.js", ...)` block to include the four missing exports with behavior-faithful stubs (classify "agent:..." keys as "agent", `scopeLegacySessionKeyToAgent` returns sessionKey unchanged, etc.).

### Result

42/42 pass.

---

## File 3: src/auto-reply/reply/get-reply-run.media-only.test.ts

### Error

2 failures: `expect(call.replyOperation).toBe(operation)` — received `undefined`. The pre-dispatch ReplyOperation supplied via `opts.replyOperation` was not being forwarded to `runReplyAgent`.

### Root cause

Commit `0ab1449215 Fix Discord session recovery abort ownership (#85100)` added `replyOperation: providedReplyOperation` to the `runReplyAgent({...})` call object at the bottom of `runPreparedReply` in `src/auto-reply/reply/get-reply-run.ts`. The rebase conflict resolution dropped that one line; `providedReplyOperation` was still derived at line 839 but never threaded through.

### Fix

`src/auto-reply/reply/get-reply-run.ts`: re-add `replyOperation: providedReplyOperation,` to the `runReplyAgent({...})` argument object alongside `replyThreadingOverride` and `isContinuationWake`.

### Result

73/73 pass.

---

## File 4: src/auto-reply/inbound.test.ts

### Error

`reports buffered items when cancelling a key`: expected `[["1","2"]]`, received `[[]]`. `onCancel` was being called with an empty items array.

### Root cause

`src/auto-reply/inbound-debounce.ts` `cancelKey()` cleared `buffer.items = []` (line 180) _before_ capturing `const canceledItems = buffer.items` (line 185). The capture then took the empty array. Almost certainly a stray edit from the rebase conflict resolution — there's a follow-up `buffer.items = []` after the capture too, so the early clear had no semantic purpose.

### Fix

Removed the early `buffer.items = []` line. Items are now captured first, then cleared, then `onCancel` receives the snapshot.

### Result

58/58 pass.

---

## File 5: extensions/telegram/src/bot.create-telegram-bot.test.ts

### Result

File ran green on first attempt (89/89). Either a prior failure was flaky/order-dependent, or a fix earlier in this session unblocked it. Confirmed green when run alongside the other 4 fixed files (272/272 in the combined run).

---

## Combined verification

- All 5 target files: **272/272 pass**
- Adjacent regression check (`subagent-registry-lifecycle.test.ts`, `subagent-registry-cleanup.test.ts`, `get-reply-run.media-only.test.ts`, `inbound.test.ts`): **192/192 pass**
