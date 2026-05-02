# WORKORDER — codex P1/P2 fixes + doc-baselines regen for PR #515

## Strategic framing

PR #515 (`frond-scribe/325-canonical2-pathB-rebase`) is the canonical2-rebase-from-Path-B candidate. The cohort review surfaced multiple findings; 🩸 + 🌫's lanes are addressing the cohort-flagged blocks (swim-37 harness restoration, 25-band early-warn band-shape via v6 editor-mode lane).

This lane runs **in parallel** on a sibling branch and addresses three not-yet-claimed findings:

1. **codex P1** — `src/auto-reply/continuation/delegate-store.ts:77` — keep decoding legacy silent-wake dual-flag payloads (data-loss-class on upgrade)
2. **codex P2** — `src/agents/tools/common.ts:47` — preserve numeric-string tolerance in tool parameter parsing (provider-tolerance regression)
3. **`generated-doc-baselines` check failure** on PR #515 — re-run doc-gen + commit baseline-hash refresh

Different files from v6 band-fix lane → no collision per cohort GO (🌊 + 🩸 :40-:41Z).

## §0 — guardrails

- Operate ONLY in `/home/figs/flesh_beast_best_beast/openclaw-wt-codex-fixes/`
- **Never read, write, list, or shell into `/home/figs/flesh_beast_tmp/openclaw/`** — prince-runtime tree
- Push to `frond-scribe/325-canonical2-codex-fixes` only (forward-only; no force-push)
- **HARD RAIL**: NO force-push of completely-untested upstream-presented content to `karmaterminal/openclaw:feature/context-pressure-squashed`
- Heartbeat webhook username: **`frond-scribe-codex-fixes-hook`** (pattern from runbook §"Webhook Heartbeat to #sprites-of-thornfield")
- Resolve webhook: `gh variable list -R karmaterminal/frond-scribe --json name,value --jq '.[] | select(.name=="DISCORD_SPRITES_WEBHOOK") | .value'`

## §1 — read-first

1. **PR #515 review comments** — particularly the chatgpt-codex-connector P1 + P2 findings on `delegate-store.ts:77` and `common.ts:47`. Pull via `gh api repos/karmaterminal/openclaw/pulls/515/comments`.
2. **`src/auto-reply/continuation/delegate-store.ts`** — read the legacy-state validator that's rejecting dual-flag payloads. The fix is to ALLOW `silent + silentWake` in the silent-wake legacy combo, not reject it.
3. **`src/agents/tools/common.ts`** — read `parseToolParams`. The fix is to preserve numeric-string tolerance for `delaySeconds` (model outputs aren't always type-stable).
4. **CLAUDE.md** at the worktree root for repo conventions.

## §2 — three fixes

### Fix 1 — codex P1 — legacy dual-flag decode

Codex finding (verbatim from PR review):

> The new legacy-state validator now rejects any payload with more than one legacy mode flag, but queued delegates from older builds can legitimately have both `silent` and `silentWake` set for silent-wake mode. In `consumePendingDelegates`, a decode failure immediately `failFlow`s the record, so those durable queued delegates are dropped instead of dispatched after upgrade. This turns a compatibility case into data loss for in-flight continuation work.

**Acceptance**:

- `consumePendingDelegates` decodes a `{silent: true, silentWake: true}` legacy payload as silent-wake mode (NOT failFlow'd)
- Test pinning: a queued delegate with both flags set survives the new validator
- The new validator can still reject genuinely-malformed multi-flag payloads (e.g. `{silent: true, postCompaction: true}` — those weren't valid in legacy either)

### Fix 2 — codex P2 — numeric-string tolerance

Codex finding (verbatim):

> `parseToolParams` now uses strict `TypeBox Parse` semantics, which rejects string-encoded numbers. `continue_work` and `continue_delegate` switched from `readNumberParam` (which accepted numeric strings like `"5"`) to this helper, so model/tool calls that still emit numeric strings for `delaySeconds` now fail with input errors instead of being scheduled. This is a behavior regression for providers/model outputs that are not perfectly type-stable.

**Acceptance**:

- `continue_work({delaySeconds: "5"})` schedules at 5s as before (not rejected)
- `continue_delegate({task, delaySeconds: "5", mode: "silent"})` schedules at 5s
- Test pinning: numeric-string tolerance preserved for `delaySeconds` parameter
- Strict typing preserved for non-numeric-string params

### Fix 3 — generated-doc-baselines check failure

Per CLAUDE.md, when config schema/help or Plugin SDK surface changes, run the matching gen command and commit the updated `.sha256` hash file.

**Acceptance**:

- `pnpm config:docs:gen` run; baseline `.sha256` file committed if it changed
- `pnpm plugin-sdk:api:gen` run; baseline `.sha256` file committed if it changed
- `pnpm config:docs:check` and `pnpm plugin-sdk:api:check` both pass

## §3 — checkpoints + heartbeats

Push at the end of each fix. Heartbeat each one to Discord webhook with `frond-scribe-codex-fixes-hook` username.

**Heartbeat shape** (per runbook):

```bash
WEBHOOK=$(gh variable list -R karmaterminal/frond-scribe --json name,value --jq '.[] | select(.name=="DISCORD_SPRITES_WEBHOOK") | .value')
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"frond-scribe-codex-fixes-hook\",\"content\":\"🤖 frond-scribe-codex-fixes: <one-line status>\"}" \
  "$WEBHOOK"
```

Heartbeat after:

- Fix 1 complete (codex P1 dual-flag decode landed)
- Fix 2 complete (codex P2 numeric-string tolerance landed)
- Fix 3 complete (doc-baselines regen + check green)
- Final declare-done

## §4 — stop-condition

Stop ONLY when:

1. `pnpm tsgo` clean
2. `pnpm check` clean
3. `pnpm test` full suite passes (the 3 fixes shouldn't introduce new failures)
4. `pnpm build` clean
5. `pnpm config:docs:check` + `pnpm plugin-sdk:api:check` pass
6. Three fixes committed + pushed

## §5 — declare-done

Final heartbeat: `🤖 frond-scribe-codex-fixes-hook: declare-done; codex P1/P2 + doc-baselines fixed at <SHA>; ready for prince review on branch frond-scribe/325-canonical2-codex-fixes`

DO NOT open PR autonomously. Push branch only; the dispatcher (frond-scribe) decides PR shape (separate PR vs commits-on-top-of-#515 once v6 lands).

## §6 — what NOT to do

- NO force-push to `karmaterminal/openclaw:feature/context-pressure-squashed`
- NO autonomous PR-opening — push branch only
- NO touching files outside the three findings (don't drift into v6 territory which 🌫's editor-mode lane owns)
- NO classification-language ("counter-shape", "cure-canon") in commits/heartbeats — plain technical descriptions only

## Journal section (append as you go)

<!-- start journal -->
