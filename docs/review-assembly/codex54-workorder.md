# Workorder: Continuation Surgery — Codex 5.4 Architecture

Saved from figs's 5.4 session. This is the implementation plan.
See: /tmp/figs-and-5.4-do-impromptu-butcher-surgeries.md on Elliott's box

## Sequencing

1. structured continuation trigger plumbing (8 files)
2. get-reply / agent-runner wake classification rewrite
3. post-compaction delegate persistence move to SessionEntry (5 files)
4. compaction dispatch consumption path
5. context-pressure threshold fix ✅ (already at 38c43b486)
6. context-pressure re-arm on compaction ✅ (already at 38c43b486)
7. optional explicit post-compaction lifecycle event
8. docs update (last)

## Status

- Steps 5-6: DONE
- Steps 1-4: IN PROGRESS
- Step 7: OPTIONAL
- Step 8: AFTER CODE
