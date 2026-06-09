/**
 * Shared test helpers for seeding + reading the session store through the
 * canonical SQLite-transparent store API.
 *
 * Background: upstream refactored the session store from raw `sessions.json`
 * JSON files to a SQLite-backed store (`store-load.ts:loadSqliteSessionStore`).
 * Continuation tests that seed via raw `fs.writeFile(JSON.stringify(...))` no
 * longer round-trip through the loader, so reads come back `undefined`. These
 * helpers seed + read through `saveSessionStore` / `loadSessionStore` (the
 * canonical seam the production runtime uses), so the test scaffold tracks the
 * production store API and is drift-proof against future store-API changes.
 *
 * Usage (continuation tests):
 *   import { seedSessionStore, readSessionStoreForTest } from
 *     "../config/sessions/store-seed.test-helpers.js"; // adjust relative depth
 *
 *   await seedSessionStore({ "agent:main:main": { sessionId: "s", ... } });
 *   const store = readSessionStoreForTest();
 */
import fs from "node:fs";
import path from "node:path";
import { resolveStorePath } from "./paths.js";
import { loadSessionStore } from "./store-load.js";
import { saveSessionStore } from "./store.js";
import type { SessionEntry } from "./types.js";

/**
 * Resolve the default agent-scoped store path used by continuation tests.
 * Mirrors the resolution the continuation runtime uses (`agentId: "main"`).
 */
export function resolveTestStorePath(agentId = "main"): string {
  return resolveStorePath(undefined, { agentId });
}

/**
 * Seed the session store through the canonical `saveSessionStore` facade so the
 * data round-trips through the SQLite loader. Replaces the stale
 * `fs.writeFileSync(storePath, JSON.stringify(data))` seed pattern.
 *
 * `skipMaintenance` keeps the seed deterministic (no background pruning/rotation
 * during a unit test), matching upstream's own `seed via facade` fix
 * (`27189b3e74`).
 */
export async function seedSessionStore(
  data: Record<string, unknown>,
  opts: { agentId?: string } = {},
): Promise<string> {
  const storePath = resolveTestStorePath(opts.agentId);
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  await saveSessionStore(storePath, data as Record<string, SessionEntry>, {
    skipMaintenance: true,
  });
  return storePath;
}

/**
 * Read the seeded store through the canonical `loadSessionStore` (SQLite-backed).
 * Replaces stale `JSON.parse(fs.readFileSync(storePath, "utf8"))` reads.
 * `skipCache` guarantees a fresh read of what was just seeded.
 */
export function readSessionStoreForTest(
  opts: {
    agentId?: string;
  } = {},
): Record<string, SessionEntry> {
  const storePath = resolveTestStorePath(opts.agentId);
  return loadSessionStore(storePath, { skipCache: true });
}

/**
 * Read-modify-write a seeded store through the canonical API. Useful where a
 * test mutates an already-seeded store (e.g. injecting a child entry) — replaces
 * the stale `JSON.parse(readFileSync) ... writeFileSync(JSON.stringify)` pattern.
 */
export async function updateSeededSessionStore(
  mutate: (store: Record<string, SessionEntry>) => void,
  opts: { agentId?: string } = {},
): Promise<void> {
  const storePath = resolveTestStorePath(opts.agentId);
  const store = loadSessionStore(storePath, { skipCache: true });
  mutate(store);
  await saveSessionStore(storePath, store, { skipMaintenance: true });
}
