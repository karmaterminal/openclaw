# v52-uptake journal — copilot lane

| Field              | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| Worktree           | `/home/figs/flesh_beast_best_beast/openclaw-wt-v52-uptake-20260503`        |
| Branch             | `frond-scribe/20260503/v52-uptake-of-v3-cohort-fixes`                      |
| Source             | `frond-scribe/20260429/v3-cohort-fixes` @ `55df7162c0` (v29-base anchored) |
| Target basis       | `8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4` (v2026.5.2)                     |
| Workorder          | `/home/figs/flesh_beast_best_beast/WORKORDER-v52-uptake-20260503.md`       |
| Tracking           | karmaterminal/openclaw#546                                                 |
| Model              | github-copilot/gpt-5.5 with `--reasoning-effort xhigh`                     |
| Outer budget       | 444m                                                                       |
| Webhook resolve    | `gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/frond-scribe`      |
| Heartbeat username | `frond-scribe-v52-uptake-hook`                                             |
| Discord posture    | webhook heartbeats ONLY (no free-form chat) — cohort not to be disturbed   |
| Replay set         | 119 cohort commits since v29 base                                          |
| Upstream window    | 1543 commits between v29 (`a448042c2e`) and v5.2 (`8b2a6e57fe`)            |
| Started            | (filled by agent at first §1 entry)                                        |

## §0 — guardrails acknowledged

- Operate only inside this worktree
- Never read/write/list/shell into `/home/figs/flesh_beast_tmp/`
- Push to `frond-scribe/20260503/v52-uptake-of-v3-cohort-fixes` only
- NO Discord chat posts — webhook heartbeats only (structured `🤖 v52-uptake §X complete; ...; commit <SHA>` shape)
- NO force-push after first push (savegame discipline per #326)
- NO modification to `COHORT_TARGET_TAG` repo variable
- NO touching `frond-scribe/20260429/v3-cohort-fixes`, `cael/325-canonical2`, `feature/context-pressure-squashed`, `archived/*`, or prince-namespaced branches
- Heartbeat at every §-section close and on any DESIGN-BREAK

(Agent fills §1 onward in-flight.)
