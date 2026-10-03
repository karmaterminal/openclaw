import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import { openOpenClawStateDatabase } from "../state/openclaw-state-db.js";
import { captureOpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.js";
import type { OpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.types.js";
import { observeMainThreadSql } from "../test-utils/main-thread-sql-spies.test-support.js";
// Covers session delivery queue persistence state transitions.
import { requireNodeSqlite } from "./node-sqlite.js";
import {
  advanceSessionDeliveryAgentRun,
  deferSessionDelivery,
  enqueueClaimedSessionDelivery,
  enqueuePostCompactionDelegateDelivery,
  enqueueSessionDelivery,
  failSessionDelivery,
  loadPendingSessionDelivery,
  loadPendingSessionDeliveries,
  markSessionDeliveryAttemptStarted,
  mergeSessionDeliveryPreparedMediaBlocks,
  moveSessionDeliveryToFailed,
  releaseSessionDeliveryClaim,
  type QueuedSessionDeliveryPayload,
} from "./session-delivery-queue-storage.js";
import {
  readSessionQueueRow,
  readSessionQueueStatus,
  rewriteSessionQueueEntry,
  rewriteSessionQueueEntryKind,
  settleSessionDelivery,
} from "./session-delivery-queue.storage.test-support.js";
import { withSessionDeliveryQueue } from "./session-delivery-queue.test-helpers.js";

describe("session-delivery queue storage", () => {
  it("dedupes entries when an idempotency key is reused", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      const firstId = await enqueueSessionDelivery(
        {
          kind: "agentTurn",
          sessionKey: "agent:main:main",
          message: "continue after restart",
          messageId: "restart-sentinel:agent:main:main:agentTurn:123",
          idempotencyKey: "restart-sentinel:agent:main:main:agentTurn:123",
        },
        tempDir,
      );
      const secondId = await enqueueSessionDelivery(
        {
          kind: "agentTurn",
          sessionKey: "agent:main:main",
          message: "continue after restart",
          messageId: "restart-sentinel:agent:main:main:agentTurn:123",
          idempotencyKey: "restart-sentinel:agent:main:main:agentTurn:123",
        },
        tempDir,
      );

      expect(secondId).toBe(firstId);
      expect(await loadPendingSessionDeliveries(tempDir)).toHaveLength(1);
    });
  });

  it("projects generic queue attachments to descriptor-only metadata before persistence", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
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
        const id = await enqueueSessionDelivery(payload, tempDir);
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
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      const secret = "RECOVERED_GENERIC_QUEUE_SECRET";
      const id = await enqueueSessionDelivery(
        {
          kind: "systemEvent",
          sessionKey: "agent:main:main",
          text: "recover descriptor metadata",
        },
        tempDir,
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

      await expect(loadPendingSessionDelivery(id, tempDir)).resolves.toBeNull();
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
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
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
        const id = await enqueueSessionDelivery(corruption.payload, tempDir);
        corruption.mutate(id);

        await expect(loadPendingSessionDelivery(id, tempDir)).resolves.toBeNull();
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
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      const id = await enqueueSessionDelivery(
        {
          kind: "agentTurn",
          sessionKey: "agent:main:main",
          message: "untrusted metadata",
          messageId: "untrusted-metadata",
        },
        tempDir,
      );
      rewriteSessionQueueEntry(tempDir, id, (entry) => {
        entry.traceparent = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
      });
      await expect(loadPendingSessionDelivery(id, tempDir)).resolves.toEqual(
        expect.not.objectContaining({ traceparent: expect.anything() }),
      );
      rewriteSessionQueueEntry(tempDir, id, (entry) => {
        entry.continuationTrigger = "operator-controlled";
      });
      await expect(loadPendingSessionDelivery(id, tempDir)).resolves.toBeNull();
      expect(readSessionQueueRow(tempDir, id)).toMatchObject({
        status: "failed",
        last_error: "invalid generic session delivery payload: invalid shape",
      });
    });
  });

  it("grants one initial-attempt lease and releases it for recovery", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      const payload = {
        kind: "agentTurn" as const,
        sessionKey: "agent:main:main",
        message: "generated image ready",
        messageId: "image:task-lease:agent-loop",
        idempotencyKey: "image:task-lease:agent-loop",
      };
      const first = await enqueueClaimedSessionDelivery(payload, 60_000, tempDir);
      const duplicate = await enqueueClaimedSessionDelivery(payload, 60_000, tempDir);

      expect(first.claimed).toBe(true);
      expect(duplicate).toEqual({ id: first.id, claimed: false, status: "pending" });
      expect((await loadPendingSessionDeliveries(tempDir))[0]?.availableAt).toBeGreaterThan(
        Date.now(),
      );

      await releaseSessionDeliveryClaim(first.id, tempDir);
      expect((await loadPendingSessionDeliveries(tempDir))[0]?.availableAt).toBeLessThanOrEqual(
        Date.now(),
      );
    });
  });

  it("reports a dead-letter conflict instead of claiming it as pending", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      const payload = {
        kind: "agentTurn" as const,
        sessionKey: "agent:main:main",
        message: "generated image ready",
        messageId: "image:task-dead-letter:agent-loop",
        idempotencyKey: "image:task-dead-letter:agent-loop",
      };
      const first = await enqueueClaimedSessionDelivery(payload, 60_000, tempDir);
      await moveSessionDeliveryToFailed(first.id, tempDir);

      await expect(enqueueClaimedSessionDelivery(payload, 60_000, tempDir)).resolves.toEqual({
        id: first.id,
        claimed: false,
        status: "failed",
      });
    });
  });

  it("lets an explicit enqueue replace a deleted ordinary failure", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      const payload = {
        kind: "systemEvent" as const,
        sessionKey: "agent:main:main",
        text: "restart complete",
        idempotencyKey: "restart:revive-failed",
      };
      const id = await enqueueSessionDelivery(payload, tempDir);
      await moveSessionDeliveryToFailed(id, tempDir);

      expect(await enqueueSessionDelivery(payload, tempDir)).toBe(id);
      expect(readSessionQueueStatus(tempDir, id)).toBe("pending");
      expect(await loadPendingSessionDeliveries(tempDir)).toHaveLength(1);
    });
  });

  it("never revives a failed permanent producer intent", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      const payload = {
        kind: "systemEvent" as const,
        sessionKey: "agent:main:main",
        text: "restart complete",
        idempotencyKey: "restart:permanent-failed",
        completionRetention: "permanent" as const,
      };
      const id = await enqueueSessionDelivery(payload, tempDir);
      await moveSessionDeliveryToFailed(id, tempDir);

      expect(await enqueueSessionDelivery(payload, tempDir)).toBe(id);
      expect(readSessionQueueStatus(tempDir, id)).toBe("failed");
      expect(await loadPendingSessionDeliveries(tempDir)).toEqual([]);
    });
  });

  it("reports a completed conflict after acknowledgement", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      const payload = {
        kind: "agentTurn" as const,
        sessionKey: "agent:main:main",
        message: "generated image ready",
        messageId: "image:task-completed:agent-loop",
        idempotencyKey: "image:task-completed:agent-loop",
      };
      const first = await enqueueClaimedSessionDelivery(payload, 60_000, tempDir);
      await settleSessionDelivery(first.id, tempDir);

      expect(await enqueueSessionDelivery(payload, tempDir)).toBe(first.id);
      expect(readSessionQueueStatus(tempDir, first.id)).toBe("completed");

      await expect(enqueueClaimedSessionDelivery(payload, 60_000, tempDir)).resolves.toEqual({
        id: first.id,
        claimed: false,
        status: "completed",
      });
      expect(await loadPendingSessionDeliveries(tempDir)).toEqual([]);
      expect(readSessionQueueStatus(tempDir, first.id)).toBe("completed");
    });
  });

  it("persists retry metadata and retains acked idempotency tombstones", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      const id = await enqueueSessionDelivery(
        {
          kind: "systemEvent",
          sessionKey: "agent:main:main",
          text: "restart complete",
        },
        tempDir,
      );

      await failSessionDelivery(id, "dispatch failed", tempDir);
      const [failedEntry] = await loadPendingSessionDeliveries(tempDir);
      expect(failedEntry?.retryCount).toBe(1);
      expect(failedEntry?.lastError).toBe("dispatch failed");

      await settleSessionDelivery(id, tempDir);
      expect(await loadPendingSessionDeliveries(tempDir)).toStrictEqual([]);
      expect(readSessionQueueStatus(tempDir, id)).toBe("completed");
    });
  });

  it("does not charge a retry through a retired worker admission", async () => {
    await withSessionDeliveryQueue(async (tempDir, queueContext) => {
      const id = await enqueueSessionDelivery(
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

      await expect(failSessionDelivery(id, "must not persist", retiredContext)).rejects.toThrow(
        "captured database admission retired",
      );

      expect((await loadPendingSessionDelivery(id, queueContext))?.retryCount).toBe(0);
    });
  });

  it("persists only canonical relative post-compaction mount hints", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
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
        tempDir,
      );

      await expect(loadPendingSessionDelivery(id, tempDir)).resolves.toMatchObject({
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
            tempDir,
          ),
          mountPath,
        ).rejects.toThrow("invalid postCompactionDelegate delivery payload: invalid shape");
      }
      await expect(loadPendingSessionDeliveries(tempDir)).resolves.toHaveLength(1);
    });
  });

  it("rejects one-sided post-compaction source metadata before persistence", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      const mismatchedMetadata = [
        { sourceFlowId: "flow-without-revision" },
        { sourceExpectedRevision: 7 },
      ];

      for (const [sequence, metadata] of mismatchedMetadata.entries()) {
        await expect(
          enqueueSessionDelivery(
            {
              kind: "postCompactionDelegate",
              sessionKey: "agent:main:main",
              task: "reject incomplete source metadata",
              createdAt: 900 + sequence,
              ...metadata,
            },
            tempDir,
          ),
        ).rejects.toThrow("invalid postCompactionDelegate delivery payload: invalid shape");
      }

      await expect(loadPendingSessionDeliveries(tempDir)).resolves.toEqual([]);
    });
  });

  it("dead-letters noncanonical recovered post-compaction mount hints and scrubs them", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
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
          tempDir,
        );
        rewriteSessionQueueEntry(tempDir, id, (entry) => {
          entry.attachAs = { mountPath };
        });

        await expect(loadPendingSessionDelivery(id, tempDir), mountPath).resolves.toBeNull();
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
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
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
        tempDir,
      );

      const entry = await loadPendingSessionDelivery(id, tempDir);
      expect(entry).not.toHaveProperty("attachments");
      expect(entry).not.toHaveProperty("attachAs");
    });
  });

  it("advances only the agent run attempt and can focus its retry media", async () => {
    // Keep the one-time SQLite capability check outside the queue observation window.
    requireNodeSqlite();
    const sqlCalls = observeMainThreadSql();
    try {
      await withSessionDeliveryQueue(async (_stateDir, queueContext) => {
        const id = await enqueueSessionDelivery(
          {
            kind: "agentTurn",
            sessionKey: "agent:main:main",
            message: "all generated media",
            messageId: "image:task-retry:agent-loop",
            expectedMediaUrls: ["/tmp/one.png", "/tmp/two.png"],
            expectedMediaAttachments: {
              "/tmp/one.png": { type: "image", path: "/tmp/one.png", mimeType: "image/png" },
              "/tmp/two.png": { type: "image", path: "/tmp/two.png", mimeType: "image/png" },
            },
          },
          queueContext,
        );

        await failSessionDelivery(id, "ambiguous timeout", queueContext);
        await deferSessionDelivery(id, 1_000, queueContext);
        let [entry] = await loadPendingSessionDeliveries(queueContext);
        expect(entry).toMatchObject({ retryCount: 1 });
        expect(entry?.agentRunAttempt).toBeUndefined();
        expect(entry?.availableAt).toBeGreaterThan(Date.now());

        await mergeSessionDeliveryPreparedMediaBlocks(
          id,
          "/tmp/one.png",
          [{ type: "image", artifactId: "artifact-one" }],
          queueContext,
        );
        await expect(
          mergeSessionDeliveryPreparedMediaBlocks(
            id,
            "/tmp/one.png",
            [{ type: "image", artifactId: "replacement-must-not-win" }],
            queueContext,
          ),
        ).resolves.toEqual([{ type: "image", artifactId: "artifact-one" }]);
        await mergeSessionDeliveryPreparedMediaBlocks(
          id,
          "/tmp/two.png",
          [{ type: "image", artifactId: "artifact-two" }],
          queueContext,
        );

        await advanceSessionDeliveryAgentRun(
          id,
          {
            message: "only missing media",
            expectedMediaUrls: ["/tmp/two.png"],
            suppressTextDelivery: true,
          },
          queueContext,
        );
        [entry] = await loadPendingSessionDeliveries(queueContext);
        expect(entry).toMatchObject({
          agentRunAttempt: 1,
          retryCount: 1,
          message: "only missing media",
          expectedMediaUrls: ["/tmp/two.png"],
          expectedMediaAttachments: {
            "/tmp/one.png": { type: "image", path: "/tmp/one.png", mimeType: "image/png" },
            "/tmp/two.png": { type: "image", path: "/tmp/two.png", mimeType: "image/png" },
          },
          preparedMediaBlocks: {
            "/tmp/one.png": [{ type: "image", artifactId: "artifact-one" }],
            "/tmp/two.png": [{ type: "image", artifactId: "artifact-two" }],
          },
          suppressTextDelivery: true,
        });
      });
      sqlCalls.expectIdle();
    } finally {
      sqlCalls.restore();
    }
  });

  it("retains ambiguous attempt ownership and clears it only for a safe retry", async () => {
    await withSessionDeliveryQueue(async (_stateDir, queueContext) => {
      const id = await enqueueSessionDelivery(
        {
          kind: "agentTurn",
          sessionKey: "agent:main:main",
          message: "generated image ready",
          messageId: "image:task-attempt-owner:agent-loop",
        },
        queueContext,
      );
      const entry = await loadPendingSessionDelivery(id, queueContext);
      assert(entry, "Expected pending session delivery");

      await markSessionDeliveryAttemptStarted(entry, queueContext);
      expect(await loadPendingSessionDelivery(id, queueContext)).toMatchObject({
        deliveryStartedAt: expect.any(Number),
      });

      await failSessionDelivery(id, "ambiguous failure after send", queueContext);
      expect(await loadPendingSessionDelivery(id, queueContext)).toMatchObject({
        deliveryStartedAt: expect.any(Number),
      });

      await failSessionDelivery(id, "safe failure before commit", queueContext, {
        releaseAttemptOwnership: true,
      });
      expect(await loadPendingSessionDelivery(id, queueContext)).not.toHaveProperty(
        "deliveryStartedAt",
      );
    });
  });

  it("records which agent run attempt consumed retry budget", async () => {
    await withSessionDeliveryQueue(async (_stateDir, queueContext) => {
      const id = await enqueueSessionDelivery(
        {
          kind: "agentTurn",
          sessionKey: "agent:main:main",
          message: "generated image ready",
          messageId: "image:task-charge:agent-loop",
        },
        queueContext,
      );

      await failSessionDelivery(id, "delivery failed", queueContext);
      expect(await loadPendingSessionDelivery(id, queueContext)).toMatchObject({
        retryCount: 1,
        lastChargedAgentRunAttempt: 0,
      });

      await advanceSessionDeliveryAgentRun(id, undefined, queueContext);
      await failSessionDelivery(id, "fresh delivery failed", queueContext);
      expect(await loadPendingSessionDelivery(id, queueContext)).toMatchObject({
        retryCount: 2,
        agentRunAttempt: 1,
        lastChargedAgentRunAttempt: 1,
      });
    });
  });

  it("persists agent-loop routing and provenance for restart replay", async () => {
    await withSessionDeliveryQueue(async (_stateDir, queueContext) => {
      await enqueueSessionDelivery(
        {
          kind: "agentTurn",
          sessionKey: "agent:main:discord:channel:123",
          message: "generated image ready",
          messageId: "image:task-1:agent-loop",
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
        },
        queueContext,
      );

      expect(await loadPendingSessionDeliveries(queueContext)).toEqual([
        expect.objectContaining({
          route: expect.objectContaining({ channel: "discord", to: "channel:123" }),
          inputProvenance: expect.objectContaining({ sourceTool: "image_generate" }),
          sourceReplyDeliveryMode: "message_tool_only",
          expectedMediaUrls: ["/tmp/proof.png"],
        }),
      ]);
    });
  });

  it("moves entries into completed idempotency state", async () => {
    await withSessionDeliveryQueue(async (tempDir, queueContext) => {
      const id = await enqueueSessionDelivery(
        {
          kind: "systemEvent",
          sessionKey: "agent:main:main",
          text: "restart complete",
        },
        queueContext,
      );

      await settleSessionDelivery(id, tempDir);

      expect(readSessionQueueStatus(tempDir, id)).toBe("completed");
    });
  });

  it("retains a permanent completion receipt", async () => {
    await withSessionDeliveryQueue(async (tempDir, queueContext) => {
      const payload = {
        kind: "systemEvent" as const,
        sessionKey: "agent:main:main",
        text: "restart complete",
        idempotencyKey: "restart:permanent-completed",
        completionRetention: "permanent" as const,
      };
      const id = await enqueueSessionDelivery(payload, queueContext);
      await settleSessionDelivery(id, tempDir);

      expect(await enqueueSessionDelivery(payload, queueContext)).toBe(id);
      expect(readSessionQueueStatus(tempDir, id)).toBe("completed");
      expect(await loadPendingSessionDeliveries(queueContext)).toEqual([]);
    });
  });
});
