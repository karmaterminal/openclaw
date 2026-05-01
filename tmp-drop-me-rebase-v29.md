# rebase candidate journal — swim-v29-copilot-exploratory

worktree: /home/figs/flesh_beast_best_beast/openclaw-wt-rebase-v29-copilot
branch: frond-scribe/20260429/rebase-copilot
base (rebase target): a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd (upstream v2026.4.29)
old-base: cbcfdf62c7297bda66009ea7476f053c3e9addab (karmaterminal-2026.4.24-base)
cohort-tip-at-fire: 9b31762f611028f296ea408cf332af5056fa4ac8
workorder: ./WORKORDER.md
track: exploratory for 2026.4.29
heartbeat: DISCORD_SPRITES_WEBHOOK (https://discord.com/api/webhooks/1499626882277048401/...)
heartbeat-username: swim-v29-copilot-exploratory
started: 2026-05-01T15:14:20+00:00

## §0 guardrails — acked

## §1 required reads — 2026-05-01T15:55Z

- Read order satisfied:
  1. `docs/design/continue-work-signal-v2.md` with `docs/AGENTS.md` scoped rules in mind.
  2. `CLAUDE.md` (same root content as `AGENTS.md` in this checkout).
  3. `AGENTS.md`.
  4. `openclaw-bootstrap/PRINCE-CODE-AGENT-RUNBOOK.md`.
  5. GitHub release notes for upstream `v2026.4.29`.
  6. Cohort commit list from `cbcfdf62c7297bda66009ea7476f053c3e9addab..origin/cael/325-canonical2`.
- Docs index: `pnpm docs:list` is available and ran before relevant docs reads; relevant continuation/RFC and root rules were read.
- Upstream target verified locally: `a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd` resolves to `test(qa): extend restart boundary wait`.
- Cohort tip at read time: `origin/cael/325-canonical2` = `9b31762f611028f296ea408cf332af5056fa4ac8`.
- Readbook constraints carried forward: remote-first journal pushes; no force-push after first push; fork CI must be manually dispatched via `karmaterminal/openclaw-bootstrap`; journal at repo root is the durable cohort read surface.
- RFC source-of-truth notes:
  - Continuation is documented as tools-first with response-token fallback: `continue_work()`, `continue_delegate()`, `request_compaction()`.
  - Delegate persistence is documented as Task Flow-backed, with `session-delivery-queue` handling restart-safe local cross-session delivery, idempotency, retry, and post-compaction handoff.
  - `targetSessionKey` remains descriptor-only in the RFC; future `targetSessionKeys[]` is named but not shipped by the RFC.
  - Post-compaction delegates are expected to return silently and wake successor sessions.
  - RFC warns that routing metadata and topology data are load-bearing for silent-wake, post-compaction dispatch, and subagent tool access.
- v29 release-note collision shortlist for §3:
  - HIGH: active-run steering default (`steer`, 500ms debounce) in messages/queue and auto-reply queueing.
  - HIGH: gateway/session abort wait semantics, upstream `1f1f70a23f`.
  - HIGH: spawned subagent routing metadata `spawnedBy`, upstream `443ca4865d`.
  - MED: visible reply enforcement (`messages.visibleReplies`), upstream `e1fd27fb24` plus follow-up docs/fixes.
  - MED: inferred follow-up commitments (`commitments.*`), upstream `8e4035d09a` and follow-ups.
  - MED: subagent orphan recovery/tombstone, upstream `838d0c02e3`.
  - MED: embedded runner blank visible prompt skip, upstream `a4d338c170`.
  - LOW-MED: tool-result guard budget, upstream `9ee651e1f5`.
  - LOW: Bedrock Opus 4.7 thinking parity, memory wiki/Active Memory filters, stale model catalog.
- Cohort feature commits most relevant to the collision map:
  - Core continuation: `8ecf0c0b83` through `1e21522fea`, plus swim-37 tracer chain `d533d5c720`..`42f1bb9c14`.
  - Run-state/blocked-liveness: `9afc94e86d`, `a5434fbba7`, `356d05a2ba`.
  - Continuation caps/pending-state: `5b360c6998`, `6302e5968d`, `a3dcc2adc2`, `1e21522fea`.
  - Subagent announce runtime/dist: `23189e3ed1`.
  - Compaction attribution: `9b31762f61`.

Next: §3 code walk across v29 base and cohort tip for high-risk surfaces before starting the actual rebase.
