# seam: delegate-dispatch.ts:103 — hedge-fire path persists advanced chainState

## bug-shape

The hedge timer callback in `armHedgeTimer` (delegate-dispatch.ts) at lines 97-115 fired `void dispatchToolDelegates(...).catch(...)` and discarded the returned Promise.

`dispatchToolDelegates` at line 175 explicitly declares its return type as `Promise<{ dispatched: number; rejected: number; chainState: ChainState }>` with the doc-comment:

> *"Without this the persisted counter never advances across hops and the maxChainLength budget enforcement breaks."*

The non-hedge call-site at agent-runner.ts:2952 already persists the returned chainState via `persistContinuationChainState`. The hedge path was the only asymmetry — it dispatched delegates (advancing the chain in-flight) but never wrote the new `currentChainCount` / `accumulatedChainTokens` back to the session entry.

Operational impact: quiet delayed hops in fully-quiet channels skip max-chain enforcement and cost-cap enforcement. A session in chain-delayed-dispatch mode could exceed `maxChainLength` because the persisted counter never advanced past the snapshot taken at hedge-arm time.

## fix shape

Three coordinated changes:

### 1. `dispatchToolDelegates` accepts an optional persist callback (delegate-dispatch.ts:175-185)

```ts
export async function dispatchToolDelegates(params: {
  sessionKey: string;
  chainState: ChainState;
  ctx: DelegateDispatchContext;
  maxChainLength: number;
  loadFreshChainState?: () => ChainState;
+ /**
+  * Optional callback invoked after hedge-timer dispatch to persist the
+  * advanced chain state. Without this the hedge path's `void` discard
+  * loses currentChainCount/accumulatedChainTokens and subsequent hops
+  * bypass maxChainLength/cost-cap enforcement.
+  */
+ persistChainState?: (state: ChainState) => void | Promise<void>;
}): Promise<{ dispatched: number; rejected: number; chainState: ChainState }>;
```

Symmetric with the existing `loadFreshChainState?: () => ChainState` callback. Both callbacks are caller-supplied because `dispatchToolDelegates` lives in the lazy-runtime module which intentionally does NOT have direct access to the durable triple-write `persistContinuationChainState` (which lives in the agent-runner closure).

### 2. `armHedgeTimer` threads the callback + the setTimeout becomes async (delegate-dispatch.ts:69-115)

```ts
function armHedgeTimer(
  sessionKey: string,
  fireAt: number,
  params: {
    chainState: ChainState;
    ctx: DelegateDispatchContext;
    maxChainLength: number;
    loadFreshChainState?: () => ChainState;
+   persistChainState?: (state: ChainState) => void | Promise<void>;
  },
): void {
  ...
- const handle = setTimeout(() => {
+ const handle = setTimeout(async () => {
    ...
-   void dispatchToolDelegates({
-     sessionKey, chainState: refreshedChainState, ctx: params.ctx,
-     maxChainLength: params.maxChainLength,
-     loadFreshChainState: params.loadFreshChainState,
-   }).catch((err) => {
+   try {
+     const result = await dispatchToolDelegates({
+       sessionKey, chainState: refreshedChainState, ctx: params.ctx,
+       maxChainLength: params.maxChainLength,
+       loadFreshChainState: params.loadFreshChainState,
+       persistChainState: params.persistChainState,
+     });
+     if (params.persistChainState && result.dispatched > 0) {
+       await params.persistChainState(result.chainState);
+     }
+   } catch (err) {
      const errorMessage = formatErrorMessage(err);
      log.error(`[continuation:delegate-hedge-error] error=${errorMessage} session=${sessionKey}`);
      surfaceHedgeDispatchFailure(sessionKey, errorMessage);
      try {
        armHedgeTimer(sessionKey, Date.now() + HEDGE_DISPATCH_FAILURE_RETRY_MS, params);
      } catch (rearmErr) { ... }
+   }
  }, fireIn);
  ...
}
```

The conditional persist (`result.dispatched > 0`) avoids spurious persists when the hedge dispatch fired but produced zero actual dispatches (queue drained between arm and fire, etc.). Only writes when the hedge actually advanced state.

Try/catch swap from `.catch()` to async/await preserves error-path identical: rearm-on-failure still fires via `armHedgeTimer(sessionKey, Date.now() + HEDGE_DISPATCH_FAILURE_RETRY_MS, params)`.

### 3. `agent-runner.ts:2926` wires the closure (the durable triple-write)

```ts
toolDelegateDispatchResult = await dispatchToolDelegates({
  sessionKey,
  chainState: dispatchChainState,
  ctx: { ... },
  maxChainLength: resolveLiveContinuationRuntimeConfig(cfg).maxChainLength,
  loadFreshChainState: () => loadContinuationChainState(activeSessionEntry, 0),
+ persistChainState: async (state) => {
+   await persistContinuationChainState({
+     count: state.currentChainCount,
+     startedAt: state.chainStartedAt,
+     tokens: state.accumulatedChainTokens,
+   });
+ },
});
```

The closure captures `persistContinuationChainState` — the LOCAL async helper at agent-runner.ts:1301-1322 that does the durable triple-write (sessionEntry + sessionStore + disk via `updateSessionStore`). NOT the lazy.runtime helper of the same name (which only mutates in-memory `sessionEntry`).

This is the architecturally-correct seam: the persist responsibility stays at the agent-runner layer where the durable-triple-write helper lives; delegate-dispatch.ts just provides the callback hook.

## why NOT inline the persist inside `dispatchToolDelegates`

`dispatchToolDelegates` is in the lazy-runtime module imported at line 2911 via `await import("../continuation/lazy.runtime.js")`. Lazy-runtime modules are intentionally separate from the agent-runner closure — they're loaded on-demand to keep startup costs bounded. Reaching back into the agent-runner closure for the durable-persist would couple lazy-runtime to agent-runner, breaking the lazy-load boundary.

The optional callback pattern preserves the boundary: lazy-runtime accepts a persist function; agent-runner provides one bound to its own durable-write helper.

## test coverage

`src/auto-reply/continuation/delegate-dispatch.test.ts` — 3 new tests in describe block `"hedge-fire chainState persistence"`:

1. **"persists advanced chainState via callback after hedge-timer dispatch"** — verifies the new persist-on-success path
2. **"does not persist when hedge dispatch spawns zero delegates"** — verifies the `result.dispatched > 0` guard
3. **"enforces max-chain budget correctly after hedge persists advanced state"** — integration test against cohort-canon `maxChainLength` enforcement

## potential ordering-race consideration

Closure at agent-runner.ts:2926 captures async `persistContinuationChainState`. If hedge fires AND main-path fires near-simultaneously, both invoking persist with different state — could there be an ordering race?

Read: hedge is delayed-dispatch substrate (per the existing `loadFreshChainState` doc-comment about *"may understate currentChainCount if other dispatches advanced it in between"*), so co-fire IS expected by design. The hedge path's `loadFreshChainState` already addresses snapshot-staleness at fire-time (re-reads the persisted state immediately before dispatch); the persist at hedge-fire writes the freshly-loaded-and-advanced state. Each hedge-fire reads fresh + writes fresh, so the durable state always reflects the latest persist-call ordering.

If main-path persists with stale state and hedge persists with fresh state shortly after, the fresh persist wins (last-write-wins on the durable triple-write). Reverse ordering (hedge first, main-path with staler state second) is theoretically possible but main-path always reads fresh from `activeSessionEntry` at line 2913, so the "main-path with staler state" scenario doesn't arise in practice.

This caveat-question was surfaced during cohort byte-walk; flagging here for archaeology rather than as an active concern.

## anchor bytes for archaeology

- delegate-dispatch.ts:69-78 — `armHedgeTimer` signature (now includes `persistChainState`)
- delegate-dispatch.ts:81-115 — setTimeout callback (now async, awaits + persists)
- delegate-dispatch.ts:172-185 — `dispatchToolDelegates` params (now includes `persistChainState`)
- delegate-dispatch.ts:201-205 — params forwarded to `armHedgeTimer` re-arm path
- agent-runner.ts:1301-1322 — local `persistContinuationChainState` helper (durable triple-write)
- agent-runner.ts:2926 — closure-wiring at the call-site
- agent-runner.ts:2952 — non-hedge call-site (already-correct pattern, unchanged)

For "no bug" to hold, the hedge path would need to be unreachable in production (it isn't — armed any time `fireAt` is in the future at hedge-eligible dispatch sites), OR the discarded `chainState` would need to be already-persisted elsewhere (it isn't — the synchronous caller path is the only persist site, and the hedge path bypasses it).
