// Memory Core tests cover shared agent database publication and shadow cleanup.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  encodeMemoryEmbedding,
  ensureMemoryIndexSchema,
  loadSqliteVecExtension,
} from "openclaw/plugin-sdk/memory-core-host-engine-storage";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  configureMemoryCoreDreamingStateForTests,
  resetMemoryCoreDreamingStateForTests,
} from "../test-helpers.js";
import {
  publishMemoryDatabaseTables,
  readMemoryDatabaseRevision,
  MemoryIndexRevisionConflictError,
} from "./manager-db-kernel.js";
import {
  cleanupOrphanMemoryReindexShadows,
  closeMemoryDatabase,
  openMemoryDatabaseAtPath,
  releaseLiveMemoryReindexShadow,
  resetMemoryDatabase,
  retainLiveMemoryReindexShadow,
} from "./manager-db.js";
import { observePublishedSql } from "./manager-publication-observer.test-support.js";
import { bindSqliteWorkerBackend } from "./manager-publication.worker.js";

function ensureTestMemorySchema(db: DatabaseSync, cacheEnabled = true, ftsEnabled = false): void {
  ensureMemoryIndexSchema({ db, cacheEnabled, ftsEnabled });
}

function readSourceSchema(db: DatabaseSync) {
  const sql = (table: string) => {
    const row = db.prepare("SELECT sql FROM sqlite_schema WHERE name = ?").get(table);
    return typeof row?.sql === "string" ? row.sql : null;
  };
  return {
    fts: sql("memory_index_chunks_fts"),
    paths: sql("memory_index_paths_fts"),
    vector: sql("memory_index_chunks_vec"),
  };
}

async function publishPreparedMemoryDatabase(
  params: Parameters<typeof publishMemoryDatabaseTables>[0] & {
    vectorExtensionPath?: string;
  },
): Promise<void> {
  if (params.sourceSchema.vector) {
    const loaded = await loadSqliteVecExtension({
      db: params.targetDb,
      extensionPath: params.vectorExtensionPath,
    });
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
  }
  publishMemoryDatabaseTables(params);
}

describe("memory manager database publication", () => {
  let fixtureRoot = "";
  const connections: DatabaseSync[] = [];
  function open(name: string, allowExtension = false) {
    const db = new DatabaseSync(path.join(fixtureRoot, name), { allowExtension });
    connections.push(db);
    return db;
  }
  const rows = (db: DatabaseSync, sql: string) => db.prepare(sql).all();
  const insertSource = (db: DatabaseSync, sourcePath: string, hash: string, source = "memory") =>
    db
      .prepare(
        "INSERT INTO memory_index_sources (path, source, hash, mtime, size) VALUES (?, ?, ?, 1, 1)",
      )
      .run(sourcePath, source, hash);
  function insertChunk(
    db: DatabaseSync,
    id: string,
    text: string,
    options: {
      rowid?: number;
      path?: string;
      embedding?: Uint8Array;
    } = {},
  ) {
    db.prepare(`INSERT INTO memory_index_chunks
      (chunk_rowid, id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
      VALUES (?, ?, ?, 'memory', 1, 1, ?, 'model', ?, ?, 1)`).run(
      options.rowid ?? null,
      id,
      options.path ?? "MEMORY.md",
      id,
      text,
      options.embedding ?? encodeMemoryEmbedding([]),
    );
  }
  function databasePair(allowExtension = false) {
    const targetDb = open("target.sqlite", allowExtension);
    const sourceDb = open("source.sqlite", allowExtension);
    return {
      targetDb,
      sourceDb,
      publish: (options: Partial<Parameters<typeof publishPreparedMemoryDatabase>[0]> = {}) => {
        const sourceSchema = readSourceSchema(sourceDb);
        sourceDb.close();
        return publishPreparedMemoryDatabase({
          targetDb,
          sourcePath: path.join(fixtureRoot, "source.sqlite"),
          sourceSchema,
          metaKey: "memory_index_meta",
          expectedRevision: readMemoryDatabaseRevision(targetDb),
          ...options,
        });
      },
    };
  }

  beforeAll(async () => {
    await configureMemoryCoreDreamingStateForTests();
  });
  afterAll(() => resetMemoryCoreDreamingStateForTests());

  beforeEach(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-memory-db-"));
  });

  afterEach(async () => {
    for (const db of connections.splice(0)) {
      if (db.isOpen) {
        db.close();
      }
    }
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it("sets busy_timeout on memory sqlite connections", () => {
    const db = openMemoryDatabaseAtPath(path.join(fixtureRoot, "index.sqlite"), false);
    try {
      const row = db.prepare("PRAGMA busy_timeout").get() as
        | { busy_timeout?: number; timeout?: number }
        | undefined;
      expect(row?.busy_timeout ?? row?.timeout).toBe(5000);
    } finally {
      closeMemoryDatabase(db);
    }
  });

  it("resets only derived memory tables, preserves their schema, and is repeatable", async () => {
    const dbPath = path.join(fixtureRoot, "index.sqlite");
    const db = new DatabaseSync(dbPath, { allowExtension: true });
    try {
      ensureTestMemorySchema(db, true, true);
      const vector = await loadSqliteVecExtension({ db });
      expect(vector.ok).toBe(true);
      db.exec(`
        CREATE VIRTUAL TABLE memory_index_chunks_vec USING vec0(id TEXT PRIMARY KEY, embedding FLOAT[3]);
        CREATE TABLE memory_unrelated (payload BLOB);
        INSERT INTO memory_unrelated VALUES (x'00ff80');
        INSERT INTO memory_index_sources (path, source, hash, mtime, size)
          VALUES ('MEMORY.md', 'memory', 'old', 1, 1);
        INSERT INTO memory_index_chunks
          (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
          VALUES ('chunk', 'MEMORY.md', 'memory', 1, 1, 'old', 'model', 'old text', x'', 1);
        INSERT INTO memory_index_chunks_vec VALUES ('chunk', '[0,1,0]');
        INSERT INTO memory_index_chunk_recall_metadata VALUES ('chunk', 9, 'old trigger', NULL);
        INSERT INTO memory_index_chunk_provenance VALUES ('chunk', 'owner', 'interactive', 1, NULL);
        INSERT INTO memory_index_meta VALUES ('meta', 'old');
      `);
      const embedding = encodeMemoryEmbedding([0, 1, 0]);
      db.prepare("UPDATE memory_index_chunks SET embedding = ? WHERE id = 'chunk'").run(embedding);
      db.prepare(
        "INSERT INTO memory_embedding_cache VALUES ('test', 'model', 'key', 'old', ?, 3, 1)",
      ).run(embedding);
      const schema = () => rows(db, "SELECT type, name, sql FROM sqlite_schema ORDER BY name");
      const beforeSchema = schema();
      const revision = readMemoryDatabaseRevision(db);
      await resetMemoryDatabase({ targetDb: db, dbPath, workspaceDir: fixtureRoot });
      expect(schema()).toEqual(beforeSchema);
      expect(rows(db, "SELECT hex(payload) AS bytes FROM memory_unrelated")).toEqual([
        { bytes: "00FF80" },
      ]);
      for (const table of [
        "memory_index_sources",
        "memory_index_chunks",
        "memory_index_chunks_fts",
        "memory_index_paths_fts",
        "memory_index_chunks_vec",
        "memory_index_chunk_recall_metadata",
        "memory_index_chunk_provenance",
        "memory_embedding_cache",
        "memory_index_meta",
      ]) {
        expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get(), table).toEqual({
          count: 0,
        });
      }
      const resetRevision = readMemoryDatabaseRevision(db);
      expect(resetRevision).toBe(revision + 1);
      expect(await resetMemoryDatabase({ targetDb: db, dbPath, workspaceDir: fixtureRoot })).toBe(
        false,
      );
      expect(readMemoryDatabaseRevision(db)).toBe(resetRevision);
    } finally {
      db.close();
    }
  });

  it("does not create an index when there is nothing to reset", async () => {
    const dbPath = path.join(fixtureRoot, "index.sqlite");
    const db = new DatabaseSync(dbPath);
    try {
      db.exec("CREATE TABLE unrelated (value TEXT); INSERT INTO unrelated VALUES ('retained')");
      expect(await resetMemoryDatabase({ targetDb: db, dbPath, workspaceDir: fixtureRoot })).toBe(
        false,
      );
      expect(rows(db, "SELECT name FROM sqlite_schema")).toEqual([{ name: "unrelated" }]);
      expect(rows(db, "SELECT * FROM unrelated")).toEqual([{ value: "retained" }]);
    } finally {
      db.close();
    }
  });

  it("admits legacy recall metadata before publishing in one transaction", async () => {
    const { targetDb, sourceDb, publish } = databasePair();
    targetDb.exec(`
      CREATE TABLE memory_index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
      CREATE TABLE memory_index_sources (
        id INTEGER PRIMARY KEY, path TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'memory',
        hash TEXT NOT NULL, mtime REAL NOT NULL, size INTEGER NOT NULL, UNIQUE (path, source)
      ) STRICT;
      CREATE TABLE memory_index_chunks (
        chunk_rowid INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE,
        path TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'memory',
        start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, hash TEXT NOT NULL,
        model TEXT NOT NULL, text TEXT NOT NULL, embedding BLOB NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE memory_index_state (
        id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL
      ) STRICT;
      INSERT INTO memory_index_state (id, revision) VALUES (1, 0);
    `);
    ensureTestMemorySchema(targetDb, false);
    ensureTestMemorySchema(sourceDb, false);
    insertChunk(sourceDb, "new", "body");
    sourceDb
      .prepare(
        `INSERT INTO memory_index_chunk_recall_metadata
         (chunk_id, importance, triggers) VALUES (?, ?, ?)`,
      )
      .run("new", 9, "when flying");

    const observed = observePublishedSql(targetDb);
    try {
      await publish({ metaKey: "meta", expectedRevision: 0 });
      expect(observed.calls().filter(({ sql }) => /^BEGIN\b/i.test(sql))).toHaveLength(1);
    } finally {
      observed.restore();
    }

    expect(
      targetDb.prepare("SELECT importance, triggers FROM memory_index_chunk_recall_metadata").get(),
    ).toEqual({ importance: 9, triggers: "when flying" });
  });

  it("removes a stale vector table when the shadow index has no vectors", async () => {
    const { targetDb, sourceDb, publish } = databasePair();
    ensureTestMemorySchema(targetDb);
    ensureTestMemorySchema(sourceDb);
    targetDb.exec("CREATE TABLE memory_index_chunks_vec (id TEXT PRIMARY KEY, embedding BLOB)");
    targetDb
      .prepare("INSERT INTO memory_index_chunks_vec (id, embedding) VALUES (?, ?)")
      .run("stale", "[]");

    await publish();

    expect(
      targetDb
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory_index_chunks_vec'",
        )
        .get(),
    ).toBeUndefined();
  });

  it("publishes stable path and chunk identities and restores FTS maintenance", async () => {
    const { targetDb, sourceDb, publish } = databasePair();
    ensureTestMemorySchema(targetDb, true, true);
    ensureTestMemorySchema(sourceDb, true, true);
    insertSource(targetDb, "memory/stale.md", "stale");
    const embedding = encodeMemoryEmbedding([0.1234567890123456, -0.5]);
    const insertPublishedChunk = (db: DatabaseSync, rowid: number, id: string, text: string) => {
      insertChunk(db, id, text, { rowid, path: `memory/${id}.md`, embedding });
      db.prepare(`INSERT INTO memory_index_chunk_provenance
        (chunk_id, origin_class, session_kind, observed_at)
        VALUES (?, 'owner', 'interactive', 1)`).run(id);
    };
    insertPublishedChunk(targetDb, 7, "stale", "Old violetmarker");
    targetDb.exec(`
      DROP TRIGGER memory_index_paths_fts_after_delete;
      CREATE TRIGGER memory_index_paths_fts_after_delete
      AFTER DELETE ON memory_index_sources
      BEGIN
        SELECT RAISE(ABORT, 'path FTS trigger fired during bulk publish');
      END;
      DROP TRIGGER memory_index_chunks_fts_after_delete;
      CREATE TRIGGER memory_index_chunks_fts_after_delete
      AFTER DELETE ON memory_index_chunks
      BEGIN
        SELECT RAISE(ABORT, 'body FTS trigger fired during bulk publish');
      END;
    `);
    sourceDb
      .prepare(
        "INSERT INTO memory_index_sources (id, path, source, hash, mtime, size) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(42, "memory/replacement.md", "memory", "replacement", 2, 2);
    insertPublishedChunk(sourceDb, 84, "replacement", "New ambermarker");
    const expectedRevision = readMemoryDatabaseRevision(targetDb);

    const observed = observePublishedSql(targetDb);
    try {
      await publish({ metaKey: "meta", expectedRevision });
      expect
        .soft(
          observed
            .calls()
            .filter(({ sql }) =>
              /memory_reindex\.sqlite_master|^\s*DELETE FROM memory_index_chunks_fts\b/i.test(sql),
            ),
        )
        .toEqual([]);
    } finally {
      observed.restore();
    }

    expect(rows(targetDb, "SELECT path, source FROM memory_index_paths_fts")).toEqual([
      { path: "memory/replacement.md", source: "memory" },
    ]);
    expect(rows(targetDb, "SELECT id, path FROM memory_index_sources")).toEqual([
      { id: 42, path: "memory/replacement.md" },
    ]);
    expect(rows(targetDb, "SELECT rowid, path FROM memory_index_paths_fts")).toEqual([
      { rowid: 42, path: "memory/replacement.md" },
    ]);
    expect(rows(targetDb, "SELECT chunk_rowid, id, embedding FROM memory_index_chunks")).toEqual([
      {
        chunk_rowid: 84,
        id: "replacement",
        embedding,
      },
    ]);
    expect(rows(targetDb, "SELECT rowid, id FROM memory_index_chunks_fts")).toEqual([
      { rowid: 84, id: "replacement" },
    ]);
    const bodyMatches = (query: string) =>
      targetDb
        .prepare(
          "SELECT id FROM memory_index_chunks_fts WHERE memory_index_chunks_fts MATCH ? ORDER BY id",
        )
        .all(query);
    expect(bodyMatches("ambermarker")).toEqual([{ id: "replacement" }]);
    expect(bodyMatches("violetmarker")).toEqual([]);
    expect(
      targetDb
        .prepare("SELECT path FROM memory_index_paths_fts WHERE memory_index_paths_fts MATCH ?")
        .all('"replacement"'),
    ).toEqual([{ path: "memory/replacement.md" }]);
    targetDb
      .prepare(
        "INSERT INTO memory_index_sources (path, source, hash, mtime, size) VALUES (?, ?, ?, ?, ?)",
      )
      .run("memory/after-publish.md", "memory", "after", 3, 3);
    insertPublishedChunk(targetDb, 85, "after-publish", "Fresh ambermarker");
    expect(bodyMatches("ambermarker")).toEqual([{ id: "after-publish" }, { id: "replacement" }]);
    targetDb
      .prepare("UPDATE memory_index_chunks SET text = ? WHERE id = ?")
      .run("Updated saffronmarker", "after-publish");
    targetDb.prepare("DELETE FROM memory_index_chunks WHERE id = ?").run("replacement");
    expect(bodyMatches("ambermarker")).toEqual([]);
    expect(bodyMatches("saffronmarker")).toEqual([{ id: "after-publish" }]);
    expect(
      rows(targetDb, "SELECT path FROM memory_index_paths_fts ORDER BY path").map(
        (row) => (row as { path: string }).path,
      ),
    ).toEqual(["memory/after-publish.md", "memory/replacement.md"]);
    targetDb
      .prepare("UPDATE memory_index_sources SET path = ? WHERE path = ? AND source = ?")
      .run("memory/after-update.md", "memory/after-publish.md", "memory");
    targetDb
      .prepare("DELETE FROM memory_index_sources WHERE path = ? AND source = ?")
      .run("memory/replacement.md", "memory");
    expect(rows(targetDb, "SELECT path FROM memory_index_paths_fts")).toEqual([
      { path: "memory/after-update.md" },
    ]);
  });

  it("removes FTS tables and triggers when the shadow has FTS disabled", async () => {
    const { targetDb, sourceDb, publish } = databasePair();
    ensureTestMemorySchema(targetDb, true, true);
    ensureTestMemorySchema(sourceDb);
    const expectedRevision = readMemoryDatabaseRevision(targetDb);

    await publish({ metaKey: "meta", expectedRevision });

    expect(
      rows(
        targetDb,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('memory_index_paths_fts', 'memory_index_chunks_fts')",
      ),
    ).toEqual([]);
    expect(
      rows(
        targetDb,
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND (name LIKE 'memory_index_paths_fts_after_%' OR name LIKE 'memory_index_chunks_fts_after_%')",
      ),
    ).toEqual([]);
    expect(() =>
      targetDb
        .prepare(
          "INSERT INTO memory_index_sources (path, source, hash, mtime, size) VALUES (?, ?, ?, ?, ?)",
        )
        .run("memory/after-disabled-publish.md", "memory", "after", 1, 1),
    ).not.toThrow();
    expect(() =>
      targetDb.exec(`INSERT INTO memory_index_chunks
        (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
        VALUES ('after', 'memory/after-disabled-publish.md', 'memory', 1, 1, 'after', 'fts-only', 'after', x'', 1)`),
    ).not.toThrow();
  });

  it("publishes a prepared shadow vector table", async () => {
    const { targetDb, sourceDb, publish } = databasePair(true);
    ensureTestMemorySchema(targetDb);
    ensureTestMemorySchema(sourceDb);
    const sourceVector = await loadSqliteVecExtension({ db: sourceDb });
    if (!sourceVector.ok) {
      return;
    }
    sourceDb.exec(`
      CREATE VIRTUAL TABLE memory_index_chunks_vec USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[3]
      )
    `);
    sourceDb
      .prepare("INSERT INTO memory_index_chunks_vec (id, embedding) VALUES (?, ?)")
      .run("vector", JSON.stringify([0, 1, 0]));

    const vectorSchema = readSourceSchema(sourceDb).vector;
    await publish({ vectorExtensionPath: sourceVector.extensionPath });

    expect(rows(targetDb, "SELECT id FROM memory_index_chunks_vec")).toEqual([{ id: "vector" }]);
    expect(readSourceSchema(targetDb).vector).toBe(vectorSchema);
  });

  it("rejects a stale shadow publish after a concurrent live memory update", async () => {
    const { targetDb, sourceDb, publish } = databasePair();
    const targetPath = path.join(fixtureRoot, "target.sqlite");
    let concurrentDb: DatabaseSync | undefined;
    try {
      ensureTestMemorySchema(targetDb);
      ensureTestMemorySchema(sourceDb);
      insertSource(targetDb, "memory.md", "published", "sessions");
      insertSource(sourceDb, "memory.md", "shadow", "sessions");
      const expectedRevision = readMemoryDatabaseRevision(targetDb);

      concurrentDb = new DatabaseSync(path.join(fixtureRoot, "target.sqlite"));
      const publisher = bindSqliteWorkerBackend(
        { kind: "agent" },
        { databasePath: targetPath, database: concurrentDb, admit: () => undefined },
      );
      try {
        expect(
          publisher.execute({
            type: "source.refresh",
            input: {
              path: "memory.md",
              expectedHash: "published",
              hash: "newer",
              mtime: 2,
              size: 2,
            },
          }),
        ).toMatchObject({ ok: true, value: true });
      } finally {
        publisher.close();
      }
      concurrentDb.close();
      concurrentDb = undefined;

      const publication = publish({ expectedRevision });
      await expect(publication).rejects.toBeInstanceOf(MemoryIndexRevisionConflictError);
      await expect(publication).rejects.toThrow(/changed while full reindex was building/);
      expect(
        targetDb
          .prepare("SELECT hash FROM memory_index_sources WHERE path = ? AND source = ?")
          .get("memory.md", "sessions"),
      ).toEqual({ hash: "newer" });
    } finally {
      try {
        concurrentDb?.close();
      } catch {}
      try {
        sourceDb.close();
      } catch {}
      targetDb.close();
    }
  });

  it("preserves the live embedding cache instead of publishing the shadow cache", async () => {
    const { targetDb, sourceDb, publish } = databasePair();
    ensureTestMemorySchema(targetDb);
    ensureTestMemorySchema(sourceDb);
    targetDb
      .prepare(
        `INSERT INTO memory_embedding_cache (
           provider, model, provider_key, hash, embedding, dims, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("test", "model", "key", "live-hash", encodeMemoryEmbedding([]), 0, 1);
    sourceDb
      .prepare(
        `INSERT INTO memory_embedding_cache (
           provider, model, provider_key, hash, embedding, dims, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("test", "model", "key", "shadow-hash", encodeMemoryEmbedding([1]), 1, 2);

    await publish();

    expect(rows(targetDb, "SELECT hash FROM memory_embedding_cache")).toEqual([
      { hash: "live-hash" },
    ]);
  });

  describe("orphan reindex shadow cleanup", () => {
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
    /** Writes one file per suffix, each last changed at its given time. */
    async function writeShadowFiles(shadowPath: string, changedAt: Record<string, Date>) {
      for (const [suffix, time] of Object.entries(changedAt)) {
        await fs.writeFile(`${shadowPath}${suffix}`, "shadow");
        await fs.utimes(`${shadowPath}${suffix}`, time, time);
      }
    }
    function createDatabase() {
      const databasePath = path.join(fixtureRoot, "agent.sqlite");
      new DatabaseSync(databasePath).close();
      return { databasePath, shadow: (id: string) => `${databasePath}.memory-reindex-${id}` };
    }

    it("keeps a shadow another process changed within the quiet floor, judged by its newest file", async () => {
      const { databasePath, shadow } = createDatabase();
      const freshShadow = shadow("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
      // A WAL-mode build changes its -wal long before a checkpoint touches the database file.
      const walWriterShadow = shadow("11111111-2222-3333-4444-555555555555");
      await writeShadowFiles(freshShadow, { "": new Date() });
      await writeShadowFiles(walWriterShadow, {
        "": minutesAgo(60),
        "-wal": minutesAgo(1),
        "-shm": minutesAgo(60),
      });
      const before = (await fs.readdir(fixtureRoot)).toSorted();

      await expect(cleanupOrphanMemoryReindexShadows(databasePath)).resolves.toBe(0);

      expect((await fs.readdir(fixtureRoot)).toSorted()).toEqual(before);
    });

    it("removes a shadow nobody holds once every file has been quiet past the floor", async () => {
      const { databasePath, shadow } = createDatabase();
      const crashedShadow = shadow("99999999-8888-7777-6666-555555555555");
      await writeShadowFiles(crashedShadow, {
        "": minutesAgo(16),
        "-wal": minutesAgo(16),
        "-shm": minutesAgo(16),
        "-journal": minutesAgo(16),
      });

      await expect(cleanupOrphanMemoryReindexShadows(databasePath)).resolves.toBe(1);

      expect(await fs.readdir(fixtureRoot)).toEqual(["agent.sqlite"]);
    });

    it("keeps a shadow this process holds at any age until it is released", async () => {
      const { databasePath, shadow } = createDatabase();
      const liveShadow = shadow("12345678-90ab-cdef-1234-567890abcdef");
      retainLiveMemoryReindexShadow(liveShadow);
      try {
        await writeShadowFiles(liveShadow, {
          "": minutesAgo(48 * 60),
          "-wal": minutesAgo(48 * 60),
        });
        await expect(cleanupOrphanMemoryReindexShadows(databasePath)).resolves.toBe(0);
        await fs.access(liveShadow);
        await fs.access(`${liveShadow}-wal`);
      } finally {
        releaseLiveMemoryReindexShadow(liveShadow);
      }

      // Once released, nothing owns the quiet files.
      await expect(cleanupOrphanMemoryReindexShadows(databasePath)).resolves.toBe(1);
      expect(await fs.readdir(fixtureRoot)).toEqual(["agent.sqlite"]);
    });

    it.skipIf(process.platform === "win32")(
      "keeps a quiet shadow whose file state cannot be read",
      async () => {
        const { databasePath, shadow } = createDatabase();
        const unreadableShadow = shadow("fedcba98-7654-3210-fedc-ba9876543210");
        await writeShadowFiles(unreadableShadow, { "": minutesAgo(60) });
        // A self-referencing link fails stat with ELOOP; a failed read is no proof the writer stopped.
        await fs.symlink(path.basename(`${unreadableShadow}-wal`), `${unreadableShadow}-wal`);

        await expect(cleanupOrphanMemoryReindexShadows(databasePath)).resolves.toBe(0);

        await fs.access(unreadableShadow);
        await fs.lstat(`${unreadableShadow}-wal`);
      },
    );
  });
});
