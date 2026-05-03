# rfc-review journal — copilot lane

| Field              | Value                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| Worktree           | `/home/figs/flesh_beast_best_beast/openclaw-wt-rfc-review-20260502`                    |
| Branch             | `frond-scribe/20260502/rfc-review-copilot`                                             |
| Base               | `frond-scribe/20260429/v3-cohort-fixes` (v2026.4.29 ancestor verified at `a448042c2e`) |
| Workorder          | `/home/figs/flesh_beast_best_beast/WORKORDER-rfc-review-20260502.md`                   |
| Tracking           | karmaterminal/openclaw#544                                                             |
| Model              | github-copilot/gpt-5.5 with `--reasoning-effort xhigh`                                 |
| Outer budget       | 444m                                                                                   |
| Webhook resolve    | `gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/frond-scribe`                  |
| Heartbeat username | `frond-scribe-rfc-review-hook`                                                         |
| Started            | (filled by agent at first §1 entry)                                                    |

## §0 — guardrails acknowledged

- Operate only inside this worktree
- Never read/write/list/shell into `/home/figs/flesh_beast_tmp/`
- Push to `frond-scribe/20260502/rfc-review-copilot` only
- No edits to `docs/design/continue-work-signal-v2.md` — review-only lane
- Cohort applies the review; this lane does not author the rewrite
- Heartbeat at every §-section close and on any DESIGN-BREAK

(Agent fills §1 onward in-flight.)
