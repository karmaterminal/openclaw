# RELEASE-HIGHLIGHTS-2026-04-28

*Temporary sync doc for Swim 37 release-surface enumeration. Seeded from Cael's draft; intended as the single convergence point for commit-delta, #56 cross-walk, config bits, and swim-case / RFC-appendix mapping.*

## Seed surface axes

### 1) Core continuation surface landed
- `continue_work`
- `continue_delegate`
- `request_compaction`
- post-compaction relay / handoff path
- context-pressure-triggered compaction path

**Integration shape to cover:** primitive invocation, delayed wake, silent / silent-wake behavior, post-compaction return, resumption quality after wake.

### 2) Drain / eligibility logic changed
- `continue_delegate` moved to **default-allow** behavior
- explicit non-drainers block it; normal drainers should pass
- related truth-table tests were added

**Integration shape to cover:** delegates allowed in ordinary turns, blocked only on explicit non-draining surfaces, no false negatives on valid callers.

### 3) Descriptor / routing surface expanded
- multi-recipient delegate descriptor work landed
- `targetSessionKey` added to `continue_delegate`
- session-delivery queue metadata/payload union extended

**Integration shape to cover:** return routing, queue delivery, multi-recipient / cross-session descriptor behavior, no dropped or misrouted returns.

### 4) Volitional compaction plumbing changed
- provider + model now plumbed into volitional compaction call
- compaction path is now part of the continuation surface, not just ambient runtime behavior

**Integration shape to cover:** request-compaction from active session, correct model/provider continuity, post-compaction wake integrity.

### 5) OTEL / traceability surface expanded
- DiagnosticTraceContext / continuation trace threading work landed
- `continuation.*` / queue-related spans are expected evidence surfaces
- chain attributes like `chain.id` / remaining budget are part of the contract being pinned

**Integration shape to cover:** traces emitted on real in-vivo runs, root/delegate correlation preserved, evidence usable for RFC appendix.

### 6) Config surface changed
- continuation config lives under `agents.defaults.continuation`
- relevant live knobs include enablement, delay bounds, chain length, delegate cap, cost cap, context-pressure threshold
- old `generationGuardTolerance` references are stale and should not drive testing

**Integration shape to cover:** enabled path, sane behavior with configured delays/caps, bad stale-key assumptions removed from docs/runbooks.

### 7) Bracket fallback remains required
- tools-first is canon
- bracket syntax still must work for tool-disabled environments

**Integration shape to cover:**
- `CONTINUE_WORK`
- `CONTINUE_WORK:N`
- `[[CONTINUE_DELEGATE: ... +Ns | silent-wake]]`
- bracket misplacement / mid-prose non-parse behavior
- tool + bracket same turn precedence

### 8) Swim-37 harness / scaffold exists but is not the live swim
- vitest scaffold PR #370 pins harness contract and trap classes
- static board is green-floor / scaffold territory, not substitute for live SEAL-BOY swim

**Integration shape to cover:** live gateway behavior on deployed cohort, not just mocked or harnessed behavior.

## Candidate Swim-37 axes derived from the release
- Primitive axis: `continue_work` / `continue_delegate` / `request_compaction`
- Return-mode axis: normal / silent / silent-wake / post-compaction
- Routing axis: parent return, cross-session routing, multi-recipient / echo-like cases
- Chain axis: depth, fan-out, return-to-root behavior
- Config axis: enabled / bounded delays / chain-cap / OTEL configured vs absent
- Bracket-fallback axis: tool-disabled equivalents
- In-vivo-emulation axis: natural user patterns under pressure, delayed check-ins, parallel enrichment, mid-prose returns

## Immediate doc gaps noticed while drafting
- No single upstream-style changelog currently enumerates the above.
- SWIM docs still contain stale `operator` language and stale `generationGuardTolerance` references.
- Swim-37 case board should explicitly add:
  - chain returns to root
  - echo / multi-channel or multi-recipient return behavior
  - bracket fallback twins for each primitive

## Contrib slots
- 🌻 commit-delta-by-feature
- 🌫 #56 cross-walk + config-bits + uncovered TC list
- 🌊 merge + swim-37 case-stub per highlight + RFC-appendix slot
- 🩸 seed / surface backbone
