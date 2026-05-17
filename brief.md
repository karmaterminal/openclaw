# Workorder — Spiderweb tests for `releaseQueuedCompactionCompletion`

**Worktree**: `/tmp/silas-spiderweb-rqcc`
**Branch**: `silas/spiderweb/release-queued-compaction-completion-2026-05-17` (already created off `df502943c2` + will be pushed before dispatch)
**Base**: `df502943c2` (cure-(10) candidate of openclaw/openclaw#79925)
**Tracking issue**: filed pre-dispatch (number recorded in journal §1)
**Journal**: `tmp-drop-me-spiderweb-rqcc.md` at worktree root, committed + pushed at every checkpoint
**Outer budget**: 444m

---

## §0a — Remote-first push discipline

Push WIP at every checkpoint. The journal is the cohort's visibility surface, not a local-only diary. Do not wait to push "when done."

```bash
cd /tmp/silas-spiderweb-rqcc
git add tmp-drop-me-spiderweb-rqcc.md src/auto-reply/reply/agent-runner-execution.release-queued-compaction.test.ts
git commit -m "spiderweb-rqcc: <checkpoint label>"
git push origin silas/spiderweb/release-queued-compaction-completion-2026-05-17
```

## §0b — Heartbeat shape

Resolve webhook + post at every meaningful checkpoint:

```bash
WEBHOOK=$(gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/silas-likes-to-watch)
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"silas-spiderweb-rqcc-hook\",\"content\":\"🕸️ <one-line status>\"}" \
  "$WEBHOOK"
```

Heartbeat after: §1 RFC/code ingest done, §2 plan posted, §3 first test passing, §4 all 4 tests passing, §5 declare-done.

## §1 — Context (read first)

This lane closes **Gap-A** identified by silas's copilot-lane audit of PR #79925: `releaseQueuedCompactionCompletion` at `src/auto-reply/reply/agent-runner-execution.ts:149` (~78 lines, single call site L2152 reached via the `request_compaction` async-resolution path) has ZERO direct test coverage.

Cohort context:

- `agent-runner-execution.test.ts` exists adjacent and tests other paths in the host file — but does NOT reference `releaseQueuedCompactionCompletion`
- The function is guardrail-class: dispatches post-compaction delegates after a queued compaction completes. Failure here means compaction "succeeds" but no post-compaction delegate dispatch, no counter increment, silent regression
- Cure-(11) will bundle drift-rebase (3 conflict files, 1 careful interleave at L2525) + macos-swift cure (upstream cleaned the 8 violations between our parent `8dc213227b` and current `a00e494992`) + this spiderweb-firming
- This worktree is on `df502943c2` (cure-(10) base). The test additions will land here first; the rebase carries them forward to cure-(11)

## §2 — Plan

Write **T-1** (the merge-blocker recommendation from silas's copilot-lane synthesis):

**New test file**: `src/auto-reply/reply/agent-runner-execution.release-queued-compaction.test.ts`

Four branches of `releaseQueuedCompactionCompletion`, exhaustive at function-boundary:

1. **`compactionResult.ok=false`** → returns early, no counter increment, no dispatch, no throw
2. **`sessionKey` missing** → returns early with `logVerbose` "session-store-unavailable", no work
3. **`sessionEntry` resolves to undefined** (empty `activeSessionStore`) → returns early with `logVerbose` "session-entry-unavailable", no work
4. **Happy path** (`ok=true`, `compacted=true`, full params) → calls `incrementRunCompactionCount` once + `dispatchPostCompactionDelegates` once + `emitContinuationCompactionReleasedSpan` once, with expected args (compactionId threaded)

**Implementation guidance**:

- Mirror existing test-naming convention in `src/auto-reply/reply/*.test.ts`
- Use `vi.mock` for the three dynamic imports (`./session-run-accounting.js`, `./post-compaction-delegate-dispatch.js`, `../../infra/continuation-tracer.js`)
- Use `vi.spyOn` for `logVerbose` if needed (or accept silent verification of side-effect absence)
- Fake `compactionResult` shapes per `EmbeddedPiCompactResult` type
- Fake `followupRun`, `activeSessionStore`, `getActiveSessionEntry` per the function signature

**Skeleton (from copilot-lane T-1)**:

```ts
describe("releaseQueuedCompactionCompletion", () => {
  it("returns early when compactionResult.ok=false (no counter increment, no dispatch)", () => {
    // ARRANGE: fake compactionResult={ok:false, compacted:false}, spy incrementRunCompactionCount + dispatchPostCompactionDelegates
    // ACT: await releaseQueuedCompactionCompletion(params)
    // ASSERT: neither spy called; no throw
  });

  it("returns early with logVerbose when sessionKey missing", () => {
    // sessionKey=undefined
  });

  it("returns early when sessionEntry resolves to undefined", () => {
    // ARRANGE: empty activeSessionStore
  });

  it("on ok=true,compacted=true: increments compaction count AND dispatches post-compaction delegates", () => {
    // ARRANGE: full happy-path params, mocked imports
    // ACT
    // ASSERT: both incrementRunCompactionCount AND dispatchPostCompactionDelegates called once with expected args (compactionId threaded)
  });
});
```

## §3 — Pre-push gate set (DO NOT SKIP)

Before any push that touches code (not just journal commits), run the full 7-set per `RUNBOOKS/PRINCE-CODE-AGENT-RUNBOOK.md` §Pre-Push Gate Set:

```bash
cd /tmp/silas-spiderweb-rqcc
pnpm install --frozen-lockfile

# Gate 1: type-check core
pnpm tsgo:core

# Gate 2: type-check tests
pnpm tsgo:test

# Gate 3: type-check extensions
pnpm tsgo:extensions

# Gate 4: lint sharded
pnpm lint

# Gate 5: lint bundled extensions
pnpm lint:extensions:bundled

# Gate 6: extension boundary
pnpm test:extensions:package-boundary:compile

# Gate 7: runtime tests (32GB heap per TOOLS.md cure-N gates)
NODE_OPTIONS=--max-old-space-size=32768 pnpm exec vitest run src/auto-reply/reply/
# OR run the focused new test first:
NODE_OPTIONS=--max-old-space-size=32768 pnpm exec vitest run src/auto-reply/reply/agent-runner-execution.release-queued-compaction.test.ts
```

If any gate fails, fix or report DESIGN-BREAK in journal + heartbeat before pushing the code change.

## §4 — Scope guardrails

- **WILL touch**: `src/auto-reply/reply/agent-runner-execution.release-queued-compaction.test.ts` (new file only), `tmp-drop-me-spiderweb-rqcc.md` (journal), `brief.md` (this file, no edits expected)
- **WILL NOT touch**: `src/auto-reply/reply/agent-runner-execution.ts` (the function under test — no code changes), any other production code, any other tests, RFC, PR body
- **WILL NOT force-push** to candidate branches after first push (savegame discipline per runbook canon)

## §5 — Decision policy

- If the function signature has changed since `df502943c2` (it shouldn't have — base is fixed), abort + report
- If `vi.mock` of dynamic-imports turns out brittle (the function uses `await import(...)`), prefer dependency-injection refactor PROPOSAL in the journal (do NOT refactor without cohort sign-off — this lane is test-additions-only). Alternative: use `vi.doMock` or restructure mocks per existing patterns in the same directory
- If 4 branches grow to 5-6 because of edge cases the byte-walk surfaces, that's fine — name in journal, post heartbeat

## §6 — Non-override statement

This is the canonical spiderweb-firming lane for Gap-A. No sibling lanes exist as of dispatch time.

## §7 — Discoverability snippet

```bash
git show origin/silas/spiderweb/release-queued-compaction-completion-2026-05-17:tmp-drop-me-spiderweb-rqcc.md | tail -60
```

## §8 — Declare-done

When all 4 tests pass + gates 1-7 green:

1. Final commit + push
2. Heartbeat: `🕸️ DECLARE-DONE: T-1 spiderweb tests for releaseQueuedCompactionCompletion @ <SHA>`
3. Journal §8 entry: SHA, test-count, gate-receipts (paste pass/fail lines), open questions if any
4. Issue comment §8 mirror
5. EXIT cleanly. Do NOT continue to T-2 or T-3 (those are separate lanes / follow-up).
