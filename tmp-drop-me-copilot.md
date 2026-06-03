# Journal: 903-memory-search-disabled

Lane: emeric/903-memory-search-disabled-on-lothric
Issue: https://github.com/karmaterminal/openclaw/issues/903
Workorder: WORKORDER-903.md at worktree root
Host: lothric NUC
Model: copilot CLI (gpt-5.5 --reasoning-effort xhigh --yolo)
Dispatching prince: Emeric (lamp-axis, emeric-dandelion-cult)

## Checkpoints

- 2026-06-03T19:55:00Z: lane created off origin/main @ 892602eaba; worktree at /home/figs/.openclaw-data/workspace/codeagents/903-memory-search-disabled/worktree; workorder authored; journal initialized; first push to origin imminent.
- $(date -uIseconds): §1 reads complete — traced memory_search disabled emit-site to extensions/memory-core/src/tools.ts buildPausedMemoryIndexUnavailableResult (called at L541 when indexIdentity.status missing|mismatched). Existing CLI surface (cli.runtime.ts L1287-L1295) already prints loud warning via formatMemoryIndexIdentityWarning; tool/agent surface emits warning ONLY in tool-result payload, never to subsystem logger. Plan: Option A — emit log.warn("memory") ONCE per (agentId|reason) on tool-call paused-detection, plus Option D docs note. Trap-test first.
