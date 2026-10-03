import { openOpenClawStateDatabase } from "../state/openclaw-state-db.js";
import { captureOpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.js";
import type { OpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.types.js";
import {
  completeSessionDelivery,
  loadPendingSessionDelivery,
  markSessionDeliverySettlement,
} from "./session-delivery-queue-storage.js";

type SessionQueueRow = {
  status: string;
  entry_json: string;
  last_error: string | null;
  entry_kind: string | null;
  session_key: string | null;
  channel: string | null;
  target: string | null;
  account_id: string | null;
};

export function captureSessionDeliveryQueueContext(stateDir: string): OpenClawStateWorkerContext {
  return captureOpenClawStateWorkerContext({
    env: { ...process.env, OPENCLAW_STATE_DIR: stateDir },
  });
}

export async function settleSessionDelivery(id: string, stateDir: string): Promise<void> {
  const context = captureSessionDeliveryQueueContext(stateDir);
  const entry = await loadPendingSessionDelivery(id, context);
  if (!entry) {
    throw new Error(`Expected pending session delivery ${id}`);
  }
  await markSessionDeliverySettlement(entry, "recovered", context);
  await completeSessionDelivery(id, context);
}

export function readSessionQueueStatus(tempDir: string, id: string): string | undefined {
  const { db } = openOpenClawStateDatabase({
    env: { ...process.env, OPENCLAW_STATE_DIR: tempDir },
  });
  const row = db
    .prepare("SELECT status FROM delivery_queue_entries WHERE queue_name = 'session' AND id = ?")
    .get(id) as { status?: string } | undefined;
  return row?.status;
}

export function readSessionQueueRow(tempDir: string, id: string): SessionQueueRow | undefined {
  const { db } = openOpenClawStateDatabase({
    env: { ...process.env, OPENCLAW_STATE_DIR: tempDir },
  });
  return db
    .prepare(
      `SELECT status, entry_json, last_error,
              entry_kind, session_key, channel, target, account_id
         FROM delivery_queue_entries
        WHERE queue_name = 'session' AND id = ?`,
    )
    .get(id) as SessionQueueRow | undefined;
}

export function rewriteSessionQueueEntry(
  tempDir: string,
  id: string,
  update: (entry: Record<string, unknown>) => void,
): void {
  const current = readSessionQueueRow(tempDir, id);
  if (!current) {
    throw new Error(`Expected session delivery row ${id}`);
  }
  const entry = JSON.parse(current.entry_json) as Record<string, unknown>;
  update(entry);
  const { db } = openOpenClawStateDatabase({
    env: { ...process.env, OPENCLAW_STATE_DIR: tempDir },
  });
  db.prepare(
    `UPDATE delivery_queue_entries
        SET entry_json = ?
      WHERE queue_name = 'session' AND id = ?`,
  ).run(JSON.stringify(entry), id);
}

export function rewriteSessionQueueEntryKind(
  tempDir: string,
  id: string,
  entryKind: string | null,
): void {
  const { db } = openOpenClawStateDatabase({
    env: { ...process.env, OPENCLAW_STATE_DIR: tempDir },
  });
  db.prepare(
    `UPDATE delivery_queue_entries
        SET entry_kind = ?
      WHERE queue_name = 'session' AND id = ?`,
  ).run(entryKind, id);
}
