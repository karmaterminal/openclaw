# Journal — delta-shift #1 (subagent-announce-delivery.ts rewrite)

## Genesis

Lane dispatched at 2026-05-10 by frond-scribe seat per cohort verdict (figs `1503146697` + Ronan `1503146545`).

- Tracking issue: karmaterminal/openclaw#631
- Workorder: `WORKORDER-subagent-announce-delivery-rewrite.md`
- Engine: copilot CLI gpt-5.5 xhigh yolo
- Webhook: `frond-scribe-delta-shift-#1-hook`

## Pre-dispatch state

- Branch: `frond-scribe-claude/20260510/delta-shift-from-upstream-main`
- Worktree: `/tmp/oc-619-guard/`
- Single tsgo:core blocking error: subagent-announce-delivery.ts:39 imports `queueEmbeddedPiMessage` which no longer exists in runtime module

## Lane checkpoints

(Copilot agent will append.)

## Plan — queue outcome rewrite

- Old API mapping:
  - `queueEmbeddedPiMessage(sessionId, steerMessage, options)` in `maybeQueueSubagentAnnounce()` becomes `queueEmbeddedPiMessageWithOutcome(...)`; only `outcome.queued === true` maps to the existing `"steered"` queue result.
  - `queueEmbeddedPiMessage(sessionId, triggerMessage, options)` in active completion wake becomes `queueEmbeddedPiMessageWithOutcome(...)`; `outcome.queued === true` preserves the existing delivered `"steered"` result.
- Outcome unwrapping:
  - Queued outcomes proceed exactly like the old boolean `true`.
  - Non-queued outcomes preserve the old fallback flow. Queue-primary failures still fall through to enqueue/direct paths as before; active requester wake failures still return a direct-primary error so dispatch can try queue fallback.
- Failure summary:
  - The active requester wake error is the only old bare queue-failure surface. It now appends `formatEmbeddedPiQueueFailureSummary(outcome)` so `not_streaming`, `compacting`, and `no_active_run` remain visible.
- Callers:
  - `deliverSubagentAnnouncement()` and `runSubagentAnnounceDispatch()` still consume the existing `"steered" | "queued" | "none" | "dropped"` delivery surface. No caller now expects the old boolean API from this module.
- Continuation semantics:
  - `inferCompletionChatType()` stays unchanged.
  - `targetRequesterSessionKey`, traceparent, and delivery-context threading stay on their existing paths; the rewrite only changes queue API consumption.
