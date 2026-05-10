# WORKORDER — #573 header-fix: `normalizeResolvedModel` hook for github-copilot plugin

> Implementation of fix candidate #1 from PR #612 root-cause analysis. Per figs's directive 2026-05-10 ~20:08Z: header-fix, copilot lane, branched off PR-presenting branch (NOT modifying it), webhook-wired, gh-issue-tracked.

## Tracking

- **Tracking issue:** karmaterminal/openclaw#629
- **PR target:** `frond-scribe-claude/20260509/narrow-surgery-tight` (sibling fold-in PR; cohort decides whether to merge into PR #79925 or leave parked)
- **Branch:** `frond-scribe-copilot/20260510/573-header-fix`
- **Base:** `ac59eeb3a72e9df6ee54db03829514ab8925cca7` (PR #79925 head)
- **Worktree:** `/tmp/oc-573-header-fix/repo` (this dir)
- **Outer budget:** 444m
- **Engine:** copilot CLI gpt-5.5 xhigh yolo
- **Journal:** `tmp-drop-me-frond-scribe-copilot.md` at worktree root, committed + pushed at every checkpoint

## §0a Remote-first push discipline (canon — load-bearing)

The branch is **already pushed to origin** (frond-scribe did this pre-dispatch).
- Push WIP state at every meaningful checkpoint with `WIP:` prefix or descriptive message.
- Never local-until-complete. *"If it fails we have nothing"* is the failure mode the canon refuses.
- Push commands — use `karmafeast` committer:
  ```bash
  git -c user.email='karmafeast@gmail.com' -c user.name='karmafeast' commit -m "<msg>"
  git push origin frond-scribe-copilot/20260510/573-header-fix
  ```

## §0b GH-issue update discipline (canon — load-bearing)

Comment on tracking issue #629 at these moments:
1. After §1 reads complete: *"§1 reads done, scope understood, starting impl"*
2. After §3 first impl chunk (function added) + tests green
3. After §4 test-suite pass (full repo regression check)
4. On any blocker / ambiguity / hard-stop: shape of the open question
5. On §8 declare-done: PR link + final SHA + cohort-quorum-needed flag

## §0c Heartbeat shape (webhook to #sprites-of-thornfield)

After each meaningful checkpoint, post to:

```bash
WEBHOOK="https://discord.com/api/webhooks/1499626882277048401/9wpErZRcyWIfghjrGO_I8gJVXyEpShKMFgURn1pNI99_8AAdhgflpIu8b1wzRQTk7bmK"

curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"frond-scribe-573-header-fix-hook\",\"content\":\"🤖 #573 header-fix: <one-line status>\"}" \
  "$WEBHOOK"
```

Heartbeat after:
- §1 reads complete (RFC ingest done)
- §3 implementation chunk done (function added)
- §4 tests green
- Any DESIGN-BREAK encountered (prefix `DESIGN-BREAK:`)
- §8 declare-done (with PR URL)

## §1 — Read substrate (HARD pre-requisite, do not skip)

Read in this order:

1. **`REPORT-573-from-PR612.md`** at this worktree root (synced from PR #612 branch) (the whole file). It is the root-cause analysis. Especially absorb:
   - "Root cause" section
   - "Fix candidates" section #1 (RECOMMENDED) — your implementation target
   - "Substrate verification" table — confirms versions
2. **`extensions/github-copilot/index.ts`** — locate the existing `resolveDynamicModel: (ctx) => resolveCopilotForwardCompatModel(ctx)` registration around line 451. The plugin's hook surface lives here.
3. **`extensions/github-copilot/models.ts`** — locate `resolveCopilotForwardCompatModel` and `fetchCopilotModelCatalog`. Understand what shape returned models have today (with vs without `model.headers`).
4. **`src/agents/pi-hooks/compaction-safeguard.ts:354`** — see the existing pattern: `headers: { ...buildCopilotIdeHeaders(), ...requestAuth.headers }`. Mirror this pattern.
5. **`extensions/github-copilot/models.test.ts`** — existing test file. Understand what coverage exists; identify the right place to add the regression test.
6. **`openclaw/plugin-sdk/plugin-entry`** type definitions — find what hook types the plugin registration accepts. Look for `normalizeResolvedModel` or similar; if it doesn't exist, you need a new hook OR you augment the existing `resolveDynamicModel` shape to also process exact configured models.

After §1, post first heartbeat + first GH-issue comment. Commit + push journal entry summarizing what you understood.

## §2 — Plan (write to `tmp-drop-me-frond-scribe-copilot.md`)

In your journal, document:
- Hook surface chosen: new `normalizeResolvedModel` hook OR augmenting existing `resolveDynamicModel` OR a different shape (justify your choice)
- Files you'll touch (must be additive — see §0d below)
- Test additions (file + test names)
- Smoke-test gates you'll run before declare-done

## §0d Scope guardrails (HARD)

You MAY touch:
- `extensions/github-copilot/index.ts` (add hook registration)
- `extensions/github-copilot/models.ts` (extend `resolveCopilotForwardCompatModel` OR add new function)
- `extensions/github-copilot/models.test.ts` (add regression test)
- New file under `extensions/github-copilot/` if needed (e.g. `extensions/github-copilot/header-merge.ts`)

You MUST NOT touch:
- `src/agents/pi-hooks/compaction-safeguard.ts` (already correct per `report.md` §1)
- `node_modules/` (vendored code; trace edits in `report.md` lane were temp)
- Dependency source (pi-ai upstream change is candidate #3, out of scope)
- Continuation feature surfaces (`src/auto-reply/continuation/*`, `src/agents/tools/continue-*-tool.ts`, etc.)
- PR-presenting branch `frond-scribe-claude/20260509/narrow-surgery-tight` (figs explicit)
- Any file outside `extensions/github-copilot/` unless you find a strict architectural necessity AND document it as a DESIGN-BREAK heartbeat first

## §3 — Implementation

Write the hook so that:

1. For any resolved github-copilot model (exact custom OR dynamic), the returned model's `headers` field carries IDE auth headers (`Editor-Version`, `Editor-Plugin-Version`, `User-Agent`, `Copilot-Integration-Id`).
2. If the source model already has explicit `model.headers`, those override the IDE defaults — pattern is `{ ...buildCopilotIdeHeaders(), ...originalHeaders }` so user-config wins where it exists.
3. The hook does NOT add headers if the model is non-Copilot (defensive — guard on `provider === "github-copilot"` or equivalent).

Where to import `buildCopilotIdeHeaders` from:
- See where `compaction-safeguard.ts:33` imports it. Use the same import path.

Commit + push after the impl chunk is done + smoke-test green. Post heartbeat + GH-issue comment.

## §4 — Test acceptance

Add to `extensions/github-copilot/models.test.ts`:

1. **Exact custom `claude-opus-4.7` resolved model carries IDE headers** — construct a test model entry with `api: "anthropic-messages"` + enterprise base URL + NO `model.headers`. Resolve through the hook. Assert resolved model has `Editor-Version`, `Editor-Plugin-Version`, `User-Agent`, `Copilot-Integration-Id` in `headers`.

2. **Exact custom model with explicit `model.headers` keeps user override** — construct a test model with `model.headers: { 'Editor-Version': 'custom-ide/9.9.9', 'X-User-Custom': 'foo' }`. Resolve. Assert `Editor-Version` is `custom-ide/9.9.9` (user override wins) and IDE defaults are merged for keys the user didn't specify.

3. **Dynamic model resolution still works** — existing dynamic-resolve test path still passes after the change.

4. **Non-Copilot model unaffected** (defensive).

Run:
```bash
pnpm test --run extensions/github-copilot/
pnpm tsgo:core
pnpm lint
```

All green. If any fails, root-cause; do NOT paper-over. Heartbeat + push at green.

## §5 — Open Draft PR

Push final state, then:

```bash
gh pr create \
  --repo karmaterminal/openclaw \
  --base frond-scribe-claude/20260509/narrow-surgery-tight \
  --head frond-scribe-copilot/20260510/573-header-fix \
  --draft \
  --title "fix(github-copilot): normalizeResolvedModel hook adds IDE headers to exact configured models (#573 candidate #1)" \
  --body-file PR_BODY.md
```

Where `PR_BODY.md` should:
- Reference Closes #629 + Refs #612 + Refs openclaw-bootstrap#573
- Summarize the fix shape
- Note Draft state until cohort byte-walk

## §6.5 — openclaw-ci dispatch (REQUIRED per runbook)

Per runbook line 264-274: every karmaterminal/openclaw PR needs explicit cross-repo CI dispatch from `karmaterminal/openclaw-bootstrap`:

```bash
gh api repos/karmaterminal/openclaw-bootstrap/dispatches \
  -f event_type=openclaw-ci \
  -F client_payload[ref]=$(git rev-parse HEAD)
```

Surface the bootstrap run ID per PR in the §8 declare-done.

## §7 — ClawSweeper / cohort review

Once Draft PR open + CI dispatched:
- Comment `@clawsweeper` for review (if applicable on this repo)
- Heartbeat the PR URL
- Update tracking issue #629 status to `prince_review` if relevant project workflow exists

## §8 — Declare-done

Comment on tracking issue #629:
- PR URL
- Final SHA
- Test count + pass status
- Bootstrap CI run ID
- Cohort-byte-walk-needed: yes (sibling fold-in decision is figs/cohort's, not this lane's)

Final webhook heartbeat. Mark journal with declare-done timestamp.

## §10 — Constraints recap

- Branched off PR-presenting branch `frond-scribe-claude/20260509/narrow-surgery-tight` ✓
- NOT modifying that branch ✓
- Webhook wired (DISCORD_SPRITES_WEBHOOK / `frond-scribe-573-header-fix-hook` username) ✓
- Tracking issue #629 filed ✓
- Remote-first push discipline ✓
- 444m budget ✓
- Pattern C (direct copilot, target repo lacks bootstrap wrappers) ✓
- karmafeast committer for force-push consistency ✓

Ready to dispatch.
