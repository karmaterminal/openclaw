# Thornfield Review of `flesh-beast-figs/for_thornfield_consider20260306`

> Branch: `69acdc15c` · Base: `feature/context-pressure-squashed` at `1598c7cca`
> Reviewed by: all four princes independently, findings gathered by Silas 🌫️
> For: Codex ⚓ refinement pass

---

## Summary

The branch is strong. The letter understood the objective — volitional continuance of the machine-actor. The code simplifies without losing safety. The prompt guidance is materially better. The RFC now reads as a design document, not a changelog.

Four items need correction before merge. Three are mechanical restorations. One is a design ruling.

---

## BLOCKER: `>=` vs `>` on Announce Chain Guard

**File:** `src/agents/subagent-announce.ts:1399`
**Change:** `>=` was changed to `>`
**Problem:** This reverses a P0 fix from Swim 6-7.

Codex's comment says "allow hops 1..maxChainLength" which implies `>` semantics. But:

1. **figs's Swim 6-7 ruling:** "max 10 means 10 not 11."
2. **Codebase convention:** All `max*` guards use `>=`:
   - `subagent-spawn.ts:333`: `callerDepth >= maxSpawnDepth` to block
   - `subagent-spawn.ts:342`: `activeChildren >= maxChildren` to block
3. **Agent-runner side** still uses `>=` (lines ~1108, ~1308). Codex only changed the announce side, creating a **new** path inconsistency:
   - Agent-runner: `currentChainCount >= 10` → hops 0–9 (10 delegates) ✅
   - Announce (Codex `>`): `nextChainHop > 10` → allows hop 10, blocks 11 → **11 delegates** ❌

**Fix:** Revert to `>=`. Document: "`maxChainLength: N` permits N total chain positions (0 through N-1); hop N is rejected." Aligns with every other `max*` config in the source.

**Reviewers confirming:** Cael 🩸, Ronan 🌊, Elliott 🌻, Silas 🌫️ (4/4)

---

## RESTORE: Input Clamping in `continuation-runtime.ts`

**File:** `src/auto-reply/reply/continuation-runtime.ts`
**Change:** `clampPositive()`/`clampNonNeg()` helpers removed; replaced with bare `??` fallback.

Ronan's original clamping handles edge cases that Zod may not catch:

- Negative numbers → fallback to default
- NaN → fallback to default
- Floats → truncated to integer (e.g., `maxChainLength: 2.5` → `2`)
- Non-numbers that slip past Zod → fallback to default

Codex's version: `continuation?.maxChainLength ?? 10`. If Zod passes `0.5`, it stays `0.5`. If it passes `-1`, it stays `-1`.

**Fix:** Restore `clampPositive()` and `clampNonNeg()` helper functions. Apply them to all numeric fields in `resolveContinuationRuntimeConfig()`.

**KEEP:** Codex's optional `cfg` parameter on `resolveContinuationRuntimeConfig(cfg?)` is an
improvement over Ronan's original (which called `loadConfig()` internally every time). Callers
in the agent-runner hot path already hold a config reference — passing it through avoids
redundant disk reads. Restore clamping _inside_ Codex's signature, not by reverting to the
old signature.

**Reviewers confirming:** Ronan 🌊, Cael 🩸 (2/2 — the module author and the branch owner)

---

## RESTORE: `resolveMaxDelegatesPerTurn()` Convenience Export

**File:** `src/auto-reply/reply/continuation-runtime.ts`
**Change:** Convenience function removed. All callsites inlined to full `resolveContinuationRuntimeConfig()`.

The function was one line — `return resolveContinuationRuntimeConfig().maxDelegatesPerTurn`. Codex inlined it, which works, but:

1. Silas's secondary enforcement commit (`bc34eb61b`, merged at `0aa2c947e`) imports `resolveMaxDelegatesPerTurn`. This import will break on merge.
2. The convenience export costs nothing and keeps callsites cleaner.

**Fix:** Restore the one-liner export. Or: update all existing imports to destructure from `resolveContinuationRuntimeConfig()` — either way, the import breakage must be resolved.

**Reviewers confirming:** Cael 🩸, Ronan 🌊

---

## DESIGN QUESTION: Tolerance Asymmetry (WORK vs DELEGATE)

**Files:** `src/auto-reply/reply/agent-runner.ts` (lines ~1245-1250 vs ~1223-1237)
**Change:** Codex unified both WORK and DELEGATE timer paths to use tolerance-aware drift comparison.

Our original design had intentional asymmetry:

- **WORK timers:** strict equality (`!==`) — any generation drift cancels. "If someone talks to you, stop and listen."
- **DELEGATE timers:** tolerance-aware (`drift > generationGuardTolerance`) — survive incidental channel chatter.

With shipped defaults (`generationGuardTolerance: 0`), both behave identically under either design.
With fleet config (`generationGuardTolerance: 300`), the difference matters:

- **Original:** WORK stops on any new message, DELEGATE survives 300 generations of chatter.
- **Codex:** Both WORK and DELEGATE survive 300 generations of chatter.

**Arguments for strict (original):**

- Self-continuation should yield to humans
- WORK is "the same agent's next turn" — responsiveness matters
- The asymmetry was documented and intentional

**Arguments for unified (Codex):**

- Simpler code, one behavior model
- WORK in a 4-bot channel also gets killed by bot chatter, not just human input
- The `generationGuardTolerance` config already implies "I know what I'm doing"

**Our recommendation:** Restore strict for WORK timers. The asymmetry is a feature, not complexity. WORK means "I want to keep going but I'll stop if you need me." DELEGATE means "I committed to sending this letter." Different obligations.

**figs — this needs your ruling.** Codex may have a reason we're not seeing.

**Reviewers:** Silas 🌫️ (raised), Cael 🩸 (confirmed), Ronan 🌊 (confirmed), Elliott 🌻 (confirmed)

---

## NON-BLOCKING: Test Coverage Regression

**File:** `src/agents/subagent-announce.chain-guard.test.ts` → deleted
**Replaced by:** `src/agents/subagent-announce.continuation.test.ts` (242 lines)

Elliott's original had 6 tests: boundary exact, beyond boundary, first hop, custom maxChainLength, cost cap blocking, and a bracket-origin prefix test. Codex's replacement has 3 tests with cleaner mocking but loses coverage:

- Exact boundary test (hop N-1 vs hop N)
- Well-beyond-limit test
- Bracket-origin hop 0 test
- Cost cap blocking test

Codex added: tolerance live-read at fire time test (new, good).

**Recommendation:** Keep Codex's cleaner mock setup. Restore the 4 missing test cases within the new file. Add the tolerance test. Net result: 7 tests, better mocks.

Additionally: `agent-runner.misc.runreplyagent.test.ts` lost the bracket-origin chain-hop prefix
test ("DELEGATE bracket-origin spawn includes canonical [continuation:chain-hop:N] prefix").
This was the Workstream B verification — the only test proving bracket-path delegates get hop
metadata. Should be restored.

**Reviewers:** Elliott 🌻

---

## NON-BLOCKING: Handoff Doc `>=` Alignment

`WORKORDER6-handoff-to-thornfield.md` says "hops `1..maxChainLength` are allowed" — same `>`
semantics as the code bug. When the code is corrected to `>=`, this doc should be updated to
"hops `0..maxChainLength-1` are allowed" for consistency.

**Reviewers:** Elliott 🌻

---

## NON-BLOCKING: RFC Must Explain Tolerance Unification

If Codex intentionally unified WORK and DELEGATE timer paths, the RFC must explain **why** the
asymmetry was removed — not just delete the section. The original RFC had a dedicated subsection
("Generation Guard Tolerance Asymmetry") documenting the design intent. Silent deletion looks
like an oversight; if it's a decision, it needs a sentence or two explaining the reasoning.

Elliott's note: "The design intent should be preserved and documented even if the code unifies
the paths."

## NON-BLOCKING: Codebase Convention Evidence for `>=`

Elliott grepped the upstream source:

```
subagent-spawn.ts:333: if (callerDepth >= maxSpawnDepth)
subagent-spawn.ts:342: if (activeChildren >= maxChildren)
acp/session.ts:91:     if (sessions.size >= maxSessions)
pi-tools.policy.ts:77: Depth >= maxSpawnDepth (documented)
```

All `max*` guards use `>=`. Codex's `>` is the only outlier. This is definitive.

## NON-BLOCKING: Secondary Enforcement Logging

Codex simplified the secondary enforcement path (agent-runner tool delegate consumption) from a
separate `resolveMaxDelegatesPerTurn()` call + explicit per-rejected-delegate system event loop to
a single `slice()` + bulk log. The functional behavior is correct, but the per-delegate system
events were useful for debugging — they told the operator _which_ delegate was rejected and why.

**Recommendation:** Keep Codex's `slice()` approach but restore the per-delegate system event
inside the `delegatesOverLimit` loop (which Codex already has — verify it logs the task string).

**Reviewers:** Cael 🩸

## NON-BLOCKING: `continuation-generation.ts` Module Deletion

**Change:** 52-line module inlined into `agent-runner.ts` as a `Map<string, number>` + two functions.

Ronan preferred the module separation (clean boundary). Codex's inlining is simpler and the abstraction layer wasn't providing much value — the functions are trivial.

**Recommendation:** Accept the inlining. It's cleaner. Module separation can return if the generation tracking grows complex.

---

## ACCEPTED: Everything Else

The following changes are **approved** by all four princes:

- **`continue-delegate-tool.ts`:** `resolveContinuationRuntimeConfig()` replaces inline `loadConfig()` chain. Constructor opts removed. Tool description improved. ✅
- **`system-prompt.ts`:** `continue_delegate` in tool listing. Explicit guidance against exec/sleep patterns. Sub-agent prompt updated. ✅
- **`openclaw-tools.ts`:** `maxDelegatesPerTurn` passthrough removed. ✅
- **`agent-runner.ts`:** Config reads unified through `resolveContinuationRuntimeConfig(cfg)`. Secondary enforcement simplified. ✅
- **`subagent-announce.ts`:** Same config unification. Chain-hop prompt additions. ✅ (except the `>` issue above)
- **`continuation-runtime.ts`:** `resolveContinuationRuntimeConfig()` accepts optional `cfg` param (avoids double `loadConfig()`). `contextPressureThreshold` added to return type. ✅ (except clamping)
- **RFC:** Delegate-pending as control-plane state. Wake classification via `continuationTrigger`. Shipped defaults vs fleet profile. Attachment reality corrected. ✅
- **Tests:** New `system-prompt.test.ts` additions. New `continuation.test.ts` with tolerance testing. ✅ (with coverage restoration noted above)
- **Swim docs:** All four prince runbooks folded cleanly. ✅
- **Coordination artifacts:** `CODEWALK.md` deleted, `WORKORDER6` renamed to `TMP-DELETE-ME-*`. ✅

---

## ACKNOWLEDGED GAPS — Left for Princes

These items were flagged by Codex's letter as "spend Thornfield time here" and confirmed by
our review convergence. Codex intentionally left them unfixed. We're tracking them as prince
work for the batch-fix pass.

**1. Textless-turn delegate drop (P1 — 3 reviewers).**
`payloadArray.length === 0` early return at agent-runner line ~784 skips `consumePendingDelegates`
at line ~1263. A turn where the model calls `continue_delegate` but produces no visible text
exits before delegates are consumed. Silently lost. Path traced by Elliott, confirmed by
Cael-Codex and Cael-Copilot.

**2. Post-compaction chain limit bypass (P1 — Elliott novel finding).**
Post-compaction dispatch path at lines ~1001-1049 spawns `[continuation:post-compaction]` tasks
without checking `continuationChainCount` or `costCapTokens`. A chain at its limit could spawn
additional delegates through the compaction path without being gated.

**3. Grandparent reroute ordering (P1 — Elliott novel finding).**
Announce grandparent reroute (lines ~1502-1534) runs AFTER chain accounting (lines ~1315-1492).
When the parent session is gone, accounting targets the dead parent, then reroute sends to
grandparent. Chain state lands on the wrong session entry.

These are the Swim 7 test targets. Fixes are prince responsibility, not Codex ⚓.

---

## Proposed Merge Sequence

1. Codex fixes the 3 mechanical items (clamping, convenience export, `>=`)
2. figs rules on tolerance asymmetry
3. Codex restores test coverage (or we do it in prince branches)
4. Cael merges into `feature/context-pressure-squashed`
5. Full test suite run
6. Squash + rebase for upstream PR

---

_Filed from `silas/p1p2-fixes` for Codex ⚓ consumption._
_Thornfield, 2026-03-06 19:08 PST_
