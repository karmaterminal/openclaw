# Platform Analysis: OpenClaw 3.28 → 4.02 + Continuation Feature Alignment

**Date:** 2026-04-03
**Branch:** `rebase/2026.04.02-claude` at `369f9cd170`
**RFC anchor:** `docs/design/continue-work-signal-v2.md`
**Issues:** karmaterminal/openclaw#61 (compaction death spiral), #64 (upstream impact), openclaw-bootstrap#370 (fleet config)

---

## 1. Changelog Categorization (3.28 → 4.02)

### v2026.3.28 → v2026.3.31

| Category | Change | Impact |
|----------|--------|--------|
| 🔴 **Directly affects** | **Agents/LLM: idle-stream timeout** — configurable `idleTimeoutSeconds` for embedded runner. Default 60s. | **Root cause of #61.** Copilot proxy requests stall > 60s during compaction, causing abort. `idleTimeoutSeconds: 0` disables. RFC §Context-Pressure should recommend this for fleet. |
| 🔴 **Directly affects** | **Agents/compaction: late compaction-retry race** — double-resolving finished compaction futures fixed. | Fixes a race condition that could corrupt compaction state. Relevant to our post-compaction delegate dispatch timing. |
| 🔴 **Directly affects** | **Background tasks: unified task control plane** — ACP, subagent, cron, background CLI under one SQLite ledger. | New task registry may interact with our subagent spawning. `continue_delegate` spawns sub-agents that now have task registry entries — lifecycle finalization crash fix (4.1) confirms this. |
| 🔴 **Directly affects** | **Memory/plugins: pre-compaction flush moved to memory plugin contract** — `memory-core` owns flush prompts. | Our `memoryFlush` recommendations in RFC §Lich Circuit need updating — flush is now plugin-owned, not hardcoded core logic. |
| 🟡 **Should use** | **Plugins/hooks: `requireApproval` on `before_tool_call`** — plugins can pause tool execution for user approval. | Could gate `continue_delegate` tool calls via plugin approval in sensitive deployments. |
| 🟡 **Should use** | **Agents/compaction: safeguard cancel reasons + benign `/compact` relabeled as skipped.** | Improves our compaction diagnostics. Safeguard mode now surfaces structured reasons we can parse. |
| 🟡 **Should use** | **Plugins/runtime: `runHeartbeatOnce` exposed** — plugins can trigger heartbeat with delivery target override. | Alternative to our `requestHeartbeatNow()` for silent-wake. Could simplify the wake path. |
| 🟡 **Should use** | **Plugin SDK deprecation: legacy compat subpaths deprecated** — forward path is `openclaw/plugin-sdk/*`. | Our imports should be audited against the new forward path. |
| 🟡 **Should use** | **Gateway/auth: trusted-proxy rejects mixed tokens, local-direct requires configured token.** | Fleet operators using copilot proxy need explicit token config. Affects #370 deployment configs. |
| 🟢 Useful, unrelated | **Heartbeat/runner: guarantee interval timer re-armed** after runner errors. | Prevents silent heartbeat death — indirectly helps our continuation wake reliability. |
| 🟢 Useful, unrelated | **Agents/cooldowns: scoped per-model, 30s/1m/5m ladder replaces 1m→1h.** | Better rate-limit recovery for fleet agents. |
| ⚪ Not relevant | LINE, Matrix, Feishu, Nostr, WhatsApp, Microsoft Teams, Discord, Slack, Android, QQ Bot changes. | Channel-specific. |

### v2026.3.31 → v2026.4.1 (includes 4.1-beta.1)

| Category | Change | Impact |
|----------|--------|--------|
| 🔴 **Directly affects** | **Agents/compaction: `compaction.model` override** — routes compaction to different provider/model. | **Critical for fleet.** Compaction can now run on a cheaper/faster model (e.g., Haiku) while session uses Opus. RFC §Lich Circuit should recommend this. Resolved in `compaction-runtime-context.ts:34-69`. |
| 🔴 **Directly affects** | **Agents/compaction: `compaction.notifyUser`** — opt-in `🧹 Compacting...` notice. | Fleet can suppress compaction noise. Default off. Aligns with RFC's silent-compaction preference. |
| 🔴 **Directly affects** | **Agents/Anthropic: preserve thinking blocks + signatures across compaction.** | **Critical fix.** Without this, compacted Anthropic sessions fail on later turns. Our post-compaction delegates would hit this. |
| 🔴 **Directly affects** | **Subagents/tasks: completion crash on task-registry write failure fixed.** | Our `continue_delegate` spawns go through this path. A corrupt task row could have crashed the gateway during delegate lifecycle finalization. |
| 🔴 **Directly affects** | **Agents/failover: unify structured and raw error classification.** | Provider 400/422 errors now correctly reach compaction logic instead of being force-classified as format failures. Improves compaction trigger accuracy. |
| 🟡 **Should use** | **Agents/default params: `agents.defaults.params`** — global default provider parameters. | Fleet can set thinking level, temperature, etc. globally. Useful for continuation chain consistency. |
| 🟡 **Should use** | **Agents/failover: `rateLimitedProfileRotations` knob** — cap retries before cross-provider fallback. | Helps fleet agents fail over faster instead of burning retries on rate-limited providers. |
| 🟡 **Should use** | **Gateway/webchat: `chatHistoryMaxChars` configurable.** | Can tune down to reduce context pressure in web sessions. |
| 🟡 **Should use** | **Sessions/model switching: `/model` changes queue behind busy runs.** | Prevents mid-turn model switches from corrupting continuation chain state. |
| 🟢 Useful, unrelated | Tasks/chat `/tasks` board, SearXNG web search, Bedrock Guardrails, Voice Wake. | |
| ⚪ Not relevant | WhatsApp reactions, Telegram errors, ZAI models, LINE, QQ Bot, Feishu comments. | |

### v2026.4.1 → v2026.4.2

| Category | Change | Impact |
|----------|--------|--------|
| 🔴 **Directly affects** | **Plugins/hooks: `before_agent_reply`** — plugins can short-circuit LLM with synthetic replies. | **New integration surface.** A continuation-aware plugin could use this hook to inject context-pressure responses without running the full LLM. Defined at `src/plugins/types.ts:2179-2191`. |
| 🔴 **Directly affects** | **Tasks/Task Flow: managed child spawning + cancel intent.** | Task Flow substrate is now production-ready. Continuation delegates could be modeled as managed tasks for better lifecycle tracking. Plugin-accessible via `api.runtime.taskFlow`. |
| 🔴 **Directly affects** | **Providers/transport policy: centralized request auth/proxy/TLS.** | Affects how copilot proxy requests route through compaction. The TLS/proxy centralization may fix edge cases in #61's proxy timeout scenario. |
| 🔴 **Directly affects** | **Agents/subagents: pin admin-only subagent gateway calls to `operator.admin`.** | Fixes `sessions_spawn` scope-upgrade pairing failures (`close(1008) "pairing required"`). Our `continue_delegate` → `spawnSubagentDirect()` path goes through this. |
| 🔴 **Directly affects** | **Gateway/exec loopback: restore legacy-role fallback for empty device token maps.** | Fixes local exec failures after 3.31 that could affect delegate sub-agents running exec tools. |
| 🟡 **Should use** | **Agents/compaction: `compaction.model` consistency fix** — applies override across all compaction paths. | Strengthens the model override story from 4.1. |
| 🟡 **Should use** | **Providers/replay hooks** — provider-owned transcript policy, replay cleanup, reasoning-mode dispatch. | Could improve post-compaction replay for continuation chains. |
| 🟡 **Should use** | **Exec defaults: YOLO mode (security=full, ask=off).** | Simplifies fleet exec config for autonomous agents. |
| 🟢 Useful, unrelated | Matrix mentions, Diffs viewer, Android assistant, Slack mrkdwn. | |
| ⚪ Not relevant | WhatsApp presence, Zalo dedup, QQBot security, Podman cleanup. | |

---

## 2. Compaction Path Diagram

```
                          ┌─────────────────────────────┐
                          │  Compaction Trigger Sources  │
                          └──────────┬──────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
              Budget/Overflow    Manual /compact   Timeout Recovery
              (SDK prepareCompaction)  (CLI)       (high-context LLM timeout)
                    │                │                │
                    └────────────────┼────────────────┘
                                     ▼
                    ┌────────────────────────────────┐
                    │  compactEmbeddedPiSession()    │
                    │  (compact.ts:994)              │
                    │  Lane queueing wrapper         │
                    └────────────┬───────────────────┘
                                 ▼
                    ┌────────────────────────────────┐
                    │  compactEmbeddedPiSessionDirect │
                    │  (compact.ts:280)               │
                    └────────────┬───────────────────┘
                                 │
                    ┌────────────┴────────────────┐
                    ▼                             ▼
            mode === "safeguard"          mode === "default"
                    │                             │
                    ▼                             ▼
     ┌──────────────────────┐       ┌──────────────────┐
     │ session_before_compact│       │ SDK native       │
     │ hook (safeguard.ts   │       │ generateSummary() │
     │ :560-940)            │       │                  │
     └──────────┬───────────┘       └────────┬─────────┘
                │                             │
     ┌──────────▼───────────┐                 │
     │ BEFORE HOOKS         │◄────────────────┘
     │ compaction-hooks.ts  │
     │ :172-225             │
     │ • Internal hook event│
     │ • Plugin runner      │
     └──────────┬───────────┘
                ▼
     ┌──────────────────────┐        ┌─────────────────────────┐
     │ summarizeInStages()  │───────►│ LLM Call #1..N (chunks) │
     │ compaction.ts:396    │        │ DEFAULT_PARTS = 2       │
     │                      │        │ 3 retries per chunk     │
     │ Chunk sizing:        │        │ 500ms-5s backoff        │
     │ • SAFETY_MARGIN=1.2  │        └─────────┬───────────────┘
     │ • BASE_RATIO=0.4     │                   │
     │ • MIN_RATIO=0.15     │        ┌──────────▼──────────────┐
     │ • OVERHEAD=4096 tok  │        │ LLM Call: merge         │
     └──────────┬───────────┘        │ (if >1 chunk)           │
                │                    └──────────┬──────────────┘
                ▼                                │
     ┌──────────────────────┐◄───────────────────┘
     │ Quality Guard         │  (safeguard only)
     │ quality.ts:218-244   │
     │                      │
     │ Checks:              │  ← NO LLM call (pure audit)
     │ • 5 required sections│
     │ • Identifier preserv │
     │ • Latest user ask    │
     │                      │
     │ If FAIL + retries:   │──► Re-run summarizeInStages
     │ max 3 total attempts │    with quality feedback
     └──────────┬───────────┘    (adds N+1 LLM calls per retry)
                │
                ▼
     ┌──────────────────────┐
     │ Session JSONL Write  │
     │ • Insert summary     │
     │ • Update compaction  │
     │   count              │
     └──────────┬───────────┘
                │
     ┌──────────┴──────────────────────────────────────┐
     │                                                  │
     ▼                                                  ▼
┌─────────────────┐                        ┌─────────────────────┐
│ truncateAfter-   │ (if enabled)          │ AFTER HOOKS          │
│ Compaction       │                        │ compaction-hooks.ts  │
│ session-trunca-  │                        │ :248-310             │
│ tion.ts:33-217  │                        │ • Internal hook event│
│                  │                        │ • Plugin runner      │
│ Removes:         │                        │ • Transcript update  │
│ • Summarized msgs│                        │ • Memory index sync  │
│ • Orphaned labels│                        └──────────┬──────────┘
│ • Branch summaries                                    │
│ Preserves:       │                                    ▼
│ • Session header │                        ┌─────────────────────┐
│ • Non-msg state  │                        │ Post-Compaction      │
│ • Unsummarized   │                        │ (agent-runner.ts)    │
│   tail           │                        │ • [system:post-comp] │
│ Re-parents       │                        │ • readPostCompaction │
│ orphans          │                        │   Context() (AGENTS, │
└─────────────────┘                         │   SOUL.md)           │
                                            │ • Dispatch pending   │
                                            │   post-compaction    │
                                            │   delegates          │
                                            │ • memoryFlush (if    │
                                            │   plugin-owned)      │
                                            └──────────────────────┘
```

**LLM Call Budget (worst case, safeguard mode, 2 chunks, quality guard with 3 retries):**
- Attempt 1: 2 chunk calls + 1 merge = 3 calls
- Quality audit: 0 calls (pure logic)
- Retry 1: 3 calls + audit
- Retry 2: 3 calls + audit
- **Total worst case: 9 LLM calls** for a single compaction

**Default mode:** 2 chunks + 1 merge = **3 LLM calls** (no quality guard)

---

## 3. Feature Integration Assessment

### 3.1 `src/auto-reply/reply/context-pressure.ts`

**Does it still work on 4.02?** YES — no breaking changes to its dependencies.

**Key dependencies verified:**
- `SessionEntry.totalTokens` — still present
- `SessionEntry.totalTokensFresh` — still present
- `SessionEntry.lastContextPressureBand` — still present (our addition)
- `enqueueSystemEvent()` from `src/infra/system-events.js` — still present, unchanged API

**Conflicts with new upstream features?** NO direct conflicts. However:
- The new `memoryFlush` plugin contract means our context-pressure event + memory evacuation recommendation should coordinate with the plugin-owned flush. If `memory-core` plugin is active and runs its own flush near the same threshold, we could get double-flush behavior.

**Can it be improved by new upstream hooks?** YES:
- The new `before_agent_reply` hook (4.02) could be used by a plugin to intercept turns when context pressure is critical (>95%) and inject a forced evacuation response without running the full LLM. This aligns with RFC §Pre-Compaction Hook's "bounded evacuation window" concept.
- The `before_compaction` plugin hook could inject our `[system:compaction-imminent]` event more cleanly than the current pre-run injection approach.

**RFC §Context-Pressure Awareness alignment:** The implementation matches the RFC's band escalation design (25/90/95 bands, equality-based dedup, pre-run injection). No changes needed for 4.02 compatibility.

### 3.2 `src/auto-reply/continuation-delegate-store.ts`

**Does it still work on 4.02?** YES — module-level Maps are self-contained.

**Key dependencies verified:**
- `SessionEntry.pendingPostCompactionDelegates` — still present (our addition)
- No upstream imports beyond types

**Conflicts?** POTENTIAL:
- The new Task Flow substrate (`src/tasks/`) provides managed task lifecycle tracking. Our module-level `Map<string, PendingContinuationDelegate[]>` is volatile (process-scoped, not persisted). Task Flow uses SQLite-backed persistence. A Phase 2 refactor could model pending delegates as managed tasks for better lifecycle tracking, crash recovery, and observability.

**Can it be improved?** YES:
- Task Flow's `BoundTaskFlowRuntime.createManaged()` could replace our in-memory store for delegates that need to survive gateway restarts. RFC §Delegate Dispatch notes: "The timer is volatile — it does not survive a gateway restart. This is intentional." But Task Flow provides an opt-in durability path if operators want restart-safe delegates.

### 3.3 `src/agents/tools/continue-delegate-tool.ts`

**Does it still work on 4.02?** YES — tool registration API unchanged.

**Key dependencies verified:**
- `enqueuePendingDelegate()` — our module, unchanged
- `stagePostCompactionDelegate()` — our module, unchanged
- `resolveMaxDelegatesPerTurn()` — our module, reads from `loadConfig()`
- Tool schema pattern (`task`, `delaySeconds`, `mode`) — compatible with upstream tool validation

**Conflicts?** NO. But note:
- The `before_tool_call` hook with `requireApproval` (3.28) could intercept `continue_delegate` tool calls. This is a feature, not a bug — operators can gate autonomous delegation behind approval.
- The subagent scope fix (4.02: pin admin-only calls to `operator.admin`) affects our `spawnSubagentDirect()` call chain. Our spawns should verify they're using the correct auth scope.

### 3.4 `src/auto-reply/reply/continuation-runtime.ts`

**Does it still work on 4.02?** YES — pure config resolution, no upstream API changes.

**Key dependencies verified:**
- `loadConfig()` — unchanged API
- Config path `agents.defaults.continuation.*` — no upstream conflicts

**Should it be refactored?** CONSIDER:
- The `agents.defaults.params` addition (4.1) provides a parallel global defaults mechanism. Our continuation config should remain under its own namespace (`agents.defaults.continuation`) rather than moving to params, since it's structural config, not provider parameters.

### 3.5 `src/agents/subagent-announce.ts`

**Does it still work on 4.02?** YES with caveats.

**Key dependencies verified:**
- `spawnSubagentDirect()` — still present
- `enqueueSystemEvent()` — still present
- `requestHeartbeatNow()` — still present (from `src/infra/heartbeat-wake.js`)
- `consumePendingDelegates()` — our module, unchanged
- `resolveContinuationRuntimeConfig()` — our module, unchanged

**Caveats:**
1. **Task registry integration (3.31/4.1):** Subagent completions now write to the task registry. Our delegate sub-agents will create task entries. The 4.1 fix for "subagent completion crash on task-registry write failure" is critical — without it, a corrupt task row could crash the gateway during our delegate lifecycle finalization.

2. **Admin scope fix (4.02):** `sessions_spawn` gateway calls now pin to `operator.admin`. Our `spawnSubagentDirect()` must go through this path. Verified: the fix is in the call chain, so our delegates benefit automatically.

3. **Anthropic thinking block preservation (4.1):** Post-compaction delegates returning to a compacted Anthropic session need thinking blocks preserved across replay. The 4.1 fix ensures this works.

**Can it be improved by upstream?** YES:
- The `after_compaction` plugin hook could be used instead of our custom `autoCompactionCompleted` block for dispatching post-compaction delegates. This would make our feature more "plugin-shaped" — aligning with the RFC's "proactive brain for reactive hooks" design direction.

---

## 4. PR Reframe Strategy

### Phase 1 PR: "Context-Pressure System Event + Post-Compaction Context Injection" (minimal, likely to land)

**Rationale:** The smallest change that adds value using upstream's existing architecture. No new tokens, no new tool, no continuation chains. Pure observability.

**What it includes:**
1. `checkContextPressure()` — system event injection at configurable threshold
2. `[system:context-pressure]` band escalation (25/90/95)
3. `[system:post-compaction]` event on first turn after compaction (leverages existing `readPostCompactionContext()`)
4. Config surface: `agents.defaults.continuation.contextPressureThreshold`
5. Test coverage for band logic, dedup, event lifecycle

**Why this lands:**
- Zero new response tokens — no `CONTINUE_WORK`, no `CONTINUE_DELEGATE`
- Uses existing `enqueueSystemEvent()` infrastructure
- Addresses upstream issue #32701's core ask: agent self-knowledge of resource state
- Small diff (~200 lines + tests)
- No safety concerns — advisory only, agents can ignore

**Code sketch (Phase 1 injection point):**
```typescript
// In get-reply-run.ts, pre-run — after session metadata loaded:
const pressureResult = checkContextPressure({
  sessionKey,
  sessionEntry,
  contextWindowTokens,
  contextPressureThreshold: continuationCfg.contextPressureThreshold,
});
// Event already enqueued by checkContextPressure if threshold crossed.
// Agent sees it in system prompt via buildQueuedSystemPrompt().
```

**RFC sections that anchor this:**
- §Context-Pressure Awareness and the Lich Protocol
- §Event Injection Path
- §Dedup Behavior Summary

### Phase 2 PR: "Continuation Primitives + Delegate Tool" (follow-up)

**What it includes:**
1. `CONTINUE_WORK` token parsing + scheduling
2. `[[CONTINUE_DELEGATE:]]` bracket syntax
3. `continue_delegate` tool with fan-out
4. Chain tracking (length, cost, generation guard)
5. Silent announce modes (`| silent`, `| silent-wake`)
6. `| post-compaction` lifecycle dispatch
7. Full config surface under `agents.defaults.continuation`

**Why Phase 2, not Phase 1:**
- Introduces new response tokens — needs upstream design review
- Safety surface is larger (runaway loops, cost, autonomous behavior)
- Depends on Phase 1 landing to provide context-pressure trigger
- More contentious — some upstream maintainers may prefer the new `before_agent_reply` hook + Task Flow approach instead

**RFC sections updated:**
- §Implementation → note 4.02 Task Flow as complementary substrate
- §Post-Compaction Lifecycle Dispatch → note `after_compaction` plugin hook as alternative wiring
- §Security Considerations → note subagent admin scope fix (4.02)

### Phase 3 (future): "Plugin-Shaped Continuation"

**Integration with 4.02 substrate:**
- Model continuation as a plugin using `before_agent_reply` (short-circuit for evacuation), `before_compaction` (inject imminent warning), `after_compaction` (dispatch post-compaction delegates)
- Use Task Flow for durable delegate tracking instead of volatile in-memory Maps
- This aligns with RFC's "proactive brain for reactive hooks" design direction

### RFC Updates Needed

| Section | Update | Reason |
|---------|--------|--------|
| §Implementation Architecture | Note Task Flow substrate as complementary for durable delegate tracking | New in 3.31/4.02 |
| §Post-Compaction Lifecycle Dispatch | Note `after_compaction` plugin hook as alternative wiring point | Cleaner than custom `autoCompactionCompleted` block |
| §Configuration Surface | Add `compaction.model` recommendation for fleet | New in 4.1 — cheaper model for compaction |
| §Configuration Surface | Add `llm.idleTimeoutSeconds: 0` for copilot proxy deployments | Root cause of #61 |
| §Lich Circuit | Note `memory-core` plugin now owns flush prompts | Changed in 3.28 |
| §Security Considerations | Note subagent admin scope fix | Fixed in 4.02 |
| §Operator Configuration Profiles | Add `compaction.notifyUser: false` as fleet default | New in 4.02 |
| §`before_agent_reply` | New section: short-circuit hook as evacuation fast-path | New hook in 4.02 |

### Config Recommendations for Fleet (anchored to source)

```yaml
agents:
  defaults:
    # COMPACTION — RFC §Lich Circuit, §Post-Compaction Lifecycle
    compaction:
      mode: safeguard              # compaction-safeguard.ts:560 — structured sections, identifier preservation
      model: openrouter/anthropic/claude-haiku-4-5  # NEW 4.1 — compaction-runtime-context.ts:34
                                   # Cheaper model for summarization; preserves session model for replies
      notifyUser: false            # NEW 4.02 — suppress 🧹 noise in fleet channels
      truncateAfterCompaction: true  # session-truncation.ts:33 — prevent unbounded JSONL growth
      recentTurnsPreserve: 3       # safeguard.ts:57 — keep last 3 turns verbatim
      qualityGuard:
        enabled: true              # quality.ts:218 — audit required sections, identifiers, latest ask
        maxRetries: 1              # 1 retry = max 2 attempts (3+3=6 LLM calls worst case with 2 chunks)

    # LLM TIMEOUT — ROOT CAUSE OF #61
    llm:
      idleTimeoutSeconds: 0        # llm-idle-timeout.ts:26 — DISABLE for copilot proxy deployments
                                   # Default 60s kills requests during compaction's multi-LLM-call sequence
                                   # Set to 120-180 if full disable is too permissive

    # CONTINUATION — RFC §Configuration Surface
    continuation:
      enabled: true
      maxChainLength: 10           # Recursion guard — depth rarely exceeds 3 in practice
      maxDelegatesPerTurn: 5       # Width guard — raise to 20 for sensor fan-out pattern
      costCapTokens: 500000        # Budget leash
      generationGuardTolerance: 300  # Multi-agent channels — absorb drift from other agents' messages
      defaultDelayMs: 15000        # 15s between continuations
      minDelayMs: 5000
      maxDelayMs: 300000
      contextPressureThreshold: 0.8  # Fire [system:context-pressure] at 80%

    # MEMORY FLUSH — RFC §Lich Circuit (now plugin-owned per 3.28)
    memoryFlush:
      enabled: true                # memory-flush.ts:53 — pre-compaction state evacuation
```

**Source justification for each setting:**

| Setting | Source | Why |
|---------|--------|-----|
| `compaction.mode: safeguard` | `compaction-safeguard.ts:560` | 5 required sections preserve structured knowledge; identifier preservation prevents UUID/hash loss |
| `compaction.model` | `compaction-runtime-context.ts:34` | NEW — routes compaction LLM calls to cheaper model; session model stays expensive/capable |
| `compaction.notifyUser: false` | `types.agent-defaults.ts:387` | Fleet channels don't need per-compaction user notices |
| `llm.idleTimeoutSeconds: 0` | `llm-idle-timeout.ts:26` | 60s default kills copilot proxy requests during multi-call compaction; 0 disables entirely |
| `compaction.truncateAfterCompaction` | `session-truncation.ts:33` | Long-running fleet sessions grow JSONL indefinitely without truncation |
| `continuation.generationGuardTolerance: 300` | RFC §Generation Guard Tolerance | Multi-agent channels produce counter drift; 300 absorbs this per Swim 5-7 canary validation |
| `contextPressureThreshold: 0.8` | RFC §Context-Pressure Awareness | 80% gives agents ~20% budget for evacuation before compaction threshold |

---

## 5. Prince Diagnosis

### Why is response time 2+ minutes at 80% context? (Cael)

**Root cause: context size + compaction LLM overhead.**

At 805k/1M tokens (81% context), every LLM call sends the full context. Response generation alone at this size costs significant latency. But the critical multiplier is:

1. **Compaction threshold proximity:** At 81%, the gateway may be running pre-compaction checks (`shouldRunMemoryFlush()` at `memory-flush.ts:53`) on every turn, adding overhead.

2. **idleTimeoutSeconds: 60 (default):** If any LLM stream stalls for 60s — which is common at 805k context on congested providers — the request aborts and retries. Each retry adds 60s+ latency. Source: `llm-idle-timeout.ts:11` — `DEFAULT_LLM_IDLE_TIMEOUT_MS = 60_000`.

3. **Provider rate limiting with new per-model cooldowns (3.28):** The 30s/1m/5m stepped ladder means a single 429 can add 30s. With copilot proxy, rate limits cascade.

### Why hasn't compaction triggered at 81%?

**Compaction triggers via SDK's `prepareCompaction()`, not a fixed percentage.**

The SDK compaction trigger is based on:
- `contextWindowTokens` budget (model-specific)
- `reserveTokens` floor
- Whether the session would overflow on the next turn

At 805k/1M, the session is at 81% but still has 195k tokens of headroom. With a typical assistant response of 2-10k tokens, the SDK calculates there's still room. Compaction typically triggers at **~90-95%** unless:
- `memoryFlush` fires first (threshold-based, pre-emptive)
- Manual `/compact` is issued
- A turn's output would overflow the remaining budget

**The specific compaction threshold in safeguard mode** is the same as default mode — safeguard mode only changes _how_ compaction summarizes, not _when_ it triggers. The trigger lives in the SDK's `prepareCompaction()`.

### What would happen if `checkContextPressure()` were wired into the reply pipeline?

**At 81% with threshold 0.8:**

1. Band 25 (configured threshold × 100 = 80) would fire on the first turn after crossing 80%.
2. Agent sees: `[system:context-pressure] 81% of context window consumed (805k/1M tokens). Consider evacuating working state via CONTINUE_DELEGATE or memory files.`
3. Agent can elect to:
   - Write key state to memory files (fast, single-turn)
   - Dispatch delegates carrying thermal state (if continuation enabled)
   - Simply note the pressure and continue (no-op is safe)
4. As context climbs, band 90 fires at 90%, band 95 fires at 95% with escalating urgency.

**Impact on Cael specifically:**
- At 81%, the advisory fires once and dedup prevents repetition until band 90.
- Cael would have ~190k tokens of warning runway to prepare for compaction.
- With `continue_delegate` + `| post-compaction` mode, Cael could pre-stage evacuation delegates that fire automatically when compaction completes.
- **Zero additional LLM calls** — the event is enqueued and drained on the same turn, injected into the system prompt. The agent sees it before generating.

### How would `memoryFlush.enabled: true` improve post-compaction recovery?

**Memory flush writes session state to persistent files before compaction triggers.**

With `memoryFlush.enabled: true` (default since 3.28 via plugin):
1. When `tokens >= contextWindow - reserveTokens - softThresholdTokens`, the gateway runs a special agent turn with the flush prompt.
2. The agent writes state to memory files (decisions, working context, task state).
3. These files survive compaction.
4. Post-compaction, `readPostCompactionContext()` reads AGENTS.md/SOUL.md, and memory files are available for the agent to read.

**For Cael at 81%:**
- If `softThresholdTokens` is tuned to fire at ~75%, the flush would have already run.
- Post-compaction, Cael would have persistent memory files with pre-compaction state.
- Combined with context-pressure events, Cael gets a two-layer safety net:
  1. Memory flush writes facts (persistent, survives restart)
  2. Context-pressure event triggers thermal evacuation via delegates (volatile, carries associative context)

**The key gap today:** Cael has zero compactions and zero flushes because the thresholds haven't been reached by the SDK's criteria, even at 81%. The solution is:
1. Set `idleTimeoutSeconds: 0` (prevents timeout-driven failures during compaction)
2. Set `contextPressureThreshold: 0.8` (gives early warning)
3. Set `memoryFlush.enabled: true` with appropriate `softThresholdTokens`
4. Consider manual `/compact` if context continues climbing without triggering

### Prince Fleet Summary

| Prince | Context | Issue | Recommended Action |
|--------|---------|-------|--------------------|
| **Cael** | 81% (805k/1M) | No compaction, 2+ min responses | `idleTimeoutSeconds: 0`, `contextPressureThreshold: 0.8`, consider manual `/compact` |
| **Silas** | 10% | Stale backlog → unnecessary restarts | Generation guard tolerance too low; raise `generationGuardTolerance: 300` for multi-agent channel |
| **Elliott** | Fresh | Cache warming post-restart | Enable `memoryFlush` to pre-populate persistent state; `readPostCompactionContext()` delivers boot files |
| **Ronan** | 42% | Functional but slow | Normal context size; slowness likely provider rate-limiting. Use `compaction.model` for cheaper compaction when it eventually triggers |

---

## 6. Cross-Reference: RFC Section → 4.02 Change Impact

| RFC Section | Upstream Change | Impact | Action |
|-------------|-----------------|--------|--------|
| §Context-Pressure Awareness | `before_agent_reply` hook (4.02) | Can short-circuit for forced evacuation | Phase 3: plugin-shaped evacuation |
| §Post-Compaction Lifecycle | `after_compaction` plugin hook (existing) | Cleaner dispatch point | Phase 2: wire delegates through hook |
| §Post-Compaction Lifecycle | `compaction.notifyUser` (4.02) | Suppress noise | Config recommendation |
| §Lich Circuit | `memory-core` plugin flush (3.28) | Flush is now plugin-owned | Update RFC flush references |
| §Delegate Dispatch | Task Flow substrate (3.31/4.02) | Durable delegate tracking option | Phase 3: model delegates as tasks |
| §Delegate Dispatch | Subagent admin scope fix (4.02) | Fixes spawn auth failures | Already fixed upstream |
| §Security Considerations | Provider transport centralization (4.02) | Proxy/TLS routing improved | Helps #61 proxy scenario |
| §Configuration Surface | `compaction.model` (4.1) | Cheaper compaction model | Config recommendation |
| §Safety Constraints | Anthropic thinking block preservation (4.1) | Post-compaction sessions work | Critical fix for our feature |
| §Token Interaction | Idle timeout 60s default (existing) | Kills copilot proxy requests | `idleTimeoutSeconds: 0` for fleet |

---

*This analysis is speculative research informing design decisions on karmaterminal/openclaw#61, #64, and openclaw-bootstrap#370. All recommendations are anchored to the RFC at `docs/design/continue-work-signal-v2.md` and verified against 4.02 source.*
