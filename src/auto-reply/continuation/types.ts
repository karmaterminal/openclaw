/**
 * Core type definitions for the continuation system.
 *
 * RFC: docs/design/continue-work-signal-v2.md
 *
 * These types are shared across signal parsing, scheduling, delegate dispatch,
 * state persistence, and tool definitions. They represent the contracts that
 * the rest of the continuation surface is built on.
 */

// ---------------------------------------------------------------------------
// Continuation signals — parsed from response text or captured from tool calls
// ---------------------------------------------------------------------------

/**
 * A parsed continuation signal from either bracket syntax or a tool call.
 *
 * Tool path: `continue_work()` sets kind="work", `continue_delegate()` sets kind="delegate".
 * Token path: `CONTINUE_WORK` / `CONTINUE_WORK:N` → kind="work",
 *             `[[CONTINUE_DELEGATE: task]]` → kind="delegate".
 *
 * Both paths converge into the same scheduler — the signal shape is identical
 * regardless of origin.
 */
export type ContinuationSignal =
  | {
      kind: "work";
      delayMs?: number;
    }
  | {
      kind: "delegate";
      task: string;
      delayMs?: number;
      silent?: boolean;
      silentWake?: boolean;
    };

// ---------------------------------------------------------------------------
// Pending delegates — enqueued by continue_delegate tool, consumed post-response
// ---------------------------------------------------------------------------

/**
 * A delegate waiting to be dispatched after the current turn completes.
 * Enqueued by the `continue_delegate` tool during execution, consumed by
 * the delegate dispatch module after the response finalizes.
 */
export type PendingContinuationDelegate = {
  task: string;
  delayMs?: number;
  mode?: "normal" | "silent" | "silent-wake" | "post-compaction";
  /** Convenience booleans for TaskFlow state serialization. */
  silent?: boolean;
  silentWake?: boolean;
  postCompaction?: boolean;
};

/**
 * A delayed delegate reservation tracked between scheduling and spawn.
 * Timers are volatile (in-memory only) unless TaskFlow backing is enabled.
 */
export type DelayedContinuationReservation = {
  id: string;
  source: "bracket" | "tool";
  task: string;
  createdAt: number;
  fireAt: number;
  plannedHop: number;
  silent?: boolean;
  silentWake?: boolean;
};

// ---------------------------------------------------------------------------
// Continuation runtime config — resolved from gateway config at use time
// ---------------------------------------------------------------------------

/**
 * Resolved continuation configuration. Read from `agents.defaults.continuation`
 * at each enforcement point (hot-reloadable).
 *
 * Note: no `generationGuardTolerance` field. The generation guard mechanism
 * was expunged per figs ruling (2026-04-15): unrelated channel noise must not
 * cancel dispatched continuation work.
 */
export type ContinuationRuntimeConfig = {
  enabled: boolean;
  taskFlowDelegates: boolean;
  defaultDelayMs: number;
  minDelayMs: number;
  maxDelayMs: number;
  maxChainLength: number;
  costCapTokens: number;
  maxDelegatesPerTurn: number;
  contextPressureThreshold?: number;
};

// ---------------------------------------------------------------------------
// Post-compaction delegate staging
// ---------------------------------------------------------------------------

/**
 * A delegate staged for release after compaction completes.
 * Stored on `SessionEntry.pendingPostCompactionDelegates`.
 * Released in the after-compaction lifecycle path with
 * `silentAnnounce: true` and `wakeOnReturn: true`.
 */
export type StagedPostCompactionDelegate = {
  task: string;
  stagedAt: number;
};

// ---------------------------------------------------------------------------
// continue_work tool-call request shape
// ---------------------------------------------------------------------------

/**
 * Captured by `continue_work()` during tool execution; consumed by the runner
 * in the same turn's post-response. Same-turn ephemeral — never persisted
 * across turn boundaries or gateway restarts.
 *
 * Single canonical definition. Prior to karmaterminal/openclaw#223 this type
 * was duplicated in `signal.ts`, `continue-work-tool.ts`, and inline in
 * `delegate-store.ts`.
 */
export type ContinueWorkRequest = {
  reason: string;
  delaySeconds: number;
};
