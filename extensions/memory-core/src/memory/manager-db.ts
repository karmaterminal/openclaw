import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  closeMemorySqliteWalMaintenance,
  configureMemorySqliteWalMaintenance,
  isPostgresSqlConnection,
  loadSqliteVecExtension,
  MEMORY_INDEX_DERIVED_TABLES,
  MEMORY_INDEX_STATE_TABLE,
  MEMORY_INDEX_VECTOR_TABLE,
  openOpenClawAgentDatabaseReadOnly,
} from "openclaw/plugin-sdk/memory-core-host-engine-storage";
import { resolveRuntimeWorkerUrl } from "openclaw/plugin-sdk/process-runtime";
import {
  openOpenClawAgentSqliteWorkerStoreV2,
  openNodeSqliteDatabase,
  runSqliteImmediateTransactionSync,
  tableExists as admittedTableExists,
} from "openclaw/plugin-sdk/sqlite-runtime";
import { withMemoryWorkspaceLock } from "../memory-workspace-lock.js";
import { memoryCpuProcessEntrypoints } from "./manager-cpu-entrypoints.js";
import { MEMORY_INDEX_STATE_ID, readMemoryDatabaseRevision } from "./manager-db-kernel.js";
import { withMemoryIndexGeneration } from "./manager-index-generation-lease.js";
import type { MemoryPublicationOperations } from "./manager-publication-task.js";
import { waitForMemoryReindexLock } from "./manager-reindex-lock.js";

const MEMORY_DATABASE_FILE_SUFFIXES = ["", "-wal", "-shm", "-journal"] as const;
const MEMORY_REINDEX_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Shadows owned by builds in this process, including suspended ones between syncs.
const liveMemoryReindexShadows = new Set<string>();

function resolveMemoryReindexBaseName(
  databaseBaseName: string,
  entryName: string,
): string | undefined {
  const matchedSuffix =
    MEMORY_DATABASE_FILE_SUFFIXES.find((suffix) => suffix && entryName.endsWith(suffix)) ?? "";
  const baseName = entryName.slice(0, entryName.length - matchedSuffix.length);
  const prefix = `${databaseBaseName}.memory-reindex-`;
  return baseName.startsWith(prefix) &&
    MEMORY_REINDEX_UUID_PATTERN.test(baseName.slice(prefix.length))
    ? baseName
    : undefined;
}

async function isRegularFile(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function hasSqliteVecExtension(db: DatabaseSync): boolean {
  try {
    const row = db.prepare("SELECT vec_version() AS version").get() as
      | { version?: unknown }
      | undefined;
    return typeof row?.version === "string" && row.version.trim().length > 0;
  } catch {
    return false;
  }
}

/** PostgreSQL reset borrows the existing agent owner without creating a missing index. */
export async function resetPostgresMemoryDatabase(params: {
  agentId: string;
  dbPath: string;
  workspaceDir: string;
}): Promise<boolean> {
  const lock = await waitForMemoryReindexLock(params.dbPath);
  try {
    return await withMemoryWorkspaceLock(params.workspaceDir, () =>
      withMemoryIndexGeneration(params.dbPath, "write", async () => {
        const worker = await openOpenClawAgentSqliteWorkerStoreV2<MemoryPublicationOperations>(
          { agentId: params.agentId, path: params.dbPath },
          { version: 2, assertCurrent() {} },
          {
            moduleUrl: resolveRuntimeWorkerUrl(memoryCpuProcessEntrypoints.publication),
            input: { kind: "agent" },
          },
        );
        try {
          const receipt = await worker.executeExisting(
            { type: "database.reset", input: undefined },
            () => {},
          );
          if (!receipt) {
            return false;
          }
          const result = receipt.value;
          if (!result.ok) {
            throw Object.assign(new Error(result.error.message), result.error, {
              entered: result.entered,
              committed: result.committed,
            });
          }
          return result.value;
        } finally {
          await worker.close();
        }
      }),
    );
  } finally {
    await lock.release();
  }
}

/** Reset derived content without replacing the shared agent database or its schema. */
export async function resetMemoryDatabase(params: {
  targetDb: DatabaseSync;
  dbPath: string;
  workspaceDir: string;
  vectorExtensionPath?: string;
}): Promise<boolean> {
  const db = params.targetDb;
  const lock = await waitForMemoryReindexLock(params.dbPath);
  try {
    return await withMemoryWorkspaceLock(params.workspaceDir, async () =>
      withMemoryIndexGeneration(params.dbPath, "write", async () => {
        if (admittedTableExists(db, MEMORY_INDEX_VECTOR_TABLE) && !hasSqliteVecExtension(db)) {
          const loaded = await loadSqliteVecExtension({
            db,
            extensionPath: params.vectorExtensionPath,
          });
          if (!loaded.ok) {
            throw new Error(
              `Memory reset requires sqlite-vec to clear the vector index: ${loaded.error}`,
            );
          }
        }
        return runSqliteImmediateTransactionSync(db, () => {
          const tables = MEMORY_INDEX_DERIVED_TABLES.filter((table) =>
            admittedTableExists(db, table),
          );
          if (
            !tables.some(
              (table) =>
                table !== MEMORY_INDEX_STATE_TABLE &&
                db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get(),
            )
          ) {
            return false;
          }
          const revision = readMemoryDatabaseRevision(db);
          const schema = tables.flatMap(
            (table) =>
              db
                .prepare(
                  "SELECT type, name, sql FROM main.sqlite_schema WHERE tbl_name = ? AND sql IS NOT NULL ORDER BY name",
                )
                // SAFETY: SQLite's catalog has text type/name/sql; the query excludes null SQL.
                .all(table) as Array<{ type: string; name: string; sql: string }>,
          );
          // Drop triggers before their targets; recreate every table before its indexes/triggers.
          // Keeping exact FTS/vector definitions also protects already-open manager handles.
          for (const entry of schema.filter((candidate) => candidate.type === "trigger")) {
            db.exec(`DROP TRIGGER "${entry.name.replaceAll('"', '""')}"`);
          }
          for (const table of tables) {
            db.exec(`DROP TABLE main.${table}`);
          }
          for (const type of ["table", "index", "trigger"]) {
            for (const entry of schema.filter((candidate) => candidate.type === type)) {
              db.exec(entry.sql);
            }
          }
          // Missing metadata requests a rebuild; never reuse an old revision (ABA).
          db.prepare(`INSERT INTO ${MEMORY_INDEX_STATE_TABLE} (id, revision) VALUES (?, ?)`).run(
            MEMORY_INDEX_STATE_ID,
            revision + 1,
          );
          return true;
        });
      }),
    );
  } finally {
    await lock.release();
  }
}

/** Remove one closed shadow memory database and its journal-mode sidecars. */
export async function removeMemoryDatabaseFiles(dbPath: string): Promise<void> {
  for (const suffix of MEMORY_DATABASE_FILE_SUFFIXES) {
    await fs.rm(`${dbPath}${suffix}`, { force: true });
  }
}

/** Keep orphan cleanup away from a shadow path until the returned release runs. */
export function retainLiveMemoryReindexShadow(shadowPath: string): () => void {
  const key = path.resolve(shadowPath);
  liveMemoryReindexShadows.add(key);
  return () => {
    liveMemoryReindexShadows.delete(key);
  };
}

/**
 * Remove shadows left by a crashed run. The Gateway, or one offline CLI, owns the
 * state directory exclusively, so a shadow this process does not hold has no live writer.
 */
export async function cleanupOrphanMemoryReindexShadows(dbPath: string): Promise<number> {
  if (!(await isRegularFile(dbPath))) {
    return 0;
  }
  const dir = path.dirname(dbPath);
  const databaseBaseName = path.basename(dbPath);
  const shadowBaseNames = new Set<string>();
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const shadowBaseName = resolveMemoryReindexBaseName(databaseBaseName, entry.name);
    if (shadowBaseName) {
      shadowBaseNames.add(shadowBaseName);
    }
  }

  let removed = 0;
  for (const shadowBaseName of shadowBaseNames) {
    const shadowPath = path.join(dir, shadowBaseName);
    // Registration precedes file creation, so a shadow listed above is either held or orphaned.
    if (liveMemoryReindexShadows.has(path.resolve(shadowPath))) {
      continue;
    }
    try {
      await removeMemoryDatabaseFiles(shadowPath);
      removed += 1;
    } catch {}
  }
  return removed;
}

export function openMemoryDatabaseAtPath(
  dbPath: string,
  allowExtension: boolean,
  runMaintenance?: (operation: () => boolean) => boolean,
): DatabaseSync {
  const db = openNodeSqliteDatabase(dbPath, { allowExtension });
  try {
    configureMemorySqliteWalMaintenance(db, {
      busyTimeoutMs: 5000,
      databasePath: dbPath,
      ...(runMaintenance ? { runMaintenance } : {}),
    });
    return db;
  } catch (err) {
    try {
      closeMemorySqliteWalMaintenance(db);
      db.close();
    } catch {}
    throw err;
  }
}

function openUninitializedMemoryDatabase(allowExtension: boolean) {
  const database = openNodeSqliteDatabase(":memory:", { readOnly: true, allowExtension });
  return { db: database, release: () => database.close(), hasIndex: false };
}

/** Open an existing memory index through the agent database query-only owner. */
export function openMemoryDatabaseReadOnlyAtPath(
  dbPath: string,
  allowExtension: boolean,
  agentId: string,
) {
  const opened = openOpenClawAgentDatabaseReadOnly(
    { agentId, path: dbPath },
    { allowExtension, lifecycle: "agent" },
  );
  if (!opened.found) {
    if (opened.reason === "database-missing") {
      return openUninitializedMemoryDatabase(allowExtension);
    }
    throw new Error(`Memory index database schema is missing: ${dbPath}`);
  }
  const { database } = opened;
  const db = database.db;
  if (!admittedTableExists(db, MEMORY_INDEX_STATE_TABLE)) {
    database.close();
    return openUninitializedMemoryDatabase(allowExtension);
  }
  if (isPostgresSqlConnection(db)) {
    database.close();
    throw new Error("PostgreSQL memory reads require the asynchronous worker API.");
  }
  return { db, release: database.close, hasIndex: true };
}

export function closeMemoryDatabase(db: DatabaseSync): void {
  closeMemorySqliteWalMaintenance(db);
  if (db.isOpen) {
    db.close();
  }
}
