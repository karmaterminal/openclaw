# WORKORDER-903 — memory_search disabled (index metadata missing) on lothric-seat

**Tracking issue**: [karmaterminal/openclaw#903](https://github.com/karmaterminal/openclaw/issues/903)
**Worktree**: `/home/figs/.openclaw-data/workspace/codeagents/903-memory-search-disabled/worktree`
**Branch**: `emeric/20260603/903-memory-search-disabled-on-lothric` (off `origin/main` @ `892602eaba`)
**Base**: `karmaterminal/openclaw:main` @ `892602eaba`
**Journal**: `tmp-drop-me-copilot.md` at worktree root, committed + pushed at every checkpoint
**Outer budget**: 444m
**Dispatching prince**: Emeric (lamp-axis) on lothric NUC
**Host**: lothric (Intel NUC i7-12700H 64GB CachyOS)
**Auth**: `emeric-dandelion-cult`

## §0a Remote-first push discipline

Branch is already created off `origin/main` @ `892602eaba` + pushed (will be at first journal commit). Push:

```bash
echo "- $(date -uIseconds): <what just happened>" >> tmp-drop-me-copilot.md
git add tmp-drop-me-copilot.md && git commit -m "journal: <one-line>"
git push origin emeric/20260603/903-memory-search-disabled-on-lothric
```

## §0b GH-issue update discipline — issue #903

Update #903 at these mandatory moments via `gh issue comment 903 --repo karmaterminal/openclaw --body "..."`:

1. After §1 reads complete: scope understood, plan named
2. After diagnosis: root-cause confirmed at byte
3. After cure-PR opened: PR link + SHA + test counts
4. On any blocker / ambiguity / hard-stop: shape of the open question
5. On declare-done: PR link + final SHA + gates-pass receipt

## §1 Read these (in order)

1. **Issue #903 body** (this workorder mirrors it; the issue is authoritative on user-facing symptom).
2. **`extensions/memory-core/src/memory/manager.ts`** — owns the `MemoryIndexIdentityState` model + `index metadata is missing` reason. Trace where `memory_search` tool dispatches into manager.
3. **`extensions/memory-core/src/memory/manager-reindex-state.ts`** — owns the metadata-check that produces `missing` / `mismatched` / `ok` status.
4. **`extensions/memory-core/index.ts`** — tool-registration surface for `memory_search`.
5. **`extensions/memory-core/openclaw.plugin.json`** — note `activation.onStartup: false`. Need to determine whether memory-core is activated on-demand and how.
6. **Existing test file**: `extensions/memory-core/src/memory/index.test.ts` (already-cites `index metadata is missing`) — replicate the failure-mode in a fresh test that asserts the silent-degradation path.

## §2 Diagnosis (what the lamp empirically observed)

On lothric-seat at 2026-06-03 12:51 PDT, `memory_search({query: "..."})` returned:

```json
{
  "results": [],
  "disabled": true,
  "unavailable": true,
  "error": "index metadata is missing",
  "warning": "memory search is paused because the memory index was built with a different embedding provider/model/settings.",
  "action": "Tell the user to run: openclaw memory status --index or openclaw memory index --force."
}
```

**Lothric-seat config snapshot** (`~/.openclaw/openclaw.json` — sensitive keys stripped):

- `plugins.entries` keys: `active-memory`, `diagnostics-otel`, `discord`, `github-copilot`, `memory-tencentdb` (enabled=false), `memory-wiki` (enabled=true bridge mode), `openai`, `searxng`
- **`memory-core` is NOT in `plugins.entries`** — it appears to be loaded implicitly OR it isn't loaded and `memory_search` is being satisfied by another extension (`active-memory`? `memory-wiki`?)
- `memory-tencentdb` has `~/.openclaw/memory-tdai/` directory with sqlite + vectors.db
- No `~/.openclaw/memory-core/` or similar memory-core data directory exists

**Hypothesis-A**: `memory_search` registers from `memory-core` plugin which is `activation.onStartup: false` and needs implicit activation that isn't firing on this seat's config-shape. The error returned is from `memory-core`'s `manager.ts` startup-state-default of `{status: "missing", reason: "index metadata is missing"}` — i.e. the plugin IS loaded but its index was never built.

**Hypothesis-B**: An embedding-provider was once configured (since plugin reports model mismatch), got removed/changed, and the existing index metadata file (if any) is stale relative to current config.

**Hypothesis-C**: Cross-prince-seat issue: lothric NUC is shared by Emeric/Rune/Silas-when-on-NUC; one prince's config-change broke shared `~/.openclaw/` state for others.

## §3 Investigation steps

1. **Trace `memory_search` tool from definition → dispatch**: where is the tool registered, and what triggers the `disabled+unavailable` early-return? Confirm whether the early-return path is in `memory-core/src/memory/manager.ts` or upstream router.
2. **Locate the embedding-provider-config substrate**: where in config-schema does the model+provider get pinned for memory-index? What key path? Document.
3. **Check on-disk index location** for `memory-core` (not `memory-tdai` which is tencentdb): `find ~/.openclaw -name "metadata.json" -path "*memory*" -not -path "*tencentdb*" -not -path "*tdai*"`. If empty: index was never built, OR memory-core's index lives in a different path.
4. **Run `openclaw memory status --index`** and `openclaw memory index --force` from CLI. Capture output. Determine whether `--force` rebuilds successfully OR fails with config-missing.
5. **Surface gap**: is there a startup-warning for "memory-core enabled but index never built" that fires loudly on session-bootstrap? If not — that IS the failure-mode (silent-degradation-class).

## §4 Cure-direction options (pick one or propose alternative)

Per scope-discipline: pick **smallest cure that addresses load-bearing failure-mode**.

- **Option A**: **Surface-loudness cure** — when `memory_search` is called and returns `disabled`, the tool-response already includes the warning + action; but startup-validation could ALSO emit a one-time warning to logs/session-bootstrap so princes notice immediately on session-start (not only on first `memory_search` call). Adds a `MemoryIndexUnavailableWarning` event in `manager.ts` startup or first-call path. Target: 1 file, ~10 lines + 1 test.
- **Option B**: **Auto-rebuild cure** — when `memory_search` is called and detects `missing` index metadata, attempt automatic rebuild-on-first-use (with timeout). Larger surface; might mask deeper config issues. NOT preferred.
- **Option C**: **Startup-validation cure** — gateway-startup runs the equivalent of `memory status --index` and surfaces broken/missing state in the same gate that validates other plugins. Target: 1-2 files, ~20-30 lines + 1-2 tests.
- **Option D**: **Documentation-only cure** — add a section to `docs/plugins/memory-core.md` covering the "index metadata is missing" failure-mode + cure-steps. Lowest surface. Probably worth including alongside A or C anyway.

**Lamp recommendation**: Option A (silent-degradation → loud-degradation) + Option D (docs). Both small, both directly address the load-bearing class (cohort princes not realizing tool is disabled).

## §5 Tests

Per binding-directive `1511812258` (figs-canonical): write trap-test FIRST that asserts the cure's behavior (RED), then implement the cure (GREEN). NOT cure-then-test.

For Option A cure:

- New test `extensions/memory-core/src/memory/manager-loud-warning.test.ts`: assert that when `MemoryIndexIdentityState.status === "missing"`, the startup OR first-call path emits a warning (capture via test-fixture log-recorder).
- Existing tests in `extensions/memory-core/src/memory/index.test.ts` MUST stay GREEN.
- Run `pnpm test extensions/memory-core` from worktree root + report counts.

## §6 Gates before declare-done

1. `pnpm tsgo:core && pnpm tsgo:test && pnpm tsgo:extensions` — type-check
2. `pnpm lint && pnpm lint:extensions:bundled` — lint
3. `pnpm test:extensions:package-boundary:compile` — extension boundary
4. `pnpm test` (FULL via `scripts/pr-lib/gates.sh` Gate 7) — runtime tests
5. `bash scripts/prepush-ci.sh` — upstream CI mirror
6. Cross-repo CI: `gh api repos/karmaterminal/openclaw-bootstrap/dispatches -f event_type=openclaw-ci -F client_payload[ref]=emeric/20260603/903-memory-search-disabled-on-lothric` and surface bootstrap run ID per declare-done.

NOTE: lothric is 12GB-RAM-constrained when running full `pnpm test` on openclaw-source. If OOM: set `OPENCLAW_VITEST_MAX_WORKERS=1 NODE_OPTIONS=--max-old-space-size=12288 pnpm test` per runbook. If still OOM: skip Gate 4 locally, rely on cross-repo CI bootstrap dispatch (Gate 6) to validate.

## §7 Webhook heartbeat

```bash
WEBHOOK=$(gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/emeric-holds-the-lamp 2>/dev/null || echo "")
[ -n "$WEBHOOK" ] && curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"903-memory-search-fix\",\"content\":\"🕯 #903: $1\"}" "$WEBHOOK"
```

Fire heartbeat after each `pnpm test` green, each push, design-break, declare-done.

## §8 Declare-done shape

When PR is opened + gates green + base-verified, post to #903 + emit webhook:

```
DECLARE-DONE: PR <link>
  - SHA: <head-sha>
  - Base: karmaterminal/openclaw:main @ 892602eaba
  - Tests: <counts>
  - Gates: tsgo ✓ lint ✓ extension-boundary ✓ pnpm-test ✓ prepush-ci ✓
  - openclaw-bootstrap CI run: <link>
  - Closes: #903
  - Cure-option-picked: A (silent→loud) + D (docs)
```

## §9 If ambiguity / blocker

Stop work + comment on #903 + emit webhook. Do NOT continue past a blocker without surfacing it to the dispatching prince + cohort. Particularly:

- If memory-core code doesn't compile cleanly off `origin/main` (might need rebase if main moved)
- If the cure surface turns out to be 100+ lines (= different class, file new issue + close #903 as "scoped too narrow")
- If Hypothesis-A/B/C are all wrong and the actual root-cause is elsewhere (escalate immediately)

## §10 Scope guardrails

WILL NOT touch:

- `src/agents/` (continuation-feature substrate; separate cure-cycle owned by Cael+Silas)
- `extensions/active-memory/` (different memory subsystem; not in scope unless investigation reveals direct dep)
- `extensions/memory-wiki/` (wiki vault; not in scope)
- `extensions/memory-tencentdb/` (tencentdb; disabled on lothric anyway)
- Any config file in `~/.openclaw/` (user-config; the cure must work for ANY config, not be config-specific)

WILL touch:

- `extensions/memory-core/` (core scope)
- `docs/plugins/memory-core.md` (if Option D folded in)
- New test files
