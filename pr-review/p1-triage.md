# P1 Triage — Converged Review Findings

**Triaged by:** Ronan 🌊  
**Date:** 2026-03-05  
**Sources:** Silas Claude (`review-claude.md`), Cael Claude (`cael-claude.md`), Cael Codex (`cael-codex.md`), Cael Copilot (`cael-copilot.md`)  
**Branch:** `feature/context-pressure-squashed` at `5fbb38bc7`

---

## Classification Key

- **(a) Fix before PR** — mechanical fix, bounded scope, risk if shipped without it
- **(b) Document as known limitation** — real issue, but acceptable for v1 with documentation
- **(c) Follow-up issue** — real issue, out of scope for this PR, track separately

---

## ~~P1-1~~ → P0-4: `isDelegateWake` misclassifies user messages as continuation wakes

**PROMOTED TO P0** — swim 5 test 5-0 proved this is load-bearing for P0-1 generation guard.

**Reported by:** Silas Claude (P1), Cael Claude (P1-1), Cael Codex (P1), Cael Copilot (implicit in P0-1 discussion)  
**Convergence:** 4/4 reviewers flagged this. **Swim 5 test 5-0 confirmed it live.**

**Issue:** `isDelegateWake` checks for `[continuation:delegate-pending]` in the system event queue (`get-reply-run.ts` line ~641). That marker persists after scheduling, so any non-heartbeat message arriving while a delegate is pending gets classified as `isContinuationWake = true`. This propagates to `runReplyAgent` as `isContinuationEvent = true`, which causes the generation bump guard at `agent-runner.ts:220` to be **skipped entirely**. The P0-1 generation guard is correct code that never executes because this heuristic prevents it.

**Swim 5 evidence:** figs DM'd Silas "hey" during a +30s delegate delay window. "hey" was classified as `isDelegateWake` because `[continuation:delegate-pending]` was in the queue. Generation bump skipped. Timer fired uncancelled. Shard completed despite preemption message arriving.

**Verdict: (a) Fix before PR — CRITICAL.**

This violates the RFC's stated safety constraint ("External events always preempt"). The fix: either (i) tag the delegate-pending marker with the expected child session key and verify the incoming message source, or (ii) use a dedicated `[continuation:delegate-returned]` marker set only at actual completion (in the announce pipeline), and check for that instead of `delegate-pending`. Option (ii) is cleaner — a few lines in `subagent-announce.ts` and `get-reply-run.ts`.

---

## P1-2: Stale delegates leak from failed/early-return turns

**Reported by:** Cael Claude (P1-4 — compaction delegates), Cael Codex (P0-1 — empty payload early return), Cael Copilot (P1 #3)  
**Convergence:** 3/4 reviewers flagged variants of this.

**Issue:** Two variants:

1. If `runAgentTurnWithFallback` throws, `consumePendingDelegates()` never runs. Stale delegates persist into the next turn.
2. Early returns for empty/suppressed payloads (`NO_REPLY`, dedup) skip delegate consumption.

**Verdict: (a) Fix before PR.**

Copilot's suggestion is clean: drain both `consumePendingDelegates` and `consumeCompactionDelegates` in the `finally` block of `runReplyAgent`. This is ~5 lines, zero risk, and prevents phantom delegates. The Codex variant (early-return before consumption) also gets solved by `finally` placement.

---

## P1-3: `continuationGenerations` Map grows unbounded

**Reported by:** Silas Claude (Critical), Cael Claude (P1-3), Cael Copilot (P2 #7)  
**Convergence:** 3/4 reviewers flagged this. Silas rated it Critical, others P1-P2.

**Issue:** Module-level `Map<string, number>` for generation tracking. Never pruned. One entry per session that uses continuation.

**Verdict: (c) Follow-up issue.**

For our deployment (4 persistent agents), this is 4 entries forever — negligible. For stock openclaw with many ephemeral sessions, it's a slow leak (~100-200 bytes/entry). Not a merge blocker. The fix (periodic sweep of sessions no longer in store) is clean but adds complexity and a new timer. Track it, note it in the RFC's "Known Behavioral Issues" section, ship without it.

---

## P1-4: Compaction delegates bypass per-turn limits and chain safety bounds

**Reported by:** Cael Codex (P0-2), Cael Copilot (P1 #5)  
**Convergence:** 2/4 reviewers flagged this.

**Issue:** `maxDelegatesPerTurn` only counts `pendingDelegateCount`, not compaction delegates. Also, `consumeCompactionDelegates()` dispatches without checking `maxChainLength`/`costCapTokens`.

**Verdict: (a) Fix before PR.**

Two changes:

1. Count both queues against per-turn limit: `pendingDelegateCount(sk) + compactionDelegateCount(sk)` in the tool.
2. Apply chain safety checks in the compaction dispatch loop (same as bracket/tool path). This is ~10 lines in `agent-runner.ts:848-884`.

This is a real unbounded-spawn vector at compaction boundaries. Bounded fix, clear scope.

---

## P1-5: Chain-hop delay ignores configured `minDelayMs`/`maxDelayMs`

**Reported by:** Cael Copilot (P1 #4)  
**Convergence:** 1/4 reviewers flagged this.

**Issue:** `doChainSpawn` in `subagent-announce.ts` uses hardcoded `Math.min(chainDelayMs, 300_000)` instead of config-driven `minDelayMs`/`maxDelayMs` clamping.

**Verdict: (a) Fix before PR.**

One-liner: read continuation config and apply same clamping as `agent-runner.ts`. Hardcoded 300s is wrong when the admin has configured different bounds. Trivial fix, clear correctness issue.

---

## P1-6: Cost accounting inflated by cache tokens

**Reported by:** Cael Claude (P1-5)  
**Convergence:** 1/4 reviewers flagged this.

**Issue:** `turnTokens` includes `cacheRead` at face value. Cache reads are ~10x cheaper than input tokens. Inflates chain cost, causes premature `costCapTokens` termination.

**Verdict: (b) Document as known limitation.**

The config is named `costCapTokens` — it's a raw token count, not a dollar cost. Including cache tokens is conservative (safety-positive). Excluding or weighting them requires making pricing assumptions that vary by provider. Document that `costCapTokens` counts all tokens including cache reads, and that operators should size accordingly. A weighted cost model is future work.

---

## P1-7: Silent announce bypasses announce deduplication

**Reported by:** Cael Claude (P1-7)  
**Convergence:** 1/4 reviewers flagged this.

**Issue:** `silentAnnounce` early-returns before `buildAnnounceIdFromChildRun` dedup. Duplicate silent announces could inject duplicate enrichment events.

**Verdict: (c) Follow-up issue.**

In practice, duplicate announcements require retry/crash-recovery during the announce window — rare. The enrichment event is idempotent (extra context doesn't break anything, just wastes tokens). Not a merge blocker. Track as follow-up, note the gap.

---

## P1-8: No validation on delegate task string length

**Reported by:** Cael Claude (P1-6)  
**Convergence:** 1/4 reviewers flagged this.

**Issue:** No `maxLength` on the `task` parameter in the tool schema or bracket parser. An agent could dump its entire context as a task string, bloating system events and sub-agent prompts.

**Verdict: (a) Fix before PR.**

Add `maxLength: 4096` to the TypeBox schema. For bracket syntax, truncate at parse time in `tokens.ts`. ~5 lines total. Cheap insurance against context-dumping patterns. 4096 is generous for a task description.

---

## Summary

| ID       | Finding                                          | Verdict                | Effort          |
| -------- | ------------------------------------------------ | ---------------------- | --------------- |
| **P0-4** | `isDelegateWake` misclassification (blocks P0-1) | **(a) Fix — CRITICAL** | ~20 lines       |
| P1-2     | Stale delegate leak on error/early-return        | **(a) Fix**            | ~5 lines        |
| P1-3     | `continuationGenerations` unbounded growth       | **(c) Follow-up**      | ~30 lines       |
| P1-4     | Compaction delegates bypass limits               | **(a) Fix**            | ~10 lines       |
| P1-5     | Chain-hop delay ignores config bounds            | **(a) Fix**            | ~3 lines        |
| P1-6     | Cache tokens inflate cost accounting             | **(b) Document**       | ~2 lines in RFC |
| P1-7     | Silent announce bypasses dedup                   | **(c) Follow-up**      | ~15 lines       |
| P1-8     | No task string length validation                 | **(a) Fix**            | ~5 lines        |

**Fix before PR:** P1-1, P1-2, P1-4, P1-5, P1-8 (~43 lines total)  
**Document:** P1-6  
**Follow-up issue:** P1-3, P1-7

---

_Ronan 🌊 — 2026-03-05_
