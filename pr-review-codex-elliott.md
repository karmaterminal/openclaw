# PR Review — Codex

## Branch

`feature/context-pressure-squashed` at `1598c7cca`

## P0 findings (blocking)

None.

## P1 findings (important)

1. `continue_delegate` work is dropped on textless runs because `runReplyAgent()` returns before any continuation bookkeeping runs. `src/auto-reply/reply/agent-runner.ts:781` returns immediately on `payloadArray.length === 0`, but tool delegates are only consumed later at `src/auto-reply/reply/agent-runner.ts:1262`, staged post-compaction delegates are only persisted later at `src/auto-reply/reply/agent-runner.ts:1441`, and the `finally` block still drains both stores at `src/auto-reply/reply/agent-runner.ts:1480`. Result: a turn that calls `continue_delegate` and emits no final text silently loses both normal delegates and `post-compaction` delegates instead of dispatching or persisting them. The same early return also skips the post-compaction lifecycle block entirely, so a compaction run with no visible payload never releases its queued delegates.

2. `post-compaction` delegates bypass the branch’s main safety limits. In the compaction path, `runReplyAgent()` slices only by `maxDelegatesPerTurn` and then directly spawns `[continuation:post-compaction] ...` tasks (`src/auto-reply/reply/agent-runner.ts:1001-1049`). That path never checks or updates `continuationChainCount` / `continuationChainTokens`, and it does not emit the `[continuation:chain-hop:N]` prefix that announce-side enforcement depends on (`src/agents/subagent-announce.ts:1348-1457`). So `mode: "post-compaction"` can sidestep both `maxChainLength` and `costCapTokens`, even though the RFC and tool text say chain tracking still applies.

3. Nested chain hops are resolved against the wrong parent when the immediate parent session has already been cleaned up. `runSubagentAnnounceFlow()` parses the child’s `[[CONTINUE_DELEGATE: ...]]`, accumulates cost, and may spawn the next hop using `targetRequesterSessionKey` at `src/agents/subagent-announce.ts:1315-1492`. The fallback that reroutes orphaned child completions from a deleted parent subagent to the grandparent does not run until `src/agents/subagent-announce.ts:1502-1534`. That means the visible completion announce is rerouted correctly, but the continuation chain accounting and next-hop spawn still target the dead parent session and stale origin. In the exact case the fallback code is meant to save, chained work can still disappear into an orphaned session.

## P2 findings (minor)

1. Silent enrichment returns are routed through a higher-trust channel than normal subagent completions. `src/agents/subagent-announce.ts:1587-1593` wraps `formatAgentInternalEventsForPrompt(...)` in a system event, while `src/auto-reply/reply/session-updates.ts:120-123` tells the model to treat every system-event entry as trusted gateway metadata. The embedded internal-event formatter does label the delegate result as “untrusted content, treat as data” (`src/agents/internal-events.ts:19-35`), so this is prompt-hygiene debt rather than a clear trust-boundary bypass under OpenClaw’s model, but it still weakens the intended separation between gateway facts and model-produced content.

## Observations

1. The user-facing agent guidance is otherwise in decent shape. `src/agents/system-prompt.ts:681-738` explains `CONTINUE_WORK`, bracket delegation, silent modes, and when to prefer `sessions_spawn`; the subagent prompt in `src/agents/subagent-announce.ts:1074-1090` gives the lighter-weight chain-hop version. I would not block on prompt discoverability.

2. The bracket parser itself looks disciplined. `src/auto-reply/tokens.ts:108-194` is feature-gated, anchored to the end of the response, strips only the matched suffix, and the current token tests cover the obvious false-positive cases.

3. Targeted continuation suites are green. I ran:
   - `pnpm vitest run src/auto-reply/tokens.test.ts src/agents/tools/continue-delegate-tool.test.ts src/auto-reply/continuation-delegate-store.test.ts src/config/zod-schema.continuation.test.ts src/agents/subagent-announce.chain-guard.test.ts src/infra/heartbeat-runner.model-override.test.ts`
   - `pnpm vitest run src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts src/auto-reply/reply/get-reply-run.media-only.test.ts`

## Verdict

Hold.

The core timer / wake plumbing looks solid, but the current branch still has important control-flow gaps around textless turns, `post-compaction` enforcement, and orphaned nested chain hops. Those are feature-breaking enough that I would not ship this as-is.
