import { subagentRuns } from "../../agents/subagents/registry/subagent-registry-memory.js";
// Continuation (karmaterminal): a fresh Gateway process for the reset-retention restart proof.
// Restores the subagent registry from SQLite, runs the boot resolution the Gateway runs after
// registry activation, replays the held return rows once, and prints what it saw as JSON.
import { initSubagentRegistry } from "../../agents/subagents/registry/subagent-registry.js";
import { getRuntimeConfig } from "../../config/config.js";
import { deliverQueuedSessionDeliveryCore } from "../../gateway/server-restart-sentinel-delivery.js";
import {
  loadPendingSessionDeliveries,
  SessionDeliveryDeferredError,
} from "../../infra/session-delivery-queue-storage.js";
import { resolveSystemEventQueueKey } from "../../infra/system-event-ownership.js";
import { peekSystemEventEntries } from "../../infra/system-events.js";
import { captureOpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.js";
import { resolveContinuationResetRetentions } from "./session-reset-retention-resolve.js";

const [sessionKey, runId, text] = process.argv.slice(2);
if (!sessionKey || !runId || !text) {
  throw new Error("usage: <sessionKey> <runId> <text>");
}
const bootedAt = Date.now();
await initSubagentRegistry();
const before = subagentRuns.get(runId)?.continuationResetRetention;
await resolveContinuationResetRetentions({ cfg: getRuntimeConfig(), markedBefore: bootedAt });
const after = subagentRuns.get(runId)?.continuationResetRetention;
const context = captureOpenClawStateWorkerContext();
const rows = (await loadPendingSessionDeliveries(context)).filter(
  (row) => row.kind === "systemEvent" && row.continuationSourceRunId === runId,
);
const replays: string[] = [];
for (const row of rows) {
  try {
    await deliverQueuedSessionDeliveryCore({
      deps: {} as never,
      entry: row,
      queueContext: context,
    });
    replays.push("returned");
  } catch (error) {
    if (!(error instanceof SessionDeliveryDeferredError)) {
      throw error;
    }
    replays.push(
      error.heldByOwner ? "held" : error.awaitingAdoptionInMemory ? "queued" : "deferred",
    );
  }
}
const events = peekSystemEventEntries(resolveSystemEventQueueKey(sessionKey, "main"))
  .filter((event) => event.text === text)
  .map((event) => event.sessionDeliveryAckId);
process.stdout.write(
  `${JSON.stringify({
    pid: process.pid,
    before: before?.state,
    after: after?.state,
    resolvedAt: after?.resolvedAt,
    rowIds: rows.map((row) => row.id),
    replays,
    events,
  })}\n`,
);
process.exit(0);
