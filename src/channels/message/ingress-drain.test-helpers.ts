import fs from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { resolvePreferredOpenClawTmpDir } from "../../infra/tmp-openclaw-dir.js";
import {
  closeOpenClawStateDatabaseForTest,
  openOpenClawStateDatabase,
} from "../../state/openclaw-state-db.js";
import { createChannelIngressQueue } from "./ingress-queue.js";

export type IngressDrainTestPayload = { text: string; kind?: "ambient" | "addressed" };

export function createTestIngressQueue(
  stateDir: string,
  options: Omit<
    Parameters<typeof createChannelIngressQueue>[0],
    "channelId" | "accountId" | "stateDir"
  > = {},
) {
  return createChannelIngressQueue<IngressDrainTestPayload>({
    channelId: "test",
    accountId: "a",
    stateDir,
    ...options,
  });
}

export async function withTempState<T>(fn: (stateDir: string) => Promise<T>): Promise<T> {
  const stateDir = await fs.mkdtemp(
    path.join(resolvePreferredOpenClawTmpDir(), "openclaw-ingress-drain-"),
  );
  try {
    return await fn(stateDir);
  } finally {
    closeOpenClawStateDatabaseForTest();
    await fs.rm(stateDir, { recursive: true, force: true });
  }
}

/**
 * Test-only SQLite instrumentation for pending list SELECT row budgets.
 * Does not expand the production queue constructor API.
 */
export function instrumentPendingListSql(stateDir: string): {
  selectedRows: () => number;
  selectCalls: () => number;
  reset: () => void;
} {
  const database = openOpenClawStateDatabase({
    env: { OPENCLAW_STATE_DIR: stateDir },
  });
  const db = database.db as DatabaseSync & {
    prepare: DatabaseSync["prepare"];
  };
  let selectedRows = 0;
  let selectCalls = 0;
  const originalPrepare = db.prepare.bind(db);
  db.prepare = ((sql: string) => {
    const statement = originalPrepare(sql) as StatementSync;
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    // Kysely binds status as `?` — match the pending list shape, not a quoted literal.
    const tracksPendingList =
      normalized.startsWith("select") &&
      normalized.includes('from "channel_ingress_events"') &&
      normalized.includes('"status"') &&
      normalized.includes("limit") &&
      !normalized.includes("count(");
    if (!tracksPendingList) {
      return statement;
    }
    const countRows = (rows: unknown): number => (Array.isArray(rows) ? rows.length : 0);
    const originalIterate = statement.iterate.bind(statement);
    Object.defineProperty(statement, "iterate", {
      configurable: true,
      value: (...params: Parameters<StatementSync["iterate"]>) => {
        selectCalls += 1;
        const rows = [...originalIterate(...params)];
        selectedRows += rows.length;
        return rows.values();
      },
    });
    const originalAll = statement.all.bind(statement);
    Object.defineProperty(statement, "all", {
      configurable: true,
      value: (...params: Parameters<StatementSync["all"]>) => {
        selectCalls += 1;
        const rows = originalAll(...params);
        selectedRows += countRows(rows);
        return rows;
      },
    });
    return statement;
  }) as DatabaseSync["prepare"];
  return {
    selectedRows: () => selectedRows,
    selectCalls: () => selectCalls,
    reset: () => {
      selectedRows = 0;
      selectCalls = 0;
    },
  };
}
