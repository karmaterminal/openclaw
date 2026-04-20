// Lazy-side boundary for the continuation/* singleton-bearing modules.
//
// CLAUDE.md rule: "Do not mix `await import('x')` and static `import ... from 'x'`
// for the same module in production code paths." The continuation modules
// (config, delegate-store, delegate-dispatch, state, context-pressure) carry
// per-process singleton state (Maps, ref counts, TaskFlow handles) and were
// being imported both statically (hot paths) and dynamically (cold paths) from
// agent-runner / followup-runner / status / commands surface. Rolldown was
// emitting them in two chunks with two separate Map identities — the bug
// surfaced by #584 (continue_work tool calls silently dropped) and worked
// around at tsdown.config.ts:147 by promoting agent-runner.runtime to a
// unified-graph entry.
//
// This module is the dedicated lazy-side entry. Every cold-path consumer
// (delayed dispatch, post-compaction drain, context-pressure trip,
// chain-state persist, status-command CLI) routes its `await import(...)` /
// `require(...)` through here instead of pulling the underlying module
// directly. The static-side consumers (status.ts, agent-runner top-level,
// continue-{work,delegate}-tool, subagent-announce.continuation.runtime) keep
// their direct static imports.
//
// Boundary rule: NO file in src/ may statically import from this module —
// that would defeat the lazy split. Enforced by the CLAUDE.md guardrail and
// caught at review time. The static-side surface continues to import the
// underlying modules directly; this entry exists only to give dynamic
// consumers a single bundler-stable target so rolldown can dedupe the
// singleton chunks.
//
// Registered as a tsdown bundler entry: `auto-reply/continuation/lazy.runtime`
// in `tsdown.config.ts`.
//
// RFC: docs/design/continue-work-signal-v2.md §6.4 (lazy-side dedupe).

export { resolveContinuationRuntimeConfig } from "./config.js";
export { dispatchToolDelegates } from "./delegate-dispatch.js";
export {
  consumeStagedPostCompactionDelegates,
  pendingDelegateCount,
  stagedPostCompactionDelegateCount,
} from "./delegate-store.js";
export { checkContextPressure, clearContextPressureState } from "./context-pressure.js";
export { loadContinuationChainState, persistContinuationChainState } from "./state.js";
