# PR Review

## Findings

1. P1: `post-compaction` delegates do not survive to a later compaction

`continue_delegate` advertises `post-compaction` as a queue that is "held until compaction fires" (`docs/design/continue-work-signal-v2.md:304`, `src/agents/tools/continue-delegate-tool.ts:117`). But the runtime only consumes that queue inside the current turn's `autoCompactionCompleted` block (`src/auto-reply/reply/agent-runner.ts:833`, `src/auto-reply/reply/agent-runner.ts:860`) and then unconditionally drains the same queue again in `finally` (`src/auto-reply/reply/agent-runner.ts:1292`). That means a delegate registered on a context-pressure turn is dropped as soon as the turn ends unless compaction also happened inside that same run. The implementation currently breaks the lifecycle semantics the feature is built around.

2. P1: delegate-return wake detection still collapses after any unrelated turn drains the event queue

The new fix keys `isDelegateWake` off `hasDelegatePending && hasDelegateReturned` (`src/auto-reply/reply/get-reply-run.ts:248`, `src/auto-reply/reply/get-reply-run.ts:268`), but `delegate-pending` lives in the ordinary system-event queue. `buildQueuedSystemPrompt()` drains that queue wholesale on the next turn (`src/auto-reply/reply/session-updates.ts:89`). So if any normal turn happens while a delegate is still in flight, the pending marker disappears, and the later return arrives with only `[continuation:delegate-returned]` left. At that point `isDelegateWake` becomes false again and the return is misclassified as ordinary input. I reproduced the exact state transition locally: enqueue `delegate-pending`, drain via `buildQueuedSystemPrompt()`, enqueue `delegate-returned`, and `hasPending=false / hasReturned=true / isDelegateWake=false`.

3. P2: `contextPressureThreshold` values above 90% are ignored by the band calculation

`checkContextPressure()` checks the fixed 95/90 bands before the configured threshold (`src/auto-reply/reply/context-pressure.ts:52`). As written, `contextPressureThreshold: 0.94` still fires at 90%, because `ratio >= 0.9` wins before `ratio >= contextPressureThreshold` is evaluated. I verified this with a direct repro: `totalTokens=91000`, `contextWindowTokens=100000`, `contextPressureThreshold=0.94` returns `{ fired: true, band: 90 }`. Any threshold in `(0.9, 1]` is effectively unreachable.

4. P2: context-pressure advisories never re-arm after compaction

The branch stores the last fired band on the session entry (`src/auto-reply/reply/context-pressure.ts:56`, `src/auto-reply/reply/context-pressure.ts:80`) and persists it in `get-reply-run` (`src/auto-reply/reply/get-reply-run.ts:433`), but the compaction path never clears it (`src/auto-reply/reply/agent-runner.ts:833`). That leaves the session permanently stuck at its highest historical band, so after the first compaction cycle the agent will never see the 80/90/95 advisories again. The design note explicitly says post-compaction lower-band re-fires are expected because compaction resets the lifecycle (`docs/design/continue-work-signal-v2.md:569`). The implementation does not currently do that reset.

## Validation

- `pnpm exec vitest run src/auto-reply/reply/context-pressure.test.ts src/auto-reply/continuation-delegate-store.test.ts`
- Manual repro for the threshold bug via `node --import tsx`
- Manual repro for the drained `delegate-pending` state via `buildQueuedSystemPrompt()`
