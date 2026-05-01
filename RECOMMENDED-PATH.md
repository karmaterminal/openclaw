# Recommended path — exploratory v2026.4.29 rebase

This is a pre-rebase recommendation from the §3 code walk. The actual conflict-resolution pass is blocked on the branch publication question in `QUESTIONS-FOR-FIGS.md`.

## Decision table

| Surface                                      | Decision       | Recommended action                                                                                                                                                                                    |
| -------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active-run steering default                  | compose        | Keep v29 `steer` default, batched steering, and 500ms follow-up debounce. Reapply cohort continuation hooks around runner finalization without changing queue-mode precedence.                        |
| Session abort wait semantics                 | merge-required | Adopt upstream abort-wait behavior, then make reply-run-registry cleanup/wait semantics use the same session key/id mapping so immediate retry cannot hit stale `ReplyRunAlreadyActiveError`.         |
| Spawned subagent `spawnedBy` metadata        | compose        | Keep upstream protocol/event metadata. It helps routing, but does not replace cohort continuation drain or silent-wake runtime.                                                                       |
| Visible replies plus blocked-liveness marker | merge-required | Preserve upstream `messages.visibleReplies`; preserve cohort #500 single blocked-marker rule. Add/keep a regression check that the marker remains visible when message-tool-only delivery falls back. |
| Inferred follow-up commitments               | compose        | Keep upstream `commitments.*` as opt-in reminders delivered by heartbeat. Do not fold continuation semantics into commitments.                                                                        |
| Subagent orphan recovery                     | merge-required | Keep upstream bounded recovery/tombstone. Compose recovered final settle with cohort child-continuation queue drain exactly once.                                                                     |
| Blank visible prompt skip                    | supersede-up   | Adopt upstream guard unchanged unless a continuation test proves it suppresses a valid runtime-only turn.                                                                                             |
| Tool-result guard budget                     | compose        | Keep upstream resolved-runtime-budget guard; cohort continuation chain/delegate cost caps stay separate.                                                                                              |

## Migration shape

1. Resolve branch publication policy before running the history rewrite.
2. Start from upstream `a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd`.
3. Replay cohort commits and prefer upstream for queue defaults, abort RPC waiting, blank prompt guard, commitments, spawnedBy protocol schema, and orphan recovery scaffolding.
4. Reapply cohort-owned continuation surfaces:
   - `src/auto-reply/continuation/*`
   - TaskFlow-backed continuation delegate store and post-compaction dispatch
   - continuation tracer and diagnostics adapter
   - blocked-liveness single-marker rule
   - subagent announce continuation drain/runtime co-location
   - compaction attribution thread/run correlation
5. Add targeted tests around the merge-required seams before broad gates:
   - abort wait then immediate retry
   - blocked-liveness marker under visible-reply enforcement
   - recovered subagent final settle drains child continuation queue once

## Current stop point

No code conflicts have been resolved yet. The lane is intentionally stopped before §4 rebase because publishing a true rebased candidate conflicts with the no-force-push rule on the already-pushed assigned branch.
