// Continuation post-compaction delegate release through sessions.compact.
// Split from server.sessions.compaction.test.ts to keep both suites under the
// test max-lines cap; the release seams below are mocked only for this file.
import fs from "node:fs/promises";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { resetContinuationCustodyProjection } from "../auto-reply/continuation/custody/custody-projection.js";
import { hydrateContinuationCustody } from "../auto-reply/continuation/custody/custody-store.js";
import {
  stagePostCompactionDelegate,
  stagedPostCompactionDelegateCount,
} from "../auto-reply/continuation/delegate-store-post-compaction.js";
import {
  appendTranscriptMessage,
  appendTranscriptEvent,
  loadSessionEntry as loadAccessorSessionEntry,
  loadTranscriptEvents,
} from "../config/sessions/session-accessor.js";
import { loadPendingSessionDeliveries } from "../infra/session-delivery-queue-storage.js";
import { peekSystemEvents } from "../infra/system-events.js";
import { closeOpenClawStateDatabaseAsync } from "../state/openclaw-state-db.js";
import { captureOpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.js";
import { normalizeSessionDeliveryState } from "../utils/delivery-context.shared.js";
import { rpcReq, writeSessionStore } from "./test-helpers.js";
import {
  setupGatewaySessionsTestHarness,
  sessionStoreEntry,
  directSessionReq,
} from "./test/server-sessions.test-helpers.js";

// Post-compaction release seam: records which sessions the release ran for;
// the decision itself reads real custody and releases for real.
const postCompactionReleaseSeams = vi.hoisted(() => ({
  releaseCalls: [] as string[],
}));

vi.mock("../auto-reply/reply/agent-runner-post-compaction-release.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../auto-reply/reply/agent-runner-post-compaction-release.js")
    >();
  return {
    ...actual,
    releasePostCompactionDelegatesAfterCompaction: async (
      ...args: Parameters<typeof actual.releasePostCompactionDelegatesAfterCompaction>
    ) => {
      postCompactionReleaseSeams.releaseCalls.push(args[0].sessionKey ?? "");
      return await actual.releasePostCompactionDelegatesAfterCompaction(...args);
    },
  };
});

// Trim seam: runs the real trim, then optionally replaces the session row so the
// handler's post-trim current-row read no longer matches the compacted session.
const trimSeams = vi.hoisted(() => ({
  afterTrim: undefined as (() => Promise<void>) | undefined,
}));

vi.mock("../config/sessions/session-accessor.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/sessions/session-accessor.js")>();
  return {
    ...actual,
    trimSessionTranscriptForManualCompact: async (
      ...args: Parameters<typeof actual.trimSessionTranscriptForManualCompact>
    ) => {
      const result = await actual.trimSessionTranscriptForManualCompact(...args);
      await trimSeams.afterTrim?.();
      return result;
    },
  };
});

const { createSessionStoreDir, openClient } = setupGatewaySessionsTestHarness();

// Cases here observe `peekSystemEvents` for the shared `agent:main:main` key.
// Each case must first settle the work it started (see the maxLines trim case
// below), then hand the next case an empty buffer, so no neighbour can read or
// inherit another case's lifecycle events.

function buildSessionTranscriptLines(sessionId: string, totalLines: number): string[] {
  const header = JSON.stringify({
    type: "session",
    version: 3,
    id: sessionId,
    timestamp: "2026-06-19T12:00:00.000Z",
    cwd: "/tmp",
  });
  const entries = Array.from({ length: Math.max(0, totalLines - 1) }, (_, index) =>
    JSON.stringify({
      type: "message",
      id: `entry-${index}`,
      parentId: index === 0 ? null : `entry-${index - 1}`,
      timestamp: `2026-06-19T12:00:${String(index % 60).padStart(2, "0")}.000Z`,
      message: { role: "user", content: `line-${index}`, timestamp: index },
    }),
  );
  return [header, ...entries];
}

// Post-compaction cases rehydrate the continuation custody projection from the
// harness state database, as Gateway boot does, so the synchronous staged
// count reads committed custody. Periodic WAL maintenance runs off-thread and
// holds an idle reference while in flight, so join it through the orderly
// async close first.
async function rehydrateContinuationCustodyAfterStateSettles(): Promise<void> {
  await closeOpenClawStateDatabaseAsync();
  resetContinuationCustodyProjection();
  await hydrateContinuationCustody();
}

function expectMainCompactionResult(
  compacted: { ok?: boolean; payload?: { compacted?: boolean; key?: string } | null },
  expectedCompacted: boolean,
) {
  expect(compacted.ok, JSON.stringify(compacted)).toBe(true);
  expect(compacted.payload?.key).toBe("agent:main:main");
  expect(compacted.payload?.compacted, JSON.stringify(compacted)).toBe(expectedCompacted);
}

function loadSessionEntry(scope: Parameters<typeof loadAccessorSessionEntry>[0]) {
  return loadAccessorSessionEntry({ ...scope, readConsistency: "latest" });
}

// Continuation post-compaction cases seed and read SQLite transcript rows directly.
async function seedTranscriptRows(params: {
  agentId?: string;
  sessionId: string;
  sessionKey: string;
  storePath: string;
  totalLines: number;
}): Promise<void> {
  const scope = {
    ...(params.agentId ? { agentId: params.agentId } : {}),
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    storePath: params.storePath,
  };
  if (params.totalLines <= 0) {
    return;
  }
  await appendTranscriptEvent(scope, {
    type: "session",
    version: 3,
    id: params.sessionId,
    timestamp: "2026-06-19T12:00:00.000Z",
    cwd: "/tmp",
  });
  for (let index = 0; index < params.totalLines - 1; index += 1) {
    await appendTranscriptMessage(scope, {
      cwd: "/tmp",
      message: {
        role: "user",
        content: `line-${index}`,
        timestamp: index,
      },
      now: Date.parse(`2026-06-19T12:00:${String(index % 60).padStart(2, "0")}.000Z`),
    });
  }
}

async function loadTranscriptRows(params: {
  agentId?: string;
  sessionId: string;
  sessionKey: string;
  storePath: string;
}): Promise<Array<Record<string, unknown>>> {
  const rows = await loadTranscriptEvents({
    ...(params.agentId ? { agentId: params.agentId } : {}),
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    storePath: params.storePath,
  });
  return rows.map((row) =>
    row && typeof row === "object" && !Array.isArray(row) ? (row as Record<string, unknown>) : {},
  );
}

test("sessions.compact releases queued post-compaction delegates after manual compaction", async () => {
  await rehydrateContinuationCustodyAfterStateSettles();
  const { dir, storePath } = await createSessionStoreDir();
  await fs.writeFile(
    path.join(dir, "sess-post-compaction.jsonl"),
    `${JSON.stringify({ role: "user", content: "hello delegates" })}\n`,
    "utf-8",
  );
  await writeSessionStore({
    entries: {
      main: sessionStoreEntry("sess-post-compaction", {
        delivery: normalizeSessionDeliveryState({
          context: { channel: "webchat", to: "webchat:user-123" },
        }),
      }),
    },
  });
  await seedTranscriptRows({
    sessionId: "sess-post-compaction",
    sessionKey: "agent:main:main",
    storePath,
    totalLines: 3,
  });
  await stagePostCompactionDelegate("agent:main:main", {
    task: "rehydrate after dashboard compact",
    createdAt: Date.now(),
  });
  expect(stagedPostCompactionDelegateCount("agent:main:main")).toBe(1);

  const { ws } = await openClient();
  const compacted = await rpcReq<{ ok: true; key: string; compacted: boolean }>(
    ws,
    "sessions.compact",
    { key: "main" },
  );

  expectMainCompactionResult(compacted, true);
  expect(stagedPostCompactionDelegateCount("agent:main:main")).toBe(0);
  expect(loadSessionEntry({ sessionKey: "agent:main:main", storePath })?.compactionCount).toBe(1);
  ws.close();
  await rehydrateContinuationCustodyAfterStateSettles();
});

test("sessions.compact preserves canonical route fields when releasing post-compaction delegates", async () => {
  await rehydrateContinuationCustodyAfterStateSettles();
  const { dir, storePath } = await createSessionStoreDir();
  await fs.writeFile(
    path.join(dir, "sess-post-compaction-legacy.jsonl"),
    `${JSON.stringify({ role: "user", content: "hello legacy route" })}\n`,
    "utf-8",
  );
  await writeSessionStore({
    entries: {
      main: sessionStoreEntry("sess-post-compaction-legacy", {
        delivery: normalizeSessionDeliveryState({
          context: {
            channel: "telegram",
            to: "chat-123",
            accountId: "acct-1",
            threadId: "topic-9",
          },
        }),
      }),
    },
  });
  await seedTranscriptRows({
    sessionId: "sess-post-compaction-legacy",
    sessionKey: "agent:main:main",
    storePath,
    totalLines: 3,
  });
  await stagePostCompactionDelegate("agent:main:main", {
    task: "rehydrate after compact with legacy route",
    createdAt: Date.now(),
  });

  const { ws } = await openClient();
  const compacted = await rpcReq<{ ok: true; key: string; compacted: boolean }>(
    ws,
    "sessions.compact",
    { key: "main" },
  );

  expectMainCompactionResult(compacted, true);
  expect(stagedPostCompactionDelegateCount("agent:main:main")).toBe(0);
  const queued = await loadPendingSessionDeliveries(captureOpenClawStateWorkerContext());
  const postCompaction = queued.find(
    (entry) =>
      entry.kind === "postCompactionDelegate" &&
      entry.task === "rehydrate after compact with legacy route",
  );
  expect(postCompaction?.deliveryContext).toMatchObject({
    channel: "telegram",
    to: "chat-123",
    accountId: "acct-1",
    threadId: "topic-9",
  });
  ws.close();
  await rehydrateContinuationCustodyAfterStateSettles();
});

test("sessions.compact maxLines releases queued post-compaction delegates after trim", async () => {
  await rehydrateContinuationCustodyAfterStateSettles();
  const { dir, storePath } = await createSessionStoreDir();
  const sessionId = "sess-post-compaction-trim";
  const transcriptPath = path.join(dir, `${sessionId}.jsonl`);
  const originalLines = buildSessionTranscriptLines(sessionId, 120);
  await fs.writeFile(transcriptPath, `${originalLines.join("\n")}\n`, "utf-8");
  await writeSessionStore({
    entries: { main: sessionStoreEntry(sessionId, { sessionFile: transcriptPath }) },
  });
  await seedTranscriptRows({
    sessionId,
    sessionKey: "agent:main:main",
    storePath,
    totalLines: 120,
  });
  await stagePostCompactionDelegate("agent:main:main", {
    task: "rehydrate after maxLines compact",
    createdAt: Date.now(),
  });

  const beforeEvents = peekSystemEvents("agent:main:main").length;

  // A maxLines trim responds before it releases the staged delegates
  // (`server-methods/sessions-compact.ts`), so the release - and the system
  // event it emits - outlive the RPC response. Drive the handler directly:
  // `directSessionReq` awaits the whole handler, so this case owns its
  // post-compaction work and settles it here. Polling for the event after an
  // early response instead lets a slow release surface inside the next case.
  const compacted = await directSessionReq<{
    ok: true;
    key: string;
    compacted: boolean;
    kept?: number;
  }>("sessions.compact", { key: "main", maxLines: 50 });

  expect(compacted.ok).toBe(true);
  expect(compacted.payload?.compacted).toBe(true);
  expect(compacted.payload?.kept).toBe(50);
  expect(peekSystemEvents("agent:main:main").slice(beforeEvents)).toContainEqual(
    expect.stringContaining("Queued 1 post-compaction delegate(s)"),
  );
  expect(stagedPostCompactionDelegateCount("agent:main:main")).toBe(0);
  await rehydrateContinuationCustodyAfterStateSettles();
});

test("sessions.compact skips post-compaction lifecycle when no delegates exist", async () => {
  const { dir, storePath } = await createSessionStoreDir();
  const sessionId = "sess-post-compaction-empty";
  const transcriptPath = path.join(dir, `${sessionId}.jsonl`);
  const originalLines = buildSessionTranscriptLines(sessionId, 120);
  await fs.writeFile(transcriptPath, `${originalLines.join("\n")}\n`, "utf-8");
  await writeSessionStore({
    entries: { main: sessionStoreEntry(sessionId, { sessionFile: transcriptPath }) },
  });
  await seedTranscriptRows({
    sessionId,
    sessionKey: "agent:main:main",
    storePath,
    totalLines: 120,
  });

  const beforeEvents = peekSystemEvents("agent:main:main").length;

  const { ws } = await openClient();
  const compacted = await rpcReq<{ ok: true; key: string; compacted: boolean; kept?: number }>(
    ws,
    "sessions.compact",
    { key: "main", maxLines: 50 },
  );

  expectMainCompactionResult(compacted, true);
  expect(compacted.payload?.kept).toBe(50);
  const trimmed = await loadTranscriptRows({
    sessionId,
    sessionKey: "agent:main:main",
    storePath,
  });
  expect(trimmed).toHaveLength(50);
  expect(trimmed[0]).toMatchObject({ type: "session", id: "sess-post-compaction-empty" });
  expect(trimmed[1]).toMatchObject({
    parentId: null,
    message: { content: "line-70" },
  });
  expect(trimmed.at(-1)).toMatchObject({
    message: { content: "line-118" },
  });
  expect(stagedPostCompactionDelegateCount("agent:main:main")).toBe(0);
  expect(peekSystemEvents("agent:main:main").slice(beforeEvents)).not.toContainEqual(
    expect.stringContaining("[system:post-compaction]"),
  );
  ws.close();
});

async function seedMaxLinesCompactionSession(sessionId: string): Promise<void> {
  const { dir, storePath } = await createSessionStoreDir();
  const transcriptPath = path.join(dir, `${sessionId}.jsonl`);
  await fs.writeFile(
    transcriptPath,
    `${buildSessionTranscriptLines(sessionId, 120).join("\n")}\n`,
    "utf-8",
  );
  await writeSessionStore({
    entries: { main: sessionStoreEntry(sessionId, { sessionFile: transcriptPath }) },
  });
  await seedTranscriptRows({
    sessionId,
    sessionKey: "agent:main:main",
    storePath,
    totalLines: 120,
  });
}

test("sessions.compact releases staged post-compaction delegates", async () => {
  await rehydrateContinuationCustodyAfterStateSettles();
  await seedMaxLinesCompactionSession("sess-post-compaction-released");
  await stagePostCompactionDelegate("agent:main:main", {
    task: "release after compaction",
    createdAt: Date.now(),
  });
  postCompactionReleaseSeams.releaseCalls.length = 0;
  const compacted = await directSessionReq<{ ok: true; compacted: boolean; kept?: number }>(
    "sessions.compact",
    { key: "main", maxLines: 50 },
  );

  expect(compacted.ok).toBe(true);
  expect(compacted.payload?.compacted).toBe(true);
  expect(postCompactionReleaseSeams.releaseCalls).toEqual(["agent:main:main"]);
  expect(stagedPostCompactionDelegateCount("agent:main:main")).toBe(0);
  await rehydrateContinuationCustodyAfterStateSettles();
});

test("sessions.compact keeps delegates staged when the post-trim row no longer matches", async () => {
  await rehydrateContinuationCustodyAfterStateSettles();
  await seedMaxLinesCompactionSession("sess-post-compaction-rotated");
  await stagePostCompactionDelegate("agent:main:main", {
    task: "must not release from a stale row",
    createdAt: Date.now(),
  });
  postCompactionReleaseSeams.releaseCalls.length = 0;
  trimSeams.afterTrim = async () => {
    trimSeams.afterTrim = undefined;
    await writeSessionStore({
      entries: { main: sessionStoreEntry("sess-post-compaction-successor") },
    });
  };
  try {
    const compacted = await directSessionReq<{ ok: true; compacted: boolean; kept?: number }>(
      "sessions.compact",
      { key: "main", maxLines: 50 },
    );

    expect(compacted.ok).toBe(true);
    expect(compacted.payload?.compacted).toBe(true);
    expect(postCompactionReleaseSeams.releaseCalls).toEqual([]);
    expect(stagedPostCompactionDelegateCount("agent:main:main")).toBe(1);
  } finally {
    trimSeams.afterTrim = undefined;
    await rehydrateContinuationCustodyAfterStateSettles();
  }
});
