// SPDX-License-Identifier: AGPL-3.0
//
// Post-compaction delegate dispatch helper.
//
// Releases delegates that were staged during a session for execution after
// auto-compaction completes. Each spawn failure must be observable: a named
// log anchor plus a system event so the dispatcher cannot drop work silently
// (regression-cover for the silent-catch class fixed in karmaterminal/openclaw#203).

import type { PendingContinuationDelegate } from "./types.js";

/**
 * Minimal logger surface used by {@link dispatchPostCompactionDelegates}.
 * Matches the {@link createSubsystemLogger} contract — kept narrow so the
 * helper can be unit-tested without pulling the full logging subsystem.
 */
export interface PostCompactionDispatchLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

export interface PostCompactionSpawnContext {
  agentSessionKey: string;
  agentChannel?: string;
  agentAccountId?: string;
  agentTo?: string;
  agentThreadId?: string | number;
}

/**
 * Result shape from a single delegate spawn attempt. The dispatcher only
 * cares about success vs failure — caller-side semantics (status fields,
 * spawn metadata) belong to the spawn implementation.
 */
export type PostCompactionSpawnFn = (
  params: {
    task: string;
    silentAnnounce: true;
    wakeOnReturn: true;
    drainsContinuationDelegateQueue: true;
  },
  ctx: PostCompactionSpawnContext,
) => Promise<unknown>;

export interface DispatchPostCompactionDelegatesArgs {
  sessionKey: string;
  delegates: PendingContinuationDelegate[];
  spawnContext: PostCompactionSpawnContext;
  spawnFn: PostCompactionSpawnFn;
  log: PostCompactionDispatchLogger;
  enqueueSystemEvent: (text: string, opts: { sessionKey: string }) => void;
}

export interface DispatchPostCompactionDelegatesResult {
  attempted: number;
  spawned: number;
  failed: number;
}

/**
 * Run each staged delegate through {@link spawnFn}. On failure, emit:
 *   - a `[continuation:post-compaction-spawn-failed]` log line at warn level
 *   - a system event so the operator surface sees the dropped work
 *
 * Failures are isolated per-delegate — one failure does not stop the rest.
 */
export async function dispatchPostCompactionDelegates(
  args: DispatchPostCompactionDelegatesArgs,
): Promise<DispatchPostCompactionDelegatesResult> {
  const { sessionKey, delegates, spawnContext, spawnFn, log, enqueueSystemEvent } = args;
  let spawned = 0;
  let failed = 0;
  for (const delegate of delegates) {
    try {
      await spawnFn(
        {
          task: delegate.task,
          silentAnnounce: true,
          wakeOnReturn: true,
          drainsContinuationDelegateQueue: true,
        },
        spawnContext,
      );
      spawned++;
    } catch (err) {
      failed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      log.warn(
        `[continuation:post-compaction-spawn-failed] error=${errMsg} session=${sessionKey} task=${delegate.task.slice(0, 80)}`,
      );
      enqueueSystemEvent(
        `[continuation] Post-compaction delegate spawn failed: ${errMsg}. Task: ${delegate.task}`,
        { sessionKey },
      );
    }
  }
  return { attempted: delegates.length, spawned, failed };
}
