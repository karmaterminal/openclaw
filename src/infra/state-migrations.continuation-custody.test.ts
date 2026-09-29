// The continuation custody import is a core Doctor state migration whose
// scope startup also runs (RFC §5.4.5), so a restart that skipped Doctor still
// imports before continuation recovery reads the custody store.
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { listContinuationRecordsInDatabase } from "../auto-reply/continuation/custody/custody-store.worker.js";
import {
  seedFlow,
  workState,
  write,
} from "../auto-reply/continuation/custody/legacy-taskflow-import.test-support.js";
import { EMPTY_LEGACY_SESSION_SURFACES } from "../plugins/legacy-session-surfaces.types.js";
import { closeOpenClawStateDatabaseAsync } from "../state/openclaw-state-db.js";
import { autoMigrateLegacyState, detectLegacyStateMigrations } from "./state-migrations.doctor.js";

const temporary = useAutoCleanupTempDirTracker(afterEach);
let env: NodeJS.ProcessEnv;

beforeEach(() => {
  const home = temporary.make("openclaw-continuation-custody-");
  const stateDir = path.join(home, ".openclaw");
  vi.stubEnv("HOME", home);
  vi.stubEnv("OPENCLAW_HOME", home);
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
  vi.stubEnv("OPENCLAW_CONFIG_PATH", path.join(stateDir, "openclaw.json"));
  vi.stubEnv("OPENCLAW_DISABLE_BUNDLED_PLUGINS", "1");
  env = process.env;
});

afterEach(async () => {
  await closeOpenClawStateDatabaseAsync();
  vi.unstubAllEnvs();
});

describe("continuation-taskflow-custody-import registration", () => {
  it("is detected, previewed and run by the startup (automatic) migration pass", async () => {
    seedFlow({ env }, { flowId: "legacy-work", status: "queued", state: workState() });

    const detected = await detectLegacyStateMigrations({
      cfg: {},
      mode: "automatic",
      env,
      legacySessionSurfaces: EMPTY_LEGACY_SESSION_SURFACES,
    });
    expect(detected.continuationCustody).toEqual({ hasLegacy: true, pendingSources: 1 });
    expect(detected.preview.join("\n")).toContain("Continuation custody: 1 legacy TaskFlow source");

    const result = await autoMigrateLegacyState({
      cfg: {},
      env,
      legacySessionSurfaces: EMPTY_LEGACY_SESSION_SURFACES,
    });

    expect(result.mode).toBe("automatic");
    expect(
      result.stepReceipts.find((receipt) => receipt.id === "continuation-taskflow-custody-import"),
    ).toMatchObject({ outcome: "completed" });
    expect(result.changes).toContain("Imported 1 continuation custody record from TaskFlow rows.");
    expect(
      write({ env }, (db) => listContinuationRecordsInDatabase(db, {})).map((r) => r.recordId),
    ).toEqual(["legacy-work"]);
  });
});
