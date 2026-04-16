/**
 * Continuation post-response wiring.
 *
 * Called by agent-runner after a main-session response completes. Handles:
 *   1. Token fallback parsing (CONTINUE_WORK, [[CONTINUE_DELEGATE:]])
 *   2. Pending delegate consumption and categorization by dispatch strategy
 *   3. Same-session continuation scheduling (CONTINUE_WORK / continue_work)
 *   4. Delayed delegate timer arming with captured payloads
 *   5. Post-compaction delegate staging (returned for caller to persist)
 *
 * This module is the single integration point between agent-runner.ts and the
 * continuation machinery. All continuation code lives outside agent-runner.
 *
 * Delegate dispatch strategies (RFC §2.3, §3.2):
 *   - immediate (delayMs=0): returned in `immediateSpawns` for direct spawn
 *   - delayed (delayMs>0, mode≠post-compaction): armed via setTimeout; timer
 *     callback invokes the provided `onDelegateSpawn` with captured payload
 *   - post-compaction: returned in `postCompactionStaged` for session staging
 *
 * NO generation guard is applied. Delayed work should not be cancelled by
 * unrelated channel noise (design decision 2026-04-15).
 */

import { logVerbose } from "../globals.js";
import {
  clampDelay,
  resolveContinuationConfig,
  type ContinuationConfig,
  type ResolvedContinuationConfig,
} from "./continuation-config.js";
import {
  consumePendingDelegates,
  enqueuePendingDelegate,
  type PendingContinuationDelegate,
} from "./continuation-delegate-store.js";
import { scheduleContinuationTurn } from "./continuation-scheduler.js";
import {
  parseContinuationSignal,
  stripContinuationSignal,
  type ContinuationSignal,
} from "./continuation-tokens.js";

export type ContinuationPostResponseParams = {
  /** Session key for the completed turn. */
  sessionKey: string;
  /** Raw continuation config from the agent/operator config. */
  continuationConfig: ContinuationConfig | undefined;
  /** Finalized response text (before display stripping). */
  finalText: string | undefined;
  /** Current chain depth for this session. */
  chainDepth: number;
  /** Accumulated token cost for this chain. */
  chainTokens: number;
  /**
   * Callback invoked when a delayed delegate timer fires. The caller (agent-
   * runner) provides this so the wire module can arm timers that carry the
   * delegate payload to the spawn point without importing sub-agent infra.
   *
   * Not called for immediate or post-compaction delegates — those are returned
   * directly in the result for the caller to handle synchronously.
   */
  onDelegateSpawn?: (delegate: PendingContinuationDelegate) => void;
};

export type DelegateTimer = {
  handle: NodeJS.Timeout;
  dueAt: number;
  delegate: PendingContinuationDelegate;
};

export type ContinuationPostResponseResult = {
  /** The display text with continuation signals stripped. */
  displayText: string | undefined;
  /** Whether a continuation was scheduled (work or delegate). */
  continuationScheduled: boolean;
  /** The parsed signal, if any. */
  signal: ContinuationSignal | undefined;
  /** Delegates ready for immediate spawn (delayMs=0, mode≠post-compaction). */
  immediateSpawns: PendingContinuationDelegate[];
  /** Delegates with armed timers (delayMs>0, mode≠post-compaction). */
  delayedTimers: DelegateTimer[];
  /** Delegates staged for post-compaction release. */
  postCompactionStaged: PendingContinuationDelegate[];
  /** All consumed delegates (union of the three categories above). */
  consumedDelegates: PendingContinuationDelegate[];
};

/**
 * Process continuation after a main-session response completes.
 *
 * 1. Parse token-fallback signals from response text
 * 2. Consume tool-path delegates from the pending store
 * 3. Merge token-path delegates into the consumed set
 * 4. Categorize delegates by dispatch strategy
 * 5. Schedule same-session continuation (CONTINUE_WORK)
 * 6. Arm delayed delegate timers with captured payloads
 * 7. Return categorized results + stripped display text
 */
export function processContinuationPostResponse(
  params: ContinuationPostResponseParams,
): ContinuationPostResponseResult {
  const config = resolveContinuationConfig(params.continuationConfig);

  if (!config.enabled) {
    return {
      displayText: params.finalText,
      continuationScheduled: false,
      signal: undefined,
      immediateSpawns: [],
      delayedTimers: [],
      postCompactionStaged: [],
      consumedDelegates: [],
    };
  }

  // 1. Parse token-fallback signals from response text
  const signal = params.finalText ? parseContinuationSignal(params.finalText) : undefined;

  const displayText =
    signal && params.finalText
      ? stripContinuationSignal(params.finalText) || undefined
      : params.finalText;

  // 2. Consume tool-path delegates
  const consumedDelegates = consumePendingDelegates(params.sessionKey);

  let continuationScheduled = false;

  // 3. Handle token-fallback signal (only if no tool-path delegates — tool path takes priority)
  if (signal && consumedDelegates.length === 0) {
    if (signal.kind === "work") {
      const delayMs = signal.delaySeconds ? signal.delaySeconds * 1000 : config.defaultDelayMs;

      const timer = scheduleContinuationTurn({
        sessionKey: params.sessionKey,
        delayMs,
        config,
        chainDepth: params.chainDepth,
        reason: "token-fallback: CONTINUE_WORK",
      });
      continuationScheduled = timer !== undefined;
    } else if (signal.kind === "delegate") {
      // Token-path delegate — enqueue and then consume in the same cycle
      enqueuePendingDelegate(params.sessionKey, {
        task: signal.task,
        delayMs: signal.delaySeconds ? signal.delaySeconds * 1000 : config.defaultDelayMs,
        mode: "normal",
        chainHop: params.chainDepth,
        enqueuedAt: Date.now(),
      });
      const freshDelegates = consumePendingDelegates(params.sessionKey);
      consumedDelegates.push(...freshDelegates);
    }
  }

  // 4. Categorize delegates and dispatch
  const immediateSpawns: PendingContinuationDelegate[] = [];
  const delayedTimers: DelegateTimer[] = [];
  const postCompactionStaged: PendingContinuationDelegate[] = [];

  if (consumedDelegates.length > 0) {
    continuationScheduled = true;
    categorizeDelegates({
      sessionKey: params.sessionKey,
      delegates: consumedDelegates,
      config,
      chainDepth: params.chainDepth,
      onDelegateSpawn: params.onDelegateSpawn,
      immediateSpawns,
      delayedTimers,
      postCompactionStaged,
    });
  }

  return {
    displayText,
    continuationScheduled,
    signal,
    immediateSpawns,
    delayedTimers,
    postCompactionStaged,
    consumedDelegates,
  };
}

/**
 * Categorize consumed delegates into dispatch strategies and arm timers
 * for delayed delegates.
 *
 * Dispatch strategies per RFC §2.3:
 *   - post-compaction → staged for session metadata, released after compaction
 *   - immediate (delayMs=0) → returned for direct spawn by caller
 *   - delayed (delayMs>0) → timer armed with captured payload; fires onDelegateSpawn
 */
function categorizeDelegates(params: {
  sessionKey: string;
  delegates: PendingContinuationDelegate[];
  config: ResolvedContinuationConfig;
  chainDepth: number;
  onDelegateSpawn: ((delegate: PendingContinuationDelegate) => void) | undefined;
  immediateSpawns: PendingContinuationDelegate[];
  delayedTimers: DelegateTimer[];
  postCompactionStaged: PendingContinuationDelegate[];
}): void {
  const {
    sessionKey,
    delegates,
    config,
    chainDepth,
    onDelegateSpawn,
    immediateSpawns,
    delayedTimers,
    postCompactionStaged,
  } = params;

  logVerbose(
    `[continuation:delegate-pending] ${delegates.length} delegate(s) registered for ${sessionKey}`,
  );

  for (const delegate of delegates) {
    // Post-compaction delegates are staged, not dispatched
    if (delegate.mode === "post-compaction") {
      logVerbose(
        `[continuation:post-compaction-staged] session=${sessionKey} task=${delegate.task.slice(0, 60)}`,
      );
      postCompactionStaged.push(delegate);
      continue;
    }

    // Chain depth guard — applies at categorization, not just at enqueue
    if (chainDepth >= config.maxChainLength) {
      logVerbose(
        `[continuation] Chain depth ${chainDepth}/${config.maxChainLength} — ` +
          `delegate rejected: ${delegate.task.slice(0, 60)}`,
      );
      continue;
    }

    if (delegate.delayMs === 0) {
      // Immediate delegates — returned for direct spawn
      logVerbose(
        `[continuation:delegate-immediate] session=${sessionKey} ` +
          `mode=${delegate.mode} task=${delegate.task.slice(0, 60)}`,
      );
      immediateSpawns.push(delegate);
    } else {
      // Delayed delegates — arm timer with captured payload
      const clampedDelayMs = clampDelay(delegate.delayMs, config);

      const dueAt = Date.now() + clampedDelayMs;
      const handle = setTimeout(() => {
        logVerbose(
          `[continuation:delegate-spawned] task=${delegate.task.slice(0, 60)} ` +
            `delay=${clampedDelayMs}ms session=${sessionKey}`,
        );
        if (onDelegateSpawn) {
          onDelegateSpawn(delegate);
        }
      }, clampedDelayMs);

      // Prevent the timer from keeping the process alive
      if (handle.unref) {
        handle.unref();
      }

      logVerbose(
        `[continuation:delegate-delayed] session=${sessionKey} ` +
          `mode=${delegate.mode} delayMs=${clampedDelayMs} ` +
          `task=${delegate.task.slice(0, 60)}`,
      );

      delayedTimers.push({ handle, dueAt, delegate });
    }
  }
}

/**
 * Check whether continuation is enabled for the given config.
 */
export function isContinuationEnabled(continuationConfig: ContinuationConfig | undefined): boolean {
  return resolveContinuationConfig(continuationConfig).enabled;
}

/**
 * Cancel all armed delegate timers. Used on session reset or shutdown.
 */
export function cancelDelegateTimers(timers: DelegateTimer[]): void {
  for (const timer of timers) {
    clearTimeout(timer.handle);
  }
}
