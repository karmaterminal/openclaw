# Hook API Investigation: OpenClaw 2026.4.02 (d74a12264a)

Investigation for PR #38780 — integrating context-pressure with upstream's lifecycle hook system.

---

## Q1: What hooks exist in 4.02?

### All 27 Typed Hook Types

Defined as a closed union at `src/plugins/types.ts:1999-2027` (`PluginHookName`), validated by `PLUGIN_HOOK_NAMES` constant at lines 2029-2058:

| Hook | Category | Params (event fields) | Return / Modification |
|------|----------|----------------------|----------------------|
| `before_model_resolve` | Modifying | `prompt: string` | `{ modelOverride?, providerOverride? }` |
| `before_prompt_build` | Modifying | `prompt, messages` | `{ systemPrompt?, prependContext?, prependSystemContext?, appendSystemContext? }` |
| `before_agent_start` | Modifying | `prompt, messages?` | Combined model_resolve + prompt_build fields |
| `before_agent_reply` | Claiming | `cleanedBody: string` | `{ handled: boolean; reply?: ReplyPayload; reason? }` |
| `llm_input` | Void | `provider, model, systemPrompt, prompt, historyMessages, imagesCount` | void (fire-and-forget) |
| `llm_output` | Void | `provider, model, assistantTexts, usage: { input?, output?, cacheRead?, cacheWrite?, total? }` | void (fire-and-forget) |
| `agent_end` | Void | `messages, success, error?, durationMs?` | void |
| **`before_compaction`** | **Void** | **`messageCount, compactingCount?, tokenCount?, messages?, sessionFile?`** | **void** |
| **`after_compaction`** | **Void** | **`messageCount, tokenCount?, compactedCount, sessionFile?`** | **void** |
| `before_reset` | Void | (session reset event) | void |
| `inbound_claim` | Claiming | message content/metadata | `{ handled: boolean }` |
| `message_received` | Void | incoming message from channel | void |
| `message_sending` | Modifying | `to, content, metadata?` | `{ content?, cancel? }` |
| `message_sent` | Void | outgoing message was sent | void |
| `before_tool_call` | Modifying | `toolName, params, runId?, toolCallId?` | `{ skip?, params?, ... }` |
| `after_tool_call` | Void | tool execution result | void |
| `tool_result_persist` | Modifying | result persistence data | `{ blocked?, blockReason? }` |
| `before_message_write` | Modifying | message data | `{ blockReason? }` |
| `session_start` | Void | session lifecycle | void |
| `session_end` | Void | session lifecycle | void |
| `subagent_spawning` | Modifying | thread binding status | spawn control |
| `subagent_delivery_target` | Modifying | origin override | delivery control |
| `subagent_spawned` | Void | subagent lifecycle | void |
| `subagent_ended` | Void | subagent lifecycle | void |
| `gateway_start` | Void | gateway lifecycle | void |
| `gateway_stop` | Void | gateway lifecycle | void |
| `before_dispatch` | Claiming | content/body/channel | `{ handled: boolean; text? }` |
| `before_install` | Modifying | installation data | approval control |

Full handler map: `src/plugins/types.ts:2690-2803` (`PluginHookHandlerMap`).

### Compaction-Specific Hook Wiring

`src/agents/pi-embedded-runner/compaction-hooks.ts` defines the bridge between the plugin system and the compaction engine:

- **`CompactionHookRunner` type** (lines 99-126): wraps the global hook runner with compaction-specific signatures.
- **`asCompactionHookRunner()`** (lines 128-139): adapts global `HookRunner` → `CompactionHookRunner`.
- **`runBeforeCompactionHooks()`** (lines 172-225): fires both internal hook `"session"/"compact:before"` and typed `before_compaction`. Passes metrics: `messageCountBefore`, `tokenCountBefore`, `messageCountOriginal`, `tokenCountOriginal`.
- **`runAfterCompactionHooks()`** (lines 248-307): fires `"session"/"compact:after"` and typed `after_compaction`. Passes metrics: `messageCount`, `tokenCount`, `compactedCount`, `summaryLength`, `tokensBefore`, `firstKeptEntryId`.

### Hook Execution Strategy

Defined in `src/plugins/hooks.ts` (`createHookRunner`):

- **Void hooks** (14 types including `before_compaction`, `after_compaction`): all handlers in **parallel** via `Promise.all()`
- **Modifying hooks** (12 types): handlers **sequentially** in priority order, merging results
- **Claiming hooks** (2 types: `inbound_claim`, `before_agent_reply`): **sequentially**, stop at first `{ handled: true }`

---

## Q2: Can a hook fire BEFORE compaction threshold is reached?

### Short answer: No existing typed hook fires per-turn with token counts. But `llm_output` fires after every LLM call with usage data.

### Detailed analysis

**`before_agent_reply`** (`src/plugins/types.ts:2179-2191`):
- Event: `{ cleanedBody: string }` — only the user message text.
- Context (`PluginHookAgentContext`, lines 2083-2095): `runId, agentId, sessionKey, sessionId, workspaceDir, messageProvider, trigger, channelId`.
- **No token count or context size available.** Cannot use for pressure monitoring.

**`llm_output`** (`src/plugins/types.ts:2206-2220`):
- Event includes `usage: { input?, output?, cacheRead?, cacheWrite?, total? }`.
- **Has token counts**, fires after every LLM call.
- However: it's a **void hook** (fire-and-forget, no return value). It can observe usage but cannot inject system events into the agent reply flow.

**`llm_input`** — fires before LLM call but has no token count data.

**`before_compaction`** — fires only when compaction is already triggered (too late for 80% warnings).

### Our context-pressure system

`src/auto-reply/reply/context-pressure.ts` (lines 29-91):

```typescript
export function checkContextPressure(params: CheckContextPressureParams): CheckContextPressureResult
```

- Reads `sessionEntry.totalTokens` and `sessionEntry.totalTokensFresh` to compute ratio.
- Band thresholds: configurable first band (e.g., 80%), then fixed 90% and 95%.
- Fires `[system:context-pressure]` via `enqueueSystemEvent()` — a system event, NOT a hook.
- Deduplication via `sessionEntry.lastContextPressureBand` (each band fires once).
- **Currently NOT wired into production call path** — defined and tested but not imported by production code.

### Integration point assessment

The best place to wire `checkContextPressure()` is **after `persistSessionUsageUpdate()`** in `src/auto-reply/reply/session-usage.ts` or `agent-runner.ts`, where `totalTokens` and `totalTokensFresh` have just been set from the LLM response's usage data. This happens after every turn, with fresh token counts. No hook needed — it's a direct function call from within the reply pipeline.

If we must use the hook system: **`llm_output`** is the closest match. It fires per-LLM-call with `usage.total`, but being a void hook, the only way to propagate the alert would be to call `enqueueSystemEvent()` from within the handler (which is what `checkContextPressure` already does).

---

## Q3: Does `truncateAfterCompaction` preserve delegate metadata?

### Yes. Continuation delegate entries survive truncation.

### Truncation code path

**Entry point:** `src/agents/pi-embedded-runner/compact.ts:935` — gated by `params.config?.agents?.defaults?.compaction?.truncateAfterCompaction`.

**Implementation:** `src/agents/pi-embedded-runner/session-truncation.ts:33-218` (`truncateSessionAfterCompaction()`).

### What gets KEPT (lines 16-31 comment, lines 99-112 logic):

1. **Session header** (line 189)
2. **All non-message session state entries** — specifically `custom`, `model_change`, `thinking_level_change`, `session_info`, `custom_message`, `compaction` (lines 18-19, 99-112: only `entry.type === "message"` entries are candidates for removal)
3. **All entries from sibling branches** not in the summarized set
4. **Unsummarized tail** — entries from `firstKeptEntryId` through the compaction entry and beyond (lines 87-93)

### What gets REMOVED (lines 99-129):

- Only `message` type entries in the current branch that precede `firstKeptEntryId` (the summarized entries)
- `label` entries whose `targetId` references a removed message (lines 117-120)
- `branch_summary` entries whose `parentId` references a removed message (lines 122-128)

### How delegates survive

Continuation delegates are stored via two mechanisms:

1. **In-memory staging** (`src/auto-reply/continuation-delegate-store.ts:136-167`): `stagedPostCompactionDelegates` map, consumed after successful turns.

2. **Persisted as `custom_entry` / `custom` session entries** — NOT `message` type. Per `continue-delegate-tool.ts:117-123`, delegates are staged in-memory during the turn, then committed to `SessionEntry` as custom entries on successful completion.

Since truncation's removal filter (`session-truncation.ts:109`) only targets entries where `entry.type === "message"`, custom entries containing delegate metadata are **never removed**.

### Delegate modes

`src/agents/tools/continue-delegate-tool.ts:16`:
```typescript
const DELEGATE_MODES = ["normal", "silent", "silent-wake", "post-compaction"] as const;
```

The `"post-compaction"` mode (line 37) is specifically designed for context evacuation — it fires when compaction happens.

---

## Q4: Can we register a custom hook type?

### Typed hooks: NO. Custom internal hooks: YES (with caveats).

### Two registration APIs

**1. Typed hooks (`api.on`)** — `src/plugins/registry.ts:878-925`:

```typescript
registerTypedHook<K extends PluginHookName>(
  record, hookName: K, handler: PluginHookHandlerMap[K], opts?: { priority?: number }
)
```

- Validation at line 885: `if (!isPluginHookName(hookName))` → rejects unknown names with a diagnostic warning.
- The `PluginHookName` union is **closed** — 27 fixed values. Adding a new typed hook requires modifying `src/plugins/types.ts` (the union, the constant array, and the handler map).

**2. Custom internal hooks (`api.registerHook`)** — `src/plugins/registry.ts:320-402`:

```typescript
registerHook(
  events: string | string[],
  handler: InternalHookHandler,
  opts?: OpenClawPluginHookOptions
)
```

- Accepts **arbitrary event keys** (line 327: `const eventList = Array.isArray(events) ? events : [events]`).
- Stored in `registry.hooks` (separate from `registry.typedHooks`).
- No validation against a fixed set — any string accepted.
- Under the hood, delegates to `registerInternalHook(event, handler)` (line 400).

### Assessment for `context_pressure_warning`

**Option A — Propose a new typed hook (requires upstream change):**
- Add `"context_pressure_warning"` to `PluginHookName` union in `types.ts:1999-2027`
- Add to `PLUGIN_HOOK_NAMES` array at lines 2029-2058
- Define event/context/result types in `PluginHookHandlerMap` at lines 2690-2803
- Add runner method in `src/plugins/hooks.ts`
- **Pro:** Full type safety, first-class citizen, discoverable.
- **Con:** Upstream must accept a new hook type — higher bar for review.

**Option B — Use custom internal hook (no upstream type changes):**
- Register via `api.registerHook("context_pressure_warning", handler)` from a plugin.
- Fire via internal hook system (`"session"/"context-pressure"` event key).
- **Pro:** Works today, no upstream type changes needed.
- **Con:** No type safety, not discoverable via `HookRunner`, bypasses the typed hook infrastructure.

**Option C — Use `llm_output` as the integration point (recommended for initial PR):**
- Already fires per-LLM-call with `usage.total`.
- Wire `checkContextPressure()` as a side-effect inside an `llm_output` handler.
- System events are already enqueued via `enqueueSystemEvent()`.
- **Pro:** Zero new hook types. Minimal diff. Uses existing plumbing exactly as designed.
- **Con:** Couples pressure checks to the observation hook rather than having a dedicated lifecycle event.

**Option D — Direct integration (no hooks at all):**
- Call `checkContextPressure()` directly after `persistSessionUsageUpdate()` in the reply pipeline.
- This is the simplest approach and what the existing (unconnected) code seems designed for.
- **Pro:** Simplest possible change. Already partially implemented.
- **Con:** Not extensible via plugins; other plugins can't observe pressure events.

---

## Recommendations for PR Strategy

1. **Phase 1 (minimal, likely to land):** Option D — wire `checkContextPressure()` into the session usage pipeline directly. The function and tests already exist. This is a 10-line change.

2. **Phase 2 (follow-up PR):** Propose `context_pressure_warning` as a new typed hook (Option A). This gives plugins visibility into pressure events. Reference Phase 1 as proof the feature works.

3. **Delegate survival is confirmed** — no changes needed to truncation. The `post-compaction` delegate mode was designed exactly for our use case.

4. **Key gap:** No per-turn hook fires with token context today. The `llm_output` void hook is the closest, but direct pipeline integration (Option D) is cleaner than abusing an observation hook.
