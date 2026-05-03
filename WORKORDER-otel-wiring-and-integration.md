# WORKORDER — otel trace-context propagation wiring + integration test

**Tracking issue**: `karmaterminal/openclaw#557` — UPDATE THIS ISSUE at meaningful checkpoints.
**Worktree**: `/home/figs/flesh_beast_best_beast/openclaw-wt-otel-wiring-20260503/` (you are here)
**Branch**: `frond-scribe/20260503/otel-wiring-and-integration` (already pushed to origin)
**Base**: `frond/v2026.5.2/canonical @ bac4caceac` (post-#555 §6.8 contract merge)
**Journal**: `tmp-drop-me-otel-wiring-journal.md` at worktree root, committed + pushed at every checkpoint.
**Dispatcher**: 🌿 frond-scribe.

---

## §0 Frame

You are implementing the **end-to-end trace-context propagation contract** specified at `docs/design/continue-work-signal-v2.md` §6.8 (just landed via PR #555). The byte-anchored audit at branch `frond-scribe/20260503/otel-traceparent-audit` (final journal `1e966b8a70`) classifies each seam as GAP/PARTIAL with file:line evidence; §6.8 specifies the wire-shape; **your job is the wiring + the integration test**.

**This is ONE comprehensive PR**, not seven split PRs. figs's framing: _"the system needs to form a comprehensive whole"_ — partial-state shipping (one seam without its peer) produces un-validated code on canonical. All 7 seams + the integration test land together.

## §0a IMPORTANT CAVEATS — you MAY deviate from §6.8 prose

Per figs's directive 2026-05-03, the §6.8 contract is design intent, NOT inviolate spec. You MAY (and SHOULD) deviate from the §6.8 prose if any of:

1. **Impossible to solve given current substrate** — e.g. a seam requires a substrate primitive that doesn't exist + would require breaking changes to add
2. **Contrary to W3C trace-context / OpenTelemetry best practices** — e.g. §6.8 specifies a shape that violates `traceparent` header semantics or otel SDK conventions; defer to the standard
3. **Access of trace context causes undue runtime strain on hot paths** — e.g. the carrier-fetch is an O(N) operation on each delegate dispatch; if so, prefer a sampled-only path or no-op-when-absent shape
4. **Implementation would block normal operations** — e.g. fail-the-call if traceparent is malformed; instead degrade gracefully and emit a diagnostic warning

If you deviate, document the deviation in:

- A journal entry at the deviation point with rationale
- A comment in the PR body's "Deviations from §6.8" section
- An RFC follow-up amendment (filed as a follow-up issue, NOT in this PR's scope)

## §0b Sampling reality (load-bearing)

**Most openclaw instances will NOT have trace collection infrastructure associated with their run.** The `diagnostics-otel` extension is opt-in, and even when loaded, sampling decisions are driven by the operator's tracer config. The wire-shape is:

> When `traceparent` is **supplied** by an upstream caller AND collection is **active**, spans assemble into a coherent tree.
> When `traceparent` is **absent** (no caller supplied one) OR collection is **inactive** (no tracer registered), the substrate has **zero overhead** — no carrier construction, no propagation work, no allocations.

This means:

- ✅ Tool/token schemas accept `traceparent` as **OPTIONAL** (not required)
- ✅ Persistence fields are **additive nullable** (NULL when absent, valid W3C `traceparent` when supplied)
- ✅ Wire functions check `if (traceparent !== undefined) { ... carry ... }` — never fail-closed on absence
- ❌ DO NOT make trace-context required at any tool-call site — would break un-instrumented openclaw runs
- ❌ DO NOT fail validation on missing `traceparent` — degrade gracefully
- ❌ DO NOT add hot-path overhead for the common (un-sampled) case

The cure for "disconnected spans" is not "force everyone to thread traceparent always" — it is "thread it when present, no-op when absent."

## §0c Rigor expectations (NON-NEGOTIABLE)

Per figs's directive, this lane mutates code on the upstream-presentation surface. Every mutation MUST:

### Tests

- **Unit tests** for every new param / schema field / function signature change. Each new wiring seam carries seam-local unit tests proving the additive carrier flows through.
- **Boundary tests** for malformed/absent `traceparent` (the common case): zero overhead, no exception, no validation failure.
- **Integration test** end-to-end (the §6.8 verification contract): 3-hop chain × cross-session targeted return × fan-out broadcast × post-restart replay. Asserts trace-tree topology has the expected parent-edge shape.
- **Test discipline** per `AGENTS.md` / `CLAUDE.md` in this worktree (Vitest, colocated `*.test.ts`, repo conventions).

### Zod schema discipline

When extending tool descriptors with `traceparent`:

- Add to the zod schema as `.optional()` with W3C-format validation (`/^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/` or use a canonical helper if one exists in the repo)
- Update the type emitted from the zod schema; do NOT manually write a parallel TypeScript interface
- Run `pnpm tsgo` after schema changes to catch any type-drift downstream

### Tool-token/bracket parity (CRITICAL)

When you extend `continue-delegate-tool.ts` schema with `traceparent`, you MUST bring **parity** to:

- `src/auto-reply/tokens.ts` `[[CONTINUE_DELEGATE: ...]]` bracket parser:
  - Add `traceparent` directive option to the parsed state struct (alongside `silent`, `silentWake`, `target`, `targets`, `fanout`)
  - Update the assignment-parser regex / token-walk to recognize `traceparent=...`
  - The signal-emit shape MUST include the new field
- `src/auto-reply/tokens.test.ts` — add tests for bracket-parser parity (the bracket form MUST behave identically to the structured tool form for trace propagation)
- The regex in tokens.ts is the brittle bit; **be careful** — test edge cases (missing param, malformed `traceparent`, multiple directive options on same line)

If you change the structured tool schema but forget the bracket parser, the bracket-form will silently drop the carrier — exactly the disconnected-spans failure mode the contract is meant to fix.

### Build verification

- After implementation, copy the worktree to a temp directory (e.g. `/tmp/openclaw-otel-wiring-build-$(date +%s)/`)
- In the temp directory, run `pnpm install --frozen-lockfile && pnpm build`
- Confirm the build produces output (the `dist/` directory or equivalent)
- This catches any module-resolution / lazy-loader / type-emit issues that `pnpm tsgo` alone misses
- Document the build-verify SHA + timestamp in the journal

### Code conventions per AGENTS.md

- TS ESM strict; no `any`; prefer real types or narrow adapters
- No `@ts-nocheck`
- External boundaries: zod or existing schema helpers
- Discriminated unions over freeform strings
- Brief comments only for non-obvious logic
- Conventional commit messages

## §0d Remote-first push discipline (load-bearing)

Branch is already pushed to origin. From here:

- Commit + push the journal (`tmp-drop-me-otel-wiring-journal.md`) at every meaningful checkpoint — minimum every 10 minutes of work, every gate-passing milestone, and at declare-done
- WIP-state pushes are encouraged; polish is not the goal, **reachability is**
- Recipe:
  ```bash
  echo "- $(date -uIseconds): <what just happened>" >> tmp-drop-me-otel-wiring-journal.md
  git add tmp-drop-me-otel-wiring-journal.md && git commit -m "journal: <one-line>"
  git push origin frond-scribe/20260503/otel-wiring-and-integration
  ```
- For substrate edits: commit + push at every seam-completion, every test-green milestone, every build-verify pass

## §0e Tracking issue update discipline

Comment on `karmaterminal/openclaw#557` at these moments (NOT every commit):

1. After §1 reads complete: _"§1 reads done, scope understood, starting seam 1 implementation"_
2. After each seam-group completes (1-7) with seam-local tests green: summary + branch SHA + test count
3. On any blocker / ambiguity / hard-stop: shape of the open question + cite §6.8 deviation
4. After integration test passes: SHA + assertion count
5. After build-verify in temp dir passes: SHA + temp dir path
6. At PR-open: PR URL + final SHA
7. At declare-done: cohort-cosign-needed flag

Use:

```bash
gh issue comment 557 --repo karmaterminal/openclaw --body-file - <<'EOF'
... markdown body ...
EOF
```

## §0f Webhook heartbeat (cohort-visible — REGULAR, NOT silent)

**Resolve frond-scribe's webhook**:

```bash
WEBHOOK=$(gh variable list -R karmaterminal/frond-scribe --json name,value --jq '.[] | select(.name == "DISCORD_SPRITES_WEBHOOK") | .value')
```

**Heartbeat (use username `frond-scribe-otel-wiring-hook`)**:

```bash
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"frond-scribe-otel-wiring-hook\",\"content\":\"🤖 otel-wiring: <one-line status>\"}" \
  "$WEBHOOK"
```

**Fire on EVERY**:

- §1 reads complete
- Each seam start
- Each seam-local test passing
- Each seam complete + pushed
- Each substantive design decision / §6.8 deviation
- Each build-verify pass
- Integration test pass
- PR-open
- Declare-done

**You are NOT silent for hours**. figs explicitly noted: _"that's not gonna take it 3-5 hours"_ — meaning the lane runs at a substantial pace AND surfaces visibility throughout. If you go > 15 minutes without a webhook + journal-push, you're operating opaquely; that's the anti-pattern.

## §1 Reads (study before implementing)

In order, read FULLY:

1. `docs/design/continue-work-signal-v2.md` — entire §3 (cross-session/multi-recipient), §6 (otel + tracing), specifically §6.6 + §6.7 + §6.8 (the contract you're implementing)
2. The audit journal at `frond-scribe/20260503/otel-traceparent-audit:tmp-drop-me-otel-traceparent-audit.md` (or pull SHA `1e966b8a70`) — Q1-Q7 evidence with file:line refs
3. `figs-rfc-feedback-0807Z-VERBATIM.txt` from the audit branch (lines 75-88 + 156-158) — the desired trace shape
4. Producer surfaces (Q1 + Q2 audit findings):
   - `src/agents/tools/continue-delegate-tool.ts` (zod schema + execution)
   - `src/auto-reply/tokens.ts` (bracket parser + ContinuationSignal + regex)
   - `src/auto-reply/continuation/types.ts` (`PendingContinuationDelegate`)
   - `src/auto-reply/continuation/delegate-store.ts` (`PendingDelegateStateSchema` + `buildDelegateState`)
   - `src/infra/continuation-tracer.ts` (span helpers + `StartSpanOptions`)
   - `src/auto-reply/reply/agent-runner.ts` (call sites; ~lines 2267-2274 + 2684-2691)
5. Return surfaces (Q3-Q5 audit findings):
   - `src/agents/subagent-announce.ts` (default + visible + targeted return paths)
   - `src/agents/subagent-announce-delivery.ts` (`deliverSubagentAnnouncement` + queue helpers)
   - `src/auto-reply/continuation/targeting.ts` (`enqueueContinuationReturnDeliveries`)
6. Substrate (Q6 + carrier persistence):
   - `src/infra/system-events.ts` (`SystemEventOptions.traceparent`)
   - `src/infra/session-delivery-queue.ts` + `session-delivery-queue-storage.ts` + `session-delivery-queue-recovery.ts`
   - `src/auto-reply/reply/session-system-events.ts` (drain helper)
   - `src/gateway/server-restart-sentinel.ts`
   - `src/auto-reply/continuation/post-compaction-delegate-dispatch.ts`
7. Consumer (already wired):
   - `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts` (parent-stitching via `trace.setSpanContext`)
8. Existing tests for parity reference:
   - `src/auto-reply/continuation/cross-session-targeting.test.ts`
   - `src/auto-reply/continuation/delegate-dispatch.test.ts`
   - `src/agents/subagent-announce.silent-wake.test.ts`
   - `src/infra/session-delivery-queue.storage.test.ts`
   - `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`

## §2 Implementation — by seam group

For each seam, implement the additive `traceparent` carrier per the §6.8 contract. Order of work below; commit + push + heartbeat per seam.

### Seam 1: Producer input contract

Files: `continue-delegate-tool.ts`, `tokens.ts`, `continuation/types.ts`, `continuation/delegate-store.ts`.

- Add `traceparent: z.string().regex(W3C_TRACEPARENT_FORMAT).optional()` to the tool descriptor zod schema
- Update tool-execution to read + thread `traceparent` into the staged/enqueued payload
- Update the bracket-parser to accept `traceparent=<value>` in `[[CONTINUE_DELEGATE: ...]]` directive options (regex extension; test edge cases)
- Update `ContinuationSignal` to include `traceparent`
- Update `PendingContinuationDelegate` runtime type (additive optional field)
- Update `PendingDelegateStateSchema` zod schema (additive nullable)
- Update `buildDelegateState` to persist `traceparent` if supplied

**Tests for Seam 1**:

- Tool schema accepts `traceparent` param and emits it in the staged delegate
- Tool schema rejects malformed `traceparent` (invalid W3C format)
- Tool schema works with `traceparent` absent (zero overhead, no validation failure)
- Bracket parser accepts `traceparent=...` directive option
- Bracket parser handles missing `traceparent` (current behavior preserved)
- Bracket parser handles malformed `traceparent` (graceful degrade, not exception)
- TaskFlow persistence round-trip preserves `traceparent` (durable across restart)
- TaskFlow persistence round-trip works with `traceparent` absent

### Seam 2: Producer span creation

Files: `src/infra/continuation-tracer.ts`, `src/auto-reply/reply/agent-runner.ts`.

- Update `emitContinuationDelegateSpan` to accept `traceparent` arg and pass to `StartSpanOptions.traceparent`
- Update agent-runner call sites (~2267 + ~2684) to pass `traceparent` from the delegate's persisted state
- The `diagnostics-otel` adapter already parent-stitches (`continuation-tracer-adapter.ts:143-158`); this seam just supplies the carrier

**Tests for Seam 2**:

- `emitContinuationDelegateSpan` parents to supplied `traceparent`
- `emitContinuationDelegateSpan` operates without parent when `traceparent` absent (zero overhead, no exception)
- agent-runner call site flows `traceparent` from delegate state into span helper

### Seam 3: Child run / spawn metadata

Files: spawn params + persisted run/session metadata so child can return with producer span context.

- Identify the spawn-time persistence shape (likely in `continuation/types.ts` runtime context + the run-store)
- Thread `traceparent` from the dispatched delegate state into the spawned child's run-context
- The child uses this carrier when emitting its own return span (Seam 4-5)

**Tests for Seam 3**:

- Spawned child's run-context includes the producer's `traceparent`
- When the child emits its return delivery (Seam 4-5), the carrier is available

### Seam 4: Default / direct return

Files: `src/agents/subagent-announce.ts`, `src/agents/subagent-announce-delivery.ts`.

- Add `traceparent` to `runSubagentAnnounceFlow` parameter object (sourced from child's run-context)
- Add `traceparent` to `deliverSubagentAnnouncement` parameter object
- Thread to:
  - Silent path: system-event injection at `subagent-announce.ts:1244-1258`
  - Visible path: `deliverSubagentAnnouncement` direct gateway send (`subagent-announce-delivery.ts:779-811`)
  - Fallback direct send (`subagent-announce-delivery.ts:596-606`)

**Tests for Seam 4**:

- Silent return system-event carries `traceparent`
- Visible return system-event carries `traceparent`
- Direct gateway send carries `traceparent`
- Fallback send carries `traceparent`
- All paths handle `traceparent` absent (zero overhead)

### Seam 5: Targeted / multi / fanout return

Files: `src/auto-reply/continuation/targeting.ts`.

- Add `traceparent` parameter to `enqueueContinuationReturnDeliveries`
- Pass to BOTH `enqueueSessionDelivery` payload (already supports `traceparent` field at storage layer) AND `enqueueSystemEvent` (already supports via `SystemEventOptions.traceparent`)
- All recipients (single, multi-explicit, fanout-tree, fanout-all) receive identical `traceparent`

**Tests for Seam 5**:

- `targetSessionKey` (single) preserves `traceparent`
- `targetSessionKeys` (multi-explicit) — every recipient gets identical `traceparent`
- `fanoutMode: "tree"` — all ancestor recipients get identical `traceparent`
- `fanoutMode: "all"` — all known-session recipients get identical `traceparent`
- `traceparent` absent — all recipients get nothing (zero overhead)

### Seam 6: Queue drain / replay

Files: `src/auto-reply/reply/session-system-events.ts`, `src/gateway/server-restart-sentinel.ts`, `src/auto-reply/continuation/post-compaction-delegate-dispatch.ts`.

- Storage already carries `traceparent` per-entry (`session-delivery-queue-storage.ts:52-58`)
- Replay sinks must re-apply per-entry `traceparent` when re-delivering
- Update `gateway/server-restart-sentinel.ts` replay logic to read + apply `traceparent` from each replayed entry
- Update `post-compaction-delegate-dispatch.ts` replay logic similarly
- Queue-drain emit already has `emitContinuationQueueDrainSpan` — extend to consume `traceparent` from drained-entry-set if available

**Tests for Seam 6**:

- Restart-replay preserves `traceparent` end-to-end (write → restart-simulation → drain → emit)
- Post-compaction replay preserves `traceparent`
- Drained-entries with mixed-presence `traceparent` (some have, some don't) are handled correctly

### Seam 7: Anti-flood cap

Files: `src/agents/subagent-announce.ts` `runSubagentAnnounceFlow`, `src/auto-reply/continuation/targeting.ts` `enqueueContinuationReturnDeliveries`.

- Apply chain-step accounting: `chainStepBudgetRemaining -= 1` per **completion**, NOT per recipient
- A 50-recipient `fanoutMode: "all"` consumes 1 chain step
- Once `chainStepBudgetRemaining <= 0`, the producer SHALL NOT thread `traceparent` past the cap (mercy clause from §6.7)
- Span emission for fan-out: 1 parent fan-out span (`continuation.queue.fanout` or equivalent) + per-recipient `outcome` attributes; NOT per-recipient sibling traces

**Tests for Seam 7**:

- 50-recipient fanout decrements `chainStepBudgetRemaining` by 1, not 50
- When `chainStepBudgetRemaining <= 0`, `traceparent` is not threaded (mercy-clause; recipient gets no parent ref)
- The trace-tree query for fan-out shows 1 parent span + per-recipient `outcome` attributes (not per-recipient sibling traces)

## §3 Integration test (the verification contract from §6.8)

Single integration test asserting the contract's emergent property: **single trace tree across all seams**.

**Scope**: 3-hop chain × cross-session targeted return × fan-out broadcast × post-restart replay.

**Assertions** (per §6.8 verification contract):

1. Root turn calls `continue_delegate` → emits `continuation.delegate.dispatch` with `traceparent` propagation flag set
2. Spawned child's first span has the producer span as parent (same `traceid`)
3. Child's return delivery emits `continuation.queue.{enqueue.{system,delivery},announce,deliver}` with `traceparent` parented to the producing span
4. Wake-side successor turn's `continuation.delegate.spawn` consumes the same `traceparent` as a **link** (not parent) — preserving spawn-as-link invariant per §6.6/§6.7
5. After a restart between enqueue and drain, the replayed delivery preserves `traceparent` and stitches the same parent span on the post-restart side

**Test placement**: `src/auto-reply/continuation/trace-context-propagation.integration.test.ts` (new file). Use existing test-helpers + diagnostics-otel adapter for span-collection.

## §4 Verification (mandatory before declare-done)

In order:

### 4a. `pnpm tsgo` clean

```bash
pnpm tsgo
```

Must exit 0. Fix any type-drift before proceeding.

### 4b. Scoped seam tests

```bash
pnpm test --run \
  src/agents/tools/continue-delegate-tool.test.ts \
  src/auto-reply/tokens.test.ts \
  src/auto-reply/continuation/delegate-store.test.ts \
  src/auto-reply/continuation/delegate-dispatch.test.ts \
  src/auto-reply/continuation/cross-session-targeting.test.ts \
  src/auto-reply/continuation/targeting.test.ts \
  src/agents/subagent-announce.silent-wake.test.ts \
  src/agents/subagent-announce-delivery.test.ts \
  src/infra/session-delivery-queue.storage.test.ts \
  src/infra/continuation-tracer.test.ts \
  extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts \
  src/auto-reply/continuation/trace-context-propagation.integration.test.ts
```

All must pass.

### 4c. `pnpm check`

```bash
pnpm check
```

Format, lint, architecture checks. Must exit 0.

### 4d. Build-in-temp-directory verification

```bash
TEMP=/tmp/openclaw-otel-wiring-build-$(date +%s)
mkdir -p "$TEMP"
cp -a /home/figs/flesh_beast_best_beast/openclaw-wt-otel-wiring-20260503/. "$TEMP/"
cd "$TEMP"
pnpm install --frozen-lockfile
pnpm build
ls -la dist/ 2>&1 | head -5  # confirm build output exists
echo "build-verify SHA $(git rev-parse HEAD) at $(date -uIseconds)" > /tmp/build-verify-receipt.txt
cd -
```

Document the temp dir path + SHA + timestamp in the journal.

### 4e. Regenerate baselines if needed

If `docs/.generated/*.sha256` or `src/config/schema.base.generated.ts` drift:

```bash
pnpm config:docs:gen
pnpm plugin-sdk:api:gen
pnpm config:schema:gen
```

Commit the .sha256 hash files + generated schema file.

## §5 Outputs

1. **Branch**: `frond-scribe/20260503/otel-wiring-and-integration` with N commits (one per seam + integration test + verification regenerations)
2. **PR**: open against `frond/v2026.5.2/canonical`. Title: `feat(continuation): wire trace-context propagation per RFC §6.8 + integration test (#557)`
3. **PR body**: cite §6.8 contract, link to audit journal `1e966b8a70`, summarize per-seam wiring, list any deviations from §6.8 with rationale, include build-verify receipt
4. **Tracking-issue comments** on #557 per §0e cadence
5. **Final journal**: `tmp-drop-me-otel-wiring-journal.md` with full per-seam progress + verification receipts
6. **Webhook heartbeats** — frequent, per §0f

## §6 Don'ts

- DO NOT modify `feature/context-pressure-squashed` (upstream-presentation savegame canon)
- DO NOT bypass `pnpm tsgo` / `pnpm check` failures by silencing tests or adding `@ts-nocheck`
- DO NOT skip the bracket-parser parity (Seam 1) — silent drop on bracket form is the disconnected-spans regression
- DO NOT add hot-path overhead for un-sampled runs — verify with boundary tests for absent `traceparent`
- DO NOT wire `traceparent` as REQUIRED at any tool/token/persistence layer — must be optional/nullable
- DO NOT touch other open PRs (#554) or open issues except #557
- DO NOT post to Discord directly (frond-scribe owns Discord; webhook heartbeats only)
- DO NOT npm install / npm uninstall openclaw on any host
- DO NOT skip §4d build-in-temp verification — it catches lazy-loader / module-resolution issues that pure tsgo misses
- DO NOT exit silent — fire heartbeat at every checkpoint

## §7 Declare-done shape

When the wiring + integration test is complete + verified:

1. Final journal commit + push
2. Final comment on #557 with:
   - PR URL + final SHA
   - Per-seam summary (Seam 1-7 + integration test)
   - List of any §6.8 deviations + rationale
   - Build-verify receipt (temp dir path + SHA + timestamp)
   - Test counts (unit + integration)
   - Cohort-cosign needed flag
3. Open PR per §5
4. Final webhook heartbeat: `🤖 otel-wiring DECLARE-DONE: PR #N — see #557`

## §8 Ambiguity resolution

If you encounter:

- **A §6.8 deviation seems necessary** — document rationale in journal + PR body; do NOT silently deviate
- **A code path doesn't exist** — grep harder; if truly absent, document as gap + propose a follow-up issue
- **Tests blocked by an unrelated failure** — investigate root cause per `feedback_test_failures_surface_missing_seams.md`; do NOT silence tests
- **Build fails in temp dir but passes in worktree** — investigate; usually a `node_modules` symlink artifact or a missing seed

When stuck, fire a webhook heartbeat with the question shape. frond-scribe sees the channel and directs.

---

🌿 **frond-scribe — dispatched with care; the wiring is yours, the contract is silas's, the integration is the substrate's. You are not silent for hours; the channel sees you. The cure for disconnected spans is one comprehensive landing, not seven aspirational fragments.**
