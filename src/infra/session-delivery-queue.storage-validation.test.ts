// Covers post-compaction and generic snapshot validation and dead-lettering in session delivery queue storage.
import { describe, expect, it } from "vitest";
import { openOpenClawStateDatabase } from "../state/openclaw-state-db.js";
import {
  enqueuePostCompactionDelegateDelivery,
  enqueueSessionDelivery,
  loadPendingSessionDelivery,
  loadPendingSessionDeliveries,
} from "./session-delivery-queue-storage.js";
import {
  readSessionQueueRow,
  rewriteSessionQueueEntry,
  rewriteSessionQueueEntryKind,
} from "./session-delivery-queue.storage.test-support.js";
import { withSessionDeliveryQueue } from "./session-delivery-queue.test-helpers.js";

describe("session-delivery queue storage validation", () => {
  it("rejects invalid post-compaction snapshot bytes before durable enqueue", async () => {
    const corruptions: Array<{
      name: string;
      attachments: Array<{ name: string; content: string; encoding?: "utf8" | "base64" }>;
    }> = [
      {
        name: "unsafe name",
        attachments: [{ name: "../escape", content: "snapshot" }],
      },
      {
        name: "invalid base64",
        attachments: [{ name: "brief.md", content: "not-base64!", encoding: "base64" }],
      },
      {
        name: "oversized content",
        attachments: [{ name: "brief.md", content: "x".repeat(1024 * 1024 + 1) }],
      },
    ];

    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      for (const [sequence, corruption] of corruptions.entries()) {
        await expect(
          enqueuePostCompactionDelegateDelivery(
            {
              sessionKey: "agent:main:main",
              delegate: {
                task: `reject ${corruption.name}`,
                createdAt: 600 + sequence,
                attachments: corruption.attachments,
              },
              sequence,
            },
            tempDir,
          ),
        ).rejects.toThrow("invalid postCompactionDelegate delivery payload: invalid shape");
      }
      await expect(loadPendingSessionDeliveries(tempDir)).resolves.toEqual([]);
    });
  });

  it("rejects oversized serialized snapshot metadata before queue persistence", async () => {
    const invalidDelegates = [
      {
        attachments: [{ name: "brief.bin", content: "Z g==", encoding: "base64" as const }],
      },
      {
        attachments: [{ name: "brief.txt", content: "snapshot", mimeType: "m".repeat(257) }],
      },
      {
        attachments: [{ name: "brief.txt", content: "snapshot" }],
        attachAs: { mountPath: "a".repeat(1025) },
      },
    ];

    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      for (const [sequence, invalid] of invalidDelegates.entries()) {
        await expect(
          enqueuePostCompactionDelegateDelivery(
            {
              sessionKey: "agent:main:main",
              delegate: {
                task: "reject serialized attachment expansion",
                createdAt: 650 + sequence,
                ...invalid,
              },
              sequence,
            },
            tempDir,
          ),
        ).rejects.toThrow("invalid postCompactionDelegate delivery payload: invalid shape");
      }
      await expect(loadPendingSessionDeliveries(tempDir)).resolves.toEqual([]);
    });
  });

  it("dead-letters invalid post-compaction JSON without retaining raw bytes", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      const id = await enqueuePostCompactionDelegateDelivery(
        {
          sessionKey: "agent:main:main",
          delegate: { task: "recover valid snapshot", createdAt: 123 },
          sequence: 0,
        },
        tempDir,
      );
      const secret = "CORRUPT_QUEUE_JSON_SECRET";
      const { db } = openOpenClawStateDatabase({
        env: { ...process.env, OPENCLAW_STATE_DIR: tempDir },
      });
      db.prepare(
        `UPDATE delivery_queue_entries
            SET entry_json = ?
          WHERE queue_name = 'session' AND id = ?`,
      ).run(`{"secret":"${secret}"`, id);

      await expect(loadPendingSessionDeliveries(tempDir)).resolves.toEqual([]);
      const row = readSessionQueueRow(tempDir, id);
      expect(row).toMatchObject({
        status: "failed",
        last_error: "invalid postCompactionDelegate delivery payload: invalid JSON",
      });
      expect(row?.entry_json).not.toContain(secret);
    });
  });

  it("dead-letters invalid generic JSON without retaining raw bytes", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      const id = await enqueueSessionDelivery(
        {
          kind: "systemEvent",
          sessionKey: "agent:main:main",
          text: "recover a generic event",
        },
        tempDir,
      );
      const secret = "CORRUPT_GENERIC_QUEUE_JSON_SECRET";
      const { db } = openOpenClawStateDatabase({
        env: { ...process.env, OPENCLAW_STATE_DIR: tempDir },
      });
      db.prepare(
        `UPDATE delivery_queue_entries
            SET entry_json = ?
          WHERE queue_name = 'session' AND id = ?`,
      ).run(`{"attachments":[{"content":"${secret}"}]`, id);

      await expect(loadPendingSessionDeliveries(tempDir)).resolves.toEqual([]);
      const row = readSessionQueueRow(tempDir, id);
      expect(row).toMatchObject({
        status: "failed",
        last_error: "invalid generic session delivery payload: invalid JSON",
      });
      expect(row?.entry_json).not.toContain(secret);
    });
  });

  it("dead-letters post-compaction snapshots that fail byte-level attachment validation", async () => {
    const corruptions: Array<{
      name: string;
      attachments: Array<Record<string, unknown>>;
    }> = [
      {
        name: "unsafe name",
        attachments: [{ name: "../unsafe", content: "snapshot" }],
      },
      {
        name: "invalid base64",
        attachments: [{ name: "brief.md", content: "not-base64!", encoding: "base64" }],
      },
      {
        name: "oversized content",
        attachments: [{ name: "brief.md", content: "x".repeat(1024 * 1024 + 1) }],
      },
    ];

    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      for (const [sequence, corruption] of corruptions.entries()) {
        const secret = `QUEUE_ATTACHMENT_VALIDATION_SECRET_${sequence}`;
        const id = await enqueuePostCompactionDelegateDelivery(
          {
            sessionKey: "agent:main:main",
            delegate: {
              task: `recover ${corruption.name}`,
              createdAt: 700 + sequence,
              attachments: [{ name: "brief.md", content: secret }],
            },
            sequence,
          },
          tempDir,
        );
        rewriteSessionQueueEntry(tempDir, id, (entry) => {
          entry.attachments = corruption.attachments;
        });

        await expect(loadPendingSessionDelivery(id, tempDir)).resolves.toBeNull();
        const row = readSessionQueueRow(tempDir, id);
        expect(row).toMatchObject({
          status: "failed",
          last_error: "invalid postCompactionDelegate delivery payload: invalid shape",
        });
        expect(row?.entry_json).not.toContain(secret);
        expect(row?.entry_json).not.toContain("not-base64!");
      }
    });
  });

  it("dead-letters raw post-compaction snapshots when entry_kind is missing or stale", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      for (const [sequence, entryKind] of [null, "agentTurn"].entries()) {
        const secret = `STALE_ENTRY_KIND_SECRET_${sequence}`;
        const id = await enqueuePostCompactionDelegateDelivery(
          {
            sessionKey: "agent:main:main",
            delegate: {
              task: "recover only matching post-compaction metadata",
              createdAt: 800 + sequence,
              attachments: [{ name: "brief.md", content: secret }],
            },
            sequence,
          },
          tempDir,
        );
        rewriteSessionQueueEntryKind(tempDir, id, entryKind);

        await expect(loadPendingSessionDelivery(id, tempDir)).resolves.toBeNull();
        const row = readSessionQueueRow(tempDir, id);
        expect(row).toMatchObject({
          status: "failed",
          last_error: "invalid postCompactionDelegate delivery payload: invalid shape",
        });
        expect(row?.entry_json).not.toContain(secret);
        expect(row?.entry_json).not.toContain("attachments");
        expect(row?.entry_json).not.toContain("task");
        await expect(loadPendingSessionDelivery(id, tempDir)).resolves.toBeNull();
      }
    });
  });

  it("accepts generic descriptor attachment refs without widening them to inline input", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      const legacySha256 = "legacy-nonhex-descriptor";
      const id = await enqueueSessionDelivery(
        {
          kind: "systemEvent",
          sessionKey: "agent:main:main",
          text: "descriptor-only event",
          attachments: [{ kind: "blob-sha256", sha256: legacySha256, mediaType: "text/plain" }],
        },
        tempDir,
      );

      await expect(loadPendingSessionDelivery(id, tempDir)).resolves.toMatchObject({
        kind: "systemEvent",
        attachments: [{ kind: "blob-sha256", sha256: legacySha256 }],
      });
    });
  });

  it("round-trips the agentTurn requester binding and rejects a widened binding", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      const requesterBinding = {
        agentId: "main",
        sessionKey: "agent:main:main",
        storePath: "/tmp/openclaw-sessions.json",
        sessionId: "requester-session",
        lifecycleRevision: null,
      };
      const seed = async (messageId: string) =>
        await enqueueSessionDelivery(
          {
            kind: "agentTurn",
            sessionKey: "agent:main:main",
            message: "requester-bound turn",
            messageId,
          },
          tempDir,
        );
      const boundId = await seed("requester-bound");
      rewriteSessionQueueEntry(tempDir, boundId, (entry) => {
        entry.requesterBinding = requesterBinding;
      });
      await expect(loadPendingSessionDelivery(boundId, tempDir)).resolves.toMatchObject({
        kind: "agentTurn",
        requesterBinding,
      });

      const widenedId = await seed("requester-widened");
      rewriteSessionQueueEntry(tempDir, widenedId, (entry) => {
        entry.requesterBinding = { ...requesterBinding, extra: "not-admitted" };
      });
      await expect(loadPendingSessionDelivery(widenedId, tempDir)).resolves.toBeNull();
    });
  });

  it("dead-letters empty or widened generic blob descriptors before returning them", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      const corruptions = [
        { kind: "blob-sha256", sha256: "", mediaType: "text/plain" },
        {
          kind: "blob-sha256",
          sha256: "legacy-nonhex-descriptor",
          mediaType: "text/plain",
          extra: "UNKNOWN_BLOB_DESCRIPTOR_FIELD",
        },
      ];
      for (const [index, attachment] of corruptions.entries()) {
        const id = await enqueueSessionDelivery(
          {
            kind: "systemEvent",
            sessionKey: "agent:main:main",
            text: `malformed descriptor seed ${index}`,
          },
          tempDir,
        );
        const current = readSessionQueueRow(tempDir, id);
        const corrupted = JSON.parse(current?.entry_json ?? "{}") as Record<string, unknown>;
        corrupted.attachments = [attachment];
        const { db } = openOpenClawStateDatabase({
          env: { ...process.env, OPENCLAW_STATE_DIR: tempDir },
        });
        db.prepare(
          `UPDATE delivery_queue_entries
            SET entry_json = ?
          WHERE queue_name = 'session' AND id = ?`,
        ).run(JSON.stringify(corrupted), id);

        await expect(loadPendingSessionDelivery(id, tempDir)).resolves.toBeNull();
        const row = readSessionQueueRow(tempDir, id);
        expect(row).toMatchObject({
          status: "failed",
          last_error: "invalid generic session delivery attachment metadata",
        });
        expect(row?.entry_json).not.toContain("attachments");
        expect(row?.entry_json).not.toContain("UNKNOWN_BLOB_DESCRIPTOR_FIELD");
      }
    });
  });

  it("dead-letters seeded generic inline attachments before they can be returned", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      for (const kind of ["systemEvent", "agentTurn"] as const) {
        const id =
          kind === "systemEvent"
            ? await enqueueSessionDelivery(
                {
                  kind,
                  sessionKey: "agent:main:main",
                  text: "generic inline attachment seed",
                },
                tempDir,
              )
            : await enqueueSessionDelivery(
                {
                  kind,
                  sessionKey: "agent:main:main",
                  message: "generic inline attachment seed",
                  messageId: `generic-inline-${kind}`,
                },
                tempDir,
              );
        const secret = `GENERIC_${kind.toUpperCase()}_INLINE_ATTACHMENT_SECRET`;
        const current = readSessionQueueRow(tempDir, id);
        const corrupted = JSON.parse(current?.entry_json ?? "{}") as Record<string, unknown>;
        corrupted.attachments = [{ name: "brief.md", content: secret }];
        const { db } = openOpenClawStateDatabase({
          env: { ...process.env, OPENCLAW_STATE_DIR: tempDir },
        });
        db.prepare(
          `UPDATE delivery_queue_entries
              SET entry_json = ?
            WHERE queue_name = 'session' AND id = ?`,
        ).run(JSON.stringify(corrupted), id);

        await expect(loadPendingSessionDelivery(id, tempDir)).resolves.toBeNull();
        await expect(loadPendingSessionDeliveries(tempDir)).resolves.not.toContainEqual(
          expect.objectContaining({ id }),
        );
        const row = readSessionQueueRow(tempDir, id);
        expect(row).toMatchObject({
          status: "failed",
          last_error: "invalid generic session delivery attachment metadata",
        });
        expect(row?.entry_json).not.toContain(secret);
        expect(row?.last_error).not.toContain(secret);
      }
    });
  });

  it("dead-letters malformed post-compaction attachment members without retaining content", async () => {
    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      const secret = "MALFORMED_QUEUE_ATTACHMENT_SECRET";
      const id = await enqueuePostCompactionDelegateDelivery(
        {
          sessionKey: "agent:main:main",
          delegate: {
            task: "recover attachment snapshot",
            createdAt: 123,
            attachments: [{ name: "brief.md", content: secret }],
          },
          sequence: 0,
        },
        tempDir,
      );
      const current = readSessionQueueRow(tempDir, id);
      const malformed = JSON.parse(current?.entry_json ?? "{}") as Record<string, unknown>;
      malformed.attachments = [{ name: "brief.md", content: secret, encoding: "hex" }];
      const { db } = openOpenClawStateDatabase({
        env: { ...process.env, OPENCLAW_STATE_DIR: tempDir },
      });
      db.prepare(
        `UPDATE delivery_queue_entries
            SET entry_json = ?
          WHERE queue_name = 'session' AND id = ?`,
      ).run(JSON.stringify(malformed), id);

      await expect(loadPendingSessionDelivery(id, tempDir)).resolves.toBeNull();
      const row = readSessionQueueRow(tempDir, id);
      expect(row).toMatchObject({
        status: "failed",
        last_error: "invalid postCompactionDelegate delivery payload: invalid shape",
      });
      expect(row?.entry_json).not.toContain(secret);
    });
  });

  it("dead-letters post-compaction rows that violate live queue semantics", async () => {
    const corruptions: Array<{
      name: string;
      mutate: (entry: Record<string, unknown>, secret: string) => void;
    }> = [
      {
        name: "empty task",
        mutate: (entry) => {
          entry.task = "   ";
        },
      },
      {
        name: "contradictory targeting",
        mutate: (entry) => {
          entry.targetSessionKey = "agent:main:target";
          entry.fanoutMode = "all";
        },
      },
      {
        name: "invalid retry budget",
        mutate: (entry) => {
          entry.maxRetries = -1;
        },
      },
      {
        name: "unknown fields",
        mutate: (entry, secret) => {
          entry.untrusted = secret;
        },
      },
    ];

    await withSessionDeliveryQueue(async (tempDir, _queueContext) => {
      for (const [sequence, corruption] of corruptions.entries()) {
        const secret = `CORRUPT_QUEUE_SECRET_${sequence}`;
        const id = await enqueuePostCompactionDelegateDelivery(
          {
            sessionKey: "agent:main:main",
            delegate: {
              task: `recover ${corruption.name}`,
              createdAt: 123 + sequence,
              attachments: [{ name: "brief.md", content: secret }],
            },
            sequence,
          },
          tempDir,
        );
        rewriteSessionQueueEntry(tempDir, id, (entry) => corruption.mutate(entry, secret));

        await expect(loadPendingSessionDelivery(id, tempDir)).resolves.toBeNull();
        const row = readSessionQueueRow(tempDir, id);
        expect(row).toMatchObject({
          status: "failed",
          last_error: "invalid postCompactionDelegate delivery payload: invalid shape",
        });
        if (!row) {
          throw new Error(`Expected failed session delivery row ${id}`);
        }
        expect(row.entry_json).not.toContain(secret);
        expect(JSON.parse(row.entry_json)).toEqual({
          id,
          enqueuedAt: expect.any(Number),
          failedAt: expect.any(Number),
          retryCount: 0,
          completionRetention: "permanent",
          recoveryState: "completed_permanent",
        });
      }
    });
  });
});
