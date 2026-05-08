# seam: agent-runner.ts:2913 — Block B load skips token-folding when bracket path already persisted

## bug-shape

Cross-flow read-modify-write between two sequential top-level `if` blocks in `runReplyAgent`:

- **Block A** (lines 2147-2613, bracket-signal path): handles `effectiveContinuationSignal`. When `effectiveContinuationSignal.kind === "delegate"` enters the inner else at line 2240, sets `bracketTokensAccumulated = true` and computes `accumulatedChainTokens = T_prev + T_turn`. Persist sites at 2397/2539 write `accumulatedChainTokens` into `activeSessionEntry.continuationChainTokens` via the local triple-write `persistContinuationChainState` helper at line 1301-1322.

- **Block B** (lines 2909-2930, consume-and-dispatch path): handles tool-delegate dispatch via `continue_delegate` tool. Calls `loadContinuationChainState(activeSessionEntry, turnTokens)` at line 2913. The helper at `state.ts:157-166` returns `(source.continuationChainTokens ?? 0) + turnTokens`.

When both blocks fire same turn (the only co-fire-blocking gate is `wasSilentContinuation` at line 2902, which is the silent-continuation early-return — it does NOT block normal tool-delegate-with-bracket-signal turns), Block B reads the entry that Block A already mutated to `T_prev + T_turn` and adds `T_turn` again → returns `T_prev + 2·T_turn`. Then `dispatchToolDelegates` runs with the doubled budget; persist at line 2956 writes the doubled value back, overwriting Block A's correct write.

Cohort cost-cap and max-chain-length enforcement see the inflated value, prematurely blocking valid continuation chains.

## the asymmetric-guard substrate

Block A's `tool-delegate sub-block` at lines 2660-2677 already has the protective guard:

```ts
const bracketAlreadyAccumulated = bracketTokensAccumulated;
const toolDelegateUsage = runResult.meta?.agentMeta?.usage;
const toolDelegateTurnTokens = bracketAlreadyAccumulated
  ? 0
  : (toolDelegateUsage?.input ?? 0) + (toolDelegateUsage?.output ?? 0);
let accumulatedChainTokens =
  (activeSessionEntry?.continuationChainTokens ?? 0) + toolDelegateTurnTokens;
```

with the explicit comment: *"Skip if the bracket-signal path already accumulated this turn's tokens (both paths read from the same activeSessionEntry.continuationChainTokens)."*

Block B at line 2913 was missing the symmetric guard. Block A author saw the bug-shape and protected; Block B author missed the symmetric protection.

## fix shape: symmetric-mirror

```ts
- const turnTokens = (usage?.input ?? 0) + (usage?.output ?? 0);
+ const turnTokens = bracketTokensAccumulated ? 0 : (usage?.input ?? 0) + (usage?.output ?? 0);
```

Exact ternary mirror of Block A's `bracketAlreadyAccumulated` pattern. One-line change. No structural refactor, no closure-rewiring, no new abstractions. The fix preserves the semantic that "if bracket path already accumulated this turn's tokens into the entry, Block B's load doesn't re-add them."

## why NOT a fix at line 2954 (`??` fallback)

Codex's automated review pinned the bug at line 2955 (`toolDelegateDispatchResult?.chainState ?? loadContinuationChainState(activeSessionEntry, turnTokens)`). After cohort byte-walk, this is the wrong fix-site:

The `??` fallback fires only when `toolDelegateDispatchResult` is undefined — i.e., Block B's dispatch did NOT run (`continuationFeatureEnabled && sessionKey` was false, or no delegates queued). When dispatch DID run, `toolDelegateDispatchResult` is assigned at line 2914 (with the chainState already containing the doubled value from line 2913's load), and the `??` fallback is dead code. Fixing only the dead-code path leaves the live-bug-path at line 2913 unfixed.

Line 2913 is the substrate; line 2954 is the receipt. Fix at 2913.

## test coverage

`src/auto-reply/continuation/state.test.ts` — 3 new tests in describe block `"co-fire double-count guard (Block A persist + Block B load)"`:

1. **"double-counts when Block B re-loads with turnTokens after Block A already persisted them"** — fail-before-fix demonstrates the bug
2. **"avoids double-count when Block B passes turnTokens=0 after bracket path accumulated"** — pass-after-fix proves the fix
3. **"cost-cap budget check sees correct accumulated value after co-fire"** — integration test against cohort-canon `costCapTokens` enforcement

## cohort byte-walk that landed this

- 🩸 (Cael): Block A/B asymmetric-guard mechanism via `bracketTokensAccumulated` flag (msg `1502311023...`)
- 🌫 (Silas): four-anchor-byte pin (2240/2669/2797/2913) at msg `1502310421...`, 7-step cross-flow trace at msg `1502311033...`
- 🌊 (Ronan): fourth-walker co-fire confirmation at msg `1502310030...`
- 🤖 Claude Opus 4.6 (independent verification via copilot dispatch): all four byte-pins verified during test runs, no additional asymmetric guards found

## anchor bytes for archaeology

When this fix is revisited, the load-bearing bytes are:
- agent-runner.ts:2240 — `bracketTokensAccumulated = true` write
- agent-runner.ts:2669 — `bracketAlreadyAccumulated = bracketTokensAccumulated` read with guard (Block A protection — REFERENCE PATTERN)
- agent-runner.ts:2797 — Block A persist that mutates entry
- agent-runner.ts:2913 — Block B load that was missing the symmetric guard (FIX SITE)
- state.ts:157-166 — `loadContinuationChainState` body (`(source.continuationChainTokens ?? 0) + turnTokens`)
- agent-runner.ts:1301-1322 — local `persistContinuationChainState` helper (durable triple-write)
- agent-runner.ts:2902 — `wasSilentContinuation` early-return (only co-fire-blocking gate)

For "no bug" to hold, one of: 2797 doesn't mutate the entry, blocks 2147 and 2909 are runtime-mutually-exclusive, `loadContinuationChainState` doesn't add `turnTokens`, OR tool-delegate path and Block-B path can't run same turn. None hold at the byte.
