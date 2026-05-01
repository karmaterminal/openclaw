# RFC<->Code Alignment Audit - v3 Self-Review Delta

**Anchor**: `frond-scribe/20260429/rebase-copilot-v3 @ f8fec1c4e8cbc6e30238ff66753a620dd2b26898` (v29-rebased candidate)  
**Baseline**: `frond-scribe/441-rfc-alignment-audit @ 881c44f03ec34780e97fd9d8ef6caff494f085c9` (canonical2 audit; A=12 B=8 C=5 D=9 E=5)  
**RFC**: `docs/design/continue-work-signal-v2.md` (1400 lines on this branch)  
**Audit framing**: copilot self-reviews its own v3 candidate as if presenting upstream at v2026.4.29.

## Methodology

I used the canonical2-side report `RFC-ALIGNMENT-AUDIT-FINDINGS.md` from `origin/frond-scribe/441-rfc-alignment-audit` as the starting ledger, not as something to re-derive. I then read the v3 RFC end-to-end, confirmed it is byte-identical to the canonical2 RFC, and direct-compared the v3 candidate tree against `origin/frond-scribe/441-rfc-alignment-audit` for the v3-specific surfaces named in `WORKORDER-v3-self.md`.

The direct v3 tree delta is narrow: `getRuntimeConfig` replaces ambient `loadConfig` at continuation/subagent seams, `src/config/sessions/store-cache.ts` carries a cached `serialized` string, `src/agents/subagent-registry-spawn-runtime.ts` accepts `agentDir?`, `src/agents/subagent-announce.{test,timeout.test}.ts` mock the renamed config accessor, and `scripts/check-duplicates.mjs` includes `studies`. I treated code as the current truth for shipped behavior and counted only RFC<->code alignment changes caused by those v3 deltas.

## Delta summary

- **Delta-A** (newly aligned vs canonical2 baseline): 0 findings.
- **Delta-B** (newly drifted vs canonical2 baseline): 0 findings.
- **Delta-C** (depth-fit drift introduced by v3 rebase): 0 findings.
- **Delta-D** (newly under-described: v3 added feature, RFC silent): 0 findings.
- **Delta-E** (newly over-described: v3 removed feature, RFC still describes): 0 findings.
- **Carries-from-baseline**: 39 findings unchanged (A1-A12, B1-B8, C1-C5, D1-D9, E1-E5).

## Delta-A - Newly aligned

No v3-side change fixes a canonical2 baseline finding.

The closest candidate is the config-boundary repair: v3 routes continuation runtime config through `getRuntimeConfig()` instead of direct `loadConfig()` imports. That is an architecture-boundary cleanup, not an RFC semantic change. The v3 helpers still resolve the same continuation defaults and clamps (`src/auto-reply/continuation/config.ts:56-88`, `src/auto-reply/reply/continuation-runtime.ts:49-81`), while the config facade currently makes `getRuntimeConfig()` an alias of `loadConfig()` (`src/config/io.ts:2348-2357`). Baseline A1 (defaults/hot-read behavior) therefore stays aligned but is not newly aligned.

## Delta-B - Newly drifted

No newly drifted RFC/code claim was introduced by v3.

Baseline B findings still exist because the RFC did not change. For example, `targetSessionKey` remains documented as an exposed descriptor seam (`docs/design/continue-work-signal-v2.md:154-158`), while the shipped `continue_delegate` schema still exposes only `task`, `delaySeconds`, and `mode` (`src/agents/tools/continue-delegate-tool.ts:17-39`, `src/agents/tools/continue-delegate-tool.ts:80-151`). Likewise, the RFC still carries the stale shipped span table names (`docs/design/continue-work-signal-v2.md:931-949`), while code pins the canonical set to `continuation.work`, `continuation.work.fire`, `continuation.delegate.dispatch`, `continuation.delegate.fire`, `continuation.queue.enqueue`, `continuation.queue.drain`, `continuation.compaction.released`, `continuation.disabled`, and `heartbeat` (`src/infra/continuation-tracer.ts:215-224`). Those are unchanged baseline drifts, not v3 regressions.

## Delta-C - Depth-fit drift introduced

No v3-specific depth-fit drift was introduced.

The v3 `getRuntimeConfig` refactor preserves the RFC's depth on runtime-read-at-use/hot reload (`docs/design/continue-work-signal-v2.md:685-690`, `docs/design/continue-work-signal-v2.md:897-917`) because the enforcement-point helpers still resolve runtime config at call time (`src/auto-reply/continuation/config.ts:50-58`, `src/auto-reply/reply/continuation-runtime.ts:49-51`) and the config facade still serves the process runtime snapshot (`src/config/io.ts:2348-2357`). The remaining v3 additions are internal type/cache/test/tooling surfaces, not RFC-depth continuation behavior.

## Delta-D - v3-added features RFC silent on

No v3-added behavior needs a new RFC section.

| v3 surface                            | Evidence                                                                                                                                                                                                              | Delta assessment                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime config accessor rename        | `src/agents/subagent-announce.runtime.ts:1`, `src/agents/subagent-announce.ts:58-67`, `src/agents/subagent-announce.ts:210-225`, `src/agents/subagent-announce.ts:771-773`                                            | Internal seam rename from `loadConfig` to `getRuntimeConfig`; same config keys/defaults and same hot-read contract. No RFC insertion needed.                                   |
| Continuation config helper defaults   | `src/auto-reply/continuation/config.ts:15-20`, `src/auto-reply/continuation/config.ts:56-88`, `src/auto-reply/reply/continuation-runtime.ts:14-19`, `src/auto-reply/reply/continuation-runtime.ts:49-81`              | Same shipped defaults and clamp semantics already covered by RFC §5 (`docs/design/continue-work-signal-v2.md:668-690`, `docs/design/continue-work-signal-v2.md:694-707`).      |
| `agentDir?` in registry spawn runtime | `src/agents/subagent-registry-spawn-runtime.ts:1-30`, `src/agents/subagent-spawn.ts:1191-1204`, `src/agents/subagent-registry.ts:480-500`                                                                             | Type-shape parity for registry/context-engine callbacks. It does not alter continuation scheduling, delegate return modes, chain budget, persistence, or RFC-visible behavior. |
| `serialized?` in session-store cache  | `src/config/sessions/store-cache.ts:4-9`, `src/config/sessions/store-cache.ts:20-24`, `src/config/sessions/store-cache.ts:65-93`, `src/config/sessions/store-load.ts:159-170`, `src/config/sessions/store.ts:383-386` | Cache optimization for cloning/no-op write detection, not a persisted `SessionEntry` field or continuation contract. The RFC should not describe this internal cache string.   |
| Subagent announce mock additions      | `src/agents/subagent-announce.test.ts:41-55`, `src/agents/subagent-announce.timeout.test.ts:19-24`                                                                                                                    | Test-only support for the config accessor rename. No RFC-visible behavior.                                                                                                     |
| Duplicate scan `studies` target       | `scripts/check-duplicates.mjs:9-25`                                                                                                                                                                                   | Tooling coverage change outside continuation runtime/API. No RFC-visible behavior.                                                                                             |

## Delta-E - v3-removed features RFC still describes

No v3-side removal was found.

The v3 candidate did not remove a continuation primitive, return mode, config key, queue substrate, status field, or diagnostics-otel seam that the RFC documents. Direct RFC comparison also returned no deletion, so every canonical2 over-description remains a baseline carry-forward rather than a v3-created removal.

## Notable observations

- **v3-side `loadConfig` refactor**: no RFC alignment shift. The refactor changes the code boundary to `getRuntimeConfig()` but preserves the shipped config values and runtime-read semantics (`src/config/io.ts:2348-2357`, `src/auto-reply/continuation/config.ts:56-88`, `src/auto-reply/reply/post-compaction-delegate-dispatch.ts:45-55`, `src/auto-reply/reply/post-compaction-delegate-dispatch.ts:418-437`).
- **v3-side `serialized?` add**: no RFC alignment shift. It is scoped to cache cloning/write avoidance and is not a user-facing or persisted session-schema field (`src/config/sessions/store-cache.ts:4-9`, `src/config/sessions/store-cache.ts:81-93`).
- **v3-side mock additions**: no RFC alignment shift. They follow the renamed runtime accessor and do not change production behavior (`src/agents/subagent-announce.test.ts:41-55`, `src/agents/subagent-announce.timeout.test.ts:19-24`).
- **Diagnostics-otel SDK seam**: Q4 remains structurally aligned with the v3 ratification. The plugin consumes continuation tracing through `openclaw/plugin-sdk/diagnostic-runtime` (`extensions/diagnostics-otel/api.ts:6-24`); the SDK subpath re-exports both diagnostic trace helpers and continuation tracer types/functions (`src/plugin-sdk/diagnostic-runtime.ts:1-39`); the adapter stitches `traceparent` into OTEL parent context (`extensions/diagnostics-otel/src/continuation-tracer-adapter.ts:139-172`) and service startup installs it when traces are enabled (`extensions/diagnostics-otel/src/service.ts:700-709`). This does not fix the RFC's stale span table; baseline B2/C1/E1/E2 still carry.
- **Session-delivery queue adoption**: baseline B3/C2 still carry. The queue can represent `systemEvent`, `agentTurn`, and `postCompactionDelegate` payloads (`src/infra/session-delivery-queue-storage.ts:67-96`), but normal system events are still explicitly in-memory/ephemeral (`src/infra/system-events.ts:1-5`, `src/infra/system-events.ts:119-140`). v3 did not migrate those call sites.

## Carries unchanged from canonical2 baseline

| Baseline section                          | Count | v3 disposition                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Class A - aligned representative findings |    12 | A1-A12 carry unchanged. v3 does not change the RFC or the core primitive semantics used by the baseline: defaults, tools/fallback, same-session continuation, delegate modes, silent returns, leaf deny, request-compaction guards, provider/model threading, context pressure, Trigger F, status row, and diagnostics-otel adapter installation.                                                  |
| Class B - drift findings                  |     8 | B1-B8 carry unchanged. The RFC is byte-identical and current code still shows the same drift axes: `targetSessionKey`, span vocabulary/table, queue adoption wording, asynchronous post-compaction release wording, TaskFlow-vs-volatile reservation nuance, duplicate context-pressure helper topology, stale `/status` path, and follow-up `request_compaction()` context-unavailable rejection. |
| Class C - depth-fit drift findings        |     5 | C1-C5 carry unchanged. v3 adds no new depth mismatch and does not resolve the existing observability, queue-adoption, hedge-timer, delegate-store, or post-compaction policy depth gaps.                                                                                                                                                                                                           |
| Class D - under-described findings        |     9 | D1-D9 carry unchanged. v3's new/changed lines do not alter fallback syntax, merge precedence, queue-depth diagnostics, compaction dedup/TTL counters, system-event semantics, queue retry cleanup, idempotency key inputs, or chain-hop token accumulation.                                                                                                                                        |
| Class E - over-described findings         |     5 | E1-E5 carry unchanged. v3 does not implement the RFC's stale span names/metric claims, explicit `targetSessionKey` rejection, or synchronous "injected into successor" wording.                                                                                                                                                                                                                    |

## Self-review note

The most important self-review result is negative: the v3 candidate's post-rebase fixes are mechanically correct-looking for type/build architecture, but they do not materially change RFC<->code alignment relative to the canonical2 audit. The eventual RFC update lane should therefore read this file as "no extra v3 delta to fold in" and use the canonical2 report as the substantive edit ledger.

The one caution for that lane: do not mistake the v3 config-boundary cleanup for an RFC semantic fix. It removes deprecated internal config API usage from continuation/subagent code, but the RFC still needs the same canonical2 corrections, especially the `targetSessionKey` contract, span schema, queue-adoption matrix, and post-compaction wording.
