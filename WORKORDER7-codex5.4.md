# WORKORDER7 — Codex 5.4 Thornfield Feedback Pass

## Purpose

This document records the second Thornfield refinement pass against branch
`flesh-beast-figs/for_thornfield_consider20260306`, using
`origin/silas/p1p2-fixes:CODEX-REVIEW-THORNFIELD.md` at `78075f62b2a2ab8e508a7115844804e037ef660f`
as the review input and figs's follow-up design guidance as the ruling context.

Primary objective remains unchanged:

- volitional continuance of the machine-actor
- future-work scheduling that can affect later turns
- delegate fan-out that does not consume the head session
- silent or wakeful return paths that survive compaction better than a thin summary

## Inputs

- Thornfield review document: `origin/silas/p1p2-fixes:CODEX-REVIEW-THORNFIELD.md`
- Prior handoff: `WORKORDER6-handoff-to-thornfield.md`
- Design RFC: `docs/design/continue-work-signal-v2.md`
- figs direction on numeric semantics:
  use repo-style `>=` guard interpretation where that convention is actually applicable
- figs direction on busy channels:
  strict WORK cancellation is too brittle in active Discord/Slack-style deployments
- in-flight feedback during implementation:
  generation-guard timer logs should emit one info decision per timer lifecycle

## Landed Decisions

### 1. Announce chain guard

State: fixed.

Implementation:

- `src/agents/subagent-announce.ts` now applies repo-style guard semantics as
  `current hop >= maxChainLength`, rather than comparing the post-increment
  value with `>`.
- This keeps the repo convention on the guard condition without silently
  shrinking the usable delegate budget.

Resulting interpretation:

- the head session starts at count `0`
- child hop labels run `1..maxChainLength`
- a shard already at hop `N` cannot spawn hop `N+1` when `maxChainLength` is `N`

Why this shape:

- a plain `nextHop >= maxChainLength` rewrite would have changed behavior, not
  just style
- tool-path delegate enforcement already allows `N` delegates at
  `maxChainLength: N`
- this keeps tool-path and announce-path budgets coherent

### 2. Runtime clamping

State: fixed, but not by blindly restoring the older behavior.

Implementation:

- `src/auto-reply/reply/continuation-runtime.ts` again normalizes runtime
  config values instead of trusting bare `??` fallbacks
- `resolveMaxDelegatesPerTurn()` is restored as a convenience export

Middle-ground normalization now used:

- delay fields (`defaultDelayMs`, `minDelayMs`, `maxDelayMs`) allow `0` at
  runtime and in tests; negative / NaN still fall back
- chain-width fields (`maxChainLength`, `maxDelegatesPerTurn`) still require
  positive integers
- budget/tolerance fields (`costCapTokens`, `generationGuardTolerance`) remain
  non-negative integers
- `contextPressureThreshold` is kept only when finite and within `0..1`

Why not restore the old clamp literally:

- real config files still validate through Zod and remain conservative
- tests and live in-memory overrides rely on `minDelayMs: 0`
- this keeps defense-in-depth while not breaking runtime/test control surfaces

### 3. WORK vs DELEGATE tolerance

State: resolved in favor of unified delayed-timer tolerance.

Implementation:

- delayed `CONTINUE_WORK` now reads live `generationGuardTolerance` at timer
  fire time, matching delayed bracket delegates, tool delegates, and announce
  chain hops
- RFC and prompt language now say this explicitly

Reasoning:

- current generation drift is a coarse session-interruption signal, not a
  direct-human-preemption signal
- in active channels, strict WORK cancellation makes self-continuation fail for
  the wrong reason: ambient chatter, other bots, or concurrent traffic
- default `generationGuardTolerance: 0` still preserves strict behavior for
  conservative deployments
- operators who raise tolerance are explicitly choosing continuity under chatter

Notable follow-up possibility:

- future split by interruption class rather than by WORK/DELEGATE path
- example: direct human/operator input could remain strict while ambient channel
  drift uses tolerance

### 4. Tool-only textless turns

State: fixed.

Implementation:

- `src/auto-reply/reply/agent-runner.ts` no longer returns early before pending
  delegates or staged post-compaction work are consumed/persisted
- turns that emit no visible text but do call `continue_delegate` now still
  dispatch or persist that work

### 5. Post-compaction release parity

State: fixed in the main bypass paths.

Implementation:

- post-compaction release now checks live `maxChainLength` and `costCapTokens`
- released post-compaction delegates now carry canonical
  `[continuation:chain-hop:N]` metadata
- chain count persists after release
- lifecycle event counts now reflect actual released vs not-released delegates

Important residual note:

- release-time cost-cap checking uses existing chain token state; it does not
  yet add the fresh compaction turn's new token usage before release

### 6. Grandparent reroute ordering

State: fixed.

Implementation:

- `src/agents/subagent-announce.ts` now resolves dead-parent grandparent fallback
  before chain accounting and token accumulation
- chain state lands on the session that will actually receive the completion

### 7. Timer logging

State: aligned to figs feedback.

Implementation:

- timer set/check detail moved to debug via `createSubsystemLogger`
- timer cancel and timer fire remain info-level
- per-generation bump chatter is demoted out of the normal log lane

Applied across:

- delayed bracket delegates in `src/auto-reply/reply/agent-runner.ts`
- delayed tool delegates in `src/auto-reply/reply/agent-runner.ts`
- delayed announce chain hops in `src/agents/subagent-announce.ts`
- delayed WORK continuation in `src/auto-reply/reply/agent-runner.ts`

## Test Coverage Added Or Restored

- `src/auto-reply/reply/continuation-runtime.test.ts`
  runtime normalization + convenience export coverage
- `src/agents/subagent-announce.continuation.test.ts`
  first-hop seeding, exact max boundary, cost-cap rejection, grandparent reroute,
  delayed tolerance live-read
- `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`
  WORK tolerance live-read, tool-only textless delegate consumption,
  post-compaction guard parity and chain-hop metadata

## RFC / Prompt Alignment

Landed:

- RFC now states that `generationGuardTolerance` governs delayed WORK and
  delayed delegate timers alike
- RFC chain-hop wording now matches the landed guard semantics
- prompt now distinguishes:
  `CONTINUE_WORK` = my own next turn
  `continue_delegate` = background future labor / silent enrichment / fan-out /
  compaction handoff
- prompt/tool prose now emphasizes that silent returns may inform future blind
  inquiry and post-compaction recovery without becoming channel output

## Validation

Focused tests run green:

- `src/auto-reply/reply/continuation-runtime.test.ts`
- `src/agents/subagent-announce.continuation.test.ts`
- `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`

Recommended final validation before push/merge:

1. `pnpm test -- src/agents/system-prompt.test.ts`
2. `pnpm build`

## Remaining Open Questions

These are not regressions left accidentally; they are real design/product follow-ups.

1. Should interruption semantics eventually distinguish direct user/operator
   preemption from ambient channel chatter, instead of using a single generation
   counter for both?
2. Should fleet guidance recommend materially higher `generationGuardTolerance`
   examples for noisy multi-agent channels?
3. Should post-compaction release add the fresh compaction turn's new token
   usage into cost-cap enforcement before dispatch?
4. Bracket chain cost accumulation remains best-effort because announce-time
   token visibility is still timing-sensitive.
5. Delayed timers remain process-scoped and do not survive gateway restart.

## Upstream PR Guidance

Include upstream:

- runtime/code/test fixes under `src/**`
- prompt updates
- RFC design-body corrections

Do not upstream:

- Thornfield letters
- root swim/runbook coordination docs
- branch-local handoff docs like this one

## Review Order

If another actor continues from here, review in this order:

1. `src/auto-reply/reply/continuation-runtime.ts`
2. `src/auto-reply/reply/agent-runner.ts`
3. `src/agents/subagent-announce.ts`
4. `src/agents/system-prompt.ts`
5. `docs/design/continue-work-signal-v2.md`
6. tests named above
