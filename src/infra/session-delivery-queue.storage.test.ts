// Surface 2 descriptor coverage for WORKORDER-rebase-20260424-v2.md, tracked in karmaterminal/openclaw#336.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempDir } from "../test-helpers/temp-dir.js";
import {
  ackSessionDelivery,
  enqueueSessionDelivery,
  failSessionDelivery,
  loadPendingSessionDeliveries,
  resolveSessionDeliveryQueueDir,
} from "./session-delivery-queue.js";

describe("session-delivery queue storage", () => {
  it("dedupes entries when an idempotency key is reused", async () => {
    await withTempDir({ prefix: "openclaw-session-delivery-" }, async (tempDir) => {
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

  it("round-trips traceparent metadata while preserving sha256 idempotency", async () => {
    await withTempDir({ prefix: "openclaw-session-delivery-" }, async (tempDir) => {
      const idempotencyKey = "restart-sentinel:agent:main:main:traceparent:123";
      const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
      const firstId = await enqueueSessionDelivery(
        {
          kind: "agentTurn",
          sessionKey: "agent:main:main",
          message: "continue after restart with trace context",
          messageId: "restart-sentinel:agent:main:main:agentTurn:traceparent:123",
          idempotencyKey,
          traceparent,
        },
        tempDir,
      );
      const secondId = await enqueueSessionDelivery(
        {
          kind: "agentTurn",
          sessionKey: "agent:main:main",
          message: "deduped duplicate",
          messageId: "restart-sentinel:agent:main:main:agentTurn:traceparent:duplicate",
          idempotencyKey,
          traceparent,
        },
        tempDir,
      );

      expect(firstId).toBe(createHash("sha256").update(idempotencyKey).digest("hex"));
      expect(secondId).toBe(firstId);
      const [entry] = await loadPendingSessionDeliveries(tempDir);
      expect(entry?.traceparent).toBe(traceparent);
    });
  });

  it("persists retry metadata and removes acked entries", async () => {
    await withTempDir({ prefix: "openclaw-session-delivery-" }, async (tempDir) => {
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

      await ackSessionDelivery(id, tempDir);
      expect(await loadPendingSessionDeliveries(tempDir)).toEqual([]);
    });
  });

  it("cleans up orphaned temporary queue files during load", async () => {
    await withTempDir({ prefix: "openclaw-session-delivery-" }, async (tempDir) => {
      await enqueueSessionDelivery(
        {
          kind: "systemEvent",
          sessionKey: "agent:main:main",
          text: "restart complete",
        },
        tempDir,
      );
      const tmpPath = path.join(resolveSessionDeliveryQueueDir(tempDir), "orphan-entry.tmp");
      fs.writeFileSync(tmpPath, "stale tmp");
      const staleAt = new Date(Date.now() - 60_000);
      fs.utimesSync(tmpPath, staleAt, staleAt);

      await loadPendingSessionDeliveries(tempDir);

      expect(fs.existsSync(tmpPath)).toBe(false);
    });
  });

  it("keeps same-tuple unkeyed concurrent enqueues distinct in the same wall-clock millisecond", async () => {
    await withTempDir({ prefix: "openclaw-session-delivery-" }, async (tempDir) => {
      const fixedNow = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
      try {
        const firstId = await enqueueSessionDelivery(
          {
            kind: "systemEvent",
            sessionKey: "agent:main:main",
            text: "concurrent enqueue",
          },
          tempDir,
        );
        const secondId = await enqueueSessionDelivery(
          {
            kind: "systemEvent",
            sessionKey: "agent:main:main",
            text: "concurrent enqueue",
          },
          tempDir,
        );

        expect(secondId).not.toBe(firstId);
        const entries = await loadPendingSessionDeliveries(tempDir);
        expect(entries).toHaveLength(2);
        expect(entries.every((entry) => entry.enqueuedAt === 1_700_000_000_000)).toBe(true);
      } finally {
        fixedNow.mockRestore();
      }
    });
  });

  it("does not collapse sub-second siblings that share a wall-clock second", async () => {
    await withTempDir({ prefix: "openclaw-session-delivery-" }, async (tempDir) => {
      const nowSpy = vi.spyOn(Date, "now");
      nowSpy.mockReturnValueOnce(1_700_000_000_010);
      nowSpy.mockReturnValueOnce(1_700_000_000_730);
      try {
        const firstId = await enqueueSessionDelivery(
          {
            kind: "agentTurn",
            sessionKey: "agent:main:main",
            message: "sibling",
            messageId: "msg-1",
          },
          tempDir,
        );
        const secondId = await enqueueSessionDelivery(
          {
            kind: "agentTurn",
            sessionKey: "agent:main:main",
            message: "sibling",
            messageId: "msg-2",
          },
          tempDir,
        );

        expect(secondId).not.toBe(firstId);
        const entries = await loadPendingSessionDeliveries(tempDir);
        expect(entries).toHaveLength(2);
        const [earlier, later] = entries.map((entry) => entry.enqueuedAt).toSorted((a, b) => a - b);
        expect([earlier, later]).toEqual([1_700_000_000_010, 1_700_000_000_730]);
        expect(Math.floor(earlier / 1000)).toBe(Math.floor(later / 1000));
      } finally {
        nowSpy.mockRestore();
      }
    });
  });

  it("treats trailing-whitespace variants of an idempotency key as the same taskHash", async () => {
    await withTempDir({ prefix: "openclaw-session-delivery-" }, async (tempDir) => {
      const baseKey = "restart-sentinel:agent:main:main:agentTurn:1700000000123";
      const cleanId = await enqueueSessionDelivery(
        {
          kind: "agentTurn",
          sessionKey: "agent:main:main",
          message: "first",
          messageId: baseKey,
          idempotencyKey: baseKey,
        },
        tempDir,
      );
      const trailingSpaceId = await enqueueSessionDelivery(
        {
          kind: "agentTurn",
          sessionKey: "agent:main:main",
          message: "trailing space duplicate",
          messageId: baseKey,
          idempotencyKey: `${baseKey}   `,
        },
        tempDir,
      );
      const trailingNewlineId = await enqueueSessionDelivery(
        {
          kind: "agentTurn",
          sessionKey: "agent:main:main",
          message: "trailing newline duplicate",
          messageId: baseKey,
          idempotencyKey: `${baseKey}\n`,
        },
        tempDir,
      );
      const trailingMixedId = await enqueueSessionDelivery(
        {
          kind: "agentTurn",
          sessionKey: "agent:main:main",
          message: "trailing mixed whitespace duplicate",
          messageId: baseKey,
          idempotencyKey: `${baseKey} \t\n`,
        },
        tempDir,
      );

      const expected = createHash("sha256").update(baseKey).digest("hex");
      expect(cleanId).toBe(expected);
      expect(trailingSpaceId).toBe(expected);
      expect(trailingNewlineId).toBe(expected);
      expect(trailingMixedId).toBe(expected);
      expect(await loadPendingSessionDeliveries(tempDir)).toHaveLength(1);
    });
  });

  it("keeps fresh temporary queue files while a write may still be in flight", async () => {
    await withTempDir({ prefix: "openclaw-session-delivery-" }, async (tempDir) => {
      const tmpPath = path.join(resolveSessionDeliveryQueueDir(tempDir), "active-entry.tmp");
      fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
      fs.writeFileSync(tmpPath, "active tmp");

      await loadPendingSessionDeliveries(tempDir);

      expect(fs.existsSync(tmpPath)).toBe(true);
    });
  });
});
