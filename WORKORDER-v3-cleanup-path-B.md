# WORKORDER — v3 Path-B cleanup (cleanup-then-present)

## STRATEGIC FRAMING — READ BEFORE STARTING

**You are cleaning up your own v3 candidate** (`frond-scribe/20260429/rebase-copilot-v3 @ f8fec1c4e8`) — the v2026.4.29 rebase candidate you authored over the last several hours. A multi-agent review-toolkit (6 agents in parallel: code-reviewer / silent-failure-hunter / type-design / pr-test-analyzer / comment-analyzer / code-simplifier) ran against the v3 candidate vs `v2026.4.29` tag (`a448042c2e`). Findings are at `/tmp/v3-review-aggro/`.

Per figs's directive 2026-05-01 ~21:14Z (Path B selected over Path A):

> _"path B have it work its branch until the thing is solid where it doesnt encounter design breaks. do not care if it takes it many hours, at all, in fact prefer it does."_

> _"on a deep pr review of the 2026.4.24 candidate, i dread it, but its better than piecemeal after publish."_

This lane is **cleanup-then-present** — the candidate is presentable as a PR only when waves A-E land cleanly. Path A (open-as-draft-PR-for-cohort-comment-surface) was rejected because the 2026.4.22 → 2026.4.22 effort still ongoing 100h+ at 2026-05-01; piecemeal-after-publish is worse than clean-cleanup-then-present.

**Anchor**: this worktree at `/home/figs/flesh_beast_best_beast/openclaw-wt-rebase-v29-copilot-v3/` — branch `frond-scribe/20260429/rebase-copilot-v3 @ f8fec1c4e8`.

## §0 — guardrails

- Operate ONLY in `/home/figs/flesh_beast_best_beast/openclaw-wt-rebase-v29-copilot-v3/`
- **Never read, write, list, or shell into `/home/figs/flesh_beast_tmp/openclaw/`** — that's seal-boy / ronan-the-prince's runtime tree
- Push to `frond-scribe/20260429/rebase-copilot-v3` only (forward-only; no force-push)
- **HARD RAIL (figs-direct, paraphrased)**: the ONLY thing princes-self-merge canon does NOT cover is **force-push of completely-untested upstream-presented content to `karmaterminal/openclaw:feature/context-pressure-squashed`** — which happened in the last 48h. Do NOT push to that branch under any circumstance. Work stays on `frond-scribe/20260429/rebase-copilot-v3`.
- Discord webhook for heartbeat: `DISCORD_SPRITES_WEBHOOK` repo variable on `karmaterminal/frond-scribe`. Username for posts: `swim-v39-v3-cleanup-pathB`
- Resolve webhook value via: `gh variable list -R karmaterminal/frond-scribe --json name,value --jq '.[] | select(.name=="DISCORD_SPRITES_WEBHOOK") | .value'`

## §1 — read-first (CRITICAL)

1. **Read the aggregated findings**: `/tmp/v3-review-aggro/SUMMARY.md` (single-page; ~85 issues across 6 categories)
2. **Read each per-agent findings doc**:
   - `/tmp/v3-review-aggro/code-reviewer-findings.md` — 8 CRITICAL + 14 IMPORTANT + 10 SUGGESTION
   - `/tmp/v3-review-aggro/silent-failure-findings.md` — 4 CRITICAL + 9 HIGH + 7 MEDIUM + 2 LOW
   - `/tmp/v3-review-aggro/type-design-findings.md` — P0 (block) + P1 (strongly request)
   - `/tmp/v3-review-aggro/test-analyzer-findings.md` — 5 CRITICAL gaps + many IMPORTANT
   - `/tmp/v3-review-aggro/comment-analyzer-findings.md` — 10 critical + 10 improvement + 10 recommended-removal + 6 positive
   - `/tmp/v3-review-aggro/code-simplifier-findings.md` — 7 BLOCKER-class + many MAJOR
3. **Read CLAUDE.md** at the worktree root for repo coding/test/build conventions
4. **Read the RFC**: `docs/design/continue-work-signal-v2.md` — load-bearing for understanding what semantics MUST be preserved during dedup-refactor
5. **Read the canonical2-side RFC audit findings**: `git show origin/frond-scribe/441-rfc-alignment-audit:RFC-ALIGNMENT-AUDIT-FINDINGS.md` — the 39 baseline findings (A=12 B=8 C=5 D=9 E=5) describe what the RFC↔code alignment looks like; cleanup must NOT introduce new drift
6. **Read v3-side RFC audit confirmation**: `git show origin/frond-scribe/441-rfc-alignment-audit-v3:RFC-ALIGNMENT-AUDIT-V3-DELTA-FINDINGS.md` — Δ=0 confirms RFC stays aligned; cleanup must keep this true

## §2 — five cleanup waves (sequential, each pushed as commits)

Each wave is its own commit-cluster. Push at the end of each wave (heartbeat to Discord). Don't bundle waves into single mega-commits.

### Wave A — cohort-identity scrub (mechanical, 1-2hr expected)

**Reject-on-sight upstream-presentation blockers**:

- `src/auto-reply/reply/cot-frame.ts` — strip the hardcoded prince-cohort regex `(?:cael|silas|ronan|elliott)` + prince glyphs `(?:🌻|🌫|🩸|🌊)`. Replace with a generic, configurable mechanism if the regex serves a real purpose; otherwise delete. **karmaterminal-internal cohort-identity must NOT ship upstream.**
- Top-level rebase-journal markdown + scripts — DELETE: `tmp-drop-me-rebase-v29-{v2,v3}.md`, `WORKORDER.md`, `BRIEF-476.md`, `RATIFICATIONS.md`, `RECOMMENDED-PATH.md`, `OV-5-AWARENESS.md`, `QUESTIONS-FOR-FIGS.md`, `INTEGRATION-TEST-GAP-MAP.md`, `RELEASE-HIGHLIGHTS-2026-04-28.md`, `fix2.py`, `src/rebase/tracer.ts`, `studies/swim-37/harness/**` (~2400 lines), `scripts/check-substrate-adoption.mjs` (531 lines), `tmp-drop-me-rebase-v29-v3.console.log`
- **DO NOT delete this workorder** — keep `WORKORDER-v3-cleanup-path-B.md` and add a journal section to it as you progress.

**Comment leaks** (per `comment-analyzer-findings.md`):

- 71 bare fork-issue references (`#NNN`) → fully-qualify as `karmaterminal/openclaw#NNN` or `karmaterminal/openclaw-bootstrap#NNN`
- ≥14 opaque review-comment IDs (`r3162427218`, etc.) → strip
- ≥14 cohort/sprites/emoji-prince attributions → strip
- ≥45 process-vocabulary leaks (`Slice 2 chunk 5b`, `F-37-015`, `swim-37 harness`, `path B`, `Q1=Option B`) → strip or rephrase generically
- ≥6 dated removal-narrative tombstones → strip

**Push** at wave-A complete with commit message: `chore(v3-cleanup): wave A — cohort-identity scrub` and heartbeat to Discord.

### Wave B — structural dedup (3-4hr expected)

Per `code-reviewer-findings.md` C4-C5 and `code-simplifier-findings.md` B1-B3:

1. **Two parallel `resolveContinuationRuntimeConfig`** at `src/auto-reply/continuation/config.ts` and `src/auto-reply/reply/continuation-runtime.ts` — already drifted (one has `clampDelayMs`, the other doesn't). **Reconcile** to single source of truth; pick the contract that matches the RFC.

2. **Two parallel `checkContextPressure`** at `src/auto-reply/reply/agent-runner.ts:1471` and `:1501` — different signatures, different bands, different dedup, within ~30 lines. **Reconcile** to single function with discriminated input if needed.

3. **Two parallel continuation-state Map stores** at `src/auto-reply/continuation/state.ts` and `src/auto-reply/reply/continuation-state.ts` — both maintain `continuationTimerRefs`+`continuationTimerHandles` Maps with same keys but separate instances. Reply-side keeps a generation-guard Map even though RFC says generations were removed 2026-04-15. **Reconcile** state ownership; reply-side should consume continuation-side.

4. **Two `dispatchPostCompactionDelegates`** (per `code-simplifier-findings.md` B3) — different signatures, both imported from different call sites. **Reconcile**.

For each: write a brief decision-rationale in this workorder's journal section before refactoring, so the cohort can audit the merge-direction. **The RFC is the contract source of truth** — when in doubt, pick the implementation that matches RFC text.

**Tests must continue passing** for the affected surfaces. If a test fails because it was asserting one of the duplicate implementations specifically, fix the test to assert the surviving contract.

**Push** at wave-B complete with commit message: `refactor(v3-cleanup): wave B — structural dedup of continuation runtime` and heartbeat.

### Wave C — CLAUDE.md compliance (2-3hr expected)

Per `code-reviewer-findings.md` C2-C3:

1. **Static-vs-dynamic import drift** — CLAUDE.md explicitly forbids mixing `await import("x")` and static `import ... from "x"` for the same module:
   - `agent-runner.ts:93` static + `:1463/:2936/:2975` dynamic for `checkContextPressure` → resolve via `*.runtime.ts` boundary
   - `subagent-announce.ts:2` static + `:233-249` dynamic for `resolveContinuationRuntimeConfig` → same pattern

2. **`INEFFECTIVE_DYNAMIC_IMPORT` warning explicitly suppressed** in `tsdown.config.ts:55-66` → CLAUDE.md says check for and fix the warning, NOT silence it. Remove the suppression and fix the underlying issues.

3. **Build verification** — after the dynamic-import refactor, run `pnpm build` and ensure NO `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings.

**Push** at wave-C complete: `fix(v3-cleanup): wave C — CLAUDE.md import discipline + suppression removal` + heartbeat.

### Wave D — silent-failure cures (2-3hr expected)

Per `silent-failure-findings.md`:

1. **`request_compaction` tool fire-and-forget** (C2) — agent stages post-compaction delegates expecting compaction; if compaction fails, all evacuation orphaned with only warn-log. **Surface failure to agent**, not silent-warn.

2. **Post-compaction context evacuation `.catch(() => {})`** (C1) — workspace AGENTS.md/RESUMPTION.md read failure silently boots post-compaction session with no operator-curated context. **Surface as explicit error path** with sentinel content.

3. **`takePendingPostCompactionDelegates` failure silently drops persisted delegates** (C4) — restore-on-restart contract loses delegates if persistence read throws. **Surface error**; let caller decide drop vs retry.

4. **Hedge-timer dispatch failure leaves orphans** (H1) — exact "session stuck without escalation" risk. Surface failure or escalate via established escalation path.

For each: add an **integration test** that proves the failure now surfaces (the test should fail without the cure and pass with it).

**Push** at wave-D complete: `fix(v3-cleanup): wave D — silent-failure cures + escalation surfacing` + heartbeat.

### Wave E — test coverage (4-6hr expected)

Per `test-analyzer-findings.md`:

1. **`continuation/state.ts`** — 8 of 9 functions untested. Cover timer-handle / refcount primitives that delegate-dispatch hedge-cleanup depends on.
2. **`continuation/delegate-dispatch.ts`** (351 LOC) — current 123-line test covers ONLY hedge-timer cleanup; cover `maxDelegatesPerTurn` cap, mode→spawn flag mapping, spawn rejection/throw, chain advancement, hop-prefix string, `dispatchPostCompactionDelegates` direct invocation.
3. **`ReplyRunAlreadyActiveError` shielding** at `agent-runner.ts:1284` — zero direct coverage; if catch removed, every concurrent reply during run-shutdown becomes unhandled. Cover.
4. **`compaction-attribution.ts`** — zero test; `normalizeCompactionTrigger` "threshold"→"budget" rewrite is a load-bearing semantic relabel. Cover.

**Push** at wave-E complete: `test(v3-cleanup): wave E — coverage for state.ts / delegate-dispatch / ReplyRunAlreadyActiveError / compaction-attribution` + heartbeat.

## §3 — stop-condition

**Stop ONLY when ALL of the following hold**:

1. `pnpm tsgo` — clean
2. `pnpm check` — clean (lint + format)
3. `pnpm test` — full suite passes
4. `pnpm build` — clean (no `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings)
5. **Zero block-landing findings** remain from `/tmp/v3-review-aggro/SUMMARY.md` "Reject-on-sight class" + "Critical structural duplication" + "CLAUDE.md compliance violations" + "Silent-failure-class" + "Type design (P0)" buckets
6. **39 RFC↔code baseline findings still carry unchanged** (verify by running a fast spot-check on B1-B8 drift findings; cleanup MUST NOT introduce new drift)

If you hit a **design break** — i.e. one of the cleanup waves requires changing the RFC contract or breaks an upstream-API surface — STOP, write the design-break shape to this workorder's journal, push, and heartbeat to Discord with `DESIGN-BREAK:` prefix. Do not proceed past a design break without figs/cohort input.

## §4 — heartbeat shape

After each meaningful checkpoint, post to Discord webhook:

```bash
WEBHOOK=$(gh variable list -R karmaterminal/frond-scribe --json name,value --jq '.[] | select(.name=="DISCORD_SPRITES_WEBHOOK") | .value')
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"swim-v39-v3-cleanup-pathB\",\"content\":\"🤖 v3-cleanup-pathB: <one-line status>\"}" \
  "$WEBHOOK"
```

Heartbeat after:

- Each wave complete (A/B/C/D/E)
- Any design-break encountered (with `DESIGN-BREAK:` prefix)
- Each push that meaningfully advances the candidate
- Final declare-done

## §5 — push cadence

Per figs's "show-your-work-as-teaching" canon + the code-agent-remote-first canon:

- **Push step 1** — push the workorder + initial journal-stub commit BEFORE doing any wave work
- **Push every meaningful checkpoint** — wave-complete, dedup-decision-locked, design-break-shape-banked
- Never let work sit local-only for >30min

## §6 — declare done

Final state:

- All 5 waves committed + pushed on `frond-scribe/20260429/rebase-copilot-v3`
- §3 stop-condition fully met
- This workorder's journal section has a §-final summary block
- Final Discord heartbeat: `🤖 v3-cleanup-pathB: declare-done; waves A-E green; tsgo+check+test+build clean; 0 block-landing remaining; ready for canonical-lineage drive at <SHA>`

## §7 — what NOT to do

- Do NOT force-push to `karmaterminal/openclaw:feature/context-pressure-squashed` — figs's hard-rail
- Do NOT shrink scope past what `/tmp/v3-review-aggro/SUMMARY.md` block-landing buckets require
- Do NOT short-circuit the stop-condition by silencing tests/lint/build — fix root causes
- Do NOT introduce new RFC↔code drift (39 baseline findings should still carry; cleanup is structural-and-mechanical, not RFC-edit)
- Do NOT delete this workorder file
- Do NOT touch any prince-namespaced branch (`cael/*`, `silas/*`, `ronan/*`, `elliott/*`); work is strictly on the `frond-scribe/20260429/rebase-copilot-v3` lane
- Do NOT proceed past a design-break — surface and wait

## §8 — efficiency note

Multi-hour preferred. Path A was rejected explicitly because cohort-coordination during cleanup-in-public is more expensive than letting one agent grind through the punchlist solo. Take the time. The candidate matters more than the wall-clock.

## Self-review framing reminder

This is **copilot cleaning up its own v3 candidate** for upstream-presentation readiness. Be honest about what you (the prior copilot lane) introduced vs what was already there. The point isn't to look-good or look-bad; the point is to make the candidate something figs can present upstream when the time comes — and the cohort-identity-leak + structural-duplication + CLAUDE.md violations are the kind of thing upstream maintainers reject on sight, regardless of how good the underlying feature is.

## Journal section (append as you go)

<!-- start journal -->
