# Journal — cael/999-forcesender-cleanse (copilot lane)

**Lane:** cael/999-forcesender-cleanse
**Issue:** karmaterminal/openclaw#1001
**Branch:** cael/20260613/999-forcesender-cleanse (off frond-scribe/20260613/assembly-drift-cure @599f7ba0, pushed remote-first)
**Back-merge source:** upstream/main @13a079b3f8462ac4689eb944a5aebf33a2adee8c
**Driver:** copilot CLI gpt-5.5 --reasoning-effort xhigh --yolo
**tmux:** oc-cael-999
**Host:** cael
**Outer budget:** 444m

---

## Checkpoints

- 2026-06-13T18:57:30+00:00: lane bootstrapped by dispatch-delegate. Worktree created at /tmp/oc-999-wt off assembly tip 599f7ba0, branch pushed remote-first to origin (minute-0). Tracking issue #1001 filed (label code-agent). WORKORDER.md + this journal committed. Copilot lane dispatch next.
  - Pre-flight confirmed: copilot smoke-test RC=0; assembly tip 599f7ba0; upstream/main 13a079b3f84; vestige grep = 36 files; webhook resolves.
  - Task: back-merge upstream/main + DROP forceSenderIsOwnerFalse (drop-and-rely; upstream replaced #858 conditional sanitize with unconditional sanitizeInboundSystemTags). 4 conflicts (3 keep-both + 1 toward-upstream). grep-gate=0 hard check (auto-merges invisibly). Gates: tsgo core+test+extensions + lint (+ full pnpm test if feasible). PR into ASSEMBLY branch only. NO merge — cohort byte-walks.

- 2026-06-13T19:03:00+00:00: §1 reads complete; starting merge next.
  - Read upstream/base `src/infra/system-events.ts` and `src/auto-reply/reply/session-system-events.ts`.
  - Upstream target shape: zero `forceSenderIsOwnerFalse`, zero legacy `trusted?` alias, and unconditional `sanitizeInboundSystemTags(text).trim()` inside `enqueueSystemEvent`.
  - Base shape: conditional force/downgrade sanitizer plus `trusted?` alias in `src/infra/system-events.ts`; continuation drain helper plus force flag vestige in `src/auto-reply/reply/session-system-events.ts`.
  - Base vestige surface confirmed: 36 unique files, 73 matching lines under `src/**/*.ts` and `extensions/**/*.ts`.
  - Continuation marker check over `src/agents/command/work-dispatch.ts`, `src/agents/command/delegate-dispatch.ts`, `src/agents/embedded-agent-runner`, and `src/auto-reply/reply/followup-runner.ts`: no `[System]` or `System:` markers found, so upstream unconditional sanitize remains a no-op for those status emits.
  - Plan: merge `upstream/main`; resolve 3 keep-both conflicts in `src/agents/embedded-agent-runner/run/params.ts`, `src/auto-reply/reply/followup-runner.ts`, and `src/agents/command/attempt-execution.ts`; resolve `src/auto-reply/reply/session-system-events.ts` toward upstream while keeping `drainFormattedSystemEvents` and dropping the force vestige; commit/push; grep-gate to 0; update sanitize tests; run `pnpm tsgo:core`, `pnpm tsgo:test`, `pnpm tsgo:extensions`, `pnpm lint`, and full `pnpm test` if feasible; open PR only into `frond-scribe/20260613/assembly-drift-cure`; dispatch `openclaw-ci`; do not merge.

- 2026-06-13T19:08:00+00:00: DESIGN-BREAK blocker; merge conflict set does not match the workorder.
  - Command attempted: `git merge upstream/main`.
  - Expected conflicts from workorder: 4 files.
  - Actual unmerged files: 8 files:
    - `src/agents/command/attempt-execution.ts`
    - `src/agents/command/types.ts`
    - `src/agents/embedded-agent-runner/run/params.ts`
    - `src/auto-reply/reply/agent-runner-execution.ts`
    - `src/auto-reply/reply/followup-runner.ts`
    - `src/auto-reply/reply/session-system-events.ts`
    - `src/config/sessions/types.ts`
    - `src/gateway/server-methods/agent.ts`
  - The extra conflicts are outside the byte-true 4-conflict contract, so the workorder says to stop and surface instead of guessing a resolution.
  - I aborted the merge to keep the branch pushable for this blocker journal checkpoint. No conflict resolutions or cleanup edits were made.

- 2026-06-13T20:10:00+00:00: Scope-change amendment received; lane is now cleanse-only, layered on the drift-only back-merge.
  - Authoritative #999 comment read: https://github.com/karmaterminal/openclaw/issues/999#issuecomment-4699385110
  - Converged resolution confirmed: DROP-AND-RELY; do not port the anti-spoof property to `deliveryContext`. `deliveryContext` is delivery-routing only; anti-spoof lives in unconditional `sanitizeInboundSystemTags` at `enqueueSystemEvent`.
  - Work split updated: frond-scribe owns the neutral drift-only back-merge into `frond-scribe/20260613/assembly-drift-cure`; this lane must not run `git merge upstream/main` anymore.
  - Current remote assembly check: `origin/frond-scribe/20260613/assembly-drift-cure` is still `599f7ba0c97556c23d1707a378f9bebc3a7f05f1`, so the drift-only back-merge has not landed yet.
  - Fresh upstream remote observation for audit: `upstream/main` currently advertises `4e4ea1c16bcd02f12498bb9b5f40a5f3b47bdd67`; no merge is being performed in this lane under the new scope.
  - Reason for split: half-dropping the field in one file while 36 callsites keep it breaks tsgo; the cleanse must be one atomic all-callsites drop in the competing PR on top of the drift-only back-merge.
  - Current pre-drift inventory remains 36 unique files and 73 matching lines for `forceSenderIsOwnerFalse` under `src/` and `extensions/`; the post-drift hard gate remains `git grep -rn forceSenderIsOwnerFalse -- '*.ts' src extensions` returning 0.
  - Allowed work while paused: prepare the callsite inventory and per-file removal draft only. No merge and no product code edits until the drift-only assembly base lands.
