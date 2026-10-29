// Continuation (karmaterminal): one gateway lifetime of the continuation-row new-process proof.
// The parent starts a fresh Node process per lifetime; durable state lives only in the
// SQLite state dir named by this process's OPENCLAW_STATE_DIR.
import { writeSync } from "node:fs";
import fs from "node:fs/promises";
import { register } from "node:module";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

// An adoption-scoped event bound to its recipient session's authority.
type SeedRow = { kind: "authority"; revision: number; sessionKey: string; revoke: boolean };
type Args = {
  sessionId?: string;
  rows?: SeedRow[];
  /** Recover through a context captured for this dir while process.env names another. */
  captureStateDir?: string;
  peekSessionKeys?: string[];
};
type ProofEdges = {
  events: Array<{ text: string; sessionKey: string; contextKey?: string; sessionId?: string }>;
  dispatches: Array<{ sessionKey: string; messageSid?: string }>;
  onAdopted?: () => void;
};

const [mode, argJson = "{}"] = process.argv.slice(2);
const stateDir = process.env.OPENCLAW_STATE_DIR;
if (!stateDir || !["seed", "recover"].includes(mode ?? "")) {
  throw new Error("Expected OPENCLAW_STATE_DIR and a seed or recover lifetime");
}
const args = JSON.parse(argJson) as Args;
process.env.HOME = stateDir;
process.env.USERPROFILE = stateDir;
process.env.OPENCLAW_HOME = stateDir;
process.env.OPENCLAW_CONFIG_PATH = path.join(stateDir, "openclaw.json");
await fs.mkdir(stateDir, { recursive: true });
await fs.writeFile(process.env.OPENCLAW_CONFIG_PATH, "{}");

const edges: ProofEdges = { events: [], dispatches: [] };
Object.defineProperty(globalThis, "__restartRecoveryProofEdges", { value: edges });

// mock-isolation: the model turn is the external edge. Each stub re-exports the real module
// (the importOriginal spread) and replaces only the export that would execute a model turn.
// tsx strips query markers, so the stub's own import of the real module is told apart by parent.
const here = new URL(".", import.meta.url);
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const reexport = (relative: string) => `export * from ${JSON.stringify(new URL(relative, here))};`;
const edgeStubs = {
  "/src/auto-reply/reply/session-event-handoff.ts": stub(`
${reexport("../auto-reply/reply/session-event-handoff.ts")}
export function enqueueSessionEventForHost(text, options) {
  const edges = globalThis.__restartRecoveryProofEdges;
  edges.events.push({
    text,
    sessionKey: options.sessionKey,
    contextKey: options.contextKey,
    sessionId: options.expectedTarget?.sessionId,
  });
  return {
    id: "proof-event",
    accepted: Promise.resolve({ ok: true }),
    cancel: () => true,
    settled: (async () => {
      await options.onAdopted?.();
      edges.onAdopted?.();
      return { status: "completed", executionStarted: true, delivered: true };
    })(),
  };
}`),
  "/src/channels/turn/lifecycle.ts": stub(`
${reexport("../channels/turn/lifecycle.ts")}
export async function dispatchAssembledChannelTurn(params) {
  const edges = globalThis.__restartRecoveryProofEdges;
  edges.dispatches.push({
    sessionKey: params.routeSessionKey,
    messageSid: params.ctxPayload?.MessageSid,
  });
  await params.turnAdoptionLifecycle?.onAdopted();
  edges.onAdopted?.();
  return { dispatched: true, dispatchResult: { observedReplyDelivery: true } };
}`),
};
register(
  stub(`
const stubs = ${JSON.stringify(edgeStubs)};
export async function resolve(specifier, context, next) {
  const resolved = await next(specifier, context);
  const bare = resolved.url.split("?")[0];
  for (const [suffix, url] of Object.entries(stubs)) {
    if (bare.endsWith(suffix) && context.parentURL !== url) {
      return { url, format: "module", shortCircuit: true };
    }
  }
  return resolved;
}
export async function load(url, context, next) {
  if (!Object.values(stubs).includes(url)) return next(url, context);
  return { format: "module", source: decodeURIComponent(url.slice(url.indexOf(",") + 1)), shortCircuit: true };
}`),
  pathToFileURL(import.meta.filename),
);

const { setRuntimeConfigSnapshot } = await import("../config/runtime-snapshot.js");
const { captureOpenClawStateWorkerContext } =
  await import("../state/openclaw-state-worker-context.js");
const queue = await import("../infra/session-delivery-queue-storage.js");
const sessions = await import("../config/sessions/session-accessor.js");
const { closeOpenClawStateDatabaseAsync } = await import("../state/openclaw-state-db.js");

setRuntimeConfigSnapshot({});
const mainKey = "agent:main:main";
const ownerA = { type: "human" as const, id: "owner-a", source: "unknown" as const };
const logs: string[] = [];
const log = {
  info: (message: string) => logs.push(`info: ${message}`),
  warn: (message: string) => logs.push(`warn: ${message}`),
  error: (message: string) => logs.push(`error: ${message}`),
};

async function pending(context = captureOpenClawStateWorkerContext()) {
  const rows = await queue.loadPendingSessionDeliveries(context);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    deliveryStartedAt: row.deliveryStartedAt ?? null,
    retryCount: row.retryCount,
  }));
}

function report(value: Record<string, unknown>) {
  writeSync(1, `${JSON.stringify({ mode, stateDir, ...value })}\n`);
}

async function enqueueAuthorityRow(row: Extract<SeedRow, { kind: "authority" }>) {
  const scope = { agentId: "main", sessionKey: row.sessionKey };
  await sessions.upsertSessionEntryCore(scope, {
    sessionId: `${row.sessionKey}:incarnation`,
    updatedAt: 1,
    createdActor: ownerA,
  });
  const recipientAuthority = await sessions.captureSessionRecipientAuthority(scope);
  const id = await queue.enqueueSessionDelivery(
    {
      kind: "systemEvent",
      sessionKey: row.sessionKey,
      text: `delegate result ${row.revision}`,
      recipientAuthority,
      awaitPromptAdoption: true,
      idempotencyKey: `proof-authority:${row.revision}`,
    },
    captureOpenClawStateWorkerContext(),
  );
  if (row.revoke) {
    sessions.assignSessionOwner(scope, {
      owner: { type: "human", id: "owner-b" },
      assignedBy: ownerA,
      assignedAt: 3,
    });
  }
  return id;
}

async function seed() {
  await sessions.replaceSessionEntry(
    { sessionKey: mainKey },
    { sessionId: args.sessionId ?? "session-1", updatedAt: Date.now() },
  );
  const ids: string[] = [];
  for (const row of args.rows ?? []) {
    // Recovery replays in enqueue order; distinct timestamps keep that order deterministic.
    await sleep(5);
    ids.push(await enqueueAuthorityRow(row));
  }
  return { ids, pending: await pending() };
}

async function recover() {
  const { recoverPendingProducedSessionDeliveries } = await import("./server-restart-sentinel.js");
  // The runtime captures its queue owner once at start (server-runtime-services.ts).
  const queueContext = captureOpenClawStateWorkerContext(
    args.captureStateDir
      ? { env: { ...process.env, OPENCLAW_STATE_DIR: args.captureStateDir } }
      : {},
  );
  const before = await pending(queueContext);
  await recoverPendingProducedSessionDeliveries({ deps: {}, queueContext, log });
  const queued: Record<string, unknown[]> = {};
  if (args.peekSessionKeys) {
    const { peekSystemEventEntries } = await import("../infra/system-events.js");
    for (const key of args.peekSessionKeys) {
      queued[key] = peekSystemEventEntries(key).map((event) => ({
        text: event.text,
        sessionDeliveryAckId: event.sessionDeliveryAckId,
        sessionDeliveryAckStateDir: event.sessionDeliveryAckStateDir,
      }));
    }
  }
  return {
    capturedStateDir: queueContext.environment.OPENCLAW_STATE_DIR,
    before,
    after: await pending(queueContext),
    events: edges.events,
    dispatches: edges.dispatches,
    queued,
    logs,
  };
}

const result = mode === "seed" ? await seed() : await recover();
await closeOpenClawStateDatabaseAsync();
report(result);
process.exit(0);
