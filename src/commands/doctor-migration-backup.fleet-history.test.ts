// Continuation (karmaterminal): agent schema 26 has two histories. Upstream's 26 → 36 run is
// covered by declared table scopes; the fleet's own 26 also crosses upstream's step 26, which
// declares none, so Doctor must keep a full image for it.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { OPENCLAW_AGENT_SCHEMA_VERSION } from "../state/openclaw-agent-db-contract.js";
import { AGENT_JSON_PREDICATE_COLUMNS } from "../state/openclaw-agent-json-predicate-schema.js";
import { createOpenClawDatabaseMaintenanceScope } from "../state/openclaw-state-db-async-lifecycle.js";
import { backupDoctorMigrationDatabases } from "./doctor-migration-backup.js";

// These fixtures isolate backup selection; historical schema repair has its own owner tests.
vi.mock("../state/openclaw-state-db-fast-path.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/openclaw-state-db-fast-path.js")>()),
  needsOpenClawStateDatabaseSchemaRepair: () => false,
}));

const tempDirs = useAutoCleanupTempDirTracker(afterEach);

function seedSchema26(databasePath: string, history: "fleet" | "upstream") {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  using database = new DatabaseSync(databasePath);
  const predicateColumns =
    history === "upstream"
      ? AGENT_JSON_PREDICATE_COLUMNS.session_nodes.map((column) => `, ${column} TEXT`).join("")
      : "";
  database.exec(`
    PRAGMA user_version = 26;
    CREATE TABLE schema_meta (schema_version INTEGER NOT NULL) STRICT;
    CREATE TABLE session_nodes (session_key TEXT PRIMARY KEY${predicateColumns}) STRICT;
    INSERT INTO schema_meta VALUES (26);
  `);
  if (history === "fleet") {
    database.exec(
      "CREATE TABLE session_recipient_authority (session_key TEXT PRIMARY KEY, epoch TEXT NOT NULL) STRICT;",
    );
  }
}

it.each([
  ["fleet", false],
  ["upstream", true],
] as const)("backs up a %s schema-26 agent database scoped: %s", async (history, scoped) => {
  const stateDir = tempDirs.make("openclaw-doctor-fleet-backup-");
  const shared = path.join(stateDir, "state", "openclaw.sqlite");
  const agent = path.join(stateDir, "agents", "main", "openclaw-agent.sqlite");
  const configPath = path.join(stateDir, "openclaw.json");
  fs.mkdirSync(path.dirname(shared), { recursive: true });
  new DatabaseSync(shared).close();
  seedSchema26(agent, history);
  fs.writeFileSync(configPath, "{}\n");
  const maintenance = createOpenClawDatabaseMaintenanceScope({
    schemaMaintenance: true,
    assertOwnerCurrent: () => {},
  });
  try {
    await maintenance.run(() =>
      backupDoctorMigrationDatabases({
        versionMigrationsOnly: true,
        env: {
          ...process.env,
          OPENCLAW_STATE_DIR: stateDir,
          OPENCLAW_CONFIG_PATH: configPath,
          OPENCLAW_UPDATE_IN_PROGRESS: undefined,
          OPENCLAW_UPDATE_POST_CORE_CONVERGENCE: undefined,
          OPENCLAW_UPDATE_PARENT_SUPPORTS_DOCTOR_CONFIG_WRITE: undefined,
        },
        pendingDatabasePaths: [agent],
        pendingMigrations: [
          {
            kind: "agent",
            path: agent,
            foundVersion: 26,
            supportedVersion: OPENCLAW_AGENT_SCHEMA_VERSION,
          },
        ],
        databasePaths: [agent],
      }),
    );
  } finally {
    await maintenance.close();
  }

  const backups = fs
    .readdirSync(path.dirname(agent))
    .filter((name) => name.startsWith(`${path.basename(agent)}.pre-startup-migration-`));
  expect(backups).toHaveLength(1);
  expect(backups[0]!.endsWith(".scoped.bak")).toBe(scoped);
});
