/**
 * Continuation-durability harness — shared helpers for the three scenarios.
 *
 * Provides:
 *   - `createDurabilityFixture()` — tmpdir session-store file + cleanup.
 *   - `seedSessionEntry()` — write an initial child/parent entry.
 *   - `readSessionEntry()` — read an entry from disk via `loadSessionStore`.
 *   - `installFakeSpawn()` — vi.mock-friendly fake for `spawnSubagentDirect`.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSessionStore, updateSessionStore } from "../../../../src/config/sessions/store.js";
import type { SessionEntry } from "../../../../src/config/sessions/types.js";

export type DurabilityFixture = {
  storePath: string;
  cleanup: () => Promise<void>;
};

/**
 * Create a tmpdir + session-store file path for one test.
 * Returned `cleanup()` removes the directory (call in `afterEach`).
 */
export async function createDurabilityFixture(): Promise<DurabilityFixture> {
  const dir = await mkdtemp(join(tmpdir(), "oc-cont-dur-"));
  const storePath = join(dir, "sessions.json");
  // Seed an empty store file so loadSessionStore returns {} not null on first read.
  await updateSessionStore(storePath, () => undefined);
  return {
    storePath,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Seed an entry at `sessionKey` with the given partial fields.
 * Real `updateSessionStore` write — flushes to disk.
 */
export async function seedSessionEntry(
  storePath: string,
  sessionKey: string,
  entry: Partial<SessionEntry> & { sessionId: string },
): Promise<void> {
  await updateSessionStore(storePath, (store) => {
    store[sessionKey] = {
      updatedAt: Date.now(),
      ...entry,
    } as SessionEntry;
  });
}

/**
 * Read the entry at `sessionKey` from disk via `loadSessionStore`.
 * Always re-reads from disk (skipCache: true) so callers see the latest
 * persisted state even after intervening writes.
 */
export function readSessionEntry(storePath: string, sessionKey: string): SessionEntry | undefined {
  const store = loadSessionStore(storePath, { skipCache: true });
  return store[sessionKey];
}

/**
 * Build a fake `spawnSubagentDirect` that returns a deterministic accepted
 * result without spinning a real subagent run. Records each call so tests
 * can assert spawn count, hop labels, and silent-wake mode.
 */
export type FakeSpawnCall = {
  task: string;
  drainsContinuationDelegateQueue?: boolean;
  silentAnnounce?: boolean;
  wakeOnReturn?: boolean;
  agentSessionKey: string;
};

export function createFakeSpawn(): {
  fn: (
    spec: {
      task: string;
      drainsContinuationDelegateQueue?: boolean;
      silentAnnounce?: boolean;
      wakeOnReturn?: boolean;
    },
    ctx: { agentSessionKey: string },
  ) => Promise<{ status: "accepted"; sessionKey: string; runId: string }>;
  calls: FakeSpawnCall[];
} {
  const calls: FakeSpawnCall[] = [];
  let counter = 0;
  return {
    calls,
    async fn(spec, ctx) {
      counter += 1;
      calls.push({
        task: spec.task,
        drainsContinuationDelegateQueue: spec.drainsContinuationDelegateQueue,
        silentAnnounce: spec.silentAnnounce,
        wakeOnReturn: spec.wakeOnReturn,
        agentSessionKey: ctx.agentSessionKey,
      });
      return {
        status: "accepted" as const,
        sessionKey: `${ctx.agentSessionKey}:child:${counter}`,
        runId: `run-${counter}`,
      };
    },
  };
}
