// Continuation (karmaterminal): a fresh Gateway process for the reset-retention restart proof.
// Restores the subagent registry from SQLite, runs the boot resolution the Gateway runs after
// registry activation, replays each run's held return rows once, and prints what it saw as JSON.
// Arguments: one or more `<sessionKey> <runId> <text>` triples.
import { subagentRuns } from "../../agents/subagents/registry/subagent-registry-memory.js";
import { initSubagentRegistry } from "../../agents/subagents/registry/subagent-registry.js";
import { captureRuntimeConfigAsyncReader, getRuntimeConfig } from "../../config/config.js";
import { deliverQueuedSessionDeliveryCore } from "../../gateway/server-restart-sentinel-delivery.js";
import {
  loadPendingSessionDeliveries,
  SessionDeliveryDeferredError,
} from "../../infra/session-delivery-queue-storage.js";
import { resolveSystemEventQueueKey } from "../../infra/system-event-ownership.js";
import { peekSystemEventEntries } from "../../infra/system-events.js";
import { captureOpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.js";
import { resolveContinuationResetRetentions } from "./session-reset-retention-resolve.js";

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 3 !== 0) {
  throw new Error("usage: (<sessionKey> <runId> <text>)+");
}
const targets = Array.from({ length: args.length / 3 }, (_, index) => ({
  sessionKey: args[index * 3]!,
  runId: args[index * 3 + 1]!,
  text: args[index * 3 + 2]!,
}));
const bootedAt = Date.now();
await captureRuntimeConfigAsyncReader()();
await initSubagentRegistry();
const before = new Map(
  targets.map(({ runId }) => [runId, subagentRuns.get(runId)?.continuationResetRetention?.state]),
);
await resolveContinuationResetRetentions({ cfg: getRuntimeConfig(), markedBefore: bootedAt });
const context = captureOpenClawStateWorkerContext();
const pending = await loadPendingSessionDeliveries(context);
const runs: Record<string, unknown> = {};
for (const { sessionKey, runId, text } of targets) {
  const rows = pending.filter(
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
  const mark = subagentRuns.get(runId)?.continuationResetRetention;
  runs[runId] = {
    before: before.get(runId),
    after: mark?.state,
    resolvedAt: mark?.resolvedAt,
    rowIds: rows.map((row) => row.id),
    replays,
    events: peekSystemEventEntries(resolveSystemEventQueueKey(sessionKey, "main"))
      .filter((event) => event.text === text)
      .map((event) => event.sessionDeliveryAckId),
  };
}
process.stdout.write(`${JSON.stringify({ pid: process.pid, runs })}\n`);
process.exit(0);
