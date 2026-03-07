# WORKORDER6.md — Final Continuation Handoff

## Purpose

This is the cleaned handoff for the continuation corrections and follow-on prompt/RFC alignment work.

It supersedes `WORKORDER6-codex54.md` as the human-shareable summary. Treat the `-codex54` file as the working draft / anchor artifact, not the final handoff.

## Status

Implemented and locally validated.

Completed validation:

- targeted continuation and prompt regression tests passed
- `pnpm build` passed

## Finalized Findings

### 1. Canonical chain-hop metadata is now aligned

- bracket-origin delegate spawns now carry canonical `[continuation:chain-hop:N]` metadata
- tool-origin and bracket-origin delegates now share the same announce-side hop contract
- announce-side chain enforcement now matches the intended semantics: hops `1..maxChainLength` are allowed, the next hop is rejected once it would exceed the cap

Why this matters:

- delegate-origin trees can continue without forcing every hop back through the main session
- width/fan-out work remains compatible with depth/chain enforcement

### 2. Live-read delegate timer policy is now aligned

- delayed delegate timers in `agent-runner.ts` now read live `generationGuardTolerance` at timer fire time
- delayed chain-hop timers in `subagent-announce.ts` now do the same

Why this matters:

- operators can retune busy-channel tolerance without restarting the gateway
- delayed delegate work behaves like live policy, not like process-start policy

### 3. Live-read width control is now aligned

- `continue_delegate` now reads `maxDelegatesPerTurn` at `execute()` time
- runner-side delegate consumption also defensively enforces the live width cap
- runtime and comments now agree on the shipped default: `maxDelegatesPerTurn = 5`

Why this matters:

- width is now a real operational knob
- stale construction-time limits no longer freeze swarm/fan-out behavior until restart

### 4. Naive-agent guidance is materially better

The main system prompt, sub-agent continuation guidance, and `continue_delegate` tool description now teach the intended model more directly:

- `CONTINUE_WORK` is the sequential same-session path
- `continue_delegate` is the first-class background delegate path for delayed, silent, wake-on-return, and compaction-aware work
- `sessions_spawn` remains the right tool for immediate explicit workers, ACP spawns, or attachment-heavy cases
- agents are explicitly told not to imitate continuation/delegate scheduling with `exec`, shell sleeps, or ad hoc `openclaw ...` relay patterns
- sub-agents are explicitly told that delegate chaining exists to keep the parent/main session free rather than using it as a relay hop

### 5. The RFC main design sections are closer to current reality

The main body of `docs/design/continue-work-signal-v2.md` now reflects current runtime behavior more accurately:

- structured `continuationTrigger: "delegate-return"` wake classification
- delegate-pending state described as control-plane state rather than prompt-visible queue text
- canonical `[continuation:chain-hop:N]` examples
- explicit distinction between shipped defaults and a more aggressive fleet/mast-cell profile

## Objective Confirmation

The core objective is now clear:

- agents need to schedule future work across turn boundaries
- delegates need to be able to return into later turns, sometimes silently
- delegate-origin work needs to be able to chain and fan out further delegates
- the main session should stay free for active thinking and user interaction while shards do legwork

This is not just "continuation as a loop primitive." It is continuation as background scheduling plus delegate-tree parallelism plus compaction-survival assistance.

## Shipped Defaults vs Fleet Profile

Shipped/runtime defaults remain conservative:

- `maxChainLength: 10`
- `maxDelegatesPerTurn: 5`
- `costCapTokens: 500000`
- `generationGuardTolerance: 0`

Current working policy read:

- `maxChainLength: 10` is probably already fine as the recursion guard
- `maxDelegatesPerTurn` is the likely bottleneck for mast-cell / sensor-swarm fan-out
- `costCapTokens` remains the real global leash
- fleet-style deployments will usually want to widen width before widening depth

In other words: the open question is policy, not mechanics. The code now supports live tuning; the remaining decision is whether upstream defaults stay conservative while fleet operators turn width up aggressively.

## Remaining Known Gaps / Follow-Up

These items are not closed by this work:

- bracket-path token-cost accumulation across chain hops remains a known partial gap; `maxChainLength` is still the primary leash there
- operational reruns still matter: Swim `6-2`, `6-7a`, `6-7b`, plus a real fan-out-width sanity check
- the historical / changelog-style tail of the RFC is still not normative and should not be used as the source of truth

## Upstream PR Hygiene

Recommended upstream include set:

- runtime fixes for chain-hop metadata, timer live-reads, and width live-reads
- behavioral regression tests for those runtime fixes
- prompt/tool wording changes if maintainers want first-class continuation UX for naive agents
- RFC main-body alignment

Recommended upstream exclude set:

- `WORKORDER6-codex54.md`
- `WORKORDER6.md`
- prompt-wording lock tests that exist only to preserve local phrasing preferences, unless they are intentionally kept as product-behavior coverage

## Validation Snapshot

Validated locally with:

```bash
pnpm test -- src/agents/system-prompt.test.ts src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts src/agents/subagent-announce.continuation.test.ts src/agents/tools/continue-delegate-tool.test.ts src/config/zod-schema.continuation.test.ts src/auto-reply/continuation-delegate-store.test.ts
pnpm build
```
