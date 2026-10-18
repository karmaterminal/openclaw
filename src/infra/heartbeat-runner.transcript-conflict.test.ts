import "../test-utils/prepare-compiled-subprocesses.js";
import { expectDefined } from "@openclaw/normalization-core/expect";
import { afterEach, expect, it, vi } from "vitest";
import { heartbeatRunnerTelegramPlugin } from "../../test/helpers/infra/heartbeat-runner-channel-plugins.js";
import type { RunEmbeddedAgentParams } from "../agents/embedded-agent-runner/run/params.js";
import { runEmbeddedAgent } from "../agents/embedded-agent.js";
import * as runtimePlugins from "../agents/runtime-plugins.js";
import { resolveActiveReplyOperationForSessionId } from "../auto-reply/reply/reply-run-registry.js";
import { setRuntimeConfigSnapshot } from "../config/runtime-snapshot.js";
import { replaceSessionEntry } from "../config/sessions/session-accessor.js";
import { SqliteTranscriptMutationConflictError } from "../config/sessions/session-mutation-conflict-error.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  captureActivePluginRegistrySnapshot,
  restoreActivePluginRegistrySnapshot,
  setActivePluginRegistry,
} from "../plugins/runtime.js";
import { openOpenClawStateDatabase } from "../state/openclaw-state-db.js";
import { createTestRegistry } from "../test-utils/channel-plugins.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import { normalizeSessionDeliveryState } from "../utils/delivery-context.shared.js";
import { runHeartbeatOnceCore as runHeartbeatOnce } from "./heartbeat-runner-run.js";
import { isRetryableSessionEventWakeReason } from "./session-event-wake.js";
import { enqueueSystemEvent, peekSystemEvents, resetSystemEventsForTest } from "./system-events.js";

// mock-isolation: Only inference is synthetic; admission, the reply pipeline, its error
// handling, heartbeat settlement and channel delivery stay real.
vi.mock("../agents/embedded-agent-runner/run.js", () => ({ runEmbeddedAgent: vi.fn() }));
const model = vi.mocked(runEmbeddedAgent);
await Promise.all([
  import("../auto-reply/dispatch.js"),
  import("../auto-reply/reply/get-reply-from-config.runtime.js").then((runtime) =>
    runtime.prewarmConfigDrivenReplyRuntime(),
  ),
]);

afterEach(() => {
  resetSystemEventsForTest();
  vi.restoreAllMocks();
});

const REMINDER = "Reminder: rotate the offsite backup drive.";
const DESTINATION = "-1001234567890";

/** A cron reminder heartbeat whose turn loses its transcript to a newer room writer (#1475). */
async function withConflictingHeartbeat(
  label: string,
  run: (fixture: {
    sessionKey: string;
    heartbeat: () => ReturnType<typeof runHeartbeatOnce>;
    channelSends: ReturnType<typeof vi.fn>;
  }) => Promise<void>,
) {
  await withOpenClawTestState({ label, env: { OPENCLAW_TEST_FAST: "0" } }, async (state) => {
    const cfg: OpenClawConfig = {
      agents: {
        entries: { main: { workspace: state.workspaceDir } },
        defaults: {
          workspace: state.workspaceDir,
          skipBootstrap: true,
          model: { primary: "mock-openai/gpt-5.6-luna" },
          models: { "mock-openai/gpt-5.6-luna": { agentRuntime: { id: "openclaw" } } },
          heartbeat: { every: "30m", target: "telegram", to: DESTINATION, isolatedSession: false },
        },
      },
      messages: { visibleReplies: "automatic" },
      channels: { telegram: { botToken: "test-token", allowFrom: ["*"] } },
      plugins: { enabled: false },
      skills: { load: { watch: false } },
    };
    setRuntimeConfigSnapshot(cfg);
    await state.writeConfig(cfg);
    openOpenClawStateDatabase();
    const sessionKey = `agent:main:${label}`;
    await replaceSessionEntry(
      { agentId: "main", sessionKey },
      {
        sessionId: `${label}-session`,
        lifecycleRevision: "original",
        updatedAt: Date.now(),
        sessionStartedAt: Date.now(),
        permissionMode: "full",
        delivery: normalizeSessionDeliveryState({
          context: { channel: "telegram", to: DESTINATION },
        }),
      },
    );
    const previousRegistry = captureActivePluginRegistrySnapshot();
    const registry = createTestRegistry([
      { pluginId: "telegram", plugin: heartbeatRunnerTelegramPlugin, source: "test" },
    ]);
    setActivePluginRegistry(registry);
    vi.spyOn(runtimePlugins, "loadAgentRuntimePluginRegistryHandle").mockReturnValue(registry);
    const channelSends = vi.fn().mockResolvedValue({ messageId: "sent", chatId: DESTINATION });
    enqueueSystemEvent(REMINDER, { sessionKey, contextKey: "cron:offsite-backup" });
    try {
      await run({
        sessionKey,
        channelSends,
        heartbeat: () =>
          runHeartbeatOnce({
            cfg,
            agentId: "main",
            sessionKey,
            source: "cron",
            intent: "immediate",
            reason: "cron:offsite-backup",
            deps: { telegram: channelSends },
          }),
      });
    } finally {
      restoreActivePluginRegistrySnapshot(previousRegistry);
    }
  });
}

async function startTurn(params: RunEmbeddedAgentParams) {
  const admission = expectDefined(params.preparedRunAdmission, "real turn admission");
  await admission.admit("gateway", params.runId);
  params.onExecutionPhase?.({ phase: "model_call_started" });
  await params.onExecutionStarted?.();
  await params.onAgentEvent?.({ stream: "lifecycle", data: { phase: "start" } });
}

it.each([
  { steered: false, label: "answered" },
  { steered: true, label: "answered-then-steered" },
] as const)(
  "does not replay a heartbeat that answered through the message tool before losing its transcript ($label)",
  async ({ steered, label }) => {
    await withConflictingHeartbeat(label, async ({ sessionKey, heartbeat, channelSends }) => {
      // #1477 F1: the reminder's only visible effect is this message-tool post.
      const posts: string[] = [];
      model.mockReset().mockImplementation(async (params) => {
        await startTurn(params);
        if (!params.prompt.includes(REMINDER)) {
          return { payloads: [{ text: "HEARTBEAT_OK" }], meta: { durationMs: 1 } };
        }
        posts.push(posts.length === 0 ? "answer" : "replayed answer");
        const operation = resolveActiveReplyOperationForSessionId(params.sessionId);
        // The message tool records the delivered answer on its reply operation.
        operation?.markSourceReplyDelivered();
        if (steered) {
          // Room input steered into the running heartbeat after its answer.
          operation?.markSteeredInputAccepted({ inboundAudio: false });
        }
        throw new SqliteTranscriptMutationConflictError(params.sessionId);
      });

      await heartbeat();
      // A retry or the next heartbeat finds the answered reminder already settled.
      await heartbeat();
      expect(posts).toEqual(["answer"]);
      expect(channelSends).not.toHaveBeenCalled();
      expect(peekSystemEvents(sessionKey)).toEqual([]);
    });
  },
);

it("stops yielding a heartbeat that keeps losing its transcript after a small retry budget", async () => {
  await withConflictingHeartbeat(
    "repeated-conflict",
    async ({ sessionKey, heartbeat, channelSends }) => {
      // #1477 F3: every attempt loses the race before answering.
      model.mockReset().mockImplementation(async (params) => {
        await startTurn(params);
        throw new SqliteTranscriptMutationConflictError(params.sessionId);
      });
      const results = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        results.push(await heartbeat());
      }
      const retryable = results.map(
        (result) => result.status === "skipped" && isRetryableSessionEventWakeReason(result.reason),
      );
      // Three yields are retried as preemption; the next conflict settles like any failed run,
      // so the wake owner schedules no further retry.
      expect(retryable).toEqual([true, true, true, false]);
      expect(results[3]?.status).toBe("failed");
      // Only the settled failure reaches the room, once; the yields stayed silent.
      expect(channelSends).toHaveBeenCalledOnce();
      // A failed heartbeat keeps unanswered work for a later heartbeat, as before #1475.
      expect(peekSystemEvents(sessionKey)).toEqual([REMINDER]);
    },
  );
});
