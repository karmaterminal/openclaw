# OV-5 awareness — handoff doc for canonical-lineage drive

This file exists so the canonical-lineage drive (canonical2 → v2026.4.29 merge) does NOT discover OV-5 work as a surprise during the merge.

## What is OV-5

OV-5 is swim-39 row "static allowlist guard-test for session-keyed volatile Maps in continuation surface." Driven by `karmaterminal/openclaw#441`. The test scans production continuation files for `new Map` / `new Set` / `new WeakMap` / `Map<` / `Set<` / `WeakMap<` declarations and FAILS CI if any production occurrence isn't in an explicit allowlist with owner / purpose / safe-volatile-classification / restart-contract.

Purpose: lock in the cohort's volatile-Map purge. The cohort moved most session-keyed state from in-memory Maps to TaskFlow sqlite; some Maps were correctly KEPT as process-only ephemerals (timer handles, waiters, hedge-timer scheduling, delayed-reservation lists). The test enumerates those kept-Maps with their safe-volatile rationale and guards against future drift.

## What's in flight on canonical2

Two PRs racing the same outcome (per figs's "viable compare" framing 2026-05-01 ~19:50Z):

- **`karmaterminal/openclaw#464`** — original PR by Elliott🌻 from 2026-04-30. Branch `elliott/441-volatile-map-allowlist-guard`. Base: `cael/repair-step9-squash-compile` (NOT current canonical2; older lineage). 1 file, +304 / -0. State: OPEN, merge=UNSTABLE (CI red), 0 reviews. Stalled since 2026-04-30T06:49 (Codex review comment).

- **`karmaterminal/openclaw#505`** — frond-scribe-dispatched copilot lane (gpt-5.5 xhigh) opened 2026-05-01 ~19:21Z. Branch `frond-scribe/441-volatile-map-allowlist-test`. Base: `cael/325-canonical2` (current canonical2 ✓). 1 file, +436 / -0. State: OPEN, merge=UNSTABLE, 1 review. Test commit at `03030c6111`.

Cohort + figs will pick best-of-the-compare; outcome is a single test landing on canonical2 (closes both `openclaw#441` and `openclaw-bootstrap#834` swim-39 OV-5 row).

## Test file location

`src/auto-reply/continuation/volatile-map-allowlist.test.ts` (canonical path; both PRs use this path).

## 10 known module-level session-keyed volatile Maps (canonical2)

These are the safe-volatile remnants that CORRECTLY survived the volatile-Map purge — process-only ephemerals (can't be persisted, restart-contract documented):

| File                                                  | Symbol                       | Type                                                | Restart contract                                                               |
| ----------------------------------------------------- | ---------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/auto-reply/continuation/state.ts:14`             | `continuationTimerHandles`   | `Map<sessionKey, Set<TimerHandle>>`                 | empty on restart; rebuilt on next continuation-arm via TaskFlow                |
| `src/auto-reply/continuation/state.ts:17`             | `continuationTimerRefs`      | `Map<sessionKey, number>`                           | empty on restart; rebuilt with timers                                          |
| `src/auto-reply/continuation/delegate-store.ts:379`   | `delayedReservations`        | `Map<sessionKey, DelayedContinuationReservation[]>` | process-local companion to timers; rebuilt from sqlite                         |
| `src/auto-reply/continuation/delegate-dispatch.ts:33` | `hedgeTimers`                | `Map<string, NodeJS.Timeout>`                       | hedge-armed redundant-fire schedule; lost on restart, rearmed by next dispatch |
| `src/auto-reply/reply/reply-run-registry.ts:83`       | `activeRunsByKey`            | `Map<sessionKey, ReplyOperation>`                   | live in-process ReplyOperation handles; can't serialize                        |
| `src/auto-reply/reply/reply-run-registry.ts:84`       | `activeSessionIdsByKey`      | `Map<sessionKey, string>`                           | mirror of activeRunsByKey index                                                |
| `src/auto-reply/reply/reply-run-registry.ts:85`       | `activeKeysBySessionId`      | `Map<sessionId, string>`                            | reverse index                                                                  |
| `src/auto-reply/reply/reply-run-registry.ts:86`       | `waitKeysBySessionId`        | `Map<sessionId, string>`                            | wait-state index                                                               |
| `src/auto-reply/reply/reply-run-registry.ts:87`       | `waitersByKey`               | `Map<sessionKey, Set<ReplyRunWaiter>>`              | in-process promise waiters; can't be persisted                                 |
| `src/auto-reply/reply/reply-run-registry.ts:171`      | `attachedBackendByOperation` | `WeakMap<ReplyOperation, ReplyBackendHandle>`       | weak-ref to in-process operation; GC'd with operation                          |

These match byte-for-byte on the v3 candidate at `547bbd342dff` (continuation surface replayed unchanged from canonical2 onto v2026.4.29). The OV-5 test applies to v29 unchanged.

## What canonical-lineage drive needs to know

When merging canonical2 → v2026.4.29:

- Whichever OV-5 PR (`#464` or `#505`) lands first on canonical2 carries the test along automatically into v29 via the merge
- The test file path is identical (`src/auto-reply/continuation/volatile-map-allowlist.test.ts`)
- The 10 allowlist anchors above are present on the v3 candidate too; same Map sites, same safe-volatile classifications
- If the canonical2 OV-5 PR adjusts the scanner glob set, the v29-side glob will also need to match (paths may differ if v29 drifts)

PR `#505` body explicitly notes "v29 applicability assessed read-only: `frond-scribe/20260429/rebase-copilot-v3 @ 547bbd342d` has the same file paths and the same 10 allowlist anchors, so this test applies unchanged."

## References

- `karmaterminal/openclaw#441` — original guard-test issue (P1; OPEN; closes when OV-5 PR merges)
- `karmaterminal/openclaw-bootstrap#834` — swim-39 OV-5 row tracker (closes when OV-5 PR merges)
- `karmaterminal/openclaw#464` — Elliott🌻's PR (yesterday, stale base)
- `karmaterminal/openclaw#505` — frond-scribe-dispatched copilot PR (today, current canonical2 base)
- frond-scribe scribe-seat dispatched the workorder at `/home/figs/flesh_beast_best_beast/openclaw-wt-ov5-allowlist-test/WORKORDER.md` (read-only-walked + heartbeat-traced)

Banked 2026-05-01 ~19:53Z post-PR-#505-open per figs's "(b) handoff state self-contained" call.
