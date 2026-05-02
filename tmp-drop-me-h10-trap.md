- 2026-05-01T23:59:55+00:00: worktree+branch+tracking-issue created; workorder with §0a/§0b in place; ready to dispatch copilot

## §1 reads checkpoint

- 2026-05-02T00:01:02+00:00: §1 required reads complete: compaction handler, runtime reconcile implementation, existing handler tests, commit bbcf2f3ad8, root CLAUDE/AGENTS, src/agents/AGENTS, and PRINCE runbook. Scope understood: test-only PR on silas/h10-throw-shape-trap targeting frond-scribe/325-canonical2-pathB-rebase; pin reconcile-failure observability and expose throw-shape gap with it.todo.

## §3 code walk checkpoint

- 2026-05-02T00:01:49+00:00: §3 walk findings: call site src/agents/pi-embedded-subscribe.handlers.compaction.ts:117-135 fire-and-forget reconcile; emitter src/agents/pi-embedded-subscribe.handlers.compaction.ts:15-52; return/event path src/agents/pi-embedded-subscribe.handlers.compaction.ts:137-183 computes completed before reconcile settles. Failure data shape: { phase: "warning", warning: "compaction_count_reconcile_failed", sessionKey, trigger, outcome: "compacted", error, compactionCountBefore, compactionCountAfter, compactionCountDelta }. emitAgentEvent shape: { runId, stream: "compaction", sessionKey, data }. onAgentEvent shape: { stream: "compaction", data }. Existing tests use createCompactionContext with vi.fn ctx.log.debug/warn, optional params.onAgentEvent pushing events array, and session lock test hook to force reconcile rejection.
