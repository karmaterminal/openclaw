
## SCOPE-DOWN PHASE (figs directive 17:35Z) — TLDR-triage-survival mandate

**Mandate (figs's words)**: *"clean damned pr, frond-scribe, no close risk bc TLDR; maintainer trying to triage all in rebase says 'this telegram plus trash...close' (totally wrong, but thats what happened, AND our mistake) - the one(s) that get us that, pls and ty"*

**Target**: <80 files total, focused on the 3 NEW TOOLS that ARE the continuation feature, deferring all infrastructure that can land in follow-on PRs.

**You are now on branch**: `frond-scribe-claude/20260509/narrow-surgery-tight` (forked from your prior surgery output `34e9bf95`).

### MUST KEEP (load-bearing for the 3 tools)

- `docs/design/continue-work-signal-v2.md` — RFC
- `src/agents/tools/continue_work*` — tool registration + impl
- `src/agents/tools/continue_delegate*` — tool registration + impl
- `src/agents/tools/request_compaction*` — tool registration + impl (also called `request-compaction-tool*`)
- `src/auto-reply/continuation/*` — context-pressure scheduler + state + signal + types
- `src/auto-reply/reply/cot-frame.ts` — CoT frame (continuation-runtime)
- `src/auto-reply/reply/post-compaction-delegate-dispatch.ts`
- `src/auto-reply/reply/run-provenance.ts`
- The 3 tools' direct integration into `agent-runner.ts` (continuation hooks only — not the broader runtime refactor)
- The 3 tools' tests
- ContextPressure events emit/consumer

### DEFER TO FOLLOW-ON PR (revert wholesale on this tight branch)

- **session-keys infrastructure** (47 files: `resolveSessionStoreEntry` / `normalizedKey` / `legacyKeys` + normalization callers across auto-reply/agents/config/sandbox)
- **sandbox fs-bridge appendFile** (14 files: `SANDBOX_PINNED_MUTATION_PYTHON`, `buildPinnedAppendPlan`, remote/host/memory bridge implementations)
- **continuation-tracer plumbing** (12 files: traceparent through delivery-queue/system-events/heartbeat-wake; ContinuationTracer exports from diagnostics-otel; diagnostic-trace-context-pure extraction)
- **subagent-registry chain helpers** (9 files: `listAncestorSessionKeys`, `configureSubagentRegistrySpawnRuntime`)
- **post-compaction-delegate delivery queue infrastructure** (8 files: storage/recovery/barrels — keep dispatch but defer queue implementation)
- **live-config-read pattern for sessions tools** (6 files)
- **misc continuation infrastructure non-tool** (uuid dep / protocol-public-schema / visibleAssistantBuffer — defer if not load-bearing for the 3 tools)
- **All 5 channels/registry mock-expansion test files** Lane A flagged as revert candidates
- **All other modified files** that the 3 tools don't directly need

### Triage rule for tight-scope

For each currently-modified file:
- IF file is in MUST-KEEP list above → KEEP
- IF file is in DEFER list above → revert wholesale to upstream/main (`git checkout upstream/main -- <file>`)
- IF file is path-pattern matching `src/agents/tools/(continue|request_compaction)*` OR `src/auto-reply/continuation/*` OR `docs/design/continue-work-signal-v2.md` → KEEP
- IF file is a TEST that ONLY tests deferred surfaces → revert
- IF file is referenced by a kept file (import-graph) → KEEP
- IF unsure → DEFER (smaller PR is the goal; load-bearing items will surface as tsgo errors and we re-add then)

### Dangling refs from prior surgery

The 42 tsgo errors Lane A surfaced (usageFamilyKey / quotaSuspension / appendFileWithinRoot / etc.) are dangling refs in feature-branch files. As you revert to deferred surfaces, MOST of those error-sites will go away (e.g., reverting session-keys infra reverts `usageFamilyKey` callers). What remains needs a small cleanup commit.

### Phases (truncated for tight-scope)

1. Phase 0: branch already exists (`narrow-surgery-tight`), already pushed
2. Phase 2: per-MUST-KEEP/DEFER triage with checkpoints every 30 reverts
3. Phase 3: pnpm install + pnpm tsgo (now should pass — most dangling refs gone with deferred infra)
4. Phase 3.5 (NEW): if dangling refs remain, fix them (small, mechanical: remove unused import, remove caller-side ref to undefined symbol, etc.)
5. Phase 4: squash to single commit (drop Lane A's commit, replace with tight-scope commit)
6. Phase 5.5: re-run pr-review-toolkit on tight-scope output
7. Phase 5: declare done

### Anti-junk gate (TIGHTER)

- Final diff target: <80 files
- If diff is >100 files: STOP, surface what's still in scope, ask coordinator
- Every kept file must directly support `continue_work` / `continue_delegate` / `request_compaction` / their tests / the RFC

### Heartbeat

Same shape: `$DISCORD_SPRITES_WEBHOOK` at every phase boundary. Log decisions to issue #615 as before.

### Output

Branch `frond-scribe-claude/20260509/narrow-surgery-tight` with single squashed commit. Coordinator opens PR after final review.

