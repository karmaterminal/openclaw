import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { APIMessage } from "discord-api-types/v10";
import { fanInChannelIngressLifecycles } from "openclaw/plugin-sdk/channel-ingress-runtime";
import type { ChannelIngressQueue } from "openclaw/plugin-sdk/channel-outbound";
import {
  closeOpenClawStateDatabaseForTest,
  createChannelIngressQueueForTests,
} from "openclaw/plugin-sdk/plugin-state-test-runtime";
import { describe, expect, it, vi } from "vitest";
import { buildDiscordInboundJob } from "./inbound-job.js";
import { createDiscordIngressMonitor } from "./ingress.js";
import { createBaseDiscordMessageContext } from "./message-handler.test-harness.js";
import { createDiscordHandlerParams } from "./message-handler.test-helpers.js";
import { createDiscordMessageRunQueue } from "./message-run-queue.js";

type DiscordIngressPayload = {
  version: 1;
  receivedAt: number;
  rawMessage: APIMessage;
};

async function withDiscordQueue<T>(
  run: (queue: ChannelIngressQueue<DiscordIngressPayload>) => Promise<T>,
): Promise<T> {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-discord-handler-"));
  const stateDir = await fs.realpath(created);
  const queue = createChannelIngressQueueForTests<DiscordIngressPayload>({
    channelId: "discord",
    accountId: "default",
    stateDir,
  });
  try {
    return await run(queue);
  } finally {
    closeOpenClawStateDatabaseForTest();
    await fs.rm(stateDir, { recursive: true, force: true });
  }
}

function createRawMessage(id: string): APIMessage {
  return {
    id,
    channel_id: "lane-a",
    content: "hello",
    author: { id: "user-1", username: "alice", discriminator: "0", avatar: null },
    attachments: [],
    embeds: [],
    mentions: [],
    mention_roles: [],
    mention_everyone: false,
    timestamp: new Date().toISOString(),
    edited_timestamp: null,
    components: [],
    pinned: false,
    type: 0,
    tts: false,
  } as unknown as APIMessage;
}

describe("Discord message run queue session identity conflicts", () => {
  it("terminally settles a deferred session identity conflict and advances its lane", async () => {
    await withDiscordQueue(async (queue) => {
      const conflictId = "session-identity-conflict";
      for (const id of [conflictId, "z-after-session-identity-conflict"]) {
        await queue.enqueue(
          id,
          { version: 1, receivedAt: 10, rawMessage: createRawMessage(id) },
          { laneKey: "channel:lane-a", receivedAt: 10 },
        );
      }
      const conflict = Object.assign(
        new Error(
          'Session "agent:main:discord:channel:lane-a" changed while starting work. Retry.',
        ),
        { code: "session_identity_conflict" },
      );
      const processDiscordMessage = vi
        .fn()
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce(undefined);
      const params = createDiscordHandlerParams();
      const messageRunQueue = createDiscordMessageRunQueue({
        runtime: params.runtime,
        testing: { processDiscordMessage: processDiscordMessage as never },
      });
      const monitor = createDiscordIngressMonitor({
        accountId: "default",
        client: {} as never,
        runtime: params.runtime,
        queue,
        dispatch: async (_event, lifecycle) => {
          const ingress = fanInChannelIngressLifecycles([lifecycle]);
          ingress.lifecycle?.onDeferred();
          messageRunQueue.enqueue(
            buildDiscordInboundJob(await createBaseDiscordMessageContext(), {
              ingressSettlement: ingress,
            }),
          );
          return { kind: "deferred" };
        },
      });
      monitor.start();
      try {
        await vi.waitFor(
          async () => {
            expect(await queue.listFailed?.({ limit: "all" })).toMatchObject([
              {
                id: conflictId,
                reason: "session-identity-conflict",
                message: conflict.message,
              },
            ]);
            expect(processDiscordMessage).toHaveBeenCalledTimes(2);
          },
          { timeout: 5_000 },
        );
        await expect(queue.listPending({ limit: "all" })).resolves.toEqual([]);
      } finally {
        await monitor.stop();
        await messageRunQueue.deactivate();
      }
    });
  });
});
