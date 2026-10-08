// Operator commands for inspecting, quarantining and requeueing durable session deliveries.
import fs from "node:fs/promises";
import { sanitizeTerminalText } from "../../packages/terminal-core/src/safe-text.js";
import { theme } from "../../packages/terminal-core/src/theme.js";
import { runWithLocalStateOwner } from "../cli/local-state-owner.js";
import { parseDurationMs } from "../cli/parse-duration.js";
import {
  listSessionDeliverySummaries,
  quarantineSessionDelivery,
  requeueQuarantinedSessionDelivery,
  SESSION_DELIVERY_QUARANTINE_REASON_PREFIX,
  type SessionDeliveryInspectStatus,
  type SessionDeliverySummary,
} from "../infra/session-delivery-queue-storage.js";
import { defaultRuntime, type RuntimeEnv, writeRuntimeJson } from "../runtime.js";
import { captureOpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.js";
import type { OpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.types.js";
import { resolveRuntimeServiceCommit, VERSION } from "../version.js";

export type SessionsDeliveriesListOptions = {
  status?: string;
  json?: boolean;
};

export type SessionsDeliveriesMutationOptions = {
  id?: string[];
  idempotencyPrefix?: string;
  olderThan?: string;
  reason?: string;
  apply?: boolean;
  receipt?: string;
  json?: boolean;
};

type MutationAction = "quarantine" | "requeue";

/** Listing shape: the idempotency key is reduced to its first segment and text to a length. */
export type SessionDeliveryListRow = Omit<SessionDeliverySummary, "idempotencyKey"> & {
  idempotencyPrefix: string | null;
};

type ReceiptRow = {
  id: string;
  sessionKey: string | null;
  entryKind: string | null;
  idempotencyPrefix: string | null;
  enqueuedAt: number;
  textLength: number | null;
  statusBefore: SessionDeliveryInspectStatus;
  statusAfter: SessionDeliveryInspectStatus;
  applied: boolean;
};

export type SessionDeliveriesReceipt = {
  command: `sessions deliveries ${MutationAction}`;
  version: string;
  commit: string | null;
  generatedAt: string;
  dryRun: boolean;
  reason: string | null;
  selector: { ids?: string[]; idempotencyPrefix?: string; olderThanMs?: number };
  rows: ReceiptRow[];
  error?: string;
};

function idempotencyPrefixOf(key: string | null): string | null {
  return key === null ? null : (key.split(":")[0] ?? null);
}

function toListRow({ idempotencyKey, ...summary }: SessionDeliverySummary): SessionDeliveryListRow {
  return { ...summary, idempotencyPrefix: idempotencyPrefixOf(idempotencyKey) };
}

function parseListStatus(raw: string | undefined): SessionDeliveryInspectStatus {
  const status = raw?.trim() ?? "pending";
  if (status !== "pending" && status !== "failed") {
    throw new Error('--status must be "pending" or "failed".');
  }
  return status;
}

function parseOlderThanMs(raw: string): number {
  // A bare number would silently mean milliseconds; operators must spell the unit.
  if (!/[a-z]$/iu.test(raw.trim())) {
    throw new Error("--older-than needs a unit, for example 6h or 2d.");
  }
  const ms = parseDurationMs(raw.trim());
  if (!(ms > 0)) {
    throw new Error("--older-than must be a positive duration.");
  }
  return ms;
}

type Selector =
  | { kind: "ids"; ids: string[] }
  | { kind: "prefix"; idempotencyPrefix: string; olderThanMs: number };

/** Refuse before any state access unless the operator named rows explicitly or by bounded prefix. */
export function resolveSessionDeliveriesSelector(
  options: SessionsDeliveriesMutationOptions,
): Selector {
  const ids = [...new Set((options.id ?? []).map((id) => id.trim()))];
  const prefix = options.idempotencyPrefix?.trim();
  if (ids.some((id) => id.length === 0)) {
    throw new Error("--id must not be blank.");
  }
  if (options.idempotencyPrefix !== undefined && !prefix) {
    throw new Error("--idempotency-prefix must not be blank.");
  }
  if (ids.length > 0 && (prefix || options.olderThan !== undefined)) {
    throw new Error("Choose one selector: --id, or --idempotency-prefix with --older-than.");
  }
  if (ids.length > 0) {
    return { kind: "ids", ids };
  }
  if (prefix) {
    if (options.olderThan === undefined) {
      throw new Error("--idempotency-prefix requires --older-than <duration>.");
    }
    return {
      kind: "prefix",
      idempotencyPrefix: prefix,
      olderThanMs: parseOlderThanMs(options.olderThan),
    };
  }
  throw new Error(
    "Refusing to select rows implicitly. Pass --id <id> (repeatable), or --idempotency-prefix <prefix> with --older-than <duration>.",
  );
}

function selectRows(
  candidates: readonly SessionDeliverySummary[],
  selector: Selector,
  action: MutationAction,
  now: number,
): SessionDeliverySummary[] {
  if (selector.kind === "ids") {
    const byId = new Map(candidates.map((row) => [row.id, row]));
    const missing = selector.ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new Error(
        action === "quarantine"
          ? `Not a pending session delivery: ${missing.join(", ")}. Nothing was changed.`
          : `Not quarantined by sessions deliveries quarantine: ${missing.join(", ")}. Nothing was changed.`,
      );
    }
    return selector.ids.map((id) => byId.get(id)!);
  }
  const cutoff = now - selector.olderThanMs;
  return candidates.filter(
    (row) =>
      row.idempotencyKey?.startsWith(selector.idempotencyPrefix) === true &&
      row.enqueuedAt <= cutoff,
  );
}

async function assertReceiptPathFree(receiptPath: string | undefined): Promise<void> {
  if (!receiptPath) {
    return;
  }
  const existing = await fs.stat(receiptPath).catch(() => undefined);
  if (existing) {
    throw new Error(`Receipt path already exists: ${receiptPath}. Choose a new path.`);
  }
}

async function runOwned<T>(
  action: string,
  run: (context: OpenClawStateWorkerContext, assertCurrent: () => void) => Promise<T>,
): Promise<T> {
  // Fails closed while any Gateway owns this state directory, including a live owner lease.
  return runWithLocalStateOwner({
    method: `sessions.deliveries.${action}`,
    params: {},
    target: "the durable session delivery queue",
    onForeignOwner: "refuse",
    runLocal: async ({ env, assertCurrent }) => {
      const context = captureOpenClawStateWorkerContext({ env });
      assertCurrent();
      return await run(context, assertCurrent);
    },
  });
}

function formatAge(now: number, at: number | null): string {
  if (at === null) {
    return "-";
  }
  return new Date(at).toISOString() + ` (${Math.max(0, Math.round((now - at) / 60_000))}m ago)`;
}

/** List pending (or failed) session-queue rows with text length only. */
export async function sessionsDeliveriesListCommand(
  options: SessionsDeliveriesListOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const status = parseListStatus(options.status);
  const rows = await runOwned("list", async (context) =>
    (await listSessionDeliverySummaries([status], context)).map(toListRow),
  );
  if (options.json) {
    writeRuntimeJson(runtime, { status, deliveries: rows });
    return;
  }
  runtime.log(theme.heading(`Session deliveries (${status})`));
  if (rows.length === 0) {
    runtime.log(theme.muted(`No ${status} session deliveries.`));
    return;
  }
  const now = Date.now();
  for (const row of rows) {
    const quarantine = row.quarantineReason
      ? `; ${sanitizeTerminalText(row.quarantineReason)}`
      : "";
    runtime.log(
      `- ${sanitizeTerminalText(row.id)} session=${sanitizeTerminalText(row.sessionKey ?? "-")} kind=${sanitizeTerminalText(row.entryKind ?? "-")} key=${sanitizeTerminalText(row.idempotencyPrefix ?? "-")} enqueued=${formatAge(now, row.enqueuedAt)} retries=${row.retryCount} lastAttempt=${formatAge(now, row.lastAttemptAt)} status=${row.status} textLength=${row.textLength ?? "-"}${quarantine}`,
    );
  }
}

async function runMutation(
  action: MutationAction,
  options: SessionsDeliveriesMutationOptions,
  runtime: RuntimeEnv,
): Promise<SessionDeliveriesReceipt> {
  const selector = resolveSessionDeliveriesSelector(options);
  const reasonText = options.reason?.trim() || "stale session delivery";
  const reason =
    action === "quarantine" ? `${SESSION_DELIVERY_QUARANTINE_REASON_PREFIX} ${reasonText}` : null;
  const dryRun = options.apply !== true;
  await assertReceiptPathFree(options.receipt);
  const receipt: SessionDeliveriesReceipt = {
    command: `sessions deliveries ${action}`,
    version: VERSION,
    commit: resolveRuntimeServiceCommit(),
    generatedAt: new Date().toISOString(),
    dryRun,
    reason,
    selector:
      selector.kind === "ids"
        ? { ids: selector.ids }
        : { idempotencyPrefix: selector.idempotencyPrefix, olderThanMs: selector.olderThanMs },
    rows: [],
  };
  const statusBefore: SessionDeliveryInspectStatus = action === "quarantine" ? "pending" : "failed";
  const statusAfter: SessionDeliveryInspectStatus = action === "quarantine" ? "failed" : "pending";
  let failure: unknown;
  try {
    await runOwned(action, async (context, assertCurrent) => {
      const summaries = await listSessionDeliverySummaries([statusBefore], context);
      const candidates =
        action === "quarantine" ? summaries : summaries.filter((row) => row.quarantineReason);
      const selected = selectRows(candidates, selector, action, Date.now());
      receipt.rows = selected.map((row) => ({
        id: row.id,
        sessionKey: row.sessionKey,
        entryKind: row.entryKind,
        idempotencyPrefix: idempotencyPrefixOf(row.idempotencyKey),
        enqueuedAt: row.enqueuedAt,
        textLength: row.textLength,
        statusBefore,
        statusAfter,
        applied: false,
      }));
      if (dryRun) {
        return;
      }
      for (const row of receipt.rows) {
        assertCurrent();
        if (action === "quarantine") {
          await quarantineSessionDelivery(row.id, reason!, context);
        } else {
          await requeueQuarantinedSessionDelivery(row.id, context);
        }
        row.applied = true;
      }
    });
  } catch (error) {
    failure = error;
    receipt.error = error instanceof Error ? error.message : String(error);
  }
  if (options.receipt && (receipt.rows.length > 0 || failure === undefined)) {
    await fs.writeFile(options.receipt, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  }
  if (failure !== undefined) {
    throw failure;
  }
  if (options.json) {
    writeRuntimeJson(runtime, receipt);
    return receipt;
  }
  const verb = action === "quarantine" ? "quarantine" : "requeue";
  runtime.log(
    theme.heading(
      dryRun
        ? `Dry run: would ${verb} ${receipt.rows.length} session deliveries (pass --apply to change them)`
        : `${verb === "quarantine" ? "Quarantined" : "Requeued"} ${receipt.rows.length} session deliveries`,
    ),
  );
  for (const row of receipt.rows) {
    runtime.log(
      `- ${sanitizeTerminalText(row.id)} session=${sanitizeTerminalText(row.sessionKey ?? "-")} enqueued=${new Date(row.enqueuedAt).toISOString()} textLength=${row.textLength ?? "-"} ${row.statusBefore} -> ${row.statusAfter}${row.applied ? "" : " (not applied)"}`,
    );
  }
  runtime.log(
    theme.muted(
      `version=${receipt.version} commit=${receipt.commit ?? "unknown"} at=${receipt.generatedAt}${options.receipt ? ` receipt=${options.receipt}` : ""}`,
    ),
  );
  return receipt;
}

/** Move selected pending rows to failed with an operator-quarantine reason (dry-run by default). */
export async function sessionsDeliveriesQuarantineCommand(
  options: SessionsDeliveriesMutationOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<SessionDeliveriesReceipt> {
  return runMutation("quarantine", options, runtime);
}

/** Return rows quarantined by this command to pending (dry-run by default). */
export async function sessionsDeliveriesRequeueCommand(
  options: SessionsDeliveriesMutationOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<SessionDeliveriesReceipt> {
  return runMutation("requeue", options, runtime);
}
