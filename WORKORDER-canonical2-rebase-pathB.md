# WORKORDER — canonical2 rebase from Path-B cleanup

## Strategic framing

You are taking Path-B copilot's already-completed v3 cleanup work and applying it to `cael/325-canonical2` (the v2026.4.24 ship-target). Path-B did the same waves on `frond-scribe/20260429/rebase-copilot-v3` against the v29-rebase candidate. canonical2 ⊂ v3 structurally, so most cleanup commits transfer with minor mechanical conflicts only.

This is not a re-derivation. Path-B's decisions are already locked + journaled. Your job is to apply them onto canonical2's base.

Per figs's directive 2026-05-01: princes are non-functional / barely functional from the canon-recitation tic; copilot is doing this rebase so the cohort can review/cosign rather than re-derive from scratch.

## §0 — guardrails

- Operate ONLY in `/home/figs/flesh_beast_best_beast/openclaw-wt-canonical2-rebase-pathB/`
- **Never read, write, list, or shell into `/home/figs/flesh_beast_tmp/openclaw/`** — that's prince-runtime tree
- Push to `frond-scribe/325-canonical2-pathB-rebase` only (forward-only; no force-push)
- **HARD RAIL**: NO force-push of completely-untested upstream-presented content to `karmaterminal/openclaw:feature/context-pressure-squashed`. That branch is the upstream-PR-presentation savegame; do NOT push to it under any circumstance.
- Heartbeat webhook username: **`copilot-agent-updates-hook-only`**
- Resolve webhook value via: `gh variable list -R karmaterminal/frond-scribe --json name,value --jq '.[] | select(.name=="DISCORD_SPRITES_WEBHOOK") | .value'`

## §1 — read-first

1. **Path-B's workorder + journal**: `git show origin/frond-scribe/20260429/rebase-copilot-v3:WORKORDER-v3-cleanup-path-B.md` — read the journal section at the bottom; it contains the decision-rationale for each wave (B in particular: continuation/_ canonical, reply/_ compatibility-only, queue dispatcher owns durable post-compaction delivery).

2. **The 5 wave commits to apply**:
   - `7054aa1a73` chore(v3-cleanup): wave A cohort-identity scrub
   - `053b6df551` chore(v3-cleanup): drop rejected rebase artifacts
   - `2946145c1c` refactor(v3-cleanup): wave B structural dedup of continuation runtime
   - `b160d0c911` fix(v3-cleanup): wave C import discipline and build warnings
   - `8bedd3f326` fix(v3-cleanup): wave D surface continuation failures
   - `0831ce3b8c` test(v3-cleanup): wave E continuation coverage

3. **The aggregated review findings**: `/tmp/canonical2-review-aggro/SUMMARY.md` + per-agent files. Same shape as v3 review but anchored on canonical2; cross-walk to verify each wave addresses the canonical2-specific findings (especially the new H10 silent-failure from PR #502 `reconcileSessionStoreCompactionCountAfterSuccess`).

4. **CLAUDE.md** at the worktree root for repo conventions.

## §2 — the rebase

The cleanup commits live on `frond-scribe/20260429/rebase-copilot-v3` (v29-rebase candidate). They were authored on top of v3-base which is canonical2 + v29-rebase mechanical-deltas. The known v29-deltas to expect as conflicts:

- `loadConfig` → `getRuntimeConfig` rename (v29-side). canonical2 still has `loadConfig` direct imports. When Path-B's commits touch `getRuntimeConfig` callsites, you'll need to map back to `loadConfig` for canonical2.
- `agentDir?` add to `RegisterSubagentRunParams` (v29-side). canonical2 doesn't have it; conflicts in `subagent-spawn.ts` / `subagent-registry.ts` may need the field-add removed.
- `serialized?` add to `SessionStoreCacheEntry` (v29-side). canonical2 doesn't have it; conflicts in `store-cache.ts` may need the field-add removed.
- `studies` add in `scripts/check-duplicates.mjs` (v29-side). canonical2 may differ.
- `subagent-announce.{test,timeout.test}.ts` mock additions for the renamed config accessor.

**Approach (your choice — pick whichever produces clean result)**:

Option A: `git cherry-pick 7054aa1a73 053b6df551 2946145c1c b160d0c911 8bedd3f326 0831ce3b8c` — apply each wave commit, resolve conflicts as you go.

Option B: Generate a patch (`git format-patch f8fec1c4e8..0831ce3b8c`) and apply it with three-way merge (`git am -3`).

Option C: Re-derive each wave from scratch using Path-B's journal + the canonical2 review-aggro findings as guidance. Slower but cleanest.

**Recommended**: Option A first, fall back to C for any wave that conflicts heavily. The v29-deltas are mechanical and isolated (5-6 callsites total); A should mostly work.

For each conflict: the canonical2 side is the truth (drop the v29-rebase delta). Don't introduce `getRuntimeConfig` / `agentDir?` / `serialized?` to canonical2 — that's v29 work, not v24.

## §3 — wave-by-wave checkpoints

Push at the end of each wave. Heartbeat to Discord webhook with `copilot-agent-updates-hook-only` username.

### Wave A — cohort-identity scrub

Apply `7054aa1a73` + `053b6df551`. Expected to land cleanly — these touch repo-root files + comment scrubs that don't conflict with v29-deltas.

Verify: 4 root cohort-artifacts deleted (`BRIEF-476.md` / `INTEGRATION-TEST-GAP-MAP.md` / `RELEASE-HIGHLIGHTS-2026-04-28.md` / `fix2.py`); `cot-frame.ts:14` regex replaced; `continuation-tracer.ts` JSDoc cohort-glyphs scrubbed; `docs/reference/templates/TOOLS.md:82` "prince-power-velocity" rephrased; comment leaks cleaned.

Heartbeat: `🤖 copilot-agent-updates-hook-only: canonical2 rebase wave A complete; cohort-identity scrub landed at <SHA>`.

### Wave B — structural dedup

Apply `2946145c1c`. Expected conflicts: `getRuntimeConfig` references in the dedup'd helpers may need un-twisting back to `loadConfig` for canonical2.

Per Path-B's journal:

- Canonical runtime config: `src/auto-reply/continuation/config.ts`
- Canonical continuation state: `src/auto-reply/continuation/state.ts`
- Reply-side becomes compatibility-only
- Queue-based dispatcher in `src/auto-reply/reply/post-compaction-delegate-dispatch.ts` owns durable post-compaction delivery
- Direct-spawn helper renamed to `dispatchStagedPostCompactionDelegates`

Verify: 4 duplicate-pairs reconciled, no `loadConfig`-vs-`getRuntimeConfig` mix introduced.

Heartbeat: `🤖 copilot-agent-updates-hook-only: canonical2 rebase wave B complete; structural dedup landed at <SHA>`.

### Wave C — CLAUDE.md import discipline

Apply `b160d0c911`. Expected conflicts: same `getRuntimeConfig` pattern; map to `loadConfig` for canonical2.

Verify: no `INEFFECTIVE_DYNAMIC_IMPORT` warnings on `pnpm build`; static-vs-dynamic discipline restored on `agent-runner.ts` + `subagent-announce.ts`.

Heartbeat: `🤖 copilot-agent-updates-hook-only: canonical2 rebase wave C complete; import discipline + INEFFECTIVE_DYNAMIC_IMPORT cure at <SHA>`.

### Wave D — silent-failure cures

Apply `8bedd3f326`. Should land with minor conflicts only (silent-failure paths are mostly canonical2-shared).

Verify cures landed:

- `request_compaction` failure surfaces as agent-visible system event
- post-compaction context read failures surface (not silent-catch)
- `takePendingPostCompactionDelegates` failures surface (preserve local pending state)
- Hedge timer dispatch failures re-arm + emit warnings
- canonical2-specific: `reconcileSessionStoreCompactionCountAfterSuccess` durable-write failure surfaces (the new H10 from PR #502 — verify Path-B's wave-D covered this; if not, extend it)

Heartbeat: `🤖 copilot-agent-updates-hook-only: canonical2 rebase wave D complete; silent-failure cures + H10 reconcile durable-write surfaced at <SHA>`.

### Wave E — test coverage

Apply `0831ce3b8c`. Test additions, should land cleanly.

Verify coverage added: state.ts timer-handle/refcount primitives; delegate-dispatch primary loop (cap, mode-flag, hop-prefix, chain advancement, spawn rejection); ReplyRunAlreadyActiveError shielding; compaction-attribution `normalizeCompactionTrigger` "threshold"→"budget" relabel.

Heartbeat: `🤖 copilot-agent-updates-hook-only: canonical2 rebase wave E complete; test coverage at <SHA>`.

## §4 — stop-condition

Stop ONLY when ALL of these hold:

1. `pnpm tsgo` clean
2. `pnpm check` clean (lint + format)
3. `pnpm test` full suite passes
4. `pnpm build` clean (no `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings)
5. **Zero block-landing findings** remain from `/tmp/canonical2-review-aggro/SUMMARY.md` Reject-on-sight + Critical structural duplication + CLAUDE.md compliance + Silent-failure-class + Type design (P0) buckets
6. **39 RFC↔code baseline findings still carry unchanged** (verify with quick spot-check on 2-3 B-class drift findings)

**Design-break protocol**: if any wave requires changing the RFC contract or breaks an upstream-API surface, STOP, journal the design-break in `WORKORDER-canonical2-rebase-pathB.md`, push, heartbeat with `DESIGN-BREAK:` prefix, and wait. Do NOT proceed past a design-break.

## §5 — final state + declare-done

Final heartbeat: `🤖 copilot-agent-updates-hook-only: canonical2 rebase declare-done; waves A-E green; tsgo+check+test+build clean; 0 block-landing remaining; ready for prince review at <SHA>`.

DO NOT open a PR autonomously. The branch on origin (`frond-scribe/325-canonical2-pathB-rebase`) is the deliverable; figs decides whether/when to PR it.

## §6 — what NOT to do

- NO force-push to `karmaterminal/openclaw:feature/context-pressure-squashed`
- NO opening of PR autonomously — push branch only
- NO RFC edits (cleanup is structural; RFC stays as-is)
- NO future-time framing in heartbeat messages (Opus-4.7 / GPT-side both prone to deferral when given future-time anchors; describe present-tense actions only)
- NO classification-language ("counter-shape #N", "cure-canon", "ratify-cluster") in commits or heartbeats — heartbeats describe the work in plain technical terms
- NO touching prince-namespaced branches (`cael/*`, `silas/*`, `ronan/*`, `elliott/*`)

## Journal section (append as you go)

<!-- start journal -->

### 2026-05-01T16:20-07:00 — Wave A checkpoint

- Applied `7054aa1a73` and `053b6df551` onto canonical2. Resolved the v3-only workorder artifact by dropping it from this branch and kept canonical2's existing lint-script shape while removing the rejected substrate-adoption check.
- Verified the four root artifacts are deleted and the `cot-frame.ts` runtime detector no longer enumerates private speaker names or glyphs.
- Added the canonical2-specific public-template wording scrub in `docs/reference/templates/TOOLS.md` because the cherry-picked Wave A commit did not touch that file. No design break.

### 2026-05-01T16:28-07:00 — Wave B checkpoint

- Applied `2946145c1c` onto canonical2. Resolved the v3-only workorder artifact by deleting it again and removed the modified reply-side `continuation-runtime.ts` duplicate in favor of `src/auto-reply/continuation/config.ts`.
- Verified reply-side `continuation-runtime`, `continuation-state`, and `context-pressure` duplicates are deleted; continuation config still imports canonical2 `loadConfig`; and the direct post-compaction helper is named `dispatchStagedPostCompactionDelegates` while the durable queue dispatcher keeps `dispatchPostCompactionDelegates`.
- Focused continuation/reply/status/subagent tests covering the moved seams passed after installing missing dependencies. No design break.

### 2026-05-01T16:36-07:00 — Wave C checkpoint

- Applied `b160d0c911` onto canonical2. Resolved the v3-only workorder artifact by deleting it again and mapped v3 `getRuntimeConfig` conflict hunks back to canonical2 `loadConfig`.
- Kept `resolveContinuationRuntimeConfig` behind `subagent-announce.runtime.ts` so subagent announce code no longer mixes static and dynamic imports for that continuation config seam.
- Verified `tsdown.config.ts` no longer suppresses `INEFFECTIVE_DYNAMIC_IMPORT`; focused subagent announce tests and `pnpm build` passed with no ineffective-dynamic-import warning. No design break.

### 2026-05-01T16:45-07:00 — Wave D checkpoint

- Applied `8bedd3f326` onto canonical2. The cherry-pick covered request-compaction background failure events, post-compaction context read failure events, persisted delegate load failure surfacing, and hedge-dispatch re-arm/warning behavior.
- Extended Wave D for canonical2 H10: `reconcileSessionStoreCompactionCountAfterSuccess` failures now emit a structured compaction warning event instead of only logging after the in-memory count increments.
- Added UI handling so warning-phase compaction events do not disturb active/retry/complete compaction status. Focused Wave D and H10 tests passed. No design break.

### 2026-05-01T16:55-07:00 — Wave E checkpoint

- Applied `0831ce3b8c` onto canonical2. Resolved only the recurring v3 workorder artifact conflict by deleting it again.
- Added/expanded coverage for continuation state timer refs/handles, delegate dispatch caps and mode/spawn paths, direct post-compaction dispatch, `ReplyRunAlreadyActiveError` shielding, and compaction trigger attribution.
- Focused Wave E coverage tests passed. No design break.

### 2026-05-01T17:12-07:00 — Final stop-condition checkpoint

- Waves A-E are applied on `frond-scribe/325-canonical2-pathB-rebase`; the final gated source commit before this journal entry is `fbe4c9936193`.
- Final source gates are clean at `fbe4c9936193`: `pnpm tsgo`, `pnpm check`, `pnpm test`, and `pnpm build` all passed; the build log has no `[INEFFECTIVE_DYNAMIC_IMPORT]`.
- Stop-condition audit is clean: rejected root artifacts are absent; duplicate reply-side continuation modules are absent; `.github/workflows/workflow-sanity.yml` has no diff; source-side identity/process greps are clean apart from literal color values; and the Type Design P0 residual grep buckets are empty.
- RFC baseline carry verified by spot-checking B-class drift findings: B1 still has no `targetSessionKey` tool schema field; B2 span-name set remains the canonical code set; B3 normal silent/silent-wake still returns through in-memory system events plus heartbeat wake; B4 post-compaction release remains queued/asynchronous. RFC docs were not edited, so the 39 RFC baseline findings carry unchanged.
- No design break.
