#!/usr/bin/env node
// Proof-only small healthy-store control for karmaterminal/openclaw#1257.
// Never opens live Gateway DBs. ANALYZE runs only on clone B.
import { createHash, randomBytes } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const LIVE_PATH_MARKERS = [
  `${path.sep}.openclaw${path.sep}agents${path.sep}`,
  `${path.sep}.openclaw${path.sep}state${path.sep}`,
];

const UNFENCED_SQL =
  "SELECT event_json FROM transcript_events WHERE session_id = ? ORDER BY seq ASC";
const FENCED_SQL =
  "SELECT event_json FROM transcript_events WHERE session_id = ? AND seq < ? ORDER BY seq ASC";

function sha256File(filePath) {
  const resolved = path.resolve(filePath);
  assertNotLivePath(resolved);
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(resolved);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function assertNotLivePath(filePath) {
  const normalized = path.resolve(filePath);
  if (LIVE_PATH_MARKERS.some((marker) => normalized.includes(marker))) {
    throw new Error(`refusing live Gateway path: ${normalized}`);
  }
}

function cpuMs(usage) {
  return (usage.user + usage.system) / 1000;
}

function timed(fn) {
  const started = process.hrtime.bigint();
  const cpuStarted = process.cpuUsage();
  const value = fn();
  return {
    value,
    wallMs: Number(process.hrtime.bigint() - started) / 1e6,
    cpuMs: cpuMs(process.cpuUsage(cpuStarted)),
  };
}

function openReadonly(filePath) {
  assertNotLivePath(filePath);
  return new DatabaseSync(filePath, { readOnly: true });
}

function openWritable(filePath) {
  assertNotLivePath(filePath);
  return new DatabaseSync(filePath);
}

function pragmas(db) {
  const one = (sql) => {
    const row = db.prepare(sql).get();
    return row ? Object.values(row)[0] : null;
  };
  let stat1Count = 0;
  let stat1Hash = null;
  try {
    const rows = db.prepare("SELECT tbl, idx, stat FROM sqlite_stat1 ORDER BY tbl, idx").all();
    stat1Count = rows.length;
    stat1Hash = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  } catch {
    stat1Count = 0;
    stat1Hash = null;
  }
  return {
    sqliteVersion: one("SELECT sqlite_version()"),
    pageSize: one("PRAGMA page_size"),
    pageCount: one("PRAGMA page_count"),
    freelistCount: one("PRAGMA freelist_count"),
    journalMode: one("PRAGMA journal_mode"),
    integrityCheck: one("PRAGMA integrity_check"),
    quickCheck: one("PRAGMA quick_check"),
    stat1Count,
    stat1Hash,
  };
}

function explain(db, sql, params) {
  return db
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all(...params)
    .map((row) => Object.values(row).join(" | "))
    .join("\n");
}

function materialize(db, sql, params) {
  const sqlTiming = timed(() => db.prepare(sql).all(...params));
  const decodeTiming = timed(() =>
    sqlTiming.value.map((row) => {
      const event = JSON.parse(row.event_json);
      return { bytes: Buffer.byteLength(row.event_json), event };
    }),
  );
  const selectedBytes = decodeTiming.value.reduce((sum, row) => sum + row.bytes, 0);
  const payloadHash = createHash("sha256")
    .update(sqlTiming.value.map((row) => row.event_json).join("\n"))
    .digest("hex");
  return {
    rowCount: sqlTiming.value.length,
    selectedBytes,
    payloadHash,
    sqlWallMs: sqlTiming.wallMs,
    sqlCpuMs: sqlTiming.cpuMs,
    decodeWallMs: decodeTiming.wallMs,
    decodeCpuMs: decodeTiming.cpuMs,
  };
}

function sampleClone(label, filePath, analyzed) {
  const coldDb = openReadonly(filePath);
  const coldPragmas = pragmas(coldDb);
  if (coldPragmas.integrityCheck !== "ok" || coldPragmas.quickCheck !== "ok") {
    coldDb.close();
    throw new Error(`${label} integrity failure: divert to #1261-style corruption, not perf`);
  }
  const unfencedExplain = explain(coldDb, UNFENCED_SQL, ["healthy"]);
  const fencedExplain = explain(coldDb, FENCED_SQL, ["healthy", 40]);
  const coldUnfenced = materialize(coldDb, UNFENCED_SQL, ["healthy"]);
  const coldFenced = materialize(coldDb, FENCED_SQL, ["healthy", 40]);
  coldDb.close();

  const warmDb = openReadonly(filePath);
  const warmUnfenced = materialize(warmDb, UNFENCED_SQL, ["healthy"]);
  const warmFenced = materialize(warmDb, FENCED_SQL, ["healthy", 40]);
  warmDb.close();

  return {
    label,
    analyzed,
    sizeBytes: statSync(filePath).size,
    pragmas: coldPragmas,
    unfencedExplain,
    fencedExplain,
    coldUnfenced,
    coldFenced,
    warmUnfenced,
    warmFenced,
  };
}

function seedOriginal(filePath) {
  const db = openWritable(filePath);
  db.exec("PRAGMA journal_mode = DELETE;");
  db.exec(`
    CREATE TABLE transcript_events (
      session_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      event_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (session_id, seq)
    ) STRICT;
  `);
  const insert = db.prepare(
    "INSERT INTO transcript_events (session_id, seq, event_json, created_at) VALUES (?, ?, ?, ?)",
  );
  db.exec("BEGIN");
  for (let seq = 1; seq <= 80; seq += 1) {
    insert.run(
      "healthy",
      seq,
      JSON.stringify({
        type: "message",
        id: `healthy-${seq}`,
        message: { role: seq % 2 === 0 ? "assistant" : "user", content: `n${seq}` },
      }),
      1_700_000_000_000 + seq,
    );
  }
  for (let seq = 1; seq <= 8; seq += 1) {
    insert.run(
      "other",
      seq,
      JSON.stringify({
        type: "message",
        id: `other-${seq}`,
        message: { role: "user", content: "x" },
      }),
      1_700_000_000_000 + seq,
    );
  }
  db.exec("COMMIT");
  db.close();
}

const root = path.join(tmpdir(), `ward-1257-small-control-${randomBytes(6).toString("hex")}`);
mkdirSync(root, { recursive: true });
const original = path.join(root, "original.sqlite");
const cloneA = path.join(root, "A.sqlite");
const cloneB = path.join(root, "B.sqlite");
const cloneAPrime = path.join(root, "A-prime.sqlite");

seedOriginal(original);
const originalHashBefore = await sha256File(original);
copyFileSync(original, cloneA);
copyFileSync(original, cloneB);
copyFileSync(original, cloneAPrime);

const sampleA = sampleClone("A", cloneA, false);
const analyzeDb = openWritable(cloneB);
analyzeDb.exec("ANALYZE;");
analyzeDb.close();
const sampleB = sampleClone("B", cloneB, true);
const sampleAPrime = sampleClone("A-prime", cloneAPrime, false);
const originalHashAfter = await sha256File(original);

const equalPayloads =
  sampleA.coldUnfenced.payloadHash === sampleB.coldUnfenced.payloadHash &&
  sampleA.coldFenced.payloadHash === sampleB.coldFenced.payloadHash &&
  sampleA.coldUnfenced.payloadHash === sampleAPrime.coldUnfenced.payloadHash &&
  sampleA.coldUnfenced.rowCount === 80 &&
  sampleA.coldFenced.rowCount === 39;

const report = {
  schema: "ward-1257-small-control.v1",
  boundIssue: "karmaterminal/openclaw#1257",
  role: "SMALL-CONTROL + RUN-ORDER + NO-MUTATION",
  notIncidentShaped: true,
  root,
  originalHashBefore,
  originalHashAfter,
  originalUnchanged: originalHashBefore === originalHashAfter,
  equalPayloads,
  clones: { A: sampleA, B: sampleB, "A-prime": sampleAPrime },
};

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "artifacts");
writeFileSync(path.join(outDir, "small-control.json"), `${JSON.stringify(report, null, 2)}\n`);
rmSync(root, { recursive: true, force: true });

if (!report.originalUnchanged || !equalPayloads) {
  console.error("small-control FAILED");
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      ok: true,
      originalUnchanged: true,
      equalPayloads: true,
      aStat1: sampleA.pragmas.stat1Count,
      bStat1: sampleB.pragmas.stat1Count,
      artifact: "causal-proof/1257-m4-sqlite-fossil/artifacts/small-control.json",
    },
    null,
    2,
  ),
);
