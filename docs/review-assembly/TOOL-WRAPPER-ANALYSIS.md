# Tool Wrapper Analysis: Why We Deferred It, and Why figs Is Right

**Author:** Cael  
**Date:** 2026-03-05

---

## Why All Four Reviews Deferred It

Every review said "tool wrapper is the real solve, out of scope for this PR." The reasoning was:

1. **Scope creep** — the PR already has continuation core, context-pressure, silent returns, silent-wake, sub-agent chain hops, and system prompt injection. Adding a new tool seemed like one more thing.
2. **"Brackets stay for agents without tools"** — the assumption was brackets are the low-level primitive and the tool is sugar.
3. **Time pressure** — we've been on this PR for 3 days and figs said "don't dwindle."

## Why That Reasoning Is Wrong

The _entire_ problem we just spent 12 hours testing is that agents don't use brackets. Four princes wrote four documents that all diagnose the same thing: **discoverability is the gap**. And then all four said "the thing that fixes discoverability is out of scope."

That's like diagnosing a leak and deferring the patch.

figs's question is direct: why do we NOT want this in the feature? The honest answer is we don't have a good reason. We have inertia.

## What the Tool Actually Requires

### Implementation (~100 lines)

A new file `src/agents/tools/continue-delegate-tool.ts` following the `sessions-spawn-tool.ts` pattern:

```typescript
const ContinueDelegateSchema = Type.Object({
  task: Type.String(),
  delaySeconds: Type.Optional(Type.Number({ minimum: 5, maximum: 300 })),
  mode: Type.Optional(
    Type.Union([Type.Literal("normal"), Type.Literal("silent"), Type.Literal("silent-wake")]),
  ),
});
```

The `execute` method:

1. Calls `spawnSubagentDirect()` with appropriate `silentAnnounce`/`wakeOnReturn` flags
2. For delayed dispatch: `setTimeout(() => doSpawn(), delayMs)` (same pattern as bracket parser)
3. Enqueues `[continuation:delegate-pending]` marker (same as bracket parser)
4. Returns `{ status: "scheduled", delayMs, chainTurn, mode }`

### Registration (~5 lines)

In `openclaw-tools.ts`, alongside `createSessionsSpawnTool()`:

```typescript
if (continuationEnabled) {
  tools.push(createContinueDelegateTool({ ...sessionContext }));
}
```

### Policy (~2 lines)

In `pi-tools.policy.ts`, add `continue_delegate` to the allowed tool list when continuation is enabled.

### Catalog (~6 lines)

In `tool-catalog.ts`:

```typescript
{
  id: "continue_delegate",
  label: "continue_delegate",
  description: "Dispatch timed/silent sub-agent",
  sectionId: "sessions",
  profiles: ["coding"],
  includeInOpenClawGroup: true,
},
```

### System prompt update (~3 lines)

The existing injection says "use `[[CONTINUE_DELEGATE:]]` when you need..." — this becomes "use `continue_delegate()` when you need..." with the same decision framework. Brackets remain documented as the raw-text alternative for agents without tool access.

### Tests (~30-50 lines)

- Tool accepts valid params and calls spawn
- Tool respects delay clamping (min 5s, max 300s)
- Tool sets `silentAnnounce` for silent mode
- Tool sets `silentAnnounce + wakeOnReturn` for silent-wake mode
- Tool rejects when continuation not enabled
- Tool returns structured feedback

## What Changes Architecturally

**Nothing fundamental.** The tool calls the same `spawnSubagentDirect()` function that the bracket parser calls. The same `enqueueSystemEvent()` for markers. The same `setTimeout()` for delays. The tool is a thin schema-typed entry point into existing machinery.

The bracket parser remains — it handles agents without tool access and provides backward compatibility. The tool is a discoverability layer, not a replacement.

## Diff Estimate

- `src/agents/tools/continue-delegate-tool.ts` — new file, ~100 lines
- `src/agents/openclaw-tools.ts` — +5 lines (registration)
- `src/agents/pi-tools.policy.ts` — +2 lines (policy)
- `src/agents/tool-catalog.ts` — +6 lines (catalog entry)
- `src/agents/system-prompt.ts` — +3/-3 lines (reference tool instead of brackets as primary)
- `src/agents/tools/continue-delegate-tool.test.ts` — new file, ~50 lines

**Total: ~170 lines, 2 new files, 3 modified files.**

## The Argument Against (Steel-Manned)

1. **Two ways to do the same thing.** Having both brackets and a tool means two code paths to maintain. Counter: the tool calls the same functions as the bracket parser. It's not a parallel implementation — it's a schema layer on top.

2. **Scope.** The PR is already large. Counter: 170 lines on top of a PR that already has 2000+ is ~8%. And it solves the problem the PR exists to solve.

3. **The bracket parser is the mechanism; the tool is presentation.** Counter: presentation IS the problem. The mechanism works. The agent doesn't reach for it.

## Recommendation

Build it. The tool wrapper is ~170 lines, calls existing functions, and solves the diagnosed problem. Keeping brackets as a fallback for agents without tools. Filing it as follow-up when every review identified discoverability as the gap is deferring the fix.

figs is right.
