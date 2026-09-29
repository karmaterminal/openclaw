// RFC §9.2.2 item 9: source-row end of life. Retirement deletes exactly the
// continuation rows a committed `imported` or `retired-terminal` receipt
// names, and nothing else.
import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../../test/helpers/temp-dir.js";
import { executeSqliteQuerySync } from "../../../infra/kysely-sync.js";
import { closeOpenClawStateDatabaseAsync } from "../../../state/openclaw-state-db.js";
import {
  migrateContinuationTaskFlowCustody,
  retireContinuationTaskFlowSourceRows,
} from "./legacy-taskflow-import.js";
import {
  OWNER_B,
  delegateState,
  kysely,
  readFlow,
  seedFlow,
  workState,
  write,
  writeLegacyPayload,
  type Options,
} from "./legacy-taskflow-import.test-support.js";

const ATTACHMENT_ID = "3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

const tempDirs = useAutoCleanupTempDirTracker((cleanup) =>
  afterEach(async () => {
    await closeOpenClawStateDatabaseAsync();
    cleanup();
  }),
);

function stateOptions(): Options {
  return { env: { ...process.env, OPENCLAW_STATE_DIR: tempDirs.make("continuation-retire-") } };
}

function flowIds(options: Options): string[] {
  return write(options, (db) =>
    executeSqliteQuerySync(
      db,
      kysely(db).selectFrom("flow_runs").select("flow_id").orderBy("flow_id"),
    ).rows.map((row) => row.flow_id),
  );
}

describe("continuation TaskFlow source retirement", () => {
  it("deletes exactly the receipt-proven continuation rows and reports receipt-less residue", async () => {
    const options = stateOptions();
    seedFlow(options, { flowId: "imported-work", status: "queued", state: workState() });
    seedFlow(options, {
      flowId: "terminal-work",
      status: "succeeded",
      state: workState(),
      endedAt: 2_000,
    });
    seedFlow(options, {
      flowId: "imported-delegate",
      controller: "delegate",
      status: "queued",
      state: delegateState({ attachmentId: ATTACHMENT_ID, attachmentCount: 1 }),
    });
    writeLegacyPayload(options, { attachmentId: ATTACHMENT_ID, flowId: "imported-delegate" });
    seedFlow(options, {
      flowId: "not-ours",
      controller: "other",
      status: "queued",
      state: { any: 1 },
    });
    // A scrubbed row with no receipt is never imported, so it has no proof.
    seedFlow(options, {
      flowId: "residue",
      controller: "delegate",
      status: "queued",
      state: delegateState({ attachments: [{ name: "a", content: "" }], attachmentCount: 1 }),
    });
    await migrateContinuationTaskFlowCustody({ env: options.env, now: () => 10_000 });
    // Retention pruned an imported record: the receipt alone is the proof.
    write(options, (db) =>
      executeSqliteQuerySync(
        db,
        kysely(db).deleteFrom("continuation_records").where("record_id", "=", "imported-work"),
      ),
    );
    // An owner still un-imported at the horizon gets its final import pass first.
    seedFlow(options, {
      flowId: "late-owner",
      owner: OWNER_B,
      status: "queued",
      state: workState({ sessionKey: OWNER_B }),
    });
    const foreign = readFlow(options, "not-ours");
    const residue = readFlow(options, "residue");

    const result = await retireContinuationTaskFlowSourceRows({
      env: options.env,
      now: () => 20_000,
    });

    expect(flowIds(options)).toEqual(["not-ours", "residue"]);
    expect(readFlow(options, "not-ours")).toEqual(foreign);
    expect(readFlow(options, "residue")).toEqual(residue);
    expect(result.warnings.join("\n")).toContain(
      "1 continuation TaskFlow row in 1 session has no import receipt",
    );
    const receipts = write(
      options,
      (db) =>
        executeSqliteQuerySync(
          db,
          kysely(db)
            .selectFrom("migration_sources")
            .selectAll()
            .where("migration_kind", "=", "continuation-taskflow-source-retirement"),
        ).rows,
    );
    expect(
      receipts.map((row): number => JSON.parse(row.report_json).deleted).toSorted((a, b) => a - b),
    ).toEqual([1, 3]);

    const again = await retireContinuationTaskFlowSourceRows({
      env: options.env,
      now: () => 30_000,
    });

    expect(flowIds(options)).toEqual(["not-ours", "residue"]);
    expect(again.changes).toEqual([]);
    expect(fs.readdirSync(`${options.env.OPENCLAW_STATE_DIR}/attachments/continuation`)).toEqual(
      [],
    );
  });
});
