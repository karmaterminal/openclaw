# rfc-apply journal — copilot lane

| Field              | Value                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| Worktree           | `/home/figs/flesh_beast_best_beast/openclaw-wt-rfc-apply-20260503`                    |
| Branch             | `frond-scribe/20260503/rfc-apply-copilot`                                             |
| Base               | `frond-scribe/20260429/v3-cohort-fixes` @ `55df7162c0` (v29-base anchored)            |
| Spec input         | `docs/design/544-rfc-scientific-literature-review-20260502.md` (455 lines, on branch) |
| Apply target       | `docs/design/continue-work-signal-v2.md` (1450 lines)                                 |
| Workorder          | `/home/figs/flesh_beast_best_beast/WORKORDER-rfc-apply-20260503.md`                   |
| Tracking           | karmaterminal/openclaw#547                                                            |
| Reviewer-elect     | 🌊 Ronan (RFC primary author; `continue_work` re-purposed → review-pass)              |
| Model              | github-copilot/gpt-5.5 with `--reasoning-effort xhigh`                                |
| Outer budget       | 444m                                                                                  |
| Webhook resolve    | `gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/frond-scribe`                 |
| Heartbeat username | `frond-scribe-rfc-apply-hook`                                                         |
| Discord posture    | webhook heartbeats ONLY (no free-form chat)                                           |
| Started            | (filled by agent at first §1 entry)                                                   |

## §0 — guardrails acknowledged

- Operate only inside this worktree
- Never read/write/list/shell into `/home/figs/flesh_beast_tmp/`
- Push to `frond-scribe/20260503/rfc-apply-copilot` only
- ALLOWED to modify `docs/design/continue-work-signal-v2.md` (this is the apply lane; review lane was forbidden)
- DELETE `docs/design/544-rfc-scientific-literature-review-20260502.md` in §4 after apply complete
- One commit per major change-set (atomic for reviewer)
- Webhook heartbeats only at every axis-apply complete + on DESIGN-BREAK + on declare-done

(Agent fills §1 onward in-flight.)
