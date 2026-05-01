# WORKORDER — v2026.4.29 candidate gate-completion (copilot v3 lane)

## Context (read first)

You are the third copilot lane working on the v2026.4.29 exploratory rebase candidate. Two prior runs:

- **v1** (`frond-scribe/20260429/rebase-copilot @ ca0e6c62a7`) — stopped at §9 force-push misread; reread artifact: `git show origin/frond-scribe/20260429/rebase-copilot:RECOMMENDED-PATH.md`
- **v2** (`frond-scribe/20260429/rebase-copilot-v2 @ 622fe0e50b`) — completed §4 rebase (95 commits replayed onto v2026.4.29 = `a448042c2e`); 16 compose / 3 supersede-up / 0 supersede-co / 0 merge-required; failed §6 `pnpm tsgo` gate with 6 type errors; pushed candidate + artifacts (`RECOMMENDED-PATH.md`, `QUESTIONS-FOR-FIGS.md`, `RATIFICATIONS.md`, journal)

**Since v2 stopped**:

1. **figs ratified** the 4 semantic questions in `QUESTIONS-FOR-FIGS.md`. Captured in `RATIFICATIONS.md` on this branch:
   - Q1 (visible-reply policy vs blocked-liveness marker) → **KEEP visible** ✅ — posting itself grants a turn
   - Q2 (abort-wait semantics vs reply-run registry cleanup) → **cohort engineering call deferred**: non-lazy + preserve `ReplyRunAlreadyActiveError` shielding + platform substrate
   - Q3 (orphan recovery ordering) → **safest-path, no fixed canon** ✅
   - Q4 (diagnostic-runtime SDK seam) → **RATIFY current shape** ✅ — Elliott🌻 byte-walked at tip `0c069d9db7` and verified spans-integration is structural (`src/plugin-sdk/diagnostic-runtime.ts` re-exports both diagnostic-event helpers and continuation-tracer surface; `extensions/diagnostics-otel/api.ts` consumes via single SDK path; `parseDiagnosticTraceparent` shared with auto-instrumented spans; `trace.setSpanContext` stitches continuation chains into parent OTEL traces; tracer-name distinction `openclaw.continuation` vs `openclaw` for collector-side filter)

2. **Ronan🌊 (cohort prince) resolved the 6 tsgo errors** on a sibling branch `ronan/v2-tsgo-repair @ 43170b6afc`. The tsgo-fix commit is **already cherry-picked into this v3 branch as commit `999b3e2b88`** (verified: `pnpm tsgo` was green on Ronan's worktree post-fix; Ronan ran it locally before pushing). The cherry-picked commit:
   - `src/agents/subagent-announce.runtime.ts`: re-export `loadConfig` from `../config/config.js`
   - `src/agents/subagent-announce.ts`: `loadConfig` in `SubagentAnnounceDeps` type + `defaultSubagentAnnounceDeps`
   - `src/agents/subagent-registry-spawn-runtime.ts`: `agentDir?` in local mirror of `RegisterSubagentRunParams`
   - `src/config/sessions/store-cache.ts`: `serialized?` in `SessionStoreCacheEntry` + `writeSessionStoreCache`
   - `scripts/check-duplicates.mjs`: `studies` in `dup:check` targets (post-v29-base addition)
   - `src/agents/subagent-announce.{test,timeout.test}.ts`: `loadConfig` in test mocks for fixture parity

   **All 6 tsgo errors closed; zero semantic change**. Per Ronan's commit message: agents-core test surface bench was 4-files-failed/18-tests-failed → 2-files-failed/0-tests-failed (residual 2-mock-setup files are orthogonal pre-existing mock-completeness issues unrelated to this rebase).

3. **Strategic framing** (per figs):
   - **Princes are driving the canonical2 → v2026.4.24 release-PR-presentation lane** (this is the priority — ship what they're cutting; "good line in the sand", critically behind)
   - **This v29 lane is parallel** so when princes get to it later, burden-to-code is low
   - You are NOT the canonical-lineage drive; you are an exploratory candidate that hands off when ready

## Branch state for this run

- **Worktree**: `/home/figs/flesh_beast_best_beast/openclaw-wt-rebase-v29-copilot-v3` (this dir; you are operating here)
- **Branch**: `frond-scribe/20260429/rebase-copilot-v3` (already pushed to origin at HEAD `999b3e2b88`)
- **Base/merge state**: 95 v2 rebase commits + RATIFICATIONS docs + 6-tsgo-error-fix cherry-picked
- **Tip lineage**: `999b3e2b88 (tsgo-fix) → 622fe0e50b (RATIFICATIONS) → 0c069d9db7 (gate-failure-journal) → f799818de2 (review-artifacts) → 1732252559 (v1-artifact-checkpoint) → 886d15d869 (seed) → 95 v2 rebase commits → a448042c2e (v2026.4.29 base)`

## §0 — guardrails

- Operate ONLY in `/home/figs/flesh_beast_best_beast/openclaw-wt-rebase-v29-copilot-v3/`
- **Never read, write, list, or shell into `/home/figs/flesh_beast_tmp/openclaw/`** — that's seal-boy/ronan-the-prince's runtime tree
- Push to `frond-scribe/20260429/rebase-copilot-v3` only (forward-only commits; do NOT force-push or rewrite history — savegame canon)
- Do NOT touch other prince-namespaced branches, do NOT touch v2 (it's the savegame predecessor)
- Use `git push origin frond-scribe/20260429/rebase-copilot-v3` for forward-only commits
- Discord webhook for heartbeats: `DISCORD_SPRITES_WEBHOOK` repo variable on `karmaterminal/frond-scribe`. Username for posts: `swim-v29-copilot-v3-gates`
- Push cadence: every meaningful checkpoint (gate-completed, gate-failed, journal-update); commit + push the journal
- Journal at root: `tmp-drop-me-rebase-v29-v3.md`

## §1 — read-first

Before running gates, read these (already on this branch tip):

- `RATIFICATIONS.md` — figs's Q1/Q3/Q4 + Q2 deferral + 🌻's Q4 byte-walk evidence + tsgo-fix-strategy memo
- `RECOMMENDED-PATH.md` — bucket ledger + HIGH-risk decisions + diff shape (297 files / +36189 / −662)
- `QUESTIONS-FOR-FIGS.md` — original 4 semantic questions (now answered per RATIFICATIONS.md)
- `tmp-drop-me-rebase-v29-v2.md` (committed on branch tip) — v2 journal

If anything in those documents disagrees with this workorder, surface it to channel; do not silently override.

## §2 — verify tsgo gate green (post-cherry-pick)

```
pnpm install   # ensure node_modules is fresh
pnpm tsgo
```

**Expected**: `===exit=0`. If not, investigate WHY the cherry-pick didn't carry the same green state Ronan reported. Do NOT guess-fix; surface to channel for cohort byte-walk.

If `pnpm tsgo` is green: heartbeat post + commit journal entry + push.

## §3 — pnpm check (lint + format)

```
pnpm check
```

If `===exit=0`: heartbeat + journal + push.

If failure: surface the failure shape. Lint/format failures might be auto-fixable via `pnpm format:fix`; investigate before guess-fixing.

## §4 — pnpm test (scoped)

```
pnpm test src/auto-reply src/agents src/messages src/gateway
```

Per workorder §6 from v2 run; this is the scoped test surface for the continuation feature.

If `===exit=0`: heartbeat + journal + push.

If failures: report the failure shape. Some test failures may be flakes; rerun once to disambiguate. If still red, journal the failure shape and surface to channel.

## §5 — pnpm build

```
pnpm build
```

This is the hard gate when the change can affect build output / packaging / lazy-loading / module boundaries / published surfaces. v29 rebase touches all of those.

If `===exit=0`: heartbeat + journal + push. **Candidate is now full-gates green** — handoff state.

If failure: report shape; check for `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings (per CLAUDE.md guardrail).

## §6 — final journal + handoff

If all gates green:

- Write a final journal block declaring "**candidate gates green; ready for canonical-lineage handoff**"
- Update `RECOMMENDED-PATH.md` with new gate status table (showing all green)
- Heartbeat post with summary
- Final commit + push

## §7 — local CI dispatch (optional)

Karmaterminal/openclaw has a local CI workflow triggered via `repository_dispatch event_type=openclaw-ci`. Dispatch shape:

```
gh api repos/karmaterminal/openclaw-bootstrap/dispatches -X POST \
  -f event_type=openclaw-ci \
  -f 'client_payload[ref]=999b3e2b88...' \   # full 40-char SHA REQUIRED
  -f 'client_payload[branch]=frond-scribe/20260429/rebase-copilot-v3'
```

Run this AFTER §5 if local gates all green; surfaces remote CI verdict in addition to local. NOT required — local gates are sufficient for ratification. Skip if you're unsure of the exact dispatch shape; cohort can run it manually post-handoff.

## §8 — what NOT to do

- Do NOT force-push the v3 branch (savegame canon)
- Do NOT rewrite v2 history (predecessor savegame)
- Do NOT touch `feature/context-pressure-squashed` or `cael/325-canonical2` or any prince-namespaced branch
- Do NOT attempt to merge this candidate into anything; it's exploratory
- Do NOT auto-fix tsgo/lint/test failures by adding `// @ts-ignore` or skip-comments — investigate root cause; if engineering call needed, journal + surface

## Discord heartbeat shape (per push checkpoint)

```bash
WEBHOOK=$(gh variable list -R karmaterminal/frond-scribe --json name,value | jq -r '.[] | select(.name=="DISCORD_SPRITES_WEBHOOK") | .value')
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"swim-v29-copilot-v3-gates\",\"content\":\"🤖 v3-gates: <one-line gate result>\"}" \
  "$WEBHOOK"
```

Heartbeat after:

- §2 tsgo verify (green/red)
- §3 check (green/red)
- §4 test (green/red)
- §5 build (green/red)
- §6 final summary

## Acceptance / declare-done

Final state when work complete:

- All 4 gates green (`tsgo`/`check`/`test`/`build`)
- Journal `tmp-drop-me-rebase-v29-v3.md` carries gate-by-gate receipts
- `RECOMMENDED-PATH.md` updated with green gate-status table
- Branch `frond-scribe/20260429/rebase-copilot-v3` pushed forward-only with all checkpoints
- Final Discord heartbeat: "🤖 v3-gates: ALL FOUR GATES GREEN — candidate ready for canonical-lineage handoff at SHA `<final-sha>`"

If any gate fails and is not auto-resolvable: journal the failure shape, surface clearly, do NOT guess-fix.
