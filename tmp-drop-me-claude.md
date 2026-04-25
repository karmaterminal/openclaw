# rebase candidate journal — claude

- worktree: `/home/figs/flesh_beast_best_beast/openclaw-wt-rebase-20260424-claude`
- branch: `frond-scribe/20260424/candidate-claude`
- base: `silas/rebase/v2026.4.22-feature` @ `140f7495`
- target: `cbcfdf62` (v2026.4.24)
- workorder: `/home/figs/flesh_beast_best_beast/WORKORDER-rebase-20260424.md`
- host: ronan
- started: 2026-04-25T22:37:07+00:00

## §0 — guardrails acked

- workshop tree confirmed: ✓ under flesh_beast_best_beast
- ronan-the-prince's tree (`/home/figs/flesh_beast_tmp/openclaw/`): off-limits
- candidate branch: push-only, no force-push, no delete after first push
- journal: this file, committed + pushed every checkpoint

## §1 — read first

**RFC** `docs/design/continue-work-signal-v2.md` (1277 lines, 90KB). Status: Implemented, ~180 tests across 13 test files. Upstream PR: openclaw/openclaw#38780.

### Feature shape (load-bearing for §2/§4 conflict resolution)

Three primitives, tools-first with response-token fallback:

| Capability             | Tool                   | Fallback                            | Purpose                             |
| ---------------------- | ---------------------- | ----------------------------------- | ----------------------------------- |
| Self-elected next turn | `continue_work()`      | `CONTINUE_WORK` / `CONTINUE_WORK:N` | Schedule another turn, same session |
| Delegated work         | `continue_delegate()`  | `[[CONTINUE_DELEGATE: ...]]`        | Sub-agent with chain semantics      |
| Volitional compaction  | `request_compaction()` | none                                | Agent-initiated compaction          |

Three-tier hierarchy: (1) tools enabled + available, (2) tools enabled but denied/unavailable → response tokens, (3) disabled.

Delegate return modes: `normal`, `silent`, `silent-wake`, `post-compaction`. The `silent-wake` mode uses `requestHeartbeatNow()` to wake parent without channel echo. `post-compaction` stages on session and releases after compaction completes.

### Implementation surface (anchors I expect to see in conflicts)

- `src/auto-reply/tokens.ts` — `parseContinuationSignal()`, `stripContinuationSignal()`
- `src/auto-reply/reply/agent-runner.ts` — pre-run pressure check + post-response delegate consumption
- `src/auto-reply/reply/agent-runner-execution.ts` + `followup-runner.ts` — provider/model thread to `compactEmbeddedPiSession` (openclaw#191)
- `src/auto-reply/reply/session-updates.ts` — `scheduleContinuationTurn()` injects `[continuation:wake]`
- `src/auto-reply/reply/context-pressure.ts` — pressure band detection + fire emission, `?? -1` band-dedup sentinel (openclaw#171/#172)
- `src/auto-reply/continuation-delegate-store-taskflow.{ts,test.ts}` — TaskFlow-backed delegate queue (THE substrate)
- `src/auto-reply/continuation-delegate-store.{ts,test.ts}` — in-memory store (legacy/runtime)
- `src/agents/tools/continue-work-tool.ts`, `continue-delegate-tool.ts`, `request-compaction-tool.ts`
- `src/agents/subagent-announce.ts` — announce-boundary delegate consumption with `silentAnnounce` + `wakeOnReturn`
- `src/agents/pi-embedded-runner/run.ts:1085` (overflow recovery), timeout-recovery a few hundred lines up — Trigger F emit points
- `src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts:96`, `run.timeout-triggered-compaction.test.ts:105` — anchor-format pins
- `src/agents/system-prompt.ts` — branches on tool availability (taught path)
- `src/auto-reply/status.ts` + `status.test.ts` — `/status` continuation telemetry render (openclaw#187)
- `src/gateway/server-restart-sentinel.ts` — **upstream-side, NEW from #70780.** Will need byte-walk to see overlap with our continuation-runtime restart-survival.

### Configuration surface (the zod schema is in `src/config/zod-schema.continuation.test.ts` territory)

```yaml
agents:
  defaults:
    continuation:
      enabled: false # ships disabled, opt-in
      maxChainLength: 10
      defaultDelayMs: 15000
      minDelayMs: 5000
      maxDelayMs: 300000
      costCapTokens: 500000
      maxDelegatesPerTurn: 5
      contextPressureThreshold: 0.8 # zod-constrained ≥ 0.005
      taskFlowDelegates: true # always on; no config option per RFC §5.4
```

Note: `generationGuardTolerance` was **removed** by design decision 2026-04-15. Several HTML-comment markers in the RFC track this. Watch for any commit in the replay set that tries to re-add it — that's a DROP/FOLD with prejudice.

### TaskFlow substrate — load-bearing

Per RFC §5.4: _"Pending delegates are backed by Task Flow (SQLite persistence) unconditionally. There is no opt-out — delegates must survive gateway restarts for the continuation lifecycle to work correctly, particularly for post-compaction delegate release."_

`enqueuePendingDelegate()` + `consumePendingDelegates()` use `createManagedTaskFlow()` with `controllerId = "core/continuation-delegate"`. This is the architectural reason silas-lineage was picked as base over canary — canary lacks `continuation-delegate-store-taskflow.{ts,test.ts}` (verified earlier today via `git cat-file -e`).

### Upstream-side overlap to byte-walk in §4

- `cbcfdf62:src/gateway/server-restart-sentinel.ts` — upstream's restart-continuation queue from #70780. Hand-off happens before sentinel deletion; falls back to session-only wake if no channel route survives reboot. Need to verify our continuation-runtime + post-compaction delegate release composes cleanly with it.
- Heartbeat suppression fix #69079/#69278 (commit `27aae62d`): upstream now stops injecting heartbeat system prompt into non-heartbeat runs. Our local `shouldInjectHeartbeatPrompt` in `pi-embedded-runner/run/attempt.ts:860` may converge or conflict.
- Compaction `keepRecentTokens` (#71357) honored on manual `/compact`; safeguard summaries re-distill instead of snowballing. Adjacent to `request_compaction()` semantics.

### #325 + #326 + Cael's plan accessibility

- #325 phase-0 LOCKED: base = `silas/rebase/v2026.4.22-feature` `140f7495`, target = `cbcfdf62`. Phase-1 in flight (Cael).
- #326 savegame discipline: this candidate branch `frond-scribe/20260424/candidate-claude` IS the savegame for this lane (no force-push after first push, no delete).
- Cael's plan at `/tmp/oc-325-rebase/rebase-plan.txt` not accessible from ronan (his worktree is on his prince host). Will derive own classification in §4; compare via #327 + #325 comments after lane completes.

§1 done — proceeding to §2 code walk.

## §2 — full code walk

(pending)

## §3 — full walk of tests of concern

(pending)

## §4 — perform the rebase

(pending)

## §5 — push savegame BEFORE any squash

(pending — first push happens after this seed commit)

## §6 — verification

(pending)

## §7 — push cadence

checkpoints pushed:

- 2026-04-25T22:37:07+00:00 seed journal + §0 acked
- 2026-04-25T22:51:00+00:00 §1 read-complete (RFC walked, surface mapped)

## §8 — declare done

(pending)
