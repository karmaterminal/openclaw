# v52-uptake journal — copilot lane

| Field              | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| Worktree           | `/home/figs/flesh_beast_best_beast/openclaw-wt-v52-uptake-20260503`        |
| Branch             | `frond-scribe/20260503/v52-uptake-of-v3-cohort-fixes`                      |
| Source             | `frond-scribe/20260429/v3-cohort-fixes` @ `55df7162c0` (v29-base anchored) |
| Target basis       | `8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4` (v2026.5.2)                     |
| Workorder          | `/home/figs/flesh_beast_best_beast/WORKORDER-v52-uptake-20260503.md`       |
| Tracking           | karmaterminal/openclaw#546                                                 |
| Model              | github-copilot/gpt-5.5 with `--reasoning-effort xhigh`                     |
| Outer budget       | 444m                                                                       |
| Webhook resolve    | `gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/frond-scribe`      |
| Heartbeat username | `frond-scribe-v52-uptake-hook`                                             |
| Discord posture    | webhook heartbeats ONLY (no free-form chat) — cohort not to be disturbed   |
| Replay set         | 119 cohort commits since v29 base                                          |
| Upstream window    | 1543 commits between v29 (`a448042c2e`) and v5.2 (`8b2a6e57fe`)            |
| Started            | (filled by agent at first §1 entry)                                        |

## §0 — guardrails acknowledged

- Operate only inside this worktree
- Never read/write/list/shell into `/home/figs/flesh_beast_tmp/`
- Push to `frond-scribe/20260503/v52-uptake-of-v3-cohort-fixes` only
- NO Discord chat posts — webhook heartbeats only (structured `🤖 v52-uptake §X complete; ...; commit <SHA>` shape)
- NO force-push after first push (savegame discipline per #326)
- NO modification to `COHORT_TARGET_TAG` repo variable
- NO touching `frond-scribe/20260429/v3-cohort-fixes`, `cael/325-canonical2`, `feature/context-pressure-squashed`, `archived/*`, or prince-namespaced branches
- Heartbeat at every §-section close and on any DESIGN-BREAK

(Agent fills §1 onward in-flight.)

## §1 — required reads closeout

Started: 2026-05-02T19:12:40-07:00
Closed: 2026-05-02T19:15:36-07:00
Elapsed: ~3m

### Process documents read

| Surface                                 | Notes                                                                                                                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `karmaterminal/openclaw#541`            | v29-uptake parent issue: wrong-basis drift from v24/canonical2 to v29, ancestor-check discipline, acceptance shape for PORT / ALREADY-ON-V3 / DROP classification and gates.                                |
| `karmaterminal/openclaw#542`            | v29-uptake PR: summary says 8 PORT / 110 ALREADY-ON-V3 / 11 DROP, no conflicts, local gates green, then Step 10 stripped the first-turn compaction-count fix into separate PR #545 after Codex P2 findings. |
| `docs/design/541-v29-uptake-journal.md` | Not present on this branch tip. Retrieved from PR #542 head. Table format and Step 10 strip-and-relane reasoning mirrored for this lane.                                                                    |
| `karmaterminal/openclaw#436`            | NTK branch index: v29 canonical line is `frond-scribe/20260429/v3-cohort-fixes` at `55df7162c0`; #542 and #545 are still active context; v52 output is a successor candidate only.                          |
| `karmaterminal/openclaw#326`            | Savegame discipline: date-discoverable savegame refs, no force-push/delete after savegame, push substrate before squash.                                                                                    |
| `karmaterminal/openclaw#546`            | Current tracking issue: branch/worktree/mission/heartbeat guardrails confirmed; final candidate must have v2026.5.2 as ancestor.                                                                            |

### Substrate code surface read

| Surface                                                                  | Notes                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/auto-reply/continuation-delegate-store-taskflow.ts` + `.test.ts`    | Missing at v29 source tip. Current canonical TaskFlow implementation is under `src/auto-reply/continuation/delegate-store.ts` + `.test.ts`.                                                                                                                                                              |
| `src/auto-reply/continuation-delegate-store.ts` + `.test.ts`             | Compatibility shim over the canonical TaskFlow store. Post-compaction wrappers adapt `SessionPostCompactionDelegate` to `StagedPostCompactionDelegate`; tests pin pending, delayed reservation, and staged delegate compatibility behavior.                                                              |
| `src/auto-reply/continuation-delegate.types.ts`                          | Compatibility re-export. Runtime `PendingContinuationDelegate` is mode-only; legacy boolean flags are storage compatibility only.                                                                                                                                                                        |
| `src/auto-reply/reply/continuation-runtime.ts` + `.test.ts`              | Missing at v29 source tip. Current lazy boundary is `src/auto-reply/continuation/lazy.runtime.ts`, dynamic-import only, exporting runtime config/context-pressure/delegate dispatch/store/state helpers.                                                                                                 |
| `src/auto-reply/reply/continuation-state.ts` + `.runtime.ts`             | Missing at v29 source tip. Current state lives at `src/auto-reply/continuation/state.ts`; pending state is derived from TaskFlow counts, with only timer handles/refs in process memory.                                                                                                                 |
| `src/auto-reply/reply/context-pressure.{ts,test.ts,integration.test.ts}` | `reply/context-pressure.ts` is missing; implementation is `continuation/context-pressure.ts`. Reply tests cover band thresholds, dedup, stale token guards, custom thresholds, warning log level, and event queue ordering.                                                                              |
| `src/auto-reply/reply/post-compaction-context.test.ts`                   | Pins AGENTS.md section extraction, custom post-compaction sections, legacy fallback sections, symlink/hardlink escape rejection, date substitution, and current-time injection.                                                                                                                          |
| `src/agents/tools/request-compaction-tool.{ts,test.ts}`                  | Tool is async fire-and-forget; guards active session/sessionId, context floor, rate limit, in-flight dedup, failure surfacing, and volitional diagnostic counters. Tests pin failure/retry behavior and pending-set cleanup.                                                                             |
| `src/agents/tools/continuation-tools-registration.test.ts`               | Full `createOpenClawTools` registration test: `continue_delegate` present when enabled/drainer-capable, `targetSessionKey` omitted, binary-canticle#11 description retained, disabled/leaf gates pinned.                                                                                                 |
| `src/auto-reply/reply/session-updates.ts` + `.compaction.test.ts`        | `session-updates.ts` still uses `updateSessionStoreEntry` at source tip; `.compaction.test.ts` is absent here but exists in open PR #545. #545 applies canonical-primitives fix with `mergeSessionEntry`, `updateSessionStore`, and `{ activeSessionKey: normalizeStoreSessionKey(sessionKey.trim()) }`. |
| `docs/design/continue-work-signal-v2.md`                                 | RFC read. Load-bearing contracts: tools-first continuation, TaskFlow-backed delegates, session-delivery-queue substrate, context-pressure bands, async request_compaction, canonical agent/tool/substrate ownership boundary, and shipped OTel continuation span vocabulary.                             |
| `src/config/sessions/types.ts` / `store.ts`                              | Cross-check for #545: `mergeSessionEntry` supplies monotonic `updatedAt`, sessionStartedAt rollover, and stale modelProvider scrub; `recordSessionMetaFromInbound` is the canonical `updateSessionStore(..., { activeSessionKey })` pattern.                                                             |

### Top surprises

1. Several workorder paths are historical names; the v29 source tip has already relocated the real continuation runtime/state/context-pressure surface under `src/auto-reply/continuation/**`.
2. The #542 Step 10 strip-and-relane decision is load-bearing for this rotation: the branch source does not include the compaction-count fix, while #545 has the intended canonical-primitives patch and tests but is still open.
3. The RFC text is slightly ahead of some code comments and file names: it names the durable substrate and TaskFlow direction correctly, but still references some older session-entry/post-compaction symbols that have since moved or been shimmed.

### Initial difficulty read

Medium-high. The replay should be mechanically straightforward if patch-equivalence filters out upstream-absorbed commits, but the risk is not conflict count; it is preserving the canonical-primitives fix from #545 without regressing the TaskFlow-backed continuation invariants while replaying across the much larger v29 -> v5.2 upstream window.
