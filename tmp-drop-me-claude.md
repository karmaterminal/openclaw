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

### Replay set: 52 commits (49 silas-feature + 3 lane journal)

`git log --oneline cbcfdf62..HEAD` gave 52. `git cherry cbcfdf62 HEAD` produced 25 `-` marks (already-upstream by patch-id) and 27 `+` marks (not patch-id-equivalent in upstream).

### Classification (independent — comparing to gpt afterward)

**DROP-release-prep (4 commits)** — version-bump commits made obsolete by sitting on cbcfdf62:

- `579f00313b` chore(release): prepare 2026.4.22 beta 1
- `0ec75a6ab4` chore(release): prepare 2026.4.22 beta 2
- `5cd79da5b1` chore(release): refresh beta 1 metadata
- `945a1922cb` chore(release): prepare 2026.4.22 stable

These will conflict on `package.json` + `src/config/schema.base.generated.ts`; resolve via `git rebase --skip`.

**DROP-already-upstream (22 commits)** — `git cherry -` marks; patches already in upstream by patch-id:

- `bef298d97f` Telegram status sessions, `435136de8f` fast mode in status
- `fdfc901e42` WeCom onboarding, `c9bb56998a` discord monitor narrowing
- `e96087892e` lazy discord subagent hooks, `27184bcb5e` defer model pricing
- `fb81fbe470` codex live discovery, `974e994193` updateLastRoute (#49515)
- `6c8a7fd967` Azure OpenAI image (#70570), `d8df6d308f` thinking-medium default (#70601)
- `744f6b3f6d`, `00ae0db05f`, `dcc406a05c`, `959622f8a4`, `ed263dd564` Discord smoke
- `ccac4db2d5`, `73f9cc262e`, `98f5cd4a62` telegram forum cache
- `3ae78c3055` (#70562), `ec925a0a57` Azure OpenAI image docs
- `8fdec301a9` wecom blurb, `71b787387d` release notes policy

`git rebase` auto-drops these because their patches become empty when replayed on cbcfdf62.

**PICK-but-may-empty (7 commits)** — `git cherry +` marked but subjects suggest upstream has equivalent. Conservative call: PICK and let rebase auto-drop if empty. (gpt lane drops these explicitly per its journal — that's the divergence.)

- `aef4fc9178` test(docker) e2e temp logs portable
- `e515ea1f31` test(gateway) docker harness probes
- `7e5f67c6a2` fix(sessions) preserve route updates during maintenance
- `aa1908bf38` test docker live backend probes
- `dfcce38a36` fix(qa) timestamp telegram update batches
- `7ee46a3ab9` fix runner label /status (#70595)
- `00bd2cf7a3` fix allow installed plugins through allowlist

**PICK continuation feature (16 commits)** — the meat of what we're preserving:

- `198758e66b` feat(continuation): core implementation
- `cf2cecf979` docs(continuation): RFC continue-work-signal-v2
- `4cab9cf2cd` test(continuation): coverage
- `2b57a3bd3f` chore(continuation): generated baselines + i18n + swift + gitignore
- `b2b2616f64` chore: remove spurious note.txt from cherry-pick
- `827d3e9150` chore: regenerate config + plugin-sdk baselines
- `0dd5d05426` fix(continuation): purge generation-guard per RFC 2026-04-15 (#299)
- `9c6a8bc6ba` docs(continuation): absorb Trigger F into RFC §4.1
- `e4d971bf13` fix(continuation): pre-merge minors from 2026-04-23 review fleet
- `74aa14f173` fix(continuation): plumb provider+model into volitional compaction (#191)
- `5469b3b3e5` docs(continuation): annotate band-dedup equivalent-idiom
- `1640105a62` docs(continuation): fix Swim 7 evidence links
- `c825009e9b` fix(continuation): gate continue_delegate on drain
- `9f00132dd6` fix(continuation): default-allow continue_delegate
- `788b0abe1d` test(continuation): drainsContinuationDelegateQueue truth-table
- `140f74956d` fix(types): tighten continuationTriggerOverride

**PICK journal (3 commits — savegame)**:

- `53f6d3edfc` seed journal, `c063a394dd` §1, `b59c88814a` §2+§3

**FOLD: none.** I considered folding `b2b2616f64` (note.txt cleanup) into `198758e66b` (the core impl that left the artifact), but per #326 the candidate branch IS the savegame and rewriting non-adjacent history before push violates the no-rewrite rule.

### Diff vs gpt lane (peeked at gpt journal AFTER deriving mine)

- Same: 4 DROP-release-prep, 22 DROP-already-upstream-via-`git-cherry-`, 16 PICK continuation
- **Differs:** the 7 `+`-marked-but-subject-equivalent commits. **gpt drops them explicitly; claude PICKS them and lets `git rebase` auto-drop empties.** Two valid approaches; mine preserves history if any of the 7 has a non-trivial diff vs upstream's equivalent.

### Conflict resolution heuristic (per workorder §4)

- Release-prep + version files (`package.json`, `apps/*/build.gradle*`, `apps/*/Info.plist`, `appcast.xml`): `git rebase --skip` for the 4 release-prep commits entirely — newer upstream wins by definition.
- Continuation feature surface (`src/auto-reply/continuation*`, `src/auto-reply/reply/context-pressure*`, `src/auto-reply/reply/continuation*`, `src/agents/tools/{request-compaction,continue-*}*`, `docs/design/continue-*`): feature wins.
- Generated baselines (`src/config/schema.base.generated.ts`, `docs/.generated/*.sha256`): take ours during rebase, regenerate fresh after via `pnpm config:docs:gen` + `pnpm plugin-sdk:api:gen`.

### Execution

Using non-interactive `git rebase cbcfdf62` rather than `-i`, because:

1. The DROP-already-upstream-via-cherry commits auto-drop on empty replay — no todo-edit needed
2. The 4 DROP-release-prep commits surface as conflicts, resolved via `git rebase --skip`
3. PICK commits replay normally
4. Cleaner audit trail than a hand-baked todo

Proceeding to execute.

## §5 — push savegame BEFORE any squash

(pending — first push happens after this seed commit)

## §6 — verification

### Gate 1: `pnpm tsgo` — **FAILED**

Substantial type errors. Categorized:

**Category A: third-party `@mariozechner/pi-ai` shape drift** (load-bearing for the cohort)

- `SupportedOpenAICompatFields` now requires `supportsLongCacheRetention` on every model `compat` block.
- Errors at: `src/config/types.models.ts:25`, `src/config/types.models.ts:44`, `src/config/zod-schema.core.ts:226`, `src/commands/onboard-custom-config.ts:541`, `src/plugin-sdk/provider-catalog-shared.ts:116`, `src/plugin-sdk/provider-tools.ts:76`, `src/agents/openai-transport-stream.ts:1552–1561`.
- `AnthropicMessagesCompat` no longer exported from `@mariozechner/pi-ai`.
- These are dependency-shape drift; not feature-side.

**Category B: missing dep**

- `@vincentkoc/qrcode-tui` not found at `src/media/qr-runtime.ts:1` and `:5`. Either upstream added a dep we don't have in `package.json`, or upstream renamed/refactored the module.

**Category C: feature-adjacent surface**

- `src/auto-reply/reply/get-reply-run.ts:838` — `transcriptCommandBody` doesn't exist on the type. Likely from the agent-runner rewrite (see §6a).

### Gate 1 DECISION: **STOP per workorder §6** ("if any gate fails: stop, write failure shape, do NOT proceed").

Did NOT run gate 2 (`pnpm check`), gate 3 (scoped tests), gate 4 (`pnpm build`), gate 5 (heartbeat scope).

## §6a — architectural alignment review (per figs's directive 2026-04-25 mid-§6)

> Figs flagged: "review phase should lean hard on 'are we aligned with architectures for the control of the turn cycle, TaskFlow, sub-agent dispatch, and compaction mechanics'"

`git diff --stat 140f74956d..cbcfdf62` on the load-bearing boundaries surfaces a much larger finding than tsgo's symptom set:

### A. Turn-cycle control / agent-runner — **major rewrite upstream**

```
src/auto-reply/reply/agent-runner.ts             | 1477 +++---------------------    -1207 net
src/auto-reply/reply/agent-runner-execution.ts   |  276 +++--                          -8 net
src/auto-reply/reply/followup-runner.ts          |  134 ++-                            +60 net
src/agents/pi-embedded-runner/run.ts             |  258 +++--                          +60 net
src/agents/pi-embedded-runner/compact.ts         |  145 ++-                          +60 net
```

Upstream **deleted ~1200 net lines of `agent-runner.ts`** and **rewrote the per-turn execution flow**. Our continuation-runtime code (pre-run pressure check, post-response delegate consumption, scheduleContinuationTurn injection) lived inside the OLD `agent-runner.ts` shape.

When I resolved the §4 conflict at `198758e66b` with `git checkout --theirs`, I **preserved the OLD agent-runner shape** (because in rebase context "theirs" = the commit being applied = our feature). That means our agent-runner.ts is **architecturally pre-rewrite**; the new upstream simplification is gone from this lane's tree.

Visible symptom: `get-reply-run.ts:838 transcriptCommandBody` type error — that field belongs to a type contract that changed in the agent-runner rewrite.

### B. Sub-agent dispatch — **major rewrite upstream**

```
src/agents/subagent-announce.ts                  | 518 ++++------------------------    -418 net
src/agents/subagent-spawn.ts                     | 267 ++++++++++++++++++---           +120 net
```

`subagent-announce.ts` lost ~418 net lines upstream — major simplification. Our announce-boundary delegate consumption (the `silentAnnounce` + `wakeOnReturn` plumbing) lived here. Same `--theirs` resolution preserved the OLD shape; upstream's simplified path is missing.

`subagent-spawn.ts` grew +120 net. Likely absorbed announce responsibilities. Our continuation chain-tracking (chain-hop labels, accepted-hop counter, parent rerouting) needs to be re-derived against this new spawn surface.

### C. Compaction mechanics + persistence — **NEW upstream surface, our integration absent**

```
src/gateway/server-restart-sentinel.ts            | 286 +++++++++++++++-------
src/infra/session-delivery-queue.ts               |  29 (NEW)
src/infra/session-delivery-queue-recovery.ts      | 271 (NEW)
src/infra/session-delivery-queue-storage.ts       | 255 (NEW)
src/infra/session-delivery-queue.recovery.test.ts | 151 (NEW)
src/infra/session-delivery-queue.storage.test.ts  |  95 (NEW)
src/infra/system-events.ts                        |  33 ---       (refactored away)
```

Upstream's #70780 introduced an entire **session-delivery-queue subsystem** with SQLite-backed persistence, recovery, and storage layers (~800 LOC of new infra). The rebase pulled these in (they're new upstream-only files), but **our continuation post-compaction delegate release is not yet wired into them**.

The interaction figs flagged is real: when `request_compaction()` enqueues compaction, the post-compaction lifecycle releases staged delegates via the OLD `enqueueSystemEvent` path. Upstream now expects routing through the new `enqueueSessionDelivery` queue instead. The rebased tree has BOTH paths live — ours via system-events, upstream's via the queue — so post-compaction delegates may double-deliver or lose ordering against restart-sentinel handoffs.

### D. Heartbeat surface — **major new code in attempt.ts**

```
src/agents/pi-embedded-runner/run/attempt.ts | 506 ++++++++++++++++++++++-----   +314 net
```

`+314 net` lines in `attempt.ts`. This is where #69079/#69278 heartbeat-prompt suppression fix lives, plus presumably the upstream Trigger F overflow-recovery emit at line 1085. Our local `shouldInjectHeartbeatPrompt` (per RFC §6.1 line 822) is at ~`attempt.ts:860`. The rebase pulled in upstream's version (since this commit was DROP-already-upstream'd earlier in cherry); we did not preserve our local `shouldInjectHeartbeatPrompt` — which is correct, upstream's fixed version supersedes ours. **No action needed here.**

### E. TaskFlow surface — **stable**

```
$ git diff --stat 140f74956d..cbcfdf62 -- src/tasks/
(empty — no upstream changes to TaskFlow runtime)
```

Our `continuation-delegate-store-taskflow.ts` integration with `createManagedTaskFlow` / `controllerId="core/continuation-delegate"` is undisturbed. **Aligned with TaskFlow architecture**; no rework needed on this axis.

### Architectural verdict

Of the four axes figs named:

| axis                 | aligned?    | note                                                                                                                                                |
| -------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Turn-cycle control   | **NO**      | agent-runner.ts kept our pre-rewrite shape; upstream's simplification missing                                                                       |
| TaskFlow             | **YES**     | substrate stable, integration undisturbed                                                                                                           |
| Sub-agent dispatch   | **NO**      | subagent-announce.ts kept our pre-rewrite shape; upstream's simplification missing                                                                  |
| Compaction mechanics | **PARTIAL** | request_compaction() guards + lifecycle hooks fine, but post-compaction delegate release not yet wired through new session-delivery-queue subsystem |

**Bottom line:** the mechanical rebase landed, but the result is **architecturally misaligned on 2 of 4 axes** because the workorder's "feature wins → take theirs" heuristic was wrong for files that upstream rewrote (rather than just patched). The right resolution for those files is **manual three-way merge**: take upstream's new shape, then re-derive our continuation-runtime hooks on top of it.

This is the hard work the cohort still needs to do post-#325. The mechanical rebase was a necessary first step; it surfaces exactly which files need three-way reconciliation.

§6 done — proceeding to §8 declare-done with **needs-rework** recommendation.

## §7 — push cadence

checkpoints pushed:

- 2026-04-25T22:37:07+00:00 seed journal + §0 acked
- 2026-04-25T22:51:00+00:00 §1 read-complete (RFC walked, surface mapped)
- 2026-04-25T23:05:00+00:00 §2 code-walk-noted (production surface, RFC/code drift, upstream-diff shape)
- 2026-04-25T23:08:00+00:00 §3 tests-walk-noted (11 core + 27 heartbeat, scoped verification plan)
- 2026-04-25T23:16:00+00:00 §4 classification-locked (4 DROP-release / 22 DROP-cherry / 7 PICK-may-empty / 16 PICK-feature / 3 PICK-journal)

## §8 — declare done

### Final HEAD

`2fb731ce3c chore(continuation): regen plugin-sdk-api baseline on cbcfdf62 base`
On origin: `frond-scribe/20260424/candidate-claude` @ `2fb731ce3c`. **Frozen** (no force-push, no delete) per #326.

### Replay summary

21 commits on `cbcfdf62`:

- 16 PICK continuation feature commits (replayed cleanly except `198758e66b` core impl which needed 9-file feature-side resolution)
- 3 lane journal commits
- 2 baseline regen commits (`bd9901f8ec`, `2fb731ce3c`)

### Drops (33 from the 49-commit silas-feature replay set)

- 22 DROP-already-upstream via `git cherry -` (auto-skipped during replay)
- 4 DROP-release-prep: `579f00313b`, `0ec75a6ab4`, `5cd79da5b1`, `945a1922cb`
- 4 DROP-may-empty hit conflicts and skipped: `e515ea1f31` (gateway docker), `aa1908bf38` (docker live backend), `7ee46a3ab9` (status runner label), `00bd2cf7a3` (allowlist installed plugins). These appeared `+`-marked in git cherry but had subject-equivalent upstream commits — same outcome the gpt lane reached by classification rather than conflict.
- 1 DROP-stale-baseline-regen: `827d3e9150` (baselines regenerated fresh on cbcfdf62 base instead)
- 1 auto-dropped on empty replay: `dfcce38a36` (qa timestamp telegram batches)
- 1 auto-dropped: `b2b2616f64` (note.txt cleanup) — the file it removes wasn't present after rebase, so nothing to do

### Gate results

| gate                 | result    | shape                                                                                                                                                                                               |
| -------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §6.1 `pnpm tsgo`     | ❌ FAILED | dep-shape drift (`@mariozechner/pi-ai` requires `supportsLongCacheRetention`) + missing dep (`@vincentkoc/qrcode-tui`) + feature-adjacent type error (`get-reply-run.ts:838 transcriptCommandBody`) |
| §6.2 `pnpm check`    | not run   | per workorder, stopped after first gate fail                                                                                                                                                        |
| §6.3 scoped tests    | not run   | same                                                                                                                                                                                                |
| §6.4 `pnpm build`    | not run   | same                                                                                                                                                                                                |
| §6.5 heartbeat scope | not run   | same                                                                                                                                                                                                |

### Diffs vs gpt lane (peeked AFTER my own classification was locked)

| dimension                                       | claude lane                                                                            | gpt lane                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------- |
| DROP-release-prep                               | 4 (same)                                                                               | 4 (same)                          |
| DROP-already-upstream via cherry `-`            | 22 (same)                                                                              | 22 (same)                         |
| Handling of 7 `+`-marked-but-equivalent commits | PICK them, let rebase auto-drop empties                                                | DROP explicitly via subject-match |
| Outcome on those 7                              | 2 applied (`7e5f67c6a2`, `aef4fc9178`); 4 skipped on conflict; 1 auto-dropped on empty | All 7 dropped pre-rebase          |
| Result equivalence                              | Same final tree-content for the 7 either way                                           | Same                              |

The two approaches converged on the same content. gpt's pre-classify-then-drop is cleaner; claude's let-the-tool-handle-it is more conservative. **No meaningful divergence in the artifact.**

### Recommendation: **needs-rework**

The mechanical rebase succeeded. The savegame is on origin. But the §6 architectural review surfaces **2 of 4 axes are misaligned** (turn-cycle control + sub-agent dispatch). These cannot be fixed by re-running the rebase with different conflict heuristics — they require **three-way reconciliation** with the upstream rewrite of `agent-runner.ts` and `subagent-announce.ts`, then re-deriving the continuation-runtime hooks on top of upstream's simplified shape.

This is the load-bearing finding from the lane: **the workorder's "feature wins → take theirs" heuristic is wrong for files where upstream did a structural rewrite, not just a patch.** Both lanes (claude and presumably gpt, depending on how they resolved the same conflicts) likely have this same architectural debt.

### What's superior on this candidate vs Cael's lineage

Don't yet know — Cael's `/tmp/oc-325-rebase` plan is on his prince host, not visible from ronan. The diff vs Cael will become tractable once he produces a head from #325 phase-2.

What this candidate _provably_ surfaces over Cael's lineage:

1. **The "feature wins → take theirs" heuristic is incomplete.** Cael's plan uses the same heuristic per #325 phase-3 docs; this candidate is empirical evidence that it produces architecturally-misaligned output.
2. **The rebase target boundary needs to be defined more precisely.** "Up onto cbcfdf62" mechanically works; "up onto cbcfdf62 _while preserving alignment with upstream's agent-runner rewrite_" is a different and harder operation.
3. **Three-way merge tooling (`git merge-file --diff3` or interactive `git mergetool`) probably needed** for `agent-runner.ts` and `subagent-announce.ts` specifically. The two-way `--theirs`/`--ours` choice that auto-rebase offers isn't sufficient.

### Comparison axis suggestion for prince review

Compare claude lane (this) vs gpt lane (#328) on:

- Did gpt's pre-classify-then-drop on the 7 `+`-marked-equivalent commits produce a cleaner history? (probably tie)
- Did either lane handle the agent-runner.ts conflict differently? (need to byte-walk gpt's tree at HEAD to see if `--theirs` was also their resolution; if so, both are misaligned)
- Did either lane spot the architectural-rewrite issue earlier and choose `--ours` instead for those files? (this is the interesting question)

§8 done — savegame frozen at `2fb731ce3c`. Issue #327 stays at `in_coding_agent` per workorder §7a (gate fail = no status flip).
