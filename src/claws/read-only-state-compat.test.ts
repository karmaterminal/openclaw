// Regression coverage for read-only Claw state access on databases that predate
// the additive provenance columns but already report the current schema version.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import { OPENCLAW_STATE_SCHEMA_VERSION } from "../state/openclaw-state-db-contract.js";
import { CLAW_LAZY_ADDITIVE_STATE_COLUMNS } from "../state/openclaw-state-db-maintenance.js";
import { tableHasColumn } from "../state/openclaw-state-db-schema-helpers.js";
import {
  closeOpenClawStateDatabaseForTest,
  openExistingOpenClawStateDatabaseReadOnly,
  openOpenClawStateDatabase,
  STATE_READ_ONLY_COMPATIBLE_MISSING_COLUMNS,
} from "../state/openclaw-state-db.js";
import { readClawResumeStateReadOnly } from "./package-resume.js";
import { parseClawManifest } from "./schema.js";
import type { ClawSourceIdentity } from "./types.js";
import { buildClawUpdatePlan } from "./update-plan.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);

afterEach(() => closeOpenClawStateDatabaseForTest());

function createBaseShapeState(params: {
  env: { OPENCLAW_STATE_DIR: string };
  packageRoot: string;
  workspace: string;
  dropIngressGeneration?: boolean;
}): string {
  const database = openOpenClawStateDatabase({ env: params.env });
  const databasePath = database.path;
  database.db
    .prepare(
      `INSERT INTO claw_installs (
        agent_id, schema_version, source_kind, claw_name, claw_version, package_root,
        manifest_path, integrity_kind, integrity, source_byte_length, manifest_schema_version,
        plan_integrity, workspace, agent_config_digest, agent_owned_paths_json, status,
        added_at_ms, updated_at_ms
      ) VALUES (
        'legacy-worker', 'openclaw.clawInstallRecord.v1', 'package', '@acme/legacy', '1.0.0', ?,
        ?, 'artifact', 'sha256:aa', 10, 1, 'sha256:bb', ?, 'sha256:cc', '[]', 'complete',
        1000, 2000
      )`,
    )
    .run(params.packageRoot, join(params.packageRoot, "CLAW.md"), params.workspace);
  for (const column of CLAW_LAZY_ADDITIVE_STATE_COLUMNS) {
    const [table, name] = column.split(".");
    database.db.exec(`ALTER TABLE ${table} DROP COLUMN ${name};`);
  }
  if (params.dropIngressGeneration) {
    // Rebuild ingress table without generation while keeping current user_version.
    database.db.exec("PRAGMA foreign_keys = OFF;");
    database.db.exec(`
      CREATE TABLE channel_ingress_events__pre_gen (
        queue_name TEXT NOT NULL,
        event_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        status TEXT NOT NULL,
        lane_key TEXT,
        payload_json TEXT NOT NULL,
        metadata_json TEXT,
        received_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        claim_token TEXT,
        claim_owner TEXT,
        claimed_at INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt_at INTEGER,
        last_error TEXT,
        failed_reason TEXT,
        failed_at INTEGER,
        completed_at INTEGER,
        completed_metadata_json TEXT,
        PRIMARY KEY (queue_name, event_id)
      ) STRICT;
      INSERT INTO channel_ingress_events__pre_gen (
        queue_name, event_id, channel_id, account_id, status, lane_key, payload_json,
        metadata_json, received_at, updated_at, claim_token, claim_owner, claimed_at,
        attempts, last_attempt_at, last_error, failed_reason, failed_at, completed_at,
        completed_metadata_json
      )
      SELECT
        queue_name, event_id, channel_id, account_id, status, lane_key, payload_json,
        metadata_json, received_at, updated_at, claim_token, claim_owner, claimed_at,
        attempts, last_attempt_at, last_error, failed_reason, failed_at, completed_at,
        completed_metadata_json
      FROM channel_ingress_events;
      DROP TABLE channel_ingress_events;
      ALTER TABLE channel_ingress_events__pre_gen RENAME TO channel_ingress_events;
      CREATE INDEX IF NOT EXISTS idx_channel_ingress_pending
        ON channel_ingress_events(queue_name, status, received_at, event_id);
      CREATE INDEX IF NOT EXISTS idx_channel_ingress_claims
        ON channel_ingress_events(queue_name, status, claimed_at);
      CREATE INDEX IF NOT EXISTS idx_channel_ingress_lane
        ON channel_ingress_events(queue_name, status, lane_key);
    `);
    database.db.exec(`PRAGMA user_version = ${OPENCLAW_STATE_SCHEMA_VERSION};`);
    expect(tableHasColumn(database.db, "channel_ingress_events", "generation")).toBe(false);
  }
  closeOpenClawStateDatabaseForTest();
  return databasePath;
}

async function createFixture(
  label: string,
  options?: { dropIngressGeneration?: boolean },
): Promise<{
  env: { OPENCLAW_STATE_DIR: string };
  databasePath: string;
  packageRoot: string;
  workspace: string;
}> {
  const root = tempDirs.make(label);
  const packageRoot = join(root, "package");
  const workspace = join(root, "workspace");
  await mkdir(packageRoot, { recursive: true });
  await mkdir(workspace, { recursive: true });
  await writeFile(join(packageRoot, "CLAW.md"), "---\nschemaVersion: 1\n---\n", "utf8");
  const env = { OPENCLAW_STATE_DIR: join(root, "state") };
  return {
    env,
    databasePath: createBaseShapeState({
      env,
      packageRoot,
      workspace,
      dropIngressGeneration: options?.dropIngressGeneration,
    }),
    packageRoot,
    workspace,
  };
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("read-only Claw state compatibility", () => {
  it("includes ingress generation in the read-only missing-column allowance", () => {
    expect(STATE_READ_ONLY_COMPATIBLE_MISSING_COLUMNS).toContain(
      "channel_ingress_events.generation",
    );
  });

  it("plans an update against a base-shape database without mutating it", async () => {
    const fixture = await createFixture("openclaw-claw-base-shape-");
    const before = await readFile(fixture.databasePath);
    const parsed = parseClawManifest({
      schemaVersion: 1,
      agent: { id: "legacy-worker", name: "Legacy Worker" },
    });
    if (!parsed.ok) {
      throw new Error(JSON.stringify(parsed.diagnostics));
    }
    const source: ClawSourceIdentity = {
      kind: "package",
      name: "@acme/legacy",
      version: "1.1.0",
      packageRoot: fixture.packageRoot,
      manifestPath: join(fixture.packageRoot, "CLAW.md"),
      integrityKind: "artifact",
      integrity: "sha256:dd",
      byteLength: 12,
    };

    const plan = await buildClawUpdatePlan({
      agentId: "legacy-worker",
      targetManifest: parsed.manifest,
      targetSource: source,
      config: {},
      sourceMcpServers: {},
      stateOptions: { env: fixture.env },
      packagePreflight: async () => ({
        ok: true as const,
        action: "install" as const,
        integrity: `sha256:${"a".repeat(64)}`,
      }),
    });

    expect(plan.blockers).not.toContainEqual(expect.objectContaining({ code: "claw_not_found" }));
    expect(plan.blockers).not.toContainEqual(
      expect.objectContaining({ code: "claw_identity_mismatch" }),
    );
    await expect(readFile(fixture.databasePath)).resolves.toEqual(before);
  });

  it("resumes a base-shape database without mutating it", async () => {
    const fixture = await createFixture("openclaw-claw-base-shape-resume-");
    const before = await readFile(fixture.databasePath);

    const state = await readClawResumeStateReadOnly("legacy-worker", {
      path: fixture.databasePath,
    });

    expect(state?.record).toMatchObject({ agentId: "legacy-worker", status: "complete" });
    expect(state?.record.bootstrap).toBeUndefined();
    await expect(readFile(fixture.databasePath)).resolves.toEqual(before);
  });

  it("opens a current-version DB missing ingress generation read-only without mutating it", async () => {
    const fixture = await createFixture("openclaw-claw-pre-generation-", {
      dropIngressGeneration: true,
    });
    const beforeBytes = await readFile(fixture.databasePath);
    const beforeSha = sha256(beforeBytes);
    const { DatabaseSync } = requireNodeSqlite();
    const prep = new DatabaseSync(fixture.databasePath, { readOnly: true });
    try {
      expect(tableHasColumn(prep, "channel_ingress_events", "generation")).toBe(false);
      expect(
        (prep.prepare("PRAGMA user_version").get() as { user_version?: number }).user_version,
      ).toBe(OPENCLAW_STATE_SCHEMA_VERSION);
    } finally {
      prep.close();
    }

    const opened = await openExistingOpenClawStateDatabaseReadOnly({ path: fixture.databasePath });
    expect(opened).toBeDefined();
    expect(tableHasColumn(opened!.db, "channel_ingress_events", "generation")).toBe(false);
    await opened!.walMaintenance.close();

    const afterOpenBytes = await readFile(fixture.databasePath);
    expect(sha256(afterOpenBytes)).toBe(beforeSha);
    expect(afterOpenBytes.equals(beforeBytes)).toBe(true);

    const parsed = parseClawManifest({
      schemaVersion: 1,
      agent: { id: "legacy-worker", name: "Legacy Worker" },
    });
    if (!parsed.ok) {
      throw new Error(JSON.stringify(parsed.diagnostics));
    }
    const source: ClawSourceIdentity = {
      kind: "package",
      name: "@acme/legacy",
      version: "1.1.0",
      packageRoot: fixture.packageRoot,
      manifestPath: join(fixture.packageRoot, "CLAW.md"),
      integrityKind: "artifact",
      integrity: "sha256:dd",
      byteLength: 12,
    };
    const plan = await buildClawUpdatePlan({
      agentId: "legacy-worker",
      targetManifest: parsed.manifest,
      targetSource: source,
      config: {},
      sourceMcpServers: {},
      stateOptions: { path: fixture.databasePath },
      packagePreflight: async () => ({
        ok: true as const,
        action: "install" as const,
        integrity: `sha256:${"a".repeat(64)}`,
      }),
    });
    expect(plan.blockers).not.toContainEqual(expect.objectContaining({ code: "claw_not_found" }));

    const resume = await readClawResumeStateReadOnly("legacy-worker", {
      path: fixture.databasePath,
    });
    expect(resume?.record).toMatchObject({ agentId: "legacy-worker", status: "complete" });

    const afterCallers = await readFile(fixture.databasePath);
    expect(sha256(afterCallers)).toBe(beforeSha);
    const verify = new DatabaseSync(fixture.databasePath, { readOnly: true });
    try {
      expect(tableHasColumn(verify, "channel_ingress_events", "generation")).toBe(false);
    } finally {
      verify.close();
    }
  });
});
