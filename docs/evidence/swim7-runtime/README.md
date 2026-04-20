# Swim 7 — Runtime Logs (Evidence Branch)

Raw runtime logs captured during Swim 7 of the context-pressure continuation
integration test sessions.

| File | Description | Lines |
|---|---|---|
| `gateway.log` | OpenClaw gateway log for the Swim 7 run | 773 |
| `raw-capture.log` | Raw event capture (channel ingress, tool calls, scheduler ticks, compaction lifecycle) | 1034 |

## Why this branch

These files were originally committed in-tree at
`docs/design/continue-work-signal-v2/swim-evidence/swim-07/{gateway,raw-capture}.log`
on the continuation candidate branch. Per the evidence-branch policy applied
to Swim 8/9/10 in §D.2 of the RFC, raw runtime logs live on dedicated
perma-branches rather than in the main docs tree, leaving only the
human-authored `SWIM7-RESULTS.md` summary in the canary tree.

The summary doc remains in-tree at
[`docs/design/continue-work-signal-v2/swim-evidence/swim-07/SWIM7-RESULTS.md`](https://github.com/karmaterminal/openclaw/blob/flesh_beast_figs/20260414-claude/docs/design/continue-work-signal-v2/swim-evidence/swim-07/SWIM7-RESULTS.md).

Companion branch with chat-channel transcript:
[`elliott/swim7-chat-evidence`](https://github.com/karmaterminal/openclaw/tree/elliott/swim7-chat-evidence).

Tracked via `karmaterminal/openclaw#202`.
