// Operator commands for inspecting, quarantining and requeueing durable session deliveries.
import fs, { type FileHandle } from "node:fs/promises";
import { sanitizeTerminalText } from "../../packages/terminal-core/src/safe-text.js";
import { theme } from "../../packages/terminal-core/src/theme.js";
import { runWithLocalStateOwner } from "../cli/local-state-owner.js";
import { parseDurationMs } from "../cli/parse-duration.js";
import {
  formatSessionDeliveryBatchRefusal,
  listSessionDeliverySummaries,
  quarantineSessionDeliveries,
  requeueQuarantinedSessionDeliveries,
  SESSION_DELIVERY_QUARANTINE_REASON_PREFIX,
  type SessionDeliveryBatchRefusal,
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
export type SessionDeliveryListRow = Omit<
  SessionDeliverySummary,
  "idempotencyKey" | "entryDigest"
> & {
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
  applied: ReceiptApplied;
};

type ReceiptApplied = boolean | "unknown";

export type SessionDeliveriesReceipt = {
  command: `sessions deliveries ${MutationAction}`;
  version: string;
  commit: string | null;
  generatedAt: string;
  dryRun: boolean;
  reason: string | null;
  selector: { ids?: string[]; idempotencyPrefix?: string; olderThanMs?: number };
  /**
   * True only when the batch transaction committed every row. `"unknown"` means the batch was
   * dispatched and the worker failed with something other than a batch refusal, so it may have
   * committed; inspect the listed ids with `list`.
   */
  applied: ReceiptApplied;
  rows: ReceiptRow[];
  /** Selected rows refused by the shared eligibility rule; any refusal blocks the whole batch. */
  refused: SessionDeliveryBatchRefusal[];
  /** Prefix matches left out because the shared eligibility rule rejects them. */
  skipped: SessionDeliveryBatchRefusal[];
  error?: string;
};

function idempotencyPrefixOf(key: string | null): string | null {
  return key === null ? null : (key.split(":")[0] ?? null);
}

function toListRow({
  idempotencyKey,
  entryDigest: _entryDigest,
  ...summary
}: SessionDeliverySummary): SessionDeliveryListRow {
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

/** A refusal raised by the batch transaction itself: it rolled back, so nothing changed. */
function isSessionDeliveryBatchRefusal(error: unknown, action: MutationAction): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  // The worker boundary may not preserve the class, so also accept the kernel's exact prefix.
  return (
    ("code" in error && error.code === "SESSION_DELIVERY_BATCH_REFUSED") ||
    error.message.startsWith(formatSessionDeliveryBatchRefusal(action, []))
  );
}

function blockerFor(action: MutationAction, row: SessionDeliverySummary): string | null {
  return action === "quarantine" ? row.quarantineBlocker : row.requeueBlocker;
}

type Selection = {
  selected: SessionDeliverySummary[];
  refused: SessionDeliveryBatchRefusal[];
  skipped: SessionDeliveryBatchRefusal[];
};

/** Apply the kernel's eligibility rule so a dry run reports exactly what `--apply` will do. */
function selectRows(
  summaries: readonly SessionDeliverySummary[],
  selector: Selector,
  action: MutationAction,
  now: number,
): Selection {
  if (selector.kind === "ids") {
    const byId = new Map(summaries.map((row) => [row.id, row]));
    const selected: SessionDeliverySummary[] = [];
    const refused: SessionDeliveryBatchRefusal[] = [];
    for (const id of selector.ids) {
      const row = byId.get(id);
      const reason = row ? blockerFor(action, row) : "not found in the session delivery queue";
      if (row) {
        selected.push(row);
      }
      if (reason) {
        refused.push({ id, reason });
      }
    }
    return { selected, refused, skipped: [] };
  }
  const cutoff = now - selector.olderThanMs;
  const statusBefore = action === "quarantine" ? "pending" : "failed";
  const matches = summaries.filter(
    (row) =>
      row.status === statusBefore &&
      row.idempotencyKey?.startsWith(selector.idempotencyPrefix) === true &&
      row.enqueuedAt <= cutoff,
  );
  const skipped: SessionDeliveryBatchRefusal[] = [];
  const selected = matches.filter((row) => {
    const reason = blockerFor(action, row);
    if (reason) {
      skipped.push({ id: row.id, reason });
    }
    return reason === null;
  });
  return { selected, refused: [], skipped };
}

/**
 * Claim the receipt file before any mutation: exclusive create with owner-only mode proves the
 * path is new and writable, so a refused path stops the command while nothing has changed.
 */
async function openReceiptFile(receiptPath: string | undefined) {
  if (!receiptPath) {
    return undefined;
  }
  try {
    return await fs.open(receiptPath, "wx", 0o600);
  } catch (error) {
    throw new Error(
      `Cannot create receipt file ${receiptPath}: ${error instanceof Error ? error.message : String(error)}. Choose a new, writable path. Nothing was changed.`,
      { cause: error },
    );
  }
}

function printReceipt(
  receipt: SessionDeliveriesReceipt,
  options: SessionsDeliveriesMutationOptions,
  runtime: RuntimeEnv,
): void {
  if (options.json) {
    writeRuntimeJson(runtime, receipt);
    return;
  }
  const action = receipt.command.split(" ").at(-1);
  runtime.log(
    theme.heading(
      receipt.applied === true
        ? `${action === "quarantine" ? "Quarantined" : "Requeued"} ${receipt.rows.length} session deliveries`
        : receipt.dryRun && !receipt.error
          ? `Dry run: would ${action} ${receipt.rows.length} session deliveries (pass --apply to change them)`
          : receipt.applied === "unknown"
            ? `${action} of ${receipt.rows.length} session deliveries: outcome unknown; inspect the exact IDs with \`openclaw sessions deliveries list\` before retrying`
            : `Nothing was changed: ${action} of ${receipt.rows.length} session deliveries was not applied`,
    ),
  );
  for (const row of receipt.rows) {
    runtime.log(
      `- ${sanitizeTerminalText(row.id)} session=${sanitizeTerminalText(row.sessionKey ?? "-")} enqueued=${new Date(row.enqueuedAt).toISOString()} textLength=${row.textLength ?? "-"} ${row.statusBefore} -> ${row.statusAfter}${row.applied === true ? "" : row.applied === "unknown" ? " (outcome unknown)" : " (not applied)"}`,
    );
  }
  for (const { id, reason } of receipt.refused) {
    runtime.log(`! refused ${sanitizeTerminalText(id)}: ${sanitizeTerminalText(reason)}`);
  }
  for (const { id, reason } of receipt.skipped) {
    runtime.log(`~ skipped ${sanitizeTerminalText(id)}: ${sanitizeTerminalText(reason)}`);
  }
  if (receipt.error) {
    runtime.log(`error: ${sanitizeTerminalText(receipt.error)}`);
  }
  runtime.log(
    theme.muted(
      `applied=${receipt.applied} dryRun=${receipt.dryRun} version=${receipt.version} commit=${receipt.commit ?? "unknown"} at=${receipt.generatedAt}${options.receipt ? ` receipt=${options.receipt}` : ""}`,
    ),
  );
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
  const receiptFile = await openReceiptFile(options.receipt);
  try {
    return await runMutationWithReceipt({
      action,
      options,
      runtime,
      selector,
      reason,
      dryRun,
      receiptFile,
    });
  } finally {
    await receiptFile?.close();
  }
}

async function runMutationWithReceipt(params: {
  action: MutationAction;
  options: SessionsDeliveriesMutationOptions;
  runtime: RuntimeEnv;
  selector: Selector;
  reason: string | null;
  dryRun: boolean;
  receiptFile: FileHandle | undefined;
}): Promise<SessionDeliveriesReceipt> {
  const { action, options, runtime, selector, reason, dryRun, receiptFile } = params;
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
    applied: false,
    rows: [],
    refused: [],
    skipped: [],
  };
  const statusBefore: SessionDeliveryInspectStatus = action === "quarantine" ? "pending" : "failed";
  const statusAfter: SessionDeliveryInspectStatus = action === "quarantine" ? "failed" : "pending";
  let failure: unknown;
  try {
    await runOwned(action, async (context, assertCurrent) => {
      const summaries = await listSessionDeliverySummaries(["pending", "failed"], context);
      const selection = selectRows(summaries, selector, action, Date.now());
      receipt.rows = selection.selected.map((row) => ({
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
      receipt.refused = selection.refused;
      receipt.skipped = selection.skipped;
      if (selection.refused.length > 0) {
        throw new Error(formatSessionDeliveryBatchRefusal(action, selection.refused));
      }
      if (dryRun || selection.selected.length === 0) {
        return;
      }
      assertCurrent();
      // One worker op validates and transitions every row in a single IMMEDIATE transaction.
      const entries = selection.selected.map(({ id, entryDigest }) => ({ id, entryDigest }));
      try {
        if (action === "quarantine") {
          await quarantineSessionDeliveries(entries, reason!, context);
        } else {
          await requeueQuarantinedSessionDeliveries(entries, context);
        }
      } catch (error) {
        if (isSessionDeliveryBatchRefusal(error, action)) {
          throw error;
        }
        // The worker may have committed before its acknowledgement or transport failed.
        receipt.applied = "unknown";
        for (const row of receipt.rows) {
          row.applied = "unknown";
        }
        throw new Error(
          `sessions deliveries ${action}: outcome unknown; inspect the exact IDs with \`openclaw sessions deliveries list\` before retrying (${entries.map((entry) => entry.id).join(", ")}). The state worker failed after dispatch: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      receipt.applied = true;
      for (const row of receipt.rows) {
        row.applied = true;
      }
    });
  } catch (error) {
    failure = error;
    receipt.error = error instanceof Error ? error.message : String(error);
  }
  // stdout is the first record; the file copy follows and cannot erase it.
  printReceipt(receipt, options, runtime);
  if (receiptFile) {
    try {
      await receiptFile.writeFile(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
      await receiptFile.sync();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        receipt.applied === true
          ? `sessions deliveries ${action} WAS APPLIED to ${receipt.rows.length} rows and the receipt was printed above, but writing the receipt file ${options.receipt} failed: ${message}`
          : receipt.applied === "unknown"
            ? `sessions deliveries ${action}: outcome unknown; inspect the exact IDs with \`openclaw sessions deliveries list\` before retrying. The receipt was printed above, but writing the receipt file ${options.receipt} failed: ${message}`
            : `sessions deliveries ${action} changed nothing; the receipt was printed above, but writing the receipt file ${options.receipt} failed: ${message}`,
        { cause: error },
      );
    }
  }
  if (failure !== undefined) {
    // Rethrow the original Error unchanged; only a non-Error throw is wrapped.
    throw failure instanceof Error
      ? failure
      : new Error(typeof failure === "string" ? failure : `sessions deliveries ${action} failed`, {
          cause: failure,
        });
  }
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
