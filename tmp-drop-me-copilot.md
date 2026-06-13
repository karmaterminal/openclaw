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

- 2026-06-13T20:23:00+00:00: Cleanse prep inventory/draft completed against the current pre-drift base; still paused on product edits.
  - Exact prep command: `grep -rn forceSenderIsOwnerFalse --include='*.ts' src/ extensions/`
  - Current prep result: 73 matching lines across 36 unique TypeScript files.
  - Re-run this exact grep after the drift-only base lands; the hard clean result is 0 lines.
  - Draft edit policy:
    - Extension production/test callsites: delete only the `forceSenderIsOwnerFalse: true` property from `enqueueSystemEvent` expectations/calls; rely on upstream's unconditional queue-boundary sanitizer.
    - `src/infra/system-events.ts`: match upstream target by deleting `forceSenderIsOwnerFalse`, legacy `trusted?`, `resolveEventOwnerDowngrade`, conditional rawText selection, and event equality ownership comparison; keep continuation traceparent fields if present after the drift-only base, and sanitize with `sanitizeInboundSystemTags(text).trim()` unconditionally.
    - `src/auto-reply/reply/session-system-events.ts`: remove ownership metadata from `FormattedSystemEventBlock`, drop force/downgrade render branching, keep `drainFormattedSystemEvents`/continuation drain tracing and post-drift upstream structure, and format all drained events as ordinary `System:` lines.
    - `src/auto-reply/reply/get-reply-run.media-only.test.ts`: mocked system-event blocks become `{ text: ... }` only; sender ownership should not be downgraded by drained system events.
    - `src/infra/system-events.test.ts`: replace conditional trusted/untrusted expectations with upstream's unconditional-sanitize test shape, especially the "neutralizes nested system markers before formatting queued events" assertion.
    - `src/auto-reply/reply/session-system-events.test.ts`: delete trusted-vs-untrusted bifurcation coverage and keep only continuation drain behavior plus ordinary `System:` formatting expectations that match the post-drift file.
  - Current per-file removal draft:
    - `extensions/discord/src/monitor/agent-components.system-controls.ts`: remove one callsite property.
    - `extensions/discord/src/monitor/listeners.reactions.ts`: remove one callsite property.
    - `extensions/discord/src/monitor/message-handler.preflight.ts`: remove one callsite property.
    - `extensions/discord/src/monitor/monitor.agent-components.test.ts`: remove five expectation properties.
    - `extensions/imessage/src/monitor/reaction-system-event.test.ts`: remove one expectation property.
    - `extensions/imessage/src/monitor/reaction-system-event.ts`: remove one callsite property.
    - `extensions/matrix/src/matrix/monitor/handler.test.ts`: remove four expectation properties.
    - `extensions/matrix/src/matrix/monitor/reaction-events.test.ts`: remove one expectation property.
    - `extensions/matrix/src/matrix/monitor/reaction-events.ts`: remove one callsite property.
    - `extensions/mattermost/src/mattermost/interactions.test.ts`: remove one expectation property.
    - `extensions/mattermost/src/mattermost/interactions.ts`: remove one callsite property.
    - `extensions/mattermost/src/mattermost/monitor.ts`: remove one callsite property.
    - `extensions/msteams/src/monitor-handler/message-handler.ts`: remove two callsite properties.
    - `extensions/msteams/src/monitor-handler/reaction-handler.ts`: remove one callsite property.
    - `extensions/msteams/src/reply-dispatcher.test.ts`: remove one expectation property.
    - `extensions/msteams/src/reply-dispatcher.ts`: remove one callsite property.
    - `extensions/signal/src/monitor/event-handler.inbound-context.test.ts`: remove one expectation property.
    - `extensions/signal/src/monitor/event-handler.ts`: remove one callsite property.
    - `extensions/slack/src/monitor/events/channels.test.ts`: remove one expectation property.
    - `extensions/slack/src/monitor/events/channels.ts`: remove one callsite property.
    - `extensions/slack/src/monitor/events/interactions.block-actions.ts`: remove one callsite property.
    - `extensions/slack/src/monitor/events/interactions.modal.ts`: remove one callsite property.
    - `extensions/slack/src/monitor/events/members.ts`: remove one callsite property.
    - `extensions/slack/src/monitor/events/messages.ts`: remove one callsite property.
    - `extensions/slack/src/monitor/events/pins.ts`: remove one callsite property.
    - `extensions/slack/src/monitor/events/reactions.test.ts`: remove one expectation property.
    - `extensions/slack/src/monitor/events/reactions.ts`: remove one callsite property.
    - `extensions/slack/src/monitor/message-handler/prepare.test.ts`: remove one expectation property.
    - `extensions/slack/src/monitor/message-handler/prepare.ts`: remove one callsite property.
    - `extensions/telegram/src/bot-handlers.runtime.ts`: remove one callsite property.
    - `extensions/whatsapp/src/auto-reply/monitor.ts`: remove two callsite properties.
    - `src/auto-reply/reply/get-reply-run.media-only.test.ts`: remove eight mock result properties and keep assertions that system events stay in prompt text without sender-owner downgrade.
    - `src/auto-reply/reply/session-system-events.test.ts`: remove three force-flag references by deleting/replacing stale bifurcation assertions.
    - `src/auto-reply/reply/session-system-events.ts`: remove five force-flag references from block type, accumulator, event inspection, and return payload.
    - `src/infra/system-events.test.ts`: remove six force-flag references by replacing old conditional-sanitize tests with upstream unconditional-sanitize expectations.
    - `src/infra/system-events.ts`: remove eleven force-flag references from types, comments, normalization, resolver, and equality.

- 2026-06-13T20:30:00+00:00: Spec refinement recorded; cleanse must bring the upstream security-file shape atomically.
  - Refinement source: Cael amendment from cohort/frond-scribe. Live #999 comments still show the earlier converged spec as of this checkpoint, so this amendment is the controlling byte-update for this lane.
  - Important correction to prior prep: on the drift-only keep-ours back-merge base, upstream's unconditional `sanitizeInboundSystemTags(text).trim()` is not yet present in the kept security files. The cleanse must therefore resolve both security files toward upstream as part of the same atomic PR:
    - `src/infra/system-events.ts`: bring upstream unconditional queue-boundary sanitizer, drop `forceSenderIsOwnerFalse`, drop legacy `trusted?`, drop `resolveEventOwnerDowngrade`, and drop ownership comparisons.
    - `src/auto-reply/reply/session-system-events.ts`: bring upstream/plain formatter shape while preserving post-drift continuation additions (`drainFormattedSystemEvents`, queue-drain tracing, delivery ack handling, traceparent/session delivery fields as present on base).
  - The extension/core callsite drops alone would remove the anti-spoof signal without bringing the replacement sanitizer; that is not acceptable. The two security-file toward-upstream swaps plus all callsite/test updates are one atomic cleanse.
  - Current remote assembly observed advanced to `e64e8c4130cd2918ba0bf791115df4986573a9fe`, so the drift-only base appears to have landed. Next step: integrate `origin/frond-scribe/20260613/assembly-drift-cure` into this no-force branch, then apply the atomic cleanse on top.

- 2026-06-13T20:43:00+00:00: Grep-gate cleanup checkpoint.
  - Integrated assembly base `e64e8c4130cd2918ba0bf791115df4986573a9fe` into this no-force branch at `a4ac7a073b80`.
  - Base already included #1005, so `forceSenderIsOwnerFalse` and `resolveEventOwnerDowngrade` were already removed with unconditional `sanitizeInboundSystemTags(text).trim()`.
  - Applied the remaining toward-upstream security-file cleanup: removed the no-op `trusted?: boolean` option from `src/infra/system-events.ts` and removed internal continuation/subagent `enqueueSystemEvent(..., { trusted: true })` usage/tests.
  - Pre-commit checks:
    - `grep -rn forceSenderIsOwnerFalse --include='*.ts' src/ extensions/` -> 0
    - `grep -rn resolveEventOwnerDowngrade --include='*.ts' src/ extensions/` -> 0
    - focused internal enqueue trusted grep under `src/auto-reply`, `src/agents/command/attempt-execution.ts`, and `src/agents/subagent-announce.ts` -> 0
    - `git diff --check` -> clean

- 2026-06-13T20:49:00+00:00: Gate green: `pnpm tsgo:core` exited 0.

- 2026-06-13T20:52:00+00:00: Gate green: `pnpm tsgo:test` exited 0.

- 2026-06-13T20:55:00+00:00: Gate green: `pnpm tsgo:extensions` exited 0.

- 2026-06-13T20:58:00+00:00: Gate green: `pnpm lint` exited 0.
