// Jump-12 rehearsal (karmaterminal/openclaw-bootstrap#1727): upstream U12 (b8b054c13a) meets an
// agent store the j12 candidate migrated to schema 40, through its ordinary open and Doctor preflight.
// It imports U12's own source: copy this directory to `j12-u12-refusal/` in a detached U12 checkout
// and run it there against the `*-migrated-40.sqlite` copies the live-shape rehearsal leaves in
// J12_WORK_DIR (see ../RECEIPTS.md for the exact commands).
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, expect, it } from "vitest";
import { prepareDoctorDatabasePreflight } from "../src/commands/doctor-database-preflight.js";
import { OPENCLAW_AGENT_SCHEMA_VERSION } from "../src/state/openclaw-agent-db-contract.js";
import {
  closeOpenClawAgentDatabasesAsync,
  openOpenClawAgentDatabase,
} from "../src/state/openclaw-agent-db.js";
import {
  closeOpenClawStateDatabaseForTest,
  openOpenClawStateDatabase,
} from "../src/state/openclaw-state-db.js";
import { withOpenClawTestState } from "../src/test-utils/openclaw-test-state.js";

const WORK_DIR = process.env.J12_WORK_DIR!;
const RECEIPT = process.env.J12_U12_RECEIPT!;
const results: Record<string, unknown> = {};
const digest = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

afterEach(async () => {
  await closeOpenClawAgentDatabasesAsync();
  closeOpenClawStateDatabaseForTest();
});

afterAll(() => {
  fs.writeFileSync(
    RECEIPT,
    `${JSON.stringify({ u12AgentSchemaVersion: OPENCLAW_AGENT_SCHEMA_VERSION, shapes: results }, null, 2)}\n`,
  );
});

it.each(["cael", "ronan", "elliott", "emeric"])(
  "U12 refuses the candidate-migrated %s store without changing it",
  async (shape) => {
    const source = path.join(WORK_DIR, `${shape}-migrated-40.sqlite`);
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      openOpenClawStateDatabase({ env: state.env });
      const agentPath = state.statePath("agents", "main", "agent", "openclaw-agent.sqlite");
      fs.mkdirSync(path.dirname(agentPath), { recursive: true, mode: 0o700 });
      fs.copyFileSync(source, agentPath);
      fs.chmodSync(agentPath, 0o600);
      const before = digest(agentPath);
      let openError: unknown;
      try {
        openOpenClawAgentDatabase({ agentId: "main", env: state.env });
      } catch (error) {
        openError = error;
      }
      await closeOpenClawAgentDatabasesAsync();
      let preflight: unknown;
      let preflightError: unknown;
      try {
        preflight = await prepareDoctorDatabasePreflight();
      } catch (error) {
        preflightError = error;
      }
      const redact = (value: unknown) =>
        JSON.parse(JSON.stringify(value ?? null).replaceAll(state.root, "<state-root>"));
      results[shape] = {
        storeSha256: before,
        openRefused: openError !== undefined,
        openError: redact(openError instanceof Error ? openError.message : String(openError)),
        doctorPreflight: redact(
          preflightError instanceof Error
            ? {
                refused: true,
                name: preflightError.name,
                message: preflightError.message,
                kind: (preflightError as { kind?: unknown }).kind,
                code: (preflightError as { code?: unknown }).code,
                incompatibleDatabases: (preflightError as { incompatibleDatabases?: unknown })
                  .incompatibleDatabases,
              }
            : { refused: false, preflight },
        ),
        storeUnchangedAfterRefusal: digest(agentPath) === before,
        agentDirectoryAfter: fs.readdirSync(path.dirname(agentPath)).toSorted(),
      };
      expect(OPENCLAW_AGENT_SCHEMA_VERSION).toBe(39);
      expect(openError instanceof Error ? openError.message : "").toMatch(
        /uses newer schema version 40; this build supports 39/u,
      );
      expect(preflightError).toMatchObject({
        kind: "newer-schema",
        incompatibleDatabases: [
          expect.objectContaining({ kind: "agent", foundVersion: 40, supportedVersion: 39 }),
        ],
      });
      expect(digest(agentPath)).toBe(before);
    });
  },
  300_000,
);
