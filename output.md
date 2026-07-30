# Upstream-drift cartography — continuation assembly vs `upstream/main`

Lane `1172-drift-cartography-opus5-r2` (Ronan seat, resumed after the Silas reboot).
Read-only. No product-code edit, no merge, no rebase, no shared-branch write.

Tracking: karmaterminal/openclaw#1197, #1198 · openclaw/openclaw#85651 · karmaterminal Project 85

**Verdict: ABSORB-TRACTABLE.**

---

## 1. Frozen bytes

All four objects were verified to resolve as commits in this worktree before any analysis.

| Role | SHA | Notes |
| --- | --- | --- |
| Assembly (continuation) | `16f4b3f106033f7fe75f68e67563db1b5b4d0e2f` | lane HEAD, `codeagent/1172-drift-cartography-opus5-r2` |
| Protected presentation | `d8b08c9c0a1f425f4cfff1b21bff4852deff823f` | strict ancestor of assembly |
| Upstream candidate | `cc48aef143551af2ce13096264335ce9954e61e6` | frozen `upstream/main` |
| Merge base (assembly ↔ upstream) | `20eda756fae6599bc9d776815016f555a64d77d6` | `git merge-base` confirmed |

Remotes: `origin` → `karmaterminal/openclaw`, `upstream` → `openclaw/openclaw`.

### 1.1 Ancestry correction (carried forward — the inherited framing was wrong here)

The workorder's "merge base `20eda756`" is `merge-base(assembly, upstream)`. It is an
ancestor of the assembly but **not** of the protected presentation:

```
merge-base(assembly, upstream)     = 20eda756…   (MB_AU)
merge-base(presentation, upstream) = f0d4d4f2fccda02915cfa9d467e660f82ff9bb1d  (MB_PU)
presentation is ancestor of assembly : YES        (assembly..presentation = 0 commits)
MB_AU is ancestor of presentation    : NO
```

The presentation forked from an **older** upstream vintage. Consequently
`diff(20eda756, presentation)` is meaningless — it reports 22,427 paths, which is pure
upstream-vintage skew, not fork content. Any future lane that reuses that number will
draw a false "presentation is enormous" conclusion.

Correct baselines, all reproduced this run:

| Delta | Command | Paths | Breakdown |
| --- | --- | --- | --- |
| Presentation fork delta | `diff MB_PU..presentation` | **368** | 237 M / 131 A |
| Assembly fork delta | `diff MB_AU..assembly` | **658** | 422 M / 236 A |
| Upstream drift | `diff MB_AU..upstream` | **4,806** | 4,122 M / 626 A / 48 D / 10 R |

`MB_AU..assembly` = 1,034 commits · `MB_AU..upstream` = 944 commits · `MB_AU..presentation` = 636 commits.

The 368 figure reproduces the pre-reboot console exactly, and 658 / 944 reproduce the
workorder. Upstream drift is 4,806 paths (workorder said "approximately 4,816").

---

## 2. Recovery provenance

Original lane: Silas `1172-drift-cartography-opus5`. The Silas boot ended abruptly at
2026-07-29 21:06:44 PDT with no orderly shutdown record; reboot began 21:07:55. The lane
tmux was lost; the product worktree survived byte-clean.

Three immediately preceding native Node crashes were all GitNexus `analyze`
(PIDs 1814932, 1815545, 1816050; SIGSEGV in/near `tree-sitter-typescript.node`).
**No GitNexus indexing was run on Silas by this lane, and none was run anywhere by me.**

Preserved artifacts, hashes verified byte-for-byte against the workorder at lane start:

| Artifact | sha256 | Status |
| --- | --- | --- |
| `silas-1172-cartography-pre-reboot-console.log` | `6351d1c65a4b8ac632a7a6d5307bee915d812599386c12f7d8032f04f1660a26` | MATCH |
| `semantic-drift-silas-recovery.mjs` | `a82555bac34ebf010849cf361ad6d82848e932eff7676adc2f853461d43b7290` | MATCH |

Both were read in full before any new work. The lost `/tmp/drift1172` inventories were
recreated from git alone (no reuse of unverifiable state).

---

## 3. GitNexus graph receipt

Substrate (indexed **before** this process launched, on this Ronan seat):

```
repo    : WORKTREES/openclaw-1172-cartography-r2-gnx-scope
commit  : 16f4b3f106033f7fe75f68e67563db1b5b4d0e2f   (exact assembly)
status  : up-to-date
scope   : src/{agents,auto-reply,channels,commands,gateway,infra,plugin-sdk,status}
receipt : 7,997 files · 204,989 symbols · 372,334 edges · 6,234 clusters · 300 flows
```

Sparse scope, indexed commit, and every receipt number were re-verified this run via
`gitnexus list` / `gitnexus status` and match the workorder exactly. (The workorder's
"204,989 nodes" is the CLI's `symbols` count.)

**TROUBLE (reported, non-blocking, mitigated):** GitNexus **MCP tools are not exposed in
this Copilot process's tool surface**, so `detect_changes` / `context` / `impact` could
not be called over MCP. The graph itself is healthy. Mitigation used, per the workorder's
fallback clause: the source CLI's **read-only** commands
(`status`, `impact`, `context`, `query`) against the existing index, addressed with
`--repo <abs-path>` because 28 repos share the name `openclaw` in the registry.
No `analyze`, no re-index, nothing executed on Silas.

---

## 4. Conflict surface (dry `merge-tree`, replayed)

`git merge-tree --write-tree --messages --name-only <assembly> <upstream>` → exit 1,
**61 conflicted files**, and the type histogram is the headline result:

```
61  CONFLICT (content)
 0  CONFLICT (modify/delete)
 0  CONFLICT (rename/rename)
 0  CONFLICT (rename/delete)
 0  CONFLICT (add/add)
```

There is **no structural conflict at all** — nothing where git cannot even identify a
common ancestor for the region. Every conflict is line-level.

* **42** are Android `values-*/strings.xml` i18n churn (translation-only).
* **19** are code / generated / test.

All 19 code conflicts fall **inside** the 194-path fork↔upstream intersection, so the
intersection set is a complete predictor of the code conflict surface.

### 4.1 The 19 code conflicts, ranked by resolution difficulty

Churn is `added+deleted` lines since `MB_AU` on each side.

| # | Path | Fork churn | Upstream churn | Character |
| --- | --- | --- | --- | --- |
| 1 | `src/infra/heartbeat-wake.ts` | 120+1 | **242+122** | **Hardest.** Both sides restructure the same scheduler. |
| 2 | `src/agents/command/attempt-execution.ts` | **501+152** | 77+42 | Fork-dominant rewrite vs upstream refinement. |
| 3 | `src/agents/embedded-agent-subscribe.ts` | **324+33** | 52+20 | Fork-dominant; upstream reshapes attachment/payload path. |
| 4 | `packages/agent-core/src/agent-loop.ts` | 318+0 | 200+39 | Co-additive, orthogonal concerns. |
| 5 | `src/agents/subagent-registry.persistence.test.ts` | 101+167 | 13+5 | Test ownership split. |
| 6 | `src/agents/subagent-spawn.ts` | 94+68 | 13+46 | Both touch spawn lifecycle. |
| 7 | `src/agents/command/attempt-execution.cli.test.ts` | 91+2 | 102+1 | Balanced test churn. |
| 8 | `src/agents/embedded-agent-subscribe.before-terminal-delivery.test.ts` | 69+1 | 26+0 | Fork-dominant test. |
| 9 | `src/agents/embedded-agent-subscribe.handlers.ts` | 65+21 | 13+11 | Fork-dominant. |
| 10 | `extensions/signal/src/monitor/event-handler.ts` | 49+64 | 71+46 | Balanced; **not** a continuation surface. |
| 11 | `src/agents/embedded-agent-runner/cli-backend-dispatch-transcript.test.ts` | 40+0 | 24+0 | Additive both sides. |
| 12 | `src/status/status-text.ts` | 28+35 | 1+6 | Fork-dominant; take fork, re-apply 7 upstream lines. |
| 13 | `src/agents/openclaw-tools.ts` | 26+139 | 38+39 | Fork **extracted** 139 lines out; upstream added options. |
| 14 | `extensions/codex/src/app-server/dynamic-tools.ts` | 15+7 | 33+2 | Upstream-dominant. |
| 15 | `scripts/plugin-sdk-surface-report.mjs` | 11+5 | 20+4 | Tooling. |
| 16 | `extensions/codex/src/app-server/run-attempt.turn-watches.test.ts` | 9+0 | 77+40 | Upstream-dominant test. |
| 17 | `docs/.generated/plugin-sdk-api-baseline.sha256` | 7+7 | 12+12 | **Generated — regenerate, never merge.** |
| 18 | `src/gateway/server-methods/chat-send-dispatch-errors.ts` | 4+0 | 116+44 | Upstream-dominant; re-apply 4 fork lines. |
| 19 | `src/auto-reply/reply/agent-runner-session-reset.ts` | 4+0 | 2+9 | Trivial. |

#### Conflict #1 in detail — the one genuine architectural collision

`src/infra/heartbeat-wake.ts` is the only file where both sides restructure the **same**
decision surface, and it sits directly on the continuation queue/drain feature.

*Upstream* rewrote the wake scheduler: `takePendingWakeBatch()` changed signature and
return type (`PendingWakeReason[]` → `takePendingWakeBatch(maxGroups, now)` →
`ReadyWakeGroup[]`), added a concurrency cap (`MAX_CONCURRENT_HEARTBEAT_WAKE_TARGETS = 4`),
an `activeWakeTargets` map, per-target `AbortController`s, and an `AsyncLocalStorage`
carrying the abort signal (`getHeartbeatWakeAbortSignal()`).

*Fork* added trusted-continuation routing: a `TRUSTED_CONTINUATION_ROUTING_MARKER` symbol,
`markTrustedContinuationHeartbeatWake` / `hasTrustedContinuationHeartbeatWake`, and —
critically — **replaced the coalescing key function** `getWakeTargetBaseKey` with
`getWakeCoalesceKey`, which partitions the key by a `trustDomain` so trusted continuation
wakes never coalesce into default wakes.

Both edits land on the coalescing/batching core. The fork's contribution is a *key
partition*; upstream's is a *batching and cancellation rework*. They are compatible in
principle — the trust-domain partition must be re-expressed on top of upstream's
ready-group model rather than upstream's old flat-batch model — but this is the one place
where a naive "take one side" resolution silently destroys a security-relevant invariant
(trusted continuation wakes must not share a coalescing bucket with untrusted ones).

---

## 5. Semantic collisions (clean-merge, invisible to conflict counting)

### 5.1 A defect in the preserved analyzer, found and fixed

`semantic-drift-silas-recovery.mjs` parses exports with `/export\s*\{([\s\S]*?)\}/g`.
That regex **cannot match `export type { … }`**, so pure type re-export barrels are
misreported as removals. This produced three bogus "upstream removed" findings on
`extensions/codex/src/app-server/protocol.ts` (`CodexPluginDetail`,
`CodexPluginListResponse`, `CodexPluginReadResponse`), which upstream merely **relocated**
to `protocol-control-plane.ts` and re-exports via `export type { … }`.

I wrote a corrected parser (handles `export type { … }` and `export type * from`) plus a
merge-base discriminator, and re-ran. Any future lane reusing the preserved analyzer
should apply the same fix first.

### 5.2 Module-level results (600 files, 6,256 in-repo imports resolved)

| Classification | Count | Meaning |
| --- | --- | --- |
| Fork-added target module | **674** (90 distinct) | Expected — the fork's own new modules are absent upstream. |
| Upstream **renamed** target | **2** | `src/commands/status.types.ts` → `src/status/types.ts` |
| Upstream **deleted** target | **0** | No upstream deletion breaks a fork import. |
| Unknown / unexplained | **0** | Full classification coverage. |

### 5.3 Symbol-level results

| Classification | Count | Meaning |
| --- | --- | --- |
| False positive (`export type` re-export) | 3 | Analyzer defect above. |
| **Fork-added exports on upstream-owned modules** | **181** across **42 modules** | Must survive the absorb. |
| Candidate upstream removals | 7 across 4 modules | **All four falsified — see §5.5.** |

The 181 fork-added exports concentrate in `src/agents` (16 modules), `src/infra` (10),
`src/auto-reply` (4), `src/config` (2), then singletons in
`extensions/diagnostics-otel`, `src/{tasks,commands,gateway,plugin-sdk,shared,status}`,
`extensions/{codex,matrix}`, and one build script. These are the fork's *export-surface
extensions of upstream-owned files* and are exactly what a "take upstream's file"
resolution would silently delete.

### 5.4 Blast radius (GitNexus `impact`, depth 2, tests included)

30 continuation symbols were probed against the scoped graph. Highest-risk first:

| Symbol | File | Impacted | Risk | Processes | Modules |
| --- | --- | --- | --- | --- | --- |
| `loadDeliveryQueueEntryResults` | `src/infra/delivery-queue-sqlite.ts` | 17 | **HIGH** | 0 | Infra 5 · Outbound 1 · Continuation 1 |
| `buildContinuationSessionPatch` | `src/agents/subagent-announce.runtime.ts` | 9 | **HIGH** | **2** | Agents 4 · Continuation 2 · Reply 1 |
| `persistInitialChildRuntimeState` | `src/agents/subagent-announce.runtime.ts` | 9 | **HIGH** | **2** | Agents 4 · Continuation 2 · Reply 1 |
| `replaceManagedDelegateReturnInPrompt` | `src/agents/internal-events.ts` | 5 | **HIGH** | 0 | Agents 2 · Infra 1 · Reply 1 |
| `resolveHeartbeatContinuationTrigger` | `src/infra/heartbeat-wake-policy.ts` | 27 | LOW | 0 | Infra 13 |
| `prepareFormattedSystemEvents` | `src/auto-reply/reply/session-system-events.ts` | 12 | LOW | 0 | Infra 3 · Reply 3 |
| `validateSubagentAttachments` | `src/agents/subagent-attachments.ts` | 7 | LOW | **2** | Continuation 6 · Tools 1 |
| `sanitizeTranscriptToolCallBlock` | `src/agents/tool-call-shared.ts` | 7 | LOW | 0 | Agents 5 · Embedded-agent-runner 1 |
| `attachManagedOutgoingImagesToMessage` | `src/gateway/managed-image-attachments.ts` | 6 | LOW | 1 | Server-methods 5 · Gateway 1 |
| `formatContinuationBannerValue` | `src/commands/status.command-report-data.ts` | 4 | LOW | 0 | Commands 2 |
| `formatStatusTextContinuationLine` | `src/status/status-continuation-line.ts` | 6 | LOW | 0 | Status 3 · Reply 1 |

Reads confirm a distinct **`Continuation` module cluster** exists in the graph and that
the durable-handoff path (`subagent-announce.runtime.ts`) is the only continuation surface
touching **two process flows** at once — the highest structural coupling in the feature.

### 5.5 Falsification: all four candidate removals are **not** real

This is the most important correction in this report.

I validated the four "confirmed upstream removals" against the **actual merged tree**
(see §7). Every one self-resolves:

| Candidate | Predicted | Actual on merged tree |
| --- | --- | --- |
| `date-time.ts :: ResolvedTimeFormat` | fork's two `system-prompt` importers break | Type is module-private **and** the importers no longer reference it — upstream changed definition *and* consumers in one coordinated commit; auto-merge stayed consistent. |
| `agent-runner-cli-dispatch.ts :: clearDroppedCliSessionBinding` | fork's `agent-runner-cli-candidate.ts` breaks | Symbol **and** its caller are gone from the merged tree. No dangling reference. |
| `managed-image-attachments.ts :: attachManagedOutgoingImagesToMessage` | 2 gateway finalization callers break | Upstream generalized images→media; merged tree correctly uses `attachManagedOutgoingMediaToMessage` at every call site. |
| `vitest.agents-paths.mjs :: agentsCoreIsolatedTestFiles` | 2 importers break | Export and both importers removed together. |

**Methodological conclusion, and the single most reusable output of this lane:**
static *assembly-vs-upstream* symbol comparison **systematically over-predicts breakage**,
because it cannot see that upstream removed a definition and its consumers in the same
change. It identifies the correct *risk class* (silent auto-merge symbol drift — which is
real, see §7) but its individual candidates are unreliable. **The only sound oracle is the
merged tree.** Future drift lanes should treat the static pass as a *hypothesis generator*
and gate every hypothesis on a merged-tree check.

---

## 6. Beneficial upstream introductions the absorb lane should adopt

Priority 2 in the workorder ("adopt beneficial upstream introductions and replacement
abstractions"). Ranked by relevance to the continuation feature.

**Replacement abstractions — adopt upstream's spelling, do not fight the rename:**

1. `attachManagedOutgoingImagesToMessage` → **`attachManagedOutgoingMediaToMessage`**.
   Images generalized to media; strictly more capable.
2. private `findLatestRunForChildSession` → exported
   **`getLatestSubagentRunByChildSessionKeyFromRuns`**. Upstream promoted the fork's
   need into a public query — better boundary than the fork's local revival.
3. Compaction reason code `already_compacted_recently` → **`already_compacted`**.
4. `src/commands/status.{summary,types,link-channel,summary.runtime}` → **`src/status/*`**.
5. `src/commands/channel-account-context.ts` → **`src/channels/account-context.ts`**.
6. `src/commands/health.types.ts` → **`src/gateway/health/types.ts`**.
7. `src/plugin-sdk/test-helpers/agents/session-manager-file-compat.ts` →
   **`…/session-manager-file-fixture.ts`**.

**New upstream capability that overlaps continuation concerns — adopt, then re-express
the fork's invariant on top:**

8. **`src/agents/embedded-agent-runner/run/turn-taint-state.ts`** (+ `agent-loop`'s
   `TurnTaintMetadata`, `toolResultTaintsTurn`, `withAssistantTurnTaint`,
   `withToolResultContentSource`, `finalizeToolCallOutcome`). Upstream now tracks whether
   a turn is tainted by tool output — directly relevant to trusted delegate-task echo
   sanitization.
9. **`embedded-agent-subscribe.ts` attachment trust map** (`trustedByUrl`, `indexByUrl`,
   uniform `taggedPayload` replacing the ad-hoc deferred payload). Upstream independently
   built per-attachment trust tracking, which overlaps the fork's structured
   return/attachment trust work. This is a *convergent* design — prefer upstream's
   uniform payload and layer the fork's trust semantics onto it.
10. **`chat-send-dispatch-errors.ts` abort-marker-aware terminal persistence ownership**
    (`agentTerminalPersistenceOwnedAtDispatchReject`, `chatAbortMarkerTimestampMs`,
    `shouldPersistUserTurn`, `releaseAbortTranscriptRoot`). Directly on the
    gateway/session boundary the continuation feature depends on; the fork only has 4
    lines here, so adopt upstream wholesale.
11. **`src/agents/embedded-agent-helpers/context-overflow.ts`** and upstream's new
    `run/overflow-context-recovery.test.ts` — upstream added *test coverage for a file the
    fork modified* (`overflow-context-recovery.ts`: fork 21+0, upstream 9+2, from
    "make overflow recovery append-only via branch-and-reappend" #115271/#115310).
    Free regression protection for a compaction-adjacent fork change.
12. `heartbeat-wake` concurrency cap + `AbortSignal` propagation
    (`getHeartbeatWakeAbortSignal`, `MAX_CONCURRENT_HEARTBEAT_WAKE_TARGETS`) — see §4.1.
13. `openclaw-tools` `webSearchEnabled` option; `subagent-spawn`
    `cleanupProvisionalSession` and `collectorSessionKey` unification; awaitable terminal
    `scheduleEvent` contract in `embedded-agent-subscribe.handlers`.
14. Broader upstream additions worth inheriting for free:
    `run/attempt-prompt-tool-policy.ts`, `run/code-mode-repair.ts`,
    `cli-runner/cli-backend-auth-policy.ts`, `sticky-model-selection.ts`,
    `tool-surface-plan.ts`, `model-catalog-order.ts`, `compaction.failure-proof.test.ts`.

---

## 7. Cross-check: the Cael absorb lane (read-only, not steered)

`origin/codeagent/1172-upstream-absorb-opus5`, tip **`9510a3797d6e33743e956acd6f7892ab4483850b`**
(2026-07-29 21:28:01 PDT, author `cael-dandelion-cult`).

* Contains assembly `16f4b3f1`: **yes**. Contains upstream `cc48aef1`: **yes**.
* Merge commit **`9ed7fd20b49ad18e4a99cb299b3ecfc9926cf857`** — "absorb upstream cc48aef
  into continuation assembly". Topology preserved: no rebase, squash, cherry-pick, or
  force-push. Its message independently reports the same 944 commits / 4,806 paths /
  merge-base `20eda756` / 61 conflicts that this lane derived independently.
* Tip commit is literally *"retarget continuation code onto upstream's renamed surfaces"* —
  independent convergence with this lane's §5 risk class.

Their seven reconciled silent auto-merges: `subagent-registry-queries` rename,
`compact-reasons` code rename, signal `event-handler` `node:timers/promises` sleep import,
`attempt-stream-prepare` test port onto the grouped `subscriptionToolTrust` shape,
`subagent-registry` duplicate resume-guard test, `chat-send` dispatch-error fixtures
(`markTerminalBroadcasted`), and two test-file union boundaries.

Their receipt: `tsgo` full project **226 errors → 3**, with the remaining 3 reproducing on
the frozen assembly base (all four typecheck inputs byte-identical to `16f4b3f1`) — i.e.
inherited, not absorb fallout.

### 7.1 Independent instrument corroboration

I re-pointed the **corrected** analyzer at their merged tree and at the frozen assembly as
a baseline, over the identical 600-file fork-owned surface:

| Tree | In-repo imports | Unresolved module | Missing symbol |
| --- | --- | --- | --- |
| Assembly `16f4b3f1` | 5,458 | 120 | 33 |
| Merged `9510a379` | 5,506 | 120 | 33 |
| **Delta introduced by the merge** | +48 | **0** | **0** |

**Zero** new unresolved modules and **zero** new missing symbols. The residual 120/33 are
my resolver's own limits, identical on both trees and therefore not absorb fallout:
96 of the 120 are `@openclaw/normalization-core` workspace **subpath exports** my naive
`packages/<pkg>/…` mapping does not model, and 23 of the 33 come from one test-helper file
where the regex mistakes destructured locals for imports (it "misses" a symbol literally
named `null`).

This corroborates Cael's `tsgo` receipt from a completely independent instrument, and is
the strongest single piece of evidence behind the verdict.

---

## 8. Feature invariants at risk

Ordered by "what breaks silently if the wrong side wins".

1. **Trusted-continuation wake isolation** — `getWakeCoalesceKey`'s `trustDomain`
   partition in `heartbeat-wake.ts`. If upstream's scheduler is taken wholesale, trusted
   continuation wakes silently re-enter the default coalescing bucket. Security-relevant,
   and the hardest conflict. *Highest risk in the whole absorb.*
2. **Post-compaction staged delivery** — `enqueuePostCompactionDelegateDelivery`,
   `buildPostCompactionDelegateDeliveryPayload`, `ackSessionDelivery`,
   `pruneFailedOlderThan` are fork-added exports on the upstream-owned
   `session-delivery-queue-storage.ts`; `loadDeliveryQueueEntryResults` is HIGH-impact
   (17 symbols, 3 modules).
3. **Durable handoff / depth accounting** — `buildContinuationSessionPatch` and
   `persistInitialChildRuntimeState` are the only continuation symbols touching **two**
   process flows each. Also the site of the assembly's most recent fixes
   ("charge post-compaction depth only for accepted children",
   "enforce the stale TTL when post-compaction work is released").
4. **Trusted delegate-task echo sanitization** — `sanitizeTranscriptToolCallBlock`,
   `isTranscriptToolCallBlock`, `isCoreToolResultMediaTrustedName`,
   `replaceManagedDelegateReturnInPrompt` (HIGH, 3 modules). Collides conceptually with
   upstream's new turn-taint and attachment-trust work (§6.8–6.9) — convergent designs
   that must be reconciled deliberately, not merged blindly.
5. **Structured return / attachments** — `validateSubagentAttachments` (2 process flows),
   against upstream's reshaped `embedded-agent-subscribe.ts` attachment pipeline.
6. **Seven-day TTL / run liveness** — `STALE_UNENDED_SUBAGENT_RUN_MS`,
   `classifySubagentRunLiveness`, `hasLiveContinuationDelegateChildRun`.
7. **Status-row rendering** — `formatStatusTextContinuationLine`,
   `formatContinuationBannerValue`, plus the `src/commands/status.* → src/status/*`
   relocation. Low blast radius (LOW risk, ≤6 impacted) but this is the surface the
   assembly is named for.
8. **Continuation queue/drain** — `resolveHeartbeatContinuationTrigger` has the widest
   footprint measured (27 impacted symbols) though all within Infra.
9. **Gateway/session boundaries** — `broadcastChatAborted`, and upstream's substantially
   rewritten `chat-send-dispatch-errors.ts` (116+/44- vs the fork's 4 lines).
10. **TaskFlow durable handoff** — `listTaskFlowsForOwnerKey` in
    `src/tasks/task-flow-runtime-internal.ts`. **Not covered by the graph** (see §11).

---

## 9. Ordered absorb recommendations

The merge itself is already done on the Cael lane; this ordering is what a *re-derivation
or review* of that absorb should follow, and it matches the priority order in the
workorder (protect continuation → adopt upstream introductions → follow upstream elsewhere).

1. **Regenerate, never merge, generated artifacts.**
   `docs/.generated/plugin-sdk-api-baseline.sha256` must be rebuilt from the merged tree;
   a textual resolution there is meaningless. Same for anything
   `scripts/plugin-sdk-surface-report.mjs` emits.
2. **Take upstream wholesale where the fork is incidental.**
   `chat-send-dispatch-errors.ts` (4 fork lines vs 160 upstream),
   `agent-runner-session-reset.ts` (4 vs 11),
   `codex/run-attempt.turn-watches.test.ts` (9 vs 117),
   `codex/dynamic-tools.ts` (22 vs 35). Re-apply the fork's few lines afterward.
3. **Take fork wholesale where upstream is incidental.**
   `status-text.ts` (63 fork vs 7 upstream),
   `embedded-agent-subscribe.handlers.ts`, `attempt-execution.ts` — then re-apply
   upstream's small edits on top.
4. **Resolve the co-additive files by union.**
   `packages/agent-core/src/agent-loop.ts`: the fork's repeated-tool-error diagnostics for
   `continue_delegate` argument normalization (318 added, **0 deleted**) and upstream's
   turn-taint / tool-result-content-source work are orthogonal. Take both.
5. **Resolve `heartbeat-wake.ts` by hand, last, with a written invariant.**
   Adopt upstream's ready-group batching, concurrency cap, and abort plumbing; then
   re-express the fork's `trustDomain` key partition on top of the new
   `ReadyWakeGroup` model. Do **not** revive `getWakeTargetBaseKey`. This resolution
   needs an inline comment naming the invariant (trusted continuation wakes must never
   share a coalescing bucket) because the reason is invisible at the call site.
6. **Adopt upstream's renames rather than reviving deleted private names** — all seven in
   §6.1–6.7. Cael's tip commit already does exactly this; it is the correct instinct.
7. **Reconcile the convergent trust designs deliberately.** Upstream's turn-taint
   (§6.8) and attachment trust map (§6.9) overlap the fork's sanitization and structured
   return work. Prefer upstream's uniform `taggedPayload` and layer the fork's trust
   semantics onto it, rather than keeping two parallel trust mechanisms — that would be a
   second path, which the architecture rules forbid.
8. **Android i18n: union the key sets.** Upstream translations win per conflicting key,
   hunk-wise, but assembly-only feature strings must survive (untranslated is fine — the
   generator emits them that way). Verify by key-set union, not by line count.
9. **Protected-presentation refresh (§10) is a separate, later step.** Do not couple it to
   this absorb.

---

## 10. Accepted descendants a protected-presentation refresh must retain

`presentation..assembly` carries **398** commits not in upstream, of which **222** are
non-merge fork-authored commits, touching **672** distinct paths.

Composition by conventional-commit type:

```
100  fix        54  test        26  refactor        15  docs        3  chore
  1  style       1  revert       ~7 uncategorized (formatter/fixture/baseline refreshes)
```

By area: `src/agents` 170 · `src/auto-reply` 138 · `src/gateway` 42 · `src/crestodian` 34 ·
`extensions/qa-matrix` 34 · `src/infra` 26 · `apps/android` 23 · `src/plugins` 22 ·
`src/cli` 17 · `extensions/codex` 15 · `ui/src` 14.

The character of this delta matters for the refresh decision: it is **overwhelmingly
bug-fix and test hardening**, not new feature surface. 100 `fix` + 54 `test` = 69% of all
non-merge commits. Representative recent accepted descendants that a refresh must not
drop:

* `fix(continuation): charge post-compaction depth only for accepted children`
* `fix(continuation): enforce the stale TTL when post-compaction work is released`
* `fix(continuation): terminalize released rows and keep source-less replays single-spawn`
* `fix(continuation): fence durable delegate spawning`
* `fix(continuation): require paired durable source metadata`
* `fix(compaction): preserve rollover session identity`
* `fix(gateway): harden validation terminal ownership` / `add chat send outcome owner`
* `refactor(continuation): give the post-compaction durable-handoff shape one spelling`
* the `refactor(*): split …ownership` series that broke the integrated import cycles

A presentation refresh that replays only the "feature" commits and skips the `fix`/`test`
body would regress depth accounting, the seven-day TTL, single-spawn replay, and durable
delegate fencing — precisely the invariants in §8.

---

## 11. Uncertainties

1. **GitNexus MCP was unavailable to this process.** All graph reads went through the
   source CLI against the same index. I believe this is equivalent for `impact`/`context`/
   `query`, but I could not exercise the MCP `detect_changes` path, so any MCP-specific
   enrichment is unverified.
2. **The graph scope excludes `src/tasks`.** `listTaskFlowsForOwnerKey` resolved as
   "target not found", so **TaskFlow durable handoff has no blast-radius measurement** in
   this report. It is a named feature surface; treat its coupling as *unmeasured*, not as
   *low*. Same caveat for `packages/`, `extensions/`, and `apps/` — 86 of the 194
   intersection paths lie outside the indexed scope.
3. **`spawnSubagent` did not resolve by name** in the graph; the spawn path is covered
   only indirectly via `persistInitialChildRuntimeState` and `subagent-spawn.ts` churn.
4. **My import resolver is naive** about workspace subpath exports
   (`@openclaw/normalization-core/*`) and misparses destructured locals in one test helper.
   That is why 120 unresolved-module and 33 missing-symbol readings persist on *both*
   trees. The *delta* is trustworthy (0/0); the *absolute* numbers are not a code-health
   statement.
5. **Static analysis over-predicts; I only falsified in one direction.** I proved the four
   candidates were false alarms. I did **not** prove the absence of silent breakage that
   the static pass never nominated — the merged-tree self-check covers imports/exports
   only, not runtime behavior, types beyond export presence, or test semantics. Cael's
   `tsgo` run is the stronger type-level evidence; neither instrument covers behavior.
6. **No test execution was performed against the merged tree by this lane.** Cael's
   `tsgo 226 → 3` is their receipt, read from their commit message, not independently
   re-run here. Behavioral proof (§12) is outstanding.
7. **Upstream drift is 4,806 paths, not 4,816** as the workorder approximated. Minor, but
   downstream arithmetic should use 4,806.
8. **The upstream candidate is frozen at `cc48aef1`.** Upstream `main` has moved since;
   per the workorder I did not chase it. Any real landing will face additional drift.
9. **The 42 Android i18n conflicts were not individually inspected.** I classified them by
   path shape and accepted the "translations win, union the key set" resolution as sound;
   I did not verify key-set union on the merged tree.

---

## 12. Proof / gate matrix

| # | Gate | Scope | Status | Owner |
| --- | --- | --- | --- | --- |
| 1 | Frozen-object verification | 4 SHAs resolve as commits | **DONE** — all four verified | this lane |
| 2 | Artifact provenance | sha256 of preserved console + analyzer | **DONE** — both match | this lane |
| 3 | Ancestry / baseline correction | `MB_PU` vs `MB_AU` | **DONE** — 368/658/4,806 reproduced | this lane |
| 4 | Dry `merge-tree` conflict census | 61 files, type histogram | **DONE** — 61 content, 0 structural | this lane |
| 5 | Path-intersection completeness | 194 paths cover all 19 code conflicts | **DONE** | this lane |
| 6 | Static semantic sweep | 600 files / 6,256 imports | **DONE** (analyzer defect fixed) | this lane |
| 7 | Merged-tree self-consistency | import/export delta vs assembly | **DONE** — 0 new / 0 new | this lane |
| 8 | GitNexus blast radius | 30 continuation symbols | **DONE** (scope caveat §11.2) | this lane |
| 9 | Full-project typecheck on merged tree | `pnpm tsgo` / `tsgo:prod` | **REPORTED by Cael** (226→3, 3 inherited) — not re-run here | absorb lane |
| 10 | Generated-artifact regeneration | plugin-sdk baseline + surface report | **REQUIRED** — must be regenerated, not merged | absorb lane |
| 11 | Import-cycle gate | `pnpm check:import-cycles` | **NOT RUN** — fork explicitly did cycle-breaking refactors; upstream moved files | absorb lane |
| 12 | Continuation behavior suite | `node scripts/test-projects.mjs` | **NOT RUN** — no product change in this lane | absorb lane |
| 13 | `heartbeat-wake` trust-partition proof | targeted test that trusted + default wakes do not coalesce | **REQUIRED, appears unwritten** — §8.1 invariant is otherwise unguarded | absorb lane |
| 14 | Android i18n key-set union | assembly-only strings survive all 42 files | **NOT VERIFIED** | absorb lane |
| 15 | Plugin-SDK surface gate | `pnpm plugin-sdk:surface:check` | **NOT RUN** — conflict touched the baseline | absorb lane |

Gates 1–8 are this lane's deliverable and are complete. Gates 9–15 belong to the absorb
lane; 10, 13, and 15 are the ones I would not let land without.

---

## 13. Verdict

# ABSORB-TRACTABLE

The drift is large in raw volume (944 upstream commits, 4,806 changed paths) but the
*collision* surface is small, well-bounded, and structurally benign:

* **194** intersecting paths out of 4,806 upstream-changed — 4.0%.
* **61** conflicts, **100% plain content**, zero modify/delete, zero rename/rename, zero
  add/add. Nothing where git loses the common ancestor.
* **42** of the 61 are translation churn; only **19** are code, and all 19 lie inside the
  intersection set, so the surface is fully predicted.
* Every one of the **422** fork-modified paths still exists upstream, and **no**
  fork-added path collides with an upstream path.
* Only **one** file — `src/infra/heartbeat-wake.ts` — is a genuine architectural collision
  where both sides restructure the same decision surface.
* The strongest evidence: on the already-merged tree, the import/export self-consistency
  profile is **identical** to the frozen assembly — 0 new unresolved modules, 0 new
  missing symbols — corroborated independently by Cael's `tsgo` result of 3 remaining
  errors, all reproducing on the frozen assembly base.

The absorb has in fact already been executed on `codeagent/1172-upstream-absorb-opus5`
with topology preserved, which converts this from a prediction into a largely observed
outcome.

It is **not** NEEDS-DESIGN: no structural conflict exists, the fork's export surface is
additive on upstream-owned modules, and upstream's relocations are straightforward
renames the absorb lane is already adopting correctly. It is emphatically **not**
ABSORB-PATHOLOGICAL.

The residual risk is concentrated, nameable, and small: the `heartbeat-wake` trust-domain
partition (§8.1, gate 13), the two convergent trust designs that must be unified rather
than duplicated (§9.7), and the generated artifacts that must be regenerated rather than
merged (§9.1, gate 10).

---

## 14. Exact commands

```bash
# Frozen-object + ancestry verification
git cat-file -t 16f4b3f106033f7fe75f68e67563db1b5b4d0e2f   # and P / U / MB
git merge-base 16f4b3f1… cc48aef1…                          # -> 20eda756…
git merge-base d8b08c9c… cc48aef1…                          # -> f0d4d4f2…  (MB_PU)
git merge-base --is-ancestor d8b08c9c… 16f4b3f1…            # presentation ⊂ assembly
git merge-base --is-ancestor 20eda756… d8b08c9c…            # FALSE — the correction

# Delta inventories
git diff --name-status -M 20eda756… 16f4b3f1…               # fork      658
git diff --name-status -M f0d4d4f2… d8b08c9c…               # present.  368
git diff --name-status -M 20eda756… cc48aef1…               # upstream  4806

# Conflict census
git merge-tree --write-tree --messages --name-only 16f4b3f1… cc48aef1…
grep -oP 'CONFLICT \([^)]+\)' merge-messages.txt | sort | uniq -c | sort -rn

# Accepted descendants after the presentation
git rev-list --count d8b08c9c…..16f4b3f1… --not cc48aef1…   # 398 (222 non-merge)

# Semantic sweep (preserved analyzer + corrected parser)
node /tmp/frond-dispatch-1172-ronan/semantic-drift-silas-recovery.mjs \
  <repo> 16f4b3f1… cc48aef1… /tmp/drift1172/fork-paths.txt /tmp/drift1172/semantic-drift.json
node /tmp/drift1172/recheck.mjs          # export-type-aware re-classification
node /tmp/drift1172/merged-selfcheck.mjs 9510a379… /tmp/drift1172/fork-paths.txt  <out>
node /tmp/drift1172/merged-selfcheck.mjs 16f4b3f1… /tmp/drift1172/fork-paths.txt  <out>

# GitNexus (read-only; --repo required, 28 registry entries share the name)
GNX=~/flesh_beast_best_beast/source/GitNexus/gitnexus/dist/cli/index.js
R=…/WORKTREES/openclaw-1172-cartography-r2-gnx-scope
node $GNX status
node $GNX impact  <symbol> --repo "$R" --depth 2 --include-tests [--summary-only]
node $GNX context <symbol> --repo "$R" -f <file>
node $GNX query   "<concept>" --repo "$R"
```

### Validation performed by this lane

Full test suite (`node scripts/test-projects.mjs`) was **not run and is not applicable**:
this lane is read-only cartography and changes no product code. The only file added is
this `output.md`. Verification instead consisted of gates 1–8 in §12, of which the
merged-tree self-consistency delta (§7.1) is the load-bearing one.
