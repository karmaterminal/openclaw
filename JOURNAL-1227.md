# #1227 investigation journal

## Dispatch receipt

- Owner: Emeric.
- Worker: Copilot CLI in tmux session `emeric-1227-correlated-ingress`.
- Branch: `codeagent/emeric-1227-correlated-ingress`.
- Frozen start SHA: `733512b612e5fcfa96ca0764ac1851990406f187`.
- Workorder: `.specify/workorders/WO-1227-CORRELATED-INGRESS.md`.
- Tracking issue: <https://github.com/karmaterminal/openclaw/issues/1227>.

## Initial known state

- Prior report-only head `3ed51aa7e253d2012f759400d7b7dfe2526dc7ad` did not change product files or establish a causal duplicate path.
- Focused retry/delivery checks were reported 190/190 passing; the broad run was incomplete at 46/81 shards. Treat these as report claims until independently bound to artifacts.
- The current investigation must distinguish duplicate admission of one source event from a sequence of distinct ambient room-event messages and voluntary `message(send)` calls.

## Checkpoints

Copilot must append timestamped, source-backed checkpoints here and push them to the branch. Do not store secrets or unrelated private message content.
