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

Production-surface read complete. Per-file shape (~700 lines of production code total):

### Core continuation production files

| file                                                     | lines | shape                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/auto-reply/continuation-delegate.types.ts`          | 17    | `PendingContinuationDelegate` + `DelayedContinuationReservation` interfaces. Pure types.                                                                                                                                                                                                                                                                                                                                                        |
| `src/auto-reply/reply/continuation-state.runtime.ts`     | 10    | re-export barrel pointing at `continuation-state.js`. Lazy-init seam.                                                                                                                                                                                                                                                                                                                                                                           |
| `src/auto-reply/reply/continuation-runtime.ts`           | 89    | `resolveContinuationRuntimeConfig()` reads `agents.defaults.continuation` + clamps. Defaults: chain=10, delay=15s, cap=500k, fan-out=5. `taskFlowDelegates` defaults to `false` unless config explicitly sets `true`.                                                                                                                                                                                                                           |
| `src/auto-reply/reply/context-pressure.ts`               | 91    | `checkContextPressure()` — bands at threshold/90/95, dedup via `lastContextPressureBand` on `SessionEntry`, `?? 0` sentinel works because zod rejects `<0.005` so band=0 is unreachable. Logs `[context-pressure:fire]`, enqueues `[system:context-pressure]` system event.                                                                                                                                                                     |
| `src/auto-reply/reply/continuation-state.ts`             | 108   | Module-level state: `delegatePendingFlags`, `continuationGenerations`, timer-handle tracking with reference counting + `setTimeout(0)` async release after `clearTimeout` (avoids race with running cb).                                                                                                                                                                                                                                        |
| `src/auto-reply/continuation-delegate-store-taskflow.ts` | 144   | TaskFlow-backed store. `controllerId="core/continuation-delegate"`. Enqueue → `createManagedTaskFlow(status:"queued")`; consume → `finishFlow()` (terminal "succeeded" lifecycle, NOT delete); cancel → `requestFlowCancel` then `updateFlowRecordByIdExpectedRevision({status:"cancelled"})`. Collect-then-cleanup pattern: build delegates list before any mutation so partial-failures still return everything.                              |
| `src/auto-reply/continuation-delegate-store.ts`          | 209   | Front-of-house store. `setTaskFlowDelegatesEnabled(boolean)` flag-gates dispatch. Volatile `Map<string, PendingContinuationDelegate[]>` is fallback. Also owns delayed-reservation table (`DelayedContinuationReservation`) and post-compaction staging table (`stagedPostCompactionDelegates`).                                                                                                                                                |
| `src/agents/tools/request-compaction-tool.ts`            | 275   | Tool factory `createRequestCompactionTool(opts)`. Guards: dedup via `pendingCompactionSessions` Set, context floor 70%, rate-limit 5min via `createExpiringMapCache`. Fire-and-forget — `void opts.triggerCompaction().then(...)` runs in background; tool returns immediately with status `compaction_requested`. Increments `incrementVolitionalCompactionCount(sessionKey)` ONLY on `result.ok && result.compacted` (post-#191 honesty fix). |

### RFC/code drift to be aware of

- RFC §5.4 says TaskFlow backing is "unconditional, no opt-out." Code says `taskFlowDelegates` defaults to `false` unless config sets it to `true`. Not a bug for the rebase — both fleet profile YAMLs in RFC §5.2 set `taskFlowDelegates: true`. Just a doc/code wording gap.
- RFC §3.3 mentions a "Generation guard removed" HTML comment (2026-04-15). Code confirms: `request-compaction-tool.ts` line ~150 has a comment "No generation guard (removed 2026-04-15 RFC)". Watch for any commit in replay set that re-introduces generation-guard logic — DROP with prejudice if it appears.

### Upstream-side overlap — concrete diff shape

I was wrong in §1 saying `src/gateway/server-restart-sentinel.ts` was a new upstream module. It already exists on our base (`140f7495`, 14767 bytes). Upstream's #70780 changes it substantially:

```
src/gateway/server-restart-sentinel.test.ts   |  337 ++++++++++++++++++----------
src/gateway/server-restart-sentinel.ts        |  286 +++++++++++++++--------
                                                 414 insertions(+), 209 deletions(-)
```

The change pulls in **new modules** that don't exist on our base:

- `src/infra/session-delivery-queue.ts`
- `src/infra/session-delivery-queue-recovery.ts`
- `src/infra/session-delivery-queue-storage.ts`

These are #70780's "queue continuations to session-delivery before deleting restart sentinel" implementation. Our existing `src/gateway/server-restart-sentinel.ts` will gain imports from these. The rebase replay won't conflict with these (they're upstream-only adds, no overlap), but our continuation runtime needs to be re-verified post-rebase to ensure `[continuation:wake]` enqueueSystemEvent flow still composes with the new queue handoff path.

**Action for §4:** after rebase, re-grep for `enqueueSystemEvent` calls that touch `[continuation:wake]` and verify ordering vs the new `enqueueSessionDelivery` / `recoverPendingSessionDeliveries` plumbing.

### Heartbeat-prompt suppression overlap (#69079/#69278)

Did NOT byte-walk `src/agents/pi-embedded-runner/run/attempt.ts:860` shouldInjectHeartbeatPrompt yet. Marking for §4 in-rebase verification: if upstream's commit `27aae62d` lands cleanly via `git cherry`-marked DROP, no action needed; if conflict, take upstream's version (it's the documented fix for the RFC's HEARTBEAT_OK suppression bug).

§2 done — proceeding to §3 test walk.

## §3 — full walk of tests of concern

Test surface = 38 files. Shape grep'd via `^\s*(describe|it|test).*\(`:

### Core continuation tests (11 files, ~3300 lines)

| file                                           | lines | shape                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `continuation-delegate-store-taskflow.test.ts` | 431   | TaskFlow store: enqueue/consume/cancel, multi-delegate fan-out, session isolation, idempotent cancel, zero-delay handling                                                                                                                             |
| `continuation-delegate-store.test.ts`          | 347   | Volatile-store equivalents + `delayedContinuationReservations` lifecycle                                                                                                                                                                              |
| `context-pressure.test.ts`                     | 600   | All band crossings (threshold/90/95), dedup-within-band, escalation, threshold=undefined gates, zero-threshold behavior                                                                                                                               |
| `context-pressure.integration.test.ts`         | 161   | Phase-2 pre-drain ordering ("event in queue BEFORE drain"), band escalation 80→90→95, threshold=0.1 live-fire, disabled-config no-op                                                                                                                  |
| `continuation-runtime.test.ts`                 | 121   | Config clamping (invalid → defaults), threshold optional, `resolveMaxDelegatesPerTurn` accessor                                                                                                                                                       |
| `post-compaction-context.test.ts`              | 415   | `readPostCompactionContext()` extracts AGENTS.md sections (Session Startup, Red Lines), per-agent limit overrides, code-block exclusion, H3 matching                                                                                                  |
| `request-compaction-tool.test.ts`              | 386   | All guards: missing session, below-threshold reject, at-threshold accept, rate-limit reject + retry-after, generation-drift bypass (post-2026-04-15 RFC), fire-and-forget, error logging                                                              |
| `continuation-tools-registration.test.ts`      | 90    | `continue_delegate` exposure: enabled→shown, disabled→hidden, `drainsContinuationDelegateQueue` flag tri-state (undef/true/false)                                                                                                                     |
| `subagent-announce.continuation.test.ts`       | 361   | Chain-hop seeding, `[continuation:chain-hop:N]` propagation, silent-wake stickiness, maxChainLength rejection, costCapTokens enforcement, rerouting to live grandparent, **delayed-timer fires regardless of generation drift (post-RFC 2026-04-15)** |
| `zod-schema.continuation.test.ts`              | 139   | Schema validation: `contextPressureThreshold` accepts 0.005–1.0, rejects 0/-1/2.0/strings; `maxDelegatesPerTurn` integer-positive                                                                                                                     |

### Heartbeat tests (~27 files, mostly orthogonal to rebase)

The 25 heartbeat-_ files in `src/infra/` + `src/agents/heartbeat-system-prompt.test.ts` + `src/auto-reply/heartbeat_.test.ts` exercise heartbeat scheduler, runner, recipients, filter, events, ack semantics. None of them are in the continuation feature replay set — they either pre-exist on both base and upstream (DROP-already-upstream candidates) or were merged before the silas-branch tip.

Most likely interaction during rebase: the upstream HEARTBEAT_OK suppression fix (commit `27aae62d` from PR #69278 / fixes #69079) lands as a DROP-already-upstream cherry-mark via `git cherry`. If it's NOT cherry-marked, that's a signal we should pull it via FOLD.

### Verification plan for §6

When §6 fires, run scoped tests in priority order:

```
pnpm test src/auto-reply/continuation-delegate-store-taskflow.test.ts \
          src/auto-reply/continuation-delegate-store.test.ts \
          src/auto-reply/reply/context-pressure.test.ts \
          src/auto-reply/reply/context-pressure.integration.test.ts \
          src/auto-reply/reply/continuation-runtime.test.ts \
          src/auto-reply/reply/post-compaction-context.test.ts \
          src/agents/tools/request-compaction-tool.test.ts \
          src/agents/tools/continuation-tools-registration.test.ts \
          src/agents/subagent-announce.continuation.test.ts \
          src/config/zod-schema.continuation.test.ts
```

Then heartbeat scope:

```
pnpm test src/infra/heartbeat-runner.scheduler.test.ts \
          src/infra/heartbeat-runner.respects-ackmaxchars-heartbeat-acks.test.ts \
          src/agents/heartbeat-system-prompt.test.ts
```

(Full heartbeat suite is fine but the 3 above are the load-bearing ones for HEARTBEAT_OK suppression interaction.)

§3 done — proceeding to §4 rebase plan.

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
- 2026-04-25T23:05:00+00:00 §2 code-walk-noted (production surface, RFC/code drift, upstream-diff shape)
- 2026-04-25T23:08:00+00:00 §3 tests-walk-noted (11 core + 27 heartbeat, scoped verification plan)

## §8 — declare done

(pending)
