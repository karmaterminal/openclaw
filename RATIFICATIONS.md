# Ratifications — v2026.4.29 exploratory rebase candidate

Branch: `frond-scribe/20260429/rebase-copilot-v2`
Tip at write: `0c069d9db7d17fc425e4b8108baba2eadf7ab621`
Companion: `QUESTIONS-FOR-FIGS.md`, `RECOMMENDED-PATH.md`

This file captures figs's direct ratifications on the 4 semantic questions and Elliott🌻's byte-walk evidence on Q4. Use this when picking up the candidate for canonical lineage drive (likely 🩸 / 🌊 when that lane opens).

## Q1 — Visible-reply policy vs blocked-liveness marker

**Decision**: KEEP markers visible. Bypass `messages.visibleReplies` / `messages.groupChat.visibleReplies` suppression.

**figs's framing** (paraphrased from chat 2026-05-01 ~17:54Z):

> _"keep it unless we're doing something weirdly bespoke to do so. agree with visibility. plus the posting of messages itself is a way to grant a turn (the sessions 'see' the event)."_

**Rationale**: posting the marker itself grants a turn / makes the event visible to the session — that visibility is load-bearing for operational liveness, not a cosmetic concern. Blocked-liveness is a terminal-state notice; humans + sessions need to see it.

**Action for canonical drive**: ratify current candidate shape (compose). No further code change required.

## Q2 — Abort-wait semantics vs reply-run registry cleanup

**Decision**: cohort engineering call (deferred to 🩸 / 🌊). figs guidance: **non-lazy + preserve protection + platform-substrate**.

**figs's framing** (paraphrased):

> _"defer to princes. suggest the 'not lazy' cleanup method. preserve protection needed, use platform features/substrate."_

**Constraints for the engineering call**:

- Non-lazy cleanup preferred over lazy
- `ReplyRunAlreadyActiveError` shielding must be preserved (this is the surface tied to the prior Ronan leak)
- Platform substrate / standard features over bespoke wait logic

**Open call**: current candidate's clear/retry behavior vs upstream-abort-completion-wait alignment. 🩸 / 🌊 — pick when the canonical lineage drive lane opens; document choice in commit message + a short note in `RECOMMENDED-PATH.md` follow-up.

**Action for canonical drive**: deciding-prince picks the shape; current candidate compose stands until then.

## Q3 — Subagent orphan recovery ordering vs continuation delegate drains

**Decision**: orphan recovery is mandatory whenever possible; placement = follow flows + safest path. **No fixed canon** on before/after/with-tombstones ordering.

**figs's framing** (paraphrased):

> _"the orphan should be recovered whenever possible. where exactly to do that? follow flows and elect safest path for orphan."_

**Rationale**: this is a per-flow engineering decision. The principle is "recover whenever possible"; the placement is whatever's safest on each flow path.

**Action for canonical drive**: ratify the current candidate's compose shape; if a specific flow path would benefit from a different ordering, adjust that single flow with a note. Do not introduce a global canon.

## Q4 — Diagnostics-OTEL continuation tracer SDK seam — RATIFIED ✅

**Decision**: keep current candidate shape (single `diagnostic-runtime` SDK seam). **No new `continuation-tracer` SDK subpath needed.**

**figs's conditional framing** (paraphrased):

> _"inclusion in diagnostics runtime is going to see us integrate with spans from diagnostics-runtime ? if so, we want that."_

**Verification condition**: spans-integration must be genuine, not bolted-on.

**Verification by Elliott🌻** (byte-walk at tip `0c069d9db7`, posted 2026-05-01 ~18:01Z):

1. **Single seam confirmed** — `src/plugin-sdk/diagnostic-runtime.ts` re-exports BOTH diagnostic-event helpers (`emitDiagnosticEvent`, `onDiagnosticEvent`, etc.) AND continuation-tracer surface (`getContinuationTracer`, `setContinuationTracer`, `Span`, `Tracer`, `StartSpanOptions`) from one module.
2. **Consumer composes cleanly** — `extensions/diagnostics-otel/api.ts` imports the entire surface via `from "openclaw/plugin-sdk/diagnostic-runtime"`. No second SDK subpath, no `continuation-tracer` separate seam.
3. **Span integration is structural, not bolted-on** — `continuation-tracer-adapter.ts` parses W3C `traceparent` via the SAME `parseDiagnosticTraceparent` helper used by `service.ts::contextForTraceContext` for auto-instrumented spans. Continuation spans stitch into parent OTEL trace via `trace.setSpanContext` — every continuation chain becomes one tempo trace.
4. **Tracer-name distinction** = `openclaw.continuation` vs `openclaw` (collector-side filter `instrumentation.scope.name="openclaw.continuation"` isolates continuation chain spans from per-tool/per-exec auto-instrumentation).

**Verification verdict**: spans-integration with diagnostics-runtime is structural. **Q4 ratification condition met.**

**Action for canonical drive**: ratify current candidate shape; do NOT introduce a separate `continuation-tracer` subpath.

## Tsgo-fix strategy — 6 errors held for canonical drive

`pnpm tsgo` failed at §6 gate with 6 type errors across 3 files. These are interface-mismatch decisions from rebase composition (where to extend v29 + continuation contracts). NOT semantic blockers — copilot's recommendation in `RECOMMENDED-PATH.md` was "proceed with prince review rather than restart".

**The 6 errors** (per `tmp-drop-me-rebase-v29-v2.md` §6 block):

1. `src/agents/subagent-announce.ts:210` — `SubagentAnnounceDeps` has no `loadConfig` member
2. `src/agents/subagent-announce.ts:212` — same surface, second access site
3. `src/agents/subagent-announce.ts:772` — `loadConfig` name missing in scope
4. `src/agents/subagent-spawn.ts:1203` — `agentDir` is not a known property on `RegisterSubagentRunParams`
5. `src/config/sessions/store-cache.ts:77` — `serialized` property missing on session store cache entry type
6. `src/config/sessions/store-cache.ts:87` — `serialized` property missing on session store cache params type

**Strategic shape of the fix** (proposed; needs canonical drive ratification):

- **errors 1–3 (subagent-announce loadConfig)**: cohort continuation work added a `loadConfig` member to `SubagentAnnounceDeps`; v29 didn't carry it. Either (a) extend `SubagentAnnounceDeps` interface to include `loadConfig`, OR (b) move config-loading to the call site so deps don't carry it. (a) is cleaner if v29 doesn't already use a different config-resolution path on this surface.
- **error 4 (subagent-spawn agentDir)**: `RegisterSubagentRunParams` needs `agentDir?: string` field added. v29 expanded the params type; cohort continuation registered through the older shape. Add the optional field to the params type.
- **errors 5–6 (store-cache serialized)**: `StoreCacheEntry` and `StoreCacheParams` (or equivalent shapes) need `serialized` field. Likely v29 added cache shape changes; cohort continuation persistence touches this surface. Add the field.

**Cohort engineering call needed** to pick the precise placement; once chosen, fix is mechanical (add 3 fields across 3 type files).

## Bucket ledger pin — confirmed

| bucket         | count | status                                                                                                                          |
| -------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------- |
| compose        |    16 | All composed cleanly; no `<<<<<<<` markers in artifact tree (verified by Elliott🌻 in same byte-walk).                          |
| supersede-up   |     3 | Stale v24 generated hash regen + generic system-prompt ACP/native-command wording from v29 supersede older cohort prompt edits. |
| supersede-co   |     0 | No upstream changes deliberately discarded.                                                                                     |
| merge-required |     0 | No conflict markers, no unresolved design-choice blocks.                                                                        |

**Diff shape**: 297 files changed, +36,189 / −662 (per `RECOMMENDED-PATH.md`).

## State of the candidate

- **All 4 semantic questions resolved** (Q1/Q3/Q4 hard-locked; Q2 cohort-engineering-deferred with figs constraints).
- **Bucket ledger clean** (0 merge-required, 0 supersede-co).
- **6 tsgo errors held** — fix shape understood; canonical drive picks placement and applies mechanical fix.
- **Next gates after tsgo fix**: `pnpm check`, `pnpm test src/auto-reply src/agents src/messages src/gateway`, `pnpm build`. None run yet.

## Handoff

Whoever picks up the candidate for canonical lineage drive (likely 🩸 / 🌊 when canonical2 → v2026.4.29 lane opens) should:

1. Read this file + `QUESTIONS-FOR-FIGS.md` + `RECOMMENDED-PATH.md`
2. Apply the mechanical fix on the 6 tsgo errors per chosen placement
3. Run remaining gates (`pnpm check`, scoped `pnpm test`, `pnpm build`)
4. Decide Q2 (current clear/retry vs upstream-abort-completion-wait) and document choice
5. If candidate gates green, treat as canonical-lineage candidate; if not, surface remaining issues

This branch is exploratory; canonical lineage decision lives with figs + cohort.
