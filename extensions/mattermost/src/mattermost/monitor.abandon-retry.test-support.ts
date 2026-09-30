import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInboundDebouncer } from "openclaw/plugin-sdk/channel-inbound-debounce";
import {
  closeOpenClawStateDatabaseForTest,
  createChannelIngressQueueForTests,
} from "openclaw/plugin-sdk/channel-ingress-test-runtime";
import {
  DEFAULT_INGRESS_RETRY_DEAD_LETTER_MIN_AGE_MS,
  DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS,
} from "openclaw/plugin-sdk/channel-outbound";
import { expect, it, vi, type Mock } from "vitest";
import type { OpenClawConfig } from "./runtime-api.js";

type AbandonRetrySocket = {
  openListenerCount: number;
  emitOpen: () => void;
  emitClose: (code: number) => void;
};

export function registerMattermostAbandonRetryTests<Socket extends AbandonRetrySocket>(harness: {
  FakeWebSocket: new () => Socket;
  testConfig: OpenClawConfig;
  createRuntimeCore: (
    config: OpenClawConfig,
    route: undefined,
    options: { inboundDebounceMs: number; createInboundDebouncer: typeof createInboundDebouncer },
  ) => unknown;
  startTestMonitor: (
    config: OpenClawConfig,
    abort: AbortController,
    socket: Socket,
  ) => Promise<void>;
  emitMattermostChannelPost: (
    socket: Socket,
    post: { id: string; message: string },
  ) => Promise<void>;
  mockState: {
    ingressQueue: unknown;
    runtimeCore: unknown;
    dispatchInboundMessage: Mock;
  };
}) {
  const {
    FakeWebSocket,
    testConfig,
    createRuntimeCore,
    startTestMonitor,
    emitMattermostChannelPost,
    mockState,
  } = harness;
  it("retries abandonment with backoff, then dead-letters without restart redispatch", async () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 0, 2);
    vi.setSystemTime(now);
    const created = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-mattermost-abandon-"));
    const stateDir = await fs.realpath(created);
    type Payload = { version: 1; receivedAt: number; rawEvent: string };
    const queue = createChannelIngressQueueForTests<Payload>({
      channelId: "mattermost",
      accountId: "default",
      stateDir,
    });
    mockState.ingressQueue = queue;
    mockState.runtimeCore = createRuntimeCore(testConfig, undefined, {
      inboundDebounceMs: 0,
      createInboundDebouncer,
    });
    mockState.dispatchInboundMessage.mockRejectedValue(
      new Error("Mattermost dispatch failed before adoption"),
    );

    const activeProviders: Array<{ stop: () => Promise<void> }> = [];
    const startProvider = async () => {
      const socket = new FakeWebSocket();
      const abortController = new AbortController();
      const monitor = startTestMonitor(testConfig, abortController, socket);
      for (let tick = 0; tick < 20 && socket.openListenerCount === 0; tick += 1) {
        await Promise.resolve();
      }
      expect(socket.openListenerCount).toBeGreaterThan(0);
      socket.emitOpen();
      let stopped = false;
      const provider = {
        socket,
        stop: async () => {
          if (stopped) {
            return;
          }
          stopped = true;
          abortController.abort();
          socket.emitClose(1000);
          await monitor;
        },
      };
      activeProviders.push(provider);
      return provider;
    };
    const send = async (provider: Awaited<ReturnType<typeof startProvider>>) => {
      await emitMattermostChannelPost(provider.socket, {
        id: "post-abandon-retry",
        message: "retry me",
      });
    };
    const pendingAttempt = async (attempts: number) => {
      let observed: Awaited<ReturnType<typeof queue.listPending>>[number] | undefined;
      await vi.waitFor(async () => {
        const pending = await queue.listPending({ limit: "all" });
        expect(pending).toEqual([
          expect.objectContaining({
            id: "post-abandon-retry",
            attempts,
            lastAttemptAt: expect.any(Number),
            lastError: "turn-abandoned",
          }),
        ]);
        observed = pending[0];
      });
      const lastAttemptAt = observed?.lastAttemptAt;
      if (lastAttemptAt === undefined) {
        throw new Error(`Missing Mattermost retry timestamp for attempt ${attempts}`);
      }
      return { ...observed, lastAttemptAt };
    };

    try {
      const first = await startProvider();
      await send(first);
      const firstAttempt = await pendingAttempt(1);
      expect(mockState.dispatchInboundMessage).toHaveBeenCalledTimes(1);
      await first.stop();

      vi.setSystemTime(firstAttempt.lastAttemptAt + 999);
      const blocked = await startProvider();
      await send(blocked);
      await vi.advanceTimersByTimeAsync(0);
      expect(mockState.dispatchInboundMessage).toHaveBeenCalledTimes(1);
      await blocked.stop();

      vi.setSystemTime(firstAttempt.lastAttemptAt + 1_001);
      const second = await startProvider();
      await send(second);
      const secondAttempt = await pendingAttempt(2);
      expect(mockState.dispatchInboundMessage).toHaveBeenCalledTimes(2);
      await second.stop();

      for (let attempt = 3; attempt < DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS; attempt += 1) {
        const claim = await queue.claim("post-abandon-retry", { ownerId: `seed-${attempt}` });
        if (!claim) {
          throw new Error(`Expected Mattermost seed claim ${attempt}`);
        }
        await queue.release(claim, {
          lastError: "turn-abandoned",
          releasedAt: secondAttempt.lastAttemptAt,
        });
      }

      vi.setSystemTime(
        secondAttempt.lastAttemptAt + DEFAULT_INGRESS_RETRY_DEAD_LETTER_MIN_AGE_MS + 64_001,
      );
      const threshold = await startProvider();
      await send(threshold);
      await vi.waitFor(async () => {
        expect(await queue.listFailed?.()).toEqual([
          expect.objectContaining({
            id: "post-abandon-retry",
            attempts: DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS - 1,
            reason: "retry-limit-exceeded",
            message: "turn-abandoned",
          }),
        ]);
      });
      expect(await queue.listPending()).toEqual([]);
      expect(await queue.listClaims()).toEqual([]);
      expect(mockState.dispatchInboundMessage).toHaveBeenCalledTimes(3);
      await threshold.stop();

      vi.setSystemTime(Date.now() + 128_001);
      const beyond = await startProvider();
      await send(beyond);
      await vi.advanceTimersByTimeAsync(0);
      expect(await queue.listPending()).toEqual([]);
      expect(await queue.listFailed?.()).toHaveLength(1);
      expect(mockState.dispatchInboundMessage).toHaveBeenCalledTimes(3);
      await beyond.stop();

      vi.setSystemTime(Date.now() + 1_000);
      const blockedRestart = await startProvider();
      await send(blockedRestart);
      await vi.advanceTimersByTimeAsync(0);
      expect(mockState.dispatchInboundMessage).toHaveBeenCalledTimes(3);
      await blockedRestart.stop();
    } finally {
      await Promise.allSettled(activeProviders.map(async (provider) => await provider.stop()));
      mockState.ingressQueue = undefined;
      closeOpenClawStateDatabaseForTest();
      await fs.rm(stateDir, { recursive: true, force: true });
      vi.useRealTimers();
    }
  });
}
