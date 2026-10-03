// Covers retry metadata, routing, attempt advancement, and completion receipts.
import { describe, expect, it } from "vitest";
import { openOpenClawStateDatabase } from "../state/openclaw-state-db.js";
import { withTestDir } from "../test-helpers/temp-dir.js";
import {
  advanceSessionDeliveryAgentRun,
  completeSessionDelivery,
  deferSessionDelivery,
  failSessionDelivery,
  loadPendingSessionDelivery,
  loadPendingSessionDeliveries,
  markSessionDeliveryAttemptStarted,
  markSessionDeliverySettlement,
  enqueueSessionDelivery,
} from "./session-delivery-queue-storage.js";
import { captureSessionDeliveryQueueContext } from "./session-delivery-queue.storage.test-support.js";

describe("session-delivery queue storage", () => {
  async function settleSessionDelivery(id: string, stateDir: string): Promise<void> {
    const queueContext = captureSessionDeliveryQueueContext(stateDir);
    const entry = await loadPendingSessionDelivery(id, queueContext);
    if (!entry) {
      throw new Error(`Expected pending session delivery ${id}`);
    }
    await markSessionDeliverySettlement(entry, "recovered", queueContext);
    await completeSessionDelivery(id, queueContext);
  }

  function readSessionQueueStatus(tempDir: string, id: string): string | undefined {
    const { db } = openOpenClawStateDatabase({
      env: { ...process.env, OPENCLAW_STATE_DIR: tempDir },
    });
    const row = db
      .prepare("SELECT status FROM delivery_queue_entries WHERE queue_name = 'session' AND id = ?")
      .get(id) as { status?: string } | undefined;
    return row?.status;
  }

  it("persists retry metadata and retains acked idempotency tombstones", async () => {
    await withTestDir({ prefix: "openclaw-session-delivery-" }, async (tempDir) => {
      const queueContext = captureSessionDeliveryQueueContext(tempDir);
      const id = await enqueueSessionDelivery(
        {
          kind: "systemEvent",
          sessionKey: "agent:main:main",
          text: "restart complete",
        },
        queueContext,
      );

      await failSessionDelivery(id, "dispatch failed", queueContext);
      const [failedEntry] = await loadPendingSessionDeliveries(queueContext);
      expect(failedEntry?.retryCount).toBe(1);
      expect(failedEntry?.lastError).toBe("dispatch failed");

      await settleSessionDelivery(id, tempDir);
      expect(await loadPendingSessionDeliveries(queueContext)).toStrictEqual([]);
      expect(readSessionQueueStatus(tempDir, id)).toBe("completed");
    });
  });

  it("retains ambiguous attempt ownership and clears it only for a safe retry", async () => {
    await withTestDir({ prefix: "openclaw-session-delivery-" }, async (tempDir) => {
      const queueContext = captureSessionDeliveryQueueContext(tempDir);
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
      if (!entry) {
        throw new Error("Expected pending session delivery");
      }

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
    await withTestDir({ prefix: "openclaw-session-delivery-" }, async (tempDir) => {
      const queueContext = captureSessionDeliveryQueueContext(tempDir);
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
    await withTestDir({ prefix: "openclaw-session-delivery-" }, async (tempDir) => {
      const queueContext = captureSessionDeliveryQueueContext(tempDir);
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
            sourceChannel: "webchat",
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

  it("advances only the agent run attempt and can focus its retry media", async () => {
    await withTestDir({ prefix: "openclaw-session-delivery-" }, async (tempDir) => {
      const queueContext = captureSessionDeliveryQueueContext(tempDir);
      const id = await enqueueSessionDelivery(
        {
          kind: "agentTurn",
          sessionKey: "agent:main:main",
          message: "all generated media",
          messageId: "image:task-retry:agent-loop",
          expectedMediaUrls: ["/tmp/one.png", "/tmp/two.png"],
        },
        queueContext,
      );

      await failSessionDelivery(id, "ambiguous timeout", queueContext);
      await deferSessionDelivery(id, 1_000, queueContext);
      let [entry] = await loadPendingSessionDeliveries(queueContext);
      expect(entry).toMatchObject({ retryCount: 1 });
      expect(entry?.agentRunAttempt).toBeUndefined();
      expect(entry?.availableAt).toBeGreaterThan(Date.now());

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
        suppressTextDelivery: true,
      });
    });
  });

  it("moves entries into completed idempotency state", async () => {
    await withTestDir({ prefix: "openclaw-session-delivery-" }, async (tempDir) => {
      const queueContext = captureSessionDeliveryQueueContext(tempDir);
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
    await withTestDir({ prefix: "openclaw-session-delivery-" }, async (tempDir) => {
      const queueContext = captureSessionDeliveryQueueContext(tempDir);
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
