import { describe, expect, it } from "vitest";
import { openOpenClawStateDatabase } from "../state/openclaw-state-db.js";
import { captureOpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.js";
import type { OpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.types.js";
import { observeMainThreadSql } from "../test-utils/main-thread-sql-spies.test-support.js";
import { requireNodeSqlite } from "./node-sqlite.js";
import {
  completeSessionDelivery as complete,
  deferSessionDelivery as defer,
  enqueueClaimedSessionDelivery as enqueueClaimed,
  enqueueSessionDelivery as enqueue,
  failSessionDelivery as fail,
  loadPendingSessionDelivery as loadPending,
  loadPendingSessionDeliveries as listPending,
  markSessionDeliverySettlement as markSettlement,
  mergeSessionDeliveryPreparedMediaBlocks as mergePrepared,
  moveSessionDeliveryToFailed as moveToFailed,
  releaseSessionDeliveryClaim as releaseClaim,
  enqueuePostCompactionDelegateDelivery,
  type QueuedSessionDeliveryPayload,
} from "./session-delivery-queue-storage.js";
import {
  readSessionQueueRow,
  readSessionQueueStatus,
  rewriteSessionQueueEntry,
  rewriteSessionQueueEntryKind,
} from "./session-delivery-queue.storage.test-support.js";
import { withSessionDeliveryQueue } from "./session-delivery-queue.test-helpers.js";

type Delivery = Parameters<typeof enqueue>[0];
function agentTurn(
  messageId: string,
  overrides: Partial<Extract<Delivery, { kind: "agentTurn" }>> = {},
): Extract<Delivery, { kind: "agentTurn" }> {
  return {
    kind: "agentTurn",
    sessionKey: "agent:main:main",
    message: "generated image ready",
    messageId,
    ...overrides,
  };
}
function systemEvent(idempotencyKey: string, permanent = false): Delivery {
  return {
    kind: "systemEvent",
    sessionKey: "agent:main:main",
    text: "restart complete",
    idempotencyKey,
    ...(permanent ? { completionRetention: "permanent" } : {}),
  };
}
const mediaAttachments = {
  "/tmp/one.png": { type: "image" as const, path: "/tmp/one.png", mimeType: "image/png" },
  "/tmp/two.png": { type: "image" as const, path: "/tmp/two.png", mimeType: "image/png" },
};
const imageBlocks = (artifactId: string) => [{ type: "image" as const, artifactId }];

describe("session-delivery queue storage", () => {
  async function settleSessionDelivery(
    id: string,
    queueContext: OpenClawStateWorkerContext,
  ): Promise<void> {
    const entry = await loadPending(id, queueContext);
    if (!entry) {
      throw new Error(`Expected pending session delivery ${id}`);
    }
    await markSettlement(entry, "recovered", queueContext);
    await complete(id, queueContext);
  }

  it("projects generic queue attachments to descriptor-only metadata before persistence", async () => {
    await withSessionDeliveryQueue(async (tempDir, queueContext) => {
      const secret = "GENERIC_QUEUE_INLINE_SECRET";
      const widenedRef = {
        kind: "blob-sha256" as const,
        sha256: "a".repeat(64),
        mediaType: "text/plain",
        content: secret,
      };
      const payloads: QueuedSessionDeliveryPayload[] = [
        {
          kind: "systemEvent",
          sessionKey: "agent:main:main",
          text: "descriptor-only event",
          attachments: [widenedRef],
        },
        {
          kind: "agentTurn",
          sessionKey: "agent:main:main",
          message: "descriptor-only turn",
          messageId: "descriptor-only-turn",
          attachments: [widenedRef],
        },
      ];
      for (const payload of payloads) {
        const id = await enqueue(payload, queueContext);
        const row = readSessionQueueRow(tempDir, id);
        expect(row?.entry_json).not.toContain(secret);
        expect(JSON.parse(row?.entry_json ?? "{}")).toMatchObject({
          attachments: [
            {
              kind: "blob-sha256",
              sha256: "a".repeat(64),
              mediaType: "text/plain",
            },
          ],
        });
      }
    });
  });

  it("scrubs widened generic attachment metadata during pending recovery", async () => {
    await withSessionDeliveryQueue(async (tempDir, queueContext) => {
      const secret = "RECOVERED_GENERIC_QUEUE_SECRET";
      const id = await enqueue(
        {
          kind: "systemEvent",
          sessionKey: "agent:main:main",
          text: "recover descriptor metadata",
        },
        queueContext,
      );
      rewriteSessionQueueEntry(tempDir, id, (entry) => {
        entry.attachments = [
          {
            kind: "blob-sha256",
            sha256: "b".repeat(64),
            content: secret,
          },
        ];
      });
      const { db } = openOpenClawStateDatabase({
        env: { ...process.env, OPENCLAW_STATE_DIR: tempDir },
      });
      db.prepare(
        `UPDATE delivery_queue_entries
            SET entry_kind = 'systemEvent',
                session_key = 'agent:main:main',
                channel = 'discord',
                target = 'channel:private',
                account_id = 'private-account'
          WHERE queue_name = 'session' AND id = ?`,
      ).run(id);

      await expect(loadPending(id, queueContext)).resolves.toBeNull();
      const row = readSessionQueueRow(tempDir, id);
      expect(row).toMatchObject({
        status: "failed",
        last_error: "invalid generic session delivery attachment metadata",
        entry_kind: null,
        session_key: null,
        channel: null,
        target: null,
        account_id: null,
      });
      expect(row?.entry_json).not.toContain(secret);
    });
  });

  it("requires exact generic metadata kinds and strict generic payload shapes during recovery", async () => {
    await withSessionDeliveryQueue(async (tempDir, queueContext) => {
      const corruptions = [
        {
          payload: {
            kind: "systemEvent" as const,
            sessionKey: "agent:main:main",
            text: "GENERIC_KIND_SYSTEM_TO_AGENT_SECRET",
          },
          mutate: (id: string) => rewriteSessionQueueEntryKind(tempDir, id, "agentTurn"),
          secret: "GENERIC_KIND_SYSTEM_TO_AGENT_SECRET",
        },
        {
          payload: {
            kind: "agentTurn" as const,
            sessionKey: "agent:main:main",
            message: "GENERIC_KIND_AGENT_TO_SYSTEM_SECRET",
            messageId: "generic-kind-agent-to-system",
          },
          mutate: (id: string) => rewriteSessionQueueEntryKind(tempDir, id, "systemEvent"),
          secret: "GENERIC_KIND_AGENT_TO_SYSTEM_SECRET",
        },
        {
          payload: {
            kind: "systemEvent" as const,
            sessionKey: "agent:main:main",
            text: "strict generic event",
          },
          mutate: (id: string) =>
            rewriteSessionQueueEntry(tempDir, id, (entry) => {
              entry.extra = "GENERIC_UNKNOWN_FIELD_SECRET";
            }),
          secret: "GENERIC_UNKNOWN_FIELD_SECRET",
        },
      ];

      for (const corruption of corruptions) {
        const id = await enqueue(corruption.payload, queueContext);
        corruption.mutate(id);

        await expect(loadPending(id, queueContext)).resolves.toBeNull();
        const row = readSessionQueueRow(tempDir, id);
        expect(row).toMatchObject({
          status: "failed",
          last_error: "invalid generic session delivery payload: invalid shape",
        });
        expect(row?.entry_json).not.toContain(corruption.secret);
      }
    });
  });

  it("fails closed for untrusted trace context and malformed continuation triggers", async () => {
    await withSessionDeliveryQueue(async (tempDir, queueContext) => {
      const id = await enqueue(
        {
          kind: "agentTurn",
          sessionKey: "agent:main:main",
          message: "untrusted metadata",
          messageId: "untrusted-metadata",
        },
        queueContext,
      );
      rewriteSessionQueueEntry(tempDir, id, (entry) => {
        entry.traceparent = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
      });
      await expect(loadPending(id, queueContext)).resolves.toEqual(
        expect.not.objectContaining({ traceparent: expect.anything() }),
      );
      rewriteSessionQueueEntry(tempDir, id, (entry) => {
        entry.continuationTrigger = "operator-controlled";
      });
      await expect(loadPending(id, queueContext)).resolves.toBeNull();
      expect(readSessionQueueRow(tempDir, id)).toMatchObject({
        status: "failed",
        last_error: "invalid generic session delivery payload: invalid shape",
      });
    });
  });

  it("grants one initial-attempt lease and releases it for recovery", async () => {
    await withSessionDeliveryQueue(async (_stateDir, queueContext) => {
      const payload = agentTurn("image:task-lease:agent-loop", {
        idempotencyKey: "image:task-lease:agent-loop",
      });
      const first = await enqueueClaimed(payload, 60_000, queueContext);
      const duplicate = await enqueueClaimed(payload, 60_000, queueContext);

      expect(first.claimed).toBe(true);
      expect(duplicate).toEqual({ id: first.id, claimed: false, status: "pending" });
      expect((await listPending(queueContext))[0]?.availableAt).toBeGreaterThan(Date.now());

      await releaseClaim(first.id, queueContext);
      expect((await listPending(queueContext))[0]?.availableAt).toBeLessThanOrEqual(Date.now());
    });
  });

  it("reports a dead-letter conflict instead of claiming it as pending", async () => {
    await withSessionDeliveryQueue(async (_stateDir, queueContext) => {
      const payload = agentTurn("image:task-dead-letter:agent-loop", {
        idempotencyKey: "image:task-dead-letter:agent-loop",
      });
      const first = await enqueueClaimed(payload, 60_000, queueContext);
      await moveToFailed(first.id, queueContext);

      await expect(enqueueClaimed(payload, 60_000, queueContext)).resolves.toEqual({
        id: first.id,
        claimed: false,
        status: "failed",
      });
    });
  });

  it.each([false, true])(
    "revives a failure only without permanent retention: %s",
    async (permanent) => {
      await withSessionDeliveryQueue(async (tempDir, queueContext) => {
        const payload = systemEvent("restart:failed", permanent);
        const id = await enqueue(payload, queueContext);
        await moveToFailed(id, queueContext);
        expect(await enqueue(payload, queueContext)).toBe(id);
        expect(readSessionQueueStatus(tempDir, id)).toBe(permanent ? "failed" : "pending");
        const pending = await listPending(queueContext);
        if (permanent) {
          expect(pending).toEqual([]);
        } else {
          expect(pending).toHaveLength(1);
        }
      });
    },
  );

  it("reports a completed conflict after acknowledgement", async () => {
    await withSessionDeliveryQueue(async (tempDir, queueContext) => {
      const payload = agentTurn("image:task-completed:agent-loop", {
        idempotencyKey: "image:task-completed:agent-loop",
      });
      const first = await enqueueClaimed(payload, 60_000, queueContext);
      await settleSessionDelivery(first.id, queueContext);

      expect(await enqueue(payload, queueContext)).toBe(first.id);
      expect(readSessionQueueStatus(tempDir, first.id)).toBe("completed");

      await expect(enqueueClaimed(payload, 60_000, queueContext)).resolves.toEqual({
        id: first.id,
        claimed: false,
        status: "completed",
      });
      expect(await listPending(queueContext)).toEqual([]);
      expect(readSessionQueueStatus(tempDir, first.id)).toBe("completed");
    });
  });

  it("does not charge a retry through a retired worker admission", async () => {
    await withSessionDeliveryQueue(async (tempDir, queueContext) => {
      const id = await enqueue(
        {
          kind: "systemEvent",
          sessionKey: "agent:main:main",
          text: "restart complete",
        },
        queueContext,
      );
      const captured = captureOpenClawStateWorkerContext({
        env: { ...process.env, OPENCLAW_STATE_DIR: tempDir },
      });
      const retiredContext = {
        ...captured,
        admission: {
          ...captured.admission,
          assertCurrent: () => {
            throw new Error("captured database admission retired");
          },
        },
      } satisfies OpenClawStateWorkerContext;

      await expect(fail(id, "must not persist", retiredContext)).rejects.toThrow(
        "captured database admission retired",
      );

      expect((await loadPending(id, queueContext))?.retryCount).toBe(0);
    });
  });

  it("persists only canonical relative post-compaction mount hints", async () => {
    await withSessionDeliveryQueue(async (tempDir, queueContext) => {
      const id = await enqueuePostCompactionDelegateDelivery(
        {
          sessionKey: "agent:main:main",
          delegate: {
            task: "use the durable snapshot",
            createdAt: 123,
            attachments: [{ name: "brief.md", content: "snapshot" }],
            attachAs: { mountPath: "  handoff/path  " },
          },
          sequence: 0,
        },
        queueContext,
      );

      await expect(loadPending(id, queueContext)).resolves.toMatchObject({
        kind: "postCompactionDelegate",
        attachAs: { mountPath: "handoff/path" },
      });

      const invalidMountPaths = [
        "/absolute",
        "handoff/../outside",
        "handoff/./nested",
        "handoff//nested",
        "handoff/path/",
        "handoff:path",
        "unsafe\npath",
      ];
      for (const [index, mountPath] of invalidMountPaths.entries()) {
        await expect(
          enqueuePostCompactionDelegateDelivery(
            {
              sessionKey: "agent:main:main",
              delegate: {
                task: "reject unsafe mount",
                createdAt: 124 + index,
                attachments: [{ name: "brief.md", content: "snapshot" }],
                attachAs: { mountPath },
              },
              sequence: index + 1,
            },
            queueContext,
          ),
          mountPath,
        ).rejects.toThrow("invalid postCompactionDelegate delivery payload: invalid shape");
      }
      await expect(listPending(queueContext)).resolves.toHaveLength(1);
    });
  });

  it("rejects one-sided post-compaction source metadata before persistence", async () => {
    await withSessionDeliveryQueue(async (tempDir, queueContext) => {
      const mismatchedMetadata = [
        { sourceFlowId: "flow-without-revision" },
        { sourceExpectedRevision: 7 },
      ];

      for (const [sequence, metadata] of mismatchedMetadata.entries()) {
        await expect(
          enqueue(
            {
              kind: "postCompactionDelegate",
              sessionKey: "agent:main:main",
              task: "reject incomplete source metadata",
              createdAt: 900 + sequence,
              ...metadata,
            },
            queueContext,
          ),
        ).rejects.toThrow("invalid postCompactionDelegate delivery payload: invalid shape");
      }

      await expect(listPending(queueContext)).resolves.toEqual([]);
    });
  });

  it("dead-letters noncanonical recovered post-compaction mount hints and scrubs them", async () => {
    await withSessionDeliveryQueue(async (tempDir, queueContext) => {
      const invalidMountPaths = [
        "/absolute",
        "handoff/../outside",
        "handoff/./nested",
        "handoff//nested",
        "handoff/path/",
        " handoff/path ",
        "handoff:path",
      ];

      for (const [sequence, mountPath] of invalidMountPaths.entries()) {
        const secret = `INVALID_RECOVERED_MOUNT_SECRET_${sequence}`;
        const id = await enqueuePostCompactionDelegateDelivery(
          {
            sessionKey: "agent:main:main",
            delegate: {
              task: "recover only a canonical mount",
              createdAt: 200 + sequence,
              attachments: [{ name: "brief.md", content: secret }],
              attachAs: { mountPath: "handoff/path" },
            },
            sequence,
          },
          queueContext,
        );
        rewriteSessionQueueEntry(tempDir, id, (entry) => {
          entry.attachAs = { mountPath };
        });

        await expect(loadPending(id, queueContext), mountPath).resolves.toBeNull();
        const row = readSessionQueueRow(tempDir, id);
        expect(row).toMatchObject({
          status: "failed",
          last_error: "invalid postCompactionDelegate delivery payload: invalid shape",
        });
        expect(row?.entry_json).not.toContain(secret);
        expect(row?.entry_json).not.toContain("attachAs");
        expect(row?.entry_json).not.toContain("attachments");
      }
    });
  });

  it("normalizes empty post-compaction attachments to absence", async () => {
    await withSessionDeliveryQueue(async (tempDir, queueContext) => {
      const id = await enqueuePostCompactionDelegateDelivery(
        {
          sessionKey: "agent:main:main",
          delegate: {
            task: "continue without a snapshot",
            createdAt: 123,
            attachments: [],
            attachAs: { mountPath: "unused" },
          },
          sequence: 0,
        },
        queueContext,
      );

      const entry = await loadPending(id, queueContext);
      expect(entry).not.toHaveProperty("attachments");
      expect(entry).not.toHaveProperty("attachAs");
    });
  });

  it("persists agent-loop routing and provenance for restart replay", async () => {
    await withSessionDeliveryQueue(async (_stateDir, queueContext) => {
      await enqueue(
        agentTurn("image:task-1:agent-loop", {
          sessionKey: "agent:main:discord:channel:123",
          route: {
            channel: "discord",
            to: "channel:123",
            accountId: "default",
            chatType: "channel",
          },
          inputProvenance: {
            kind: "inter_session",
            sourceSessionKey: "image_generate:task-1",
            sourceChannel: "internal",
            sourceTool: "image_generate",
          },
          sourceReplyDeliveryMode: "message_tool_only",
          expectedMediaUrls: ["/tmp/proof.png"],
        }),
        queueContext,
      );

      expect(await listPending(queueContext)).toEqual([
        expect.objectContaining({
          sessionKey: "agent:main:discord:channel:123",
          route: {
            channel: "discord",
            to: "channel:123",
            accountId: "default",
            chatType: "channel",
          },
          inputProvenance: {
            kind: "inter_session",
            sourceSessionKey: "image_generate:task-1",
            sourceChannel: "internal",
            sourceTool: "image_generate",
          },
          sourceReplyDeliveryMode: "message_tool_only",
          expectedMediaUrls: ["/tmp/proof.png"],
        }),
      ]);
    });
  });

  it("preserves prepared media through delivery retries", async () => {
    // Keep the one-time SQLite capability check outside the queue observation window.
    requireNodeSqlite();
    const sqlCalls = observeMainThreadSql();
    try {
      await withSessionDeliveryQueue(async (_stateDir, queueContext) => {
        const id = await enqueue(
          agentTurn("image:task-retry:agent-loop", {
            message: "all generated media",
            expectedMediaUrls: ["/tmp/one.png", "/tmp/two.png"],
            expectedMediaAttachments: mediaAttachments,
          }),
          queueContext,
        );

        await fail(id, "ambiguous timeout", queueContext);
        await defer(id, 1_000, queueContext);
        const [entry] = await listPending(queueContext);
        expect(entry).toMatchObject({ retryCount: 1 });
        expect(entry?.agentRunAttempt).toBeUndefined();
        expect(entry?.availableAt).toBeGreaterThan(Date.now());

        await mergePrepared(id, "/tmp/one.png", imageBlocks("artifact-one"), queueContext);
        await expect(
          mergePrepared(id, "/tmp/one.png", imageBlocks("replacement-must-not-win"), queueContext),
        ).resolves.toEqual(imageBlocks("artifact-one"));
        await mergePrepared(id, "/tmp/two.png", imageBlocks("artifact-two"), queueContext);

        expect(await loadPending(id, queueContext)).toMatchObject({
          retryCount: 1,
          message: "all generated media",
          expectedMediaUrls: ["/tmp/one.png", "/tmp/two.png"],
          expectedMediaAttachments: mediaAttachments,
          preparedMediaBlocks: {
            "/tmp/one.png": imageBlocks("artifact-one"),
            "/tmp/two.png": imageBlocks("artifact-two"),
          },
        });
        await fail(id, "fresh delivery failed", queueContext);
        expect(await loadPending(id, queueContext)).toMatchObject({
          retryCount: 2,
        });
      });
      sqlCalls.expectIdle();
    } finally {
      sqlCalls.restore();
    }
  });

  it("moves entries into completed idempotency state", async () => {
    await withSessionDeliveryQueue(async (tempDir, queueContext) => {
      const id = await enqueue(
        {
          kind: "systemEvent",
          sessionKey: "agent:main:main",
          text: "restart complete",
        },
        queueContext,
      );

      await settleSessionDelivery(id, queueContext);

      expect(readSessionQueueStatus(tempDir, id)).toBe("completed");
    });
  });

  it("retains a permanent completion receipt", async () => {
    await withSessionDeliveryQueue(async (tempDir, queueContext) => {
      const payload = systemEvent("restart:permanent-completed", true);
      const id = await enqueue(payload, queueContext);
      await settleSessionDelivery(id, queueContext);

      expect(await enqueue(payload, queueContext)).toBe(id);
      expect(readSessionQueueStatus(tempDir, id)).toBe("completed");
      expect(await listPending(queueContext)).toEqual([]);
    });
  });
});
