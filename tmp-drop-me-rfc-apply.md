# RFC apply journal: continue-work-signal-v2

Tracking issue: karmaterminal/openclaw#547  
Lane: `frond-scribe/rfc-apply-copilot`  
Branch: `frond-scribe/20260503/rfc-apply-copilot`

## §1 closeout - required reads

Status: complete as of 2026-05-02T19:23:13-07:00.

Read pass:

- Full spec read: `docs/design/544-rfc-scientific-literature-review-20260502.md` (455 lines).
- Full artifact read: `docs/design/continue-work-signal-v2.md` (1400 lines).
- Docs rules read: `docs/AGENTS.md`; `pnpm docs:list` run and relevant `design/` entries checked.
- Code/test verification read across the current continuation paths: `src/auto-reply/continuation/{signal,tokens via ../tokens,types,config,context-pressure,delegate-store,delegate-dispatch}.ts`, compatibility shims, `src/auto-reply/reply/{agent-runner,followup-runner,post-compaction-context,post-compaction-delegate-dispatch}.ts`, `src/agents/tools/{continue-delegate-tool,request-compaction-tool}.ts`, `src/config/zod-schema.continuation.test.ts`, `src/infra/{continuation-tracer,session-delivery-queue-storage}.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts`, and `src/gateway/server-restart-sentinel.ts`.
- Stale/moved required-read paths: `docs/design/541-v29-uptake-journal.md`, `src/auto-reply/continuation-delegate-store-taskflow.ts`, `src/auto-reply/continuation-delegate-store-taskflow.test.ts`, `src/auto-reply/reply/continuation-runtime.ts`, and `src/auto-reply/reply/context-pressure.ts` are not present in this checkout. Current-path replacements were found and read where possible.

Total time: about 4 minutes wall-clock from dispatch to closeout. The file set was already localized by the review, so most time went to confirming current-code lineages rather than discovery.

Top 3 surprises about the spec-vs-artifact gap:

1. The review's highest-risk public-surface corrections are real in current bytes: `continue_delegate()` does not advertise `targetSessionKey`, `earlyWarningBand` is a shipped/defaulted config field, and the RFC span table still names old spans.
2. The RFC still describes `session-delivery-queue` as if it carries ordinary `continue_delegate()` work. Current code is more precise: tool delegates sit in TaskFlow, unmatured tool delegates are filter-at-consume plus a process hedge timer, bracket delayed reservations are process-scoped, and the session-delivery queue carries restart/system-event/agent-turn/post-compaction delivery.
3. The artifact has strong substrate language, but the shipped/future/historical boundaries are not stable enough for cold pickup: `targetSessionKey`, the substrate-adoption lint claim, the provider/model bug history, and the `/new` delayed-work survival claim all need tightening or relocation.

Initial rewrite estimate:

- Major rewrites: 6 sections (`§2.3`, `§2.5-§2.6`, `§3.2/§3.6`, `§4.1/§4.4/§4.6`, `§5.1/§5.4`, `§6.6`).
- Minor edits: 8 sections (`§1`, `§2.2/§2.4/§2.7`, `§4.2/§4.3`, `§6.3/§6.4/§6.5`, `§7.2`, `§8`, `§9.5`, `§10.1/§10.2`, appendices).
- Structural apply: add a terminology/scope subsection and explicit shipped/future/non-goal markers while preserving the existing top-level order. Full top-level renumber/reorder is deferred because the workorder also asks to preserve the RFC's existing structure where possible, and the review's concrete fixes can be applied without moving the whole document.

## §2 plan - apply axes

### §2.A - TOC byte-accuracy

- Apply: keep TOC byte-accurate after adding a new early terminology/scope subsection and renumbering the §2 subsections around it.
- Cross-check: run a heading/TOC slug comparison after edits.
- Defer: none expected.

### §2.B - Structural rewrite proposal

- Apply: introduce `Terminology and scope`; separate shipped behavior, implementation notes, future seams, and non-goals inside the existing section order; narrow substrate claims into a matrix; keep detailed validation evidence in/testing appendices rather than letting it define the main contract.
- Defer: wholesale top-level restructure into the review's proposed 11-section outline. Reason: high review cost and unnecessary churn for a docs apply lane when the concrete findings map cleanly onto the current RFC structure.
- Cross-check: every shipped/future distinction around `targetSessionKey`, multi-recipient return, substrate adoption, and trace schema.

### §2.C - Narrative flow

- Apply: add successor-turn authority language in §1 and close; define terms before use; remove forward references that require cohort memory; turn §4.1 into causes plus emission surfaces; compress provider/model history into a normative active-session requirement with appendix evidence.
- Defer: none beyond top-level reorder.
- Cross-check: `§2.3`, `§4.3`, `§6.4`, `§9.5`, and `§10.2`.

### §3 - Claims validation

- Apply missing claims: bracket-vs-tool precedence, last text payload, fallback grammar constraints, TaskFlow filter-at-consume, hedge timer, corrupt TaskFlow payload failure, runtime `mode` as canonical, follow-up delegate drain, request-compaction success-only cooldown/failure event/TTL, post-compaction TTL/budget/queue-first semantics, post-compaction context boundary/time shaping.
- Fix stale/contradicted claims: remove shipped `targetSessionKey`, add `earlyWarningBand`, replace span schema, delete/update `/new` survival claim, remove nonexistent `pnpm lint:substrate-adoption` script claim.
- Cross-check: current files named in §1, especially `src/agents/tools/continue-delegate-tool.ts`, `src/auto-reply/continuation/delegate-store.ts`, `src/auto-reply/continuation/delegate-dispatch.ts`, `src/agents/tools/request-compaction-tool.ts`, `src/infra/continuation-tracer.ts`, and `src/auto-reply/reply/post-compaction-delegate-dispatch.ts`.

### §4 - Depth and Mermaid

- Apply: replace the existing §2.6 Mermaid with the capability decision tree; add diagrams for delegate dispatch, trigger taxonomy, post-compaction lifecycle, gateway broker, and trace/chain correlation.
- Apply depth changes: expand under-depth substrate and post-compaction sections; trim or relocate over-depth canary/history claims.
- Defer: no diagram for full top-level document outline.
- Cross-check: mermaid syntax by inspection plus formatter/docs checks.

### §5 - Register pass

- Apply: replace marketing/adjectival phrasing with falsifiable contract language; normalize `TaskFlow`; define human-user/operator roles; add shipped/future/status markers; add code/test pins where load-bearing claims remain.
- Defer: exhaustive line-by-line literary rewrite outside changed surfaces.
- Cross-check: `rg` for stale terms (`targetSessionKey`, old span names, `Task Flow`, `lint:substrate-adoption`, `/new` survival claim).

### §5.special - substrate-dignity language

- Apply: inline the review's language into §1, primitive semantics, applicability, and the final discussion.
- Defer: none.
- Cross-check: closing returns to bounded successor-turn provision rather than ending as a backlog list.

## §2.A applied - TOC byte-accuracy

Applied in `docs/design/continue-work-signal-v2.md`:

- Added `2.1 Terminology and scope` to the TOC/body.
- Renumbered the §2 interface subsections through `2.8 Design rationale`.
- Replaced the old §2.6 title with `2.7 Capability-tier hierarchy`.

Check result: heading/TOC count is 73/73 after the structural insert. The quick slug script needs GitHub-style underscore preservation for code spans, but the changed anchors follow the same convention already used by the RFC (`continue_work`, `continue_delegate`, `request_compaction`).

## §2.B applied - structural separation

Applied:

- Added early term definitions for human-user/operator, turn/successor turn, continuation chain, delegate, relay, temporal shard, substrate, broker, TaskFlow, and OTel.
- Added explicit shipped/implementation/historical/future/non-goal status markers.
- Corrected the §2 primitive surface so shipped semantics are separated from future seams (`targetSessionKey` and multi-recipient return).

Deferred:

- Full top-level rewrite into the review's proposed 11-section outline. The concrete fixes are being applied in-place to preserve reviewability and avoid whole-document churn.

## §2.C applied - narrative flow

Applied:

- Added bounded successor-turn authority language in the opening.
- Reframed `continue_work()`, `continue_delegate()`, and `request_compaction()` as future-turn arrangement primitives.
- Expanded fallback grammar into one self-contained constraints block.
- Replaced the old capability diagram with a decision tree so the cold-reader can follow enabled/tool-denied/fallback/disabled paths.

## §3 applied - claims validation

Applied:

- Added/strengthened code-backed claims for bracket-vs-tool precedence, last-text-payload parsing, fallback grammar, TaskFlow filter-at-consume, hedge timers, corrupt TaskFlow payload failure, canonical delegate `mode`, follow-up delegate drain, success-only compaction cooldown, failed compaction recovery event, 24h volitional counter semantics, post-compaction TTL/budget/queue-first behavior, and post-compaction context boundary/time shaping.
- Corrected stale or contradicted claims: `targetSessionKey` is future/non-goal rather than shipped schema; `earlyWarningBand` is shipped and defaulted; old `continuation.delegate.enqueue/spawn/return` span names are explicitly stale; `/new` is an interruption boundary; `pnpm lint:substrate-adoption` is not a shipped script in this checkout.
- Rewrote persistence claims into a path-specific substrate matrix: process timers/reservations, TaskFlow pending/staged delegates, and `session-delivery-queue` delivery.

Deferred:

- No substrate-bug issue filed. The contradicted claims were documentation drift, not implementation defects.

## §4 applied - depth and Mermaid

Applied:

- Existing §2 capability diagram was replaced with a decision tree during §2.C.
- Added Mermaid diagrams for TaskFlow delegate dispatch, trigger causes vs. emission surfaces, post-compaction delegate lifecycle, gateway-as-lifecycle-broker, and trace/chain correlation.
- Expanded under-depth mechanics around filter-at-consume, hedge timers, queue-first post-compaction release, stale/overflow/re-stage behavior, path-specific persistence, and traceparent parent stitching.
- Trimmed overbroad `session-delivery-queue` language by explicitly limiting ordinary tool delegates to TaskFlow before compaction.

Deferred:

- No additional full-document architecture diagram; the five new diagrams plus the §2 capability decision tree cover the review's concrete diagram requests.
