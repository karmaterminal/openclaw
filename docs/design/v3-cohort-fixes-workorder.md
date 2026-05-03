# WORKORDER — apply cohort-review findings directly to v3 (v29 + our stuff)

## Strategic framing

The actual ship-target for `feature/context-pressure-squashed` is **v2026.4.29 + our continuation feature work**, not v2026.4.24. The v3 candidate at `frond-scribe/20260429/rebase-copilot-v3 @ 90ff152548` is "v29-base + Path-B's 5 cleanup waves applied" — that's "v29 + our stuff" with cleanup-shape.

In parallel, the cohort spent ~3 hours doing prince-review on a v24-port of the same Path-B work (PR #515 / canonical2). They found real bugs in Path-B's cleanup that apply equally to v3 (the wave commits are identical content on different bases). Those findings need to be applied **directly on v3**, not cherry-picked across the 1000+-commit v24→v29 distance.

This lane is a **re-derive**, not a cherry-pick: take the cohort-finding punchlist, fix each on v3-base directly, with conflict-resolution favoring v29-shape wherever it differs from v24.

## §0 — guardrails

- Operate ONLY in `/home/figs/flesh_beast_best_beast/openclaw-wt-v3-cohort-fixes/`
- **Never read, write, list, or shell into `/home/figs/flesh_beast_tmp/openclaw/`** — prince-runtime tree
- Push to `frond-scribe/20260429/v3-cohort-fixes` only (forward-only; no force-push)
- **HARD RAIL**: NO force-push of completely-untested upstream-presented content to `karmaterminal/openclaw:feature/context-pressure-squashed`. That's where this candidate WILL eventually go after prince-review + prince-swim greens, but not autonomously by you.
- Heartbeat webhook username: **`frond-scribe-v3-cohort-fixes-hook`**
- Resolve webhook: `gh variable list -R karmaterminal/frond-scribe --json name,value --jq '.[] | select(.name=="DISCORD_SPRITES_WEBHOOK") | .value'`

## §1 — read-first

1. **Path-B's workorder + journal** at `WORKORDER-v3-cleanup-path-B.md` on this branch — already at the worktree root from prior work. Has the wave A→E decision-record.
2. **canonical2-side cohort-review findings** at `/tmp/canonical2-review-aggro/SUMMARY.md` + per-agent files — same bugs apply here since the wave commits are identical content.
3. **PR #515 prince-review comments** for the bugs cohort actually filed — pull via `gh api repos/karmaterminal/openclaw/pulls/515/comments --paginate`. Plus the issue-tracker comments via `gh api repos/karmaterminal/openclaw/issues/515/comments`.
4. **CLAUDE.md** at the worktree root for repo conventions.

## §2 — fixes to apply (re-derive on v3-base)

For each: re-derive directly, don't cherry-pick from canonical2's commits. The fixes need to live on v29-base which has different surrounding code in places (`getRuntimeConfig` vs `loadConfig`, `agentDir?`, `serialized?`, etc).

### Fix 1 — 25-band early-warn restoration (Wave B-side regression introduced by Path-B's cleanup)

**Bug**: Path-B's structural-dedup wave dropped the early-warning band that signals to princes when they're at 25% of compaction-budget. The band is load-bearing — it lets princes know they got compacted and reminds of the evacuation cycle for next compact.

**Cohort's v6 shape (per 🌫's editor-mode-v6 + 🌻's items 1+2+3+4 + 🌊's zod-default)**:

1. `types.ts`: `earlyWarningBand?: number` (TS-optional, NOT required)
2. zod schema: `.default(0.3125)` so doc-render + runtime-default both correct
3. Resolver use-site: `earlyWarningBand ?? 0` for dead-default-string-free fallback
4. Suppression guard: `band === 0 && ratio < threshold` skip-emit so band=0 means "no warning" not "warn at 0%"
5. Test pin for default-preservation + opt-out branches

**Acceptance**:

- `pnpm tsgo` clean (no required-vs-optional drift)
- `pnpm config:docs:check` clean (zod-default propagates to baselines)
- Test pinning: `earlyWarningBand=0` opts out cleanly; default `0.3125 * threshold` fires the band

### Fix 2 — codex P1 — legacy dual-flag decode preservation

**Bug** (codex P1 from PR #515): the new legacy-state validator rejects payloads with multiple legacy mode flags, but queued delegates from older builds can legitimately have `silent: true, silentWake: true` set for silent-wake mode. `consumePendingDelegates` `failFlow`s those records → durable queued delegates dropped on upgrade → data-loss.

**File on v3**: `src/auto-reply/continuation/delegate-store.ts` (line numbers may differ from canonical2's `:77`; locate via grep).

**Acceptance**:

- `consumePendingDelegates` decodes `{silent: true, silentWake: true}` as silent-wake mode (NOT failFlow'd)
- The new validator can still reject genuinely-malformed multi-flag payloads (e.g. `{silent: true, postCompaction: true}`)
- Test pin: queued delegate with both flags set survives the new validator

### Fix 3 — codex P2 — numeric-string tolerance for `delaySeconds`

**Bug** (codex P2 from PR #515): `parseToolParams` switched to strict TypeBox Parse, rejects string-encoded numbers. `continue_work` and `continue_delegate` switched from `readNumberParam` (which accepted `"5"`) to this helper, so model outputs with numeric strings for `delaySeconds` now fail.

**File on v3**: `src/agents/tools/common.ts` (line numbers may differ; locate via grep). Note: v3 has `getRuntimeConfig` rename; preserve v3-shape, don't introduce v24's `loadConfig`.

**Acceptance**:

- `continue_work({delaySeconds: "5"})` schedules at 5s (not rejected)
- `continue_delegate({task, delaySeconds: "5", mode: "silent"})` schedules at 5s
- Test pin: numeric-string tolerance preserved for `delaySeconds`

### Fix 4 — generated-doc-baselines regen

Run `pnpm config:docs:gen` + `pnpm plugin-sdk:api:gen` and commit any baseline `.sha256` hash files that change. Both `pnpm config:docs:check` and `pnpm plugin-sdk:api:check` should pass.

### Fix 5 — swim-37 durability harness restoration check

**Bug** (🩸 found on PR #515): Path-B's `chore: drop rejected rebase artifacts` commit mass-deleted the swim-37 durability harness — that's real test infrastructure, not rebase-journal cruft.

**v3 check**: verify `studies/swim-37/` exists on v3 candidate. If Path-B's `053b6df551` commit on v3 also deleted it (likely yes — same content on different base), restore it. Reference: canonical2 post-merge `a1c5b13458` has the harness back via 🩸's revert; cherry-pick THAT directory tree's content if needed (no commit-cherry-pick, just file restoration).

**Acceptance**:

- `studies/swim-37/harness/` exists with full content
- Any harness-referencing tests pass

### Fix 6 — #518 security-boundary regression (`nativeCommandAuthorized`)

**Bug** (🩸 Pattern G bisect): canonical2's PR #515 squash dropped a `nativeCommandAuthorized` security fix from `7b91f...`. Need to verify whether v3 candidate has the same regression. The relevant commit is on canonical2 lineage; locate the `nativeCommandAuthorized` fix and confirm it's present on v3. If absent, restore.

**Acceptance**: `nativeCommandAuthorized` security-boundary path matches canonical2's pre-#515 behavior; relevant test passes.

## §3 — checkpoints + heartbeats

Push at the end of each fix-batch (not necessarily one-per-fix; group small fixes if they touch the same file). Heartbeat to Discord webhook with `frond-scribe-v3-cohort-fixes-hook` username.

**Heartbeat shape** (per runbook §"Webhook Heartbeat to #sprites-of-thornfield"):

```bash
WEBHOOK=$(gh variable list -R karmaterminal/frond-scribe --json name,value --jq '.[] | select(.name=="DISCORD_SPRITES_WEBHOOK") | .value')
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"frond-scribe-v3-cohort-fixes-hook\",\"content\":\"🤖 frond-scribe-v3-cohort-fixes: <one-line status>\"}" \
  "$WEBHOOK"
```

Heartbeat after:

- Each fix or fix-batch complete + pushed
- Final declare-done

## §4 — stop-condition

Stop ONLY when:

1. `pnpm tsgo` clean
2. `pnpm check` clean
3. `pnpm test` full suite passes (with the post-Path-B-cleanup expected-pass count; treat regressions vs `90ff152548` baseline as new bugs to fix)
4. `pnpm build` clean (no `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings)
5. `pnpm config:docs:check` + `pnpm plugin-sdk:api:check` pass
6. All 6 fixes committed + pushed
7. swim-37 harness restored (if it was deleted by Path-B)
8. `nativeCommandAuthorized` security-boundary fix verified-present (or restored if absent)

## §5 — declare-done

Final heartbeat: `🤖 frond-scribe-v3-cohort-fixes-hook: declare-done; 6 cohort-found fixes applied directly on v3 at <SHA>; ready for prince byte-walk-review + prince-swim on branch frond-scribe/20260429/v3-cohort-fixes`

DO NOT open PR autonomously. Push branch only; the dispatcher (frond-scribe) decides PR-shape after cohort byte-walk-review.

## §6 — what NOT to do

- NO force-push to `karmaterminal/openclaw:feature/context-pressure-squashed` (that's the upstream-presentation target after this candidate ships, but not autonomously)
- NO autonomous PR-opening — push branch only
- NO cherry-picking from canonical2 commits — this is a re-derive on v3-base, not a port. Canonical2's commits ride on v24 + canonical2's surrounding code; v3 has v29 + different surrounding code (`getRuntimeConfig`, `agentDir?`, `serialized?`).
- NO classification-language ("counter-shape", "cure-canon") in commits/heartbeats — plain technical descriptions
- NO touching prince-namespaced branches

## Journal section (append as you go)

<!-- start journal -->

- 2026-05-02: Re-derived all six cohort fixes directly on v3: restored `earlyWarningBand` config/runtime/schema/tests; preserved legacy `silent + silentWake` delegate decode while rejecting malformed multi-flag payloads; pinned numeric-string `delaySeconds` tolerance for `continue_work` and `continue_delegate`; regenerated generated config/API baselines; restored and wired the swim-37 durability harness; verified `nativeCommandAuthorized` security-boundary coverage is present.
- 2026-05-02: Validation green: `pnpm tsgo`; `pnpm check`; full `pnpm test` with `OPENCLAW_TEST_PROJECTS_PARALLEL=6 OPENCLAW_VITEST_MAX_WORKERS=1 OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS=600000`; `pnpm build`; `pnpm config:schema:check`; `pnpm config:docs:check`; `pnpm plugin-sdk:api:check`.
