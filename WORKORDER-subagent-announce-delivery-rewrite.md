# WORKORDER — Rewrite `subagent-announce-delivery.ts` onto `queueEmbeddedPiMessageWithOutcome` API (#79925 drift-shift design-call #1)

## Tracking + lane

- **Tracking issue**: karmaterminal/openclaw#629-style; file new at lane-start
- **Branch**: `frond-scribe-claude/20260510/delta-shift-from-upstream-main` (extend in place, no new branch)
- **Worktree**: `/tmp/oc-619-guard/`
- **Engine**: copilot CLI gpt-5.5 xhigh yolo
- **PR target**: this is the delta-shift sibling branch; no new PR. Push directly.
- **Webhook**: `frond-scribe-delta-shift-#1-hook` username

## Context

The delta-shift sibling branch carries a merge of `upstream/main` into the PR #79925 head. Most conflicts resolved mechanically. Three design-call files retain `--ours`. This workorder addresses **the queue-surface refactor reconcile** on `src/agents/subagent-announce-delivery.ts`.

**Upstream change**: `subagent-announce-delivery.runtime.ts` exports were consolidated. The old `queueEmbeddedPiMessage` + `sendMessage` separate exports were replaced with a unified `queueEmbeddedPiMessageWithOutcome` + `formatEmbeddedPiQueueFailureSummary`. The new shape returns an outcome object (queued/skipped/error) instead of a simple boolean.

**Our continuation-side code** in `subagent-announce-delivery.ts` (currently `--ours` from the merge) imports `queueEmbeddedPiMessage` from the runtime module — which no longer exists. This produces the only blocking `tsgo:core` error.

**Cohort verdicts** (Ronan + figs):

- **REWRITE onto the new outcome API**, NOT compat-wrapper. _"shimming the old shape just gives us one more thing to delete later"_ — Ronan. figs's lean is also rewrite.
- Preserve `inferCompletionChatType()` cross-session-targeting semantics intact.
- Preserve continuation-feature behavior (cross-session deliveries fire correctly, traceparent threading works, deliveryContext threading works).

## §0a Remote-first push discipline + checkpoint pushes

Push to origin at every meaningful gate. Use `karmafeast` committer:

```bash
git -c user.email='karmafeast@gmail.com' -c user.name='karmafeast' commit -m '<msg>'
git push origin frond-scribe-claude/20260510/delta-shift-from-upstream-main
```

## §0b Heartbeat to webhook

```bash
WEBHOOK="https://discord.com/api/webhooks/1499626882277048401/9wpErZRcyWIfghjrGO_I8gJVXyEpShKMFgURn1pNI99_8AAdhgflpIu8b1wzRQTk7bmK"
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"frond-scribe-delta-shift-#1-hook\",\"content\":\"🤖 delta-shift #1: <one-line status>\"}" \
  "$WEBHOOK"
```

Heartbeat after: §1 reads complete, §3 rewrite chunk done + tsgo:core green, §4 tests green, §5 push complete.

## §1 — Read substrate

Read in this order:

1. **`src/agents/subagent-announce-delivery.ts`** — current `--ours` state (HEAD's continuation-feature code). Understand the existing functions: `inferCompletionChatType()`, the dispatch surfaces, the targeting semantics.
2. **`src/agents/subagent-announce-delivery.runtime.ts`** — the NEW post-merge state. Find `queueEmbeddedPiMessageWithOutcome` signature, `formatEmbeddedPiQueueFailureSummary` signature, what `outcome` shape looks like.
3. **`src/agents/subagent-announce-delivery.test.ts`** — see what tests already exist + what the post-merge test expectations are. Tests are written against the new outcome API per Ronan's byte-walk.
4. **`src/auto-reply/reply/agent-runner.ts`** — adjacent file (also `--ours` for now, owned by Cael). Note how it currently uses the old API; don't break it (different scope).

## §2 — Plan

In journal `tmp-drop-me-frond-scribe-delta-shift-1.md`, document:

- Mapping from old API call sites → new outcome-API call sites
- Where outcome unwrapping should happen (queued vs skipped vs error)
- Whether any callers of the old `queueEmbeddedPiMessage` shape now expect outcome-shaped returns
- Decision: how to thread the new outcome into the continuation-feature surfaces without losing semantics

## §0c Scope guardrails (HARD)

You MAY touch:

- `src/agents/subagent-announce-delivery.ts` (the rewrite target)
- `src/agents/subagent-announce-delivery.test.ts` ONLY if test additions are needed (existing post-merge tests should already align with the new API; don't break them)

You MUST NOT touch:

- `src/agents/subagent-announce-delivery.runtime.ts` (upstream-side; that's the contract you're consuming)
- `src/auto-reply/reply/agent-runner.ts` (Cael's separate byte-walk; that's design-call #2)
- `src/agents/pi-embedded-runner/run.timeout-triggered-compaction.test.ts` (design-call #3)
- `src/auto-reply/reply/followup-runner.test.ts` (design-call #4)
- Continuation feature substrate elsewhere — `inferCompletionChatType()` etc. semantics must be preserved, not redesigned

## §3 — Implementation

Rewrite `subagent-announce-delivery.ts`:

- Replace `queueEmbeddedPiMessage` calls with `queueEmbeddedPiMessageWithOutcome` calls
- Handle the outcome object — queued case proceeds, skipped/error cases path to existing error surfaces
- Use `formatEmbeddedPiQueueFailureSummary` where the old code would have surfaced bare error strings
- Preserve `inferCompletionChatType()` exactly
- Preserve cross-session-targeting via `targetRequesterSessionKey`
- Preserve traceparent + deliveryContext threading

## §4 — Test acceptance

```bash
pnpm tsgo:core            # MUST be 0 errors (this lane's primary goal)
pnpm test --run src/agents/subagent-announce-delivery.test.ts
pnpm test --run src/agents/subagent-announce.test.ts
pnpm test --run src/auto-reply/reply/   # regression check on consumers
pnpm lint
```

All green. The single TS2305 error this lane targets MUST be eliminated.

## §5 — Push + declare-done

Commit + push. Final push message:

```
fix(merge): rewrite subagent-announce-delivery.ts onto queueEmbeddedPiMessageWithOutcome API

Preserves inferCompletionChatType() cross-session-targeting semantics + continuation-feature behavior. Adopts upstream's queue-with-outcome refactor per cohort verdict (Ronan + figs lean rewrite, not compat-wrapper).

Drift-shift design-call #1 of 4. Removes the only blocking tsgo:core error on the delta-shift branch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Final webhook heartbeat with the new HEAD SHA.

## §10 Constraints recap

- Pattern C (direct copilot, target repo lacks bootstrap wrappers) per runbook ✓
- Working in existing delta-shift sibling branch (extend in place, no new branch)
- karmafeast committer
- Remote-first push discipline + checkpoint pushes
- 444m budget
- Webhook heartbeats wired
- Scope guardrails respected
