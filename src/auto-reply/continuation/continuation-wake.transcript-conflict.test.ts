// Continuation wake turns that lose their transcript to a newer writer (OQ-1, #1475 D3a).
//
// Upstream retired heartbeat turns (#180192), so a continuation wake is a session-event turn.
// D3a was a background turn that lost its transcript to newer room input and failed instead of
// yielding. These cases ask whether a wake turn does the same at this head.
//
// Real: the continuation producer, the wake, the session-event handoff, reply admission, the
// durable return row, and the Gateway's lifecycle persistence of the run's events. Only the
// model decision (runEmbeddedAgent) is synthetic: it admits the turn, then raises what the
// transcript writers raise when a newer writer moved the transcript, either raw or as the
// replay-safe wrapper attempt normalization adds after an effect-free run.
import { expectDefined } from "@openclaw/normalization-core/expect";
import { afterEach, expect, it, vi } from "vitest";
import { withinTest } from "../../../test/helpers/promise.js";
import {
  admitModelTurn,
  completionConfig,
} from "../../agents/bash-tools.lifecycle.test-support.js";
import type { RunEmbeddedAgentParams } from "../../agents/embedded-agent-runner/run/params.js";
import { ReplaySafeTranscriptConflictError } from "../../agents/embedded-agent-runner/transcript-conflict.js";
import { runEmbeddedAgent } from "../../agents/embedded-agent.js";
import type { ChannelOutboundAdapter } from "../../channels/plugins/outbound.types.js";
import type { ChannelPlugin } from "../../channels/plugins/types.public.js";
import { setRuntimeConfigSnapshot } from "../../config/runtime-snapshot.js";
import { replaceSessionEntry } from "../../config/sessions/session-accessor.js";
import { readSessionEntryInWorker } from "../../config/sessions/session-entry-read-writable.js";
import { SqliteTranscriptMutationConflictError } from "../../config/sessions/session-mutation-conflict-error.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { persistGatewaySessionLifecycleEvent } from "../../gateway/session-lifecycle-state.js";
import { onAgentEvent, type AgentEventPayload } from "../../infra/agent-events.js";
import { loadPendingSessionDelivery } from "../../infra/session-delivery-queue-storage.js";
import { resetSystemEventsForTest } from "../../infra/system-events.js";
import {
  captureActivePluginRegistrySnapshot,
  restoreActivePluginRegistrySnapshot,
  setActivePluginRegistry,
} from "../../plugins/runtime.js";
import { resolveActiveReplyOperationForSessionId } from "../../sessions/session-controller.queries.js";
import { openOpenClawStateDatabase } from "../../state/openclaw-state-db.js";
import { captureOpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.js";
import {
  createChannelTestPluginBase,
  createTestRegistry,
} from "../../test-utils/channel-plugins.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { normalizeSessionDeliveryState } from "../../utils/delivery-context.shared.js";
import { enqueueSessionEventForHost } from "../reply/session-event-handoff.js";
import {
  resetContinuationWakesForTest,
  settleContinuationWakesForTest,
} from "./continuation-wake.js";
import { enqueueContinuationReturnDeliveries } from "./targeting.js";

// mock-isolation: Synthetic model decisions; admission, queue, handoff and durable rows stay real.
vi.mock("../../agents/embedded-agent-runner/run.js", () => ({
  runEmbeddedAgent: vi.fn(),
}));
const runEmbeddedAgentMock = vi.mocked(runEmbeddedAgent);
// Match Gateway startup: activate the real reply runtimes before admitting turns.
await Promise.all([
  import("../dispatch.js"),
  import("../reply/get-reply-from-config.runtime.js").then((runtime) =>
    runtime.prewarmConfigDrivenReplyRuntime(),
  ),
]);

const AGENT_ID = "main";
const ROUTE = { channel: "telegram", to: "-100001", accountId: "default" };

afterEach(() => {
  resetContinuationWakesForTest();
  resetSystemEventsForTest();
  runEmbeddedAgentMock.mockReset();
});

type WakeTurnFailure = {
  sendText: ReturnType<typeof vi.fn<NonNullable<ChannelOutboundAdapter["sendText"]>>>;
  prompts: string[];
  terminal: Record<string, unknown> | undefined;
  rowPending: boolean;
  entry: Awaited<ReturnType<typeof readSessionEntryInWorker>>;
};

/**
 * One delegate return wakes a continuation-enabled session whose turn admits, then fails with
 * `failure`. The Gateway persists the run's lifecycle events as its agent-event handler would.
 * An `answered` turn first answers its source through the message tool. An `exec` turn is the
 * ordinary session event a background exec completion raises instead of a continuation wake.
 */
async function failWakeTurn(
  label: string,
  failure: (sessionId: string) => Error,
  signal: AbortSignal,
  options: { answered?: boolean; exec?: boolean } = {},
): Promise<WakeTurnFailure> {
  let observed: WakeTurnFailure | undefined;
  await withOpenClawTestState({ label, env: { OPENCLAW_TEST_FAST: "0" } }, async (state) => {
    const config: OpenClawConfig = completionConfig(state.workspaceDir);
    config.agents = {
      ...config.agents,
      defaults: { ...config.agents?.defaults, continuation: { enabled: true } },
    };
    setRuntimeConfigSnapshot(config);
    await state.writeConfig(config);
    openOpenClawStateDatabase();
    const registry = captureActivePluginRegistrySnapshot();
    const current = expectDefined(registry.activeRegistry, "active plugin registry");
    const sendText = vi
      .fn<NonNullable<ChannelOutboundAdapter["sendText"]>>()
      .mockResolvedValue({ channel: "telegram", messageId: "wake-reply" });
    const channels = createTestRegistry([
      {
        pluginId: "telegram",
        source: "test",
        plugin: {
          ...createChannelTestPluginBase({ id: "telegram" }),
          outbound: { deliveryMode: "direct", sendText },
        } satisfies ChannelPlugin,
      },
    ]);
    setActivePluginRegistry({
      ...current,
      channels: [
        ...current.channels.filter((entry) => entry.plugin.id !== "telegram"),
        ...channels.channels,
      ],
      channelSetups: [
        ...current.channelSetups.filter((entry) => entry.plugin.id !== "telegram"),
        ...channels.channelSetups,
      ],
    });
    const sessionKey = `agent:main:wake-${label}`;
    const sessionId = `session-${label}`;
    await replaceSessionEntry(
      { agentId: AGENT_ID, sessionKey },
      {
        sessionId,
        lifecycleRevision: "original",
        permissionMode: "full",
        delivery: normalizeSessionDeliveryState({ context: ROUTE }),
        continuationChainCount: 2,
        continuationChainTokens: 1_000,
        continuationChainStartedAt: 1,
        continuationChainId: "chain-before-wake",
        updatedAt: Date.now(),
      },
    );
    const lifecycle: AgentEventPayload[] = [];
    const unsubscribe = onAgentEvent((event) => {
      if (event.stream === "lifecycle" && event.sessionKey === sessionKey) {
        lifecycle.push(event);
      }
    });
    const prompts: string[] = [];
    runEmbeddedAgentMock.mockImplementation(async (params: RunEmbeddedAgentParams) => {
      prompts.push(params.prompt);
      // The model ran; the turn then failed before its answer reached the transcript.
      await admitModelTurn(params);
      if (options.answered) {
        resolveActiveReplyOperationForSessionId(sessionId)?.markSourceReplyDelivered();
      }
      throw failure(sessionId);
    });
    try {
      let row: string | undefined;
      if (options.exec) {
        await withinTest(
          enqueueSessionEventForHost("Background exec completed", {
            agentId: AGENT_ID,
            sessionKey,
            source: "exec",
            sourceTurnId: `exec:${label}`,
          }).settled,
          signal,
        );
      } else {
        const produced = await enqueueContinuationReturnDeliveries({
          targetSessionKeys: [sessionKey],
          text: "delegate alpha finished",
          idempotencyKeyBase: "continuation-return:delegate alpha finished",
          wakeRecipients: true,
          childRunId: "child-run:alpha",
          recipientAgentIds: new Map([[sessionKey, AGENT_ID]]),
          ownerAgentId: AGENT_ID,
        });
        row = expectDefined(produced.deliveryIds[0], "durable return row");
        await withinTest(settleContinuationWakesForTest(), signal);
      }
      for (const event of lifecycle) {
        await persistGatewaySessionLifecycleEvent({ sessionKey, agentId: AGENT_ID, event });
      }

      const terminals = lifecycle.filter(
        (event) => event.data.phase === "end" || event.data.phase === "error",
      );
      expect(terminals).toHaveLength(1);
      observed = {
        sendText,
        prompts,
        terminal: terminals[0]?.data,
        rowPending:
          row !== undefined &&
          (await loadPendingSessionDelivery(row, captureOpenClawStateWorkerContext())) !== null,
        entry: await readSessionEntryInWorker({ agentId: AGENT_ID, sessionKey }),
      };
    } finally {
      unsubscribe();
      restoreActivePluginRegistrySnapshot(registry);
    }
  });
  return expectDefined(observed, "failed wake turn");
}

it.for([
  { form: "raw", failure: (id: string) => new SqliteTranscriptMutationConflictError(id) },
  {
    form: "replay-safe",
    failure: (id: string) =>
      new ReplaySafeTranscriptConflictError(new SqliteTranscriptMutationConflictError(id)),
  },
])(
  "yields a wake turn whose transcript loses to a newer writer ($form conflict) instead of failing it",
  async ({ form, failure }, { signal }) => {
    const turn = await failWakeTurn(`conflict-${form}`, failure, signal);

    expect(turn.prompts).toHaveLength(1);
    expect(turn.prompts[0]).toContain("delegate alpha finished");
    // D3a's visible harms: no failure copy in the room, and no interrupted run left for
    // restart recovery. A yield must keep both.
    expect(turn.sendText).not.toHaveBeenCalled();
    expect(turn.entry?.abortedLastRun).not.toBe(true);
    // D3a itself: the turn yields to the newer writer instead of settling as a failed run.
    expect(turn.entry?.status).not.toBe("failed");
    expect(turn.entry?.lastRunError).toBeUndefined();
  },
);

it("leaves the interrupted run for a non-continuation event turn that yields to a newer writer", async ({
  signal,
}) => {
  const turn = await failWakeTurn(
    "conflict-exec",
    (id) => new SqliteTranscriptMutationConflictError(id),
    signal,
    { exec: true },
  );

  expect(turn.prompts).toHaveLength(1);
  expect(turn.prompts[0]).toContain("Background exec completed");
  // The same yield, but only a continuation wake is exempt: upstream marks the next turn.
  expect(turn.terminal).toMatchObject({ aborted: true, stopReason: "superseded" });
  expect(turn.entry).toMatchObject({ status: "killed", abortedLastRun: true });
});

it("settles a wake turn that fails for any other reason as a failure, out of the room", async ({
  signal,
}) => {
  const turn = await failWakeTurn(
    "provider-failure",
    () => new Error("synthetic provider failure"),
    signal,
  );

  expect(turn.prompts).toHaveLength(1);
  // An event turn's failure stays out of the room and leaves no interrupted run.
  expect(turn.sendText).not.toHaveBeenCalled();
  expect(turn.entry?.abortedLastRun).toBe(false);
  // The run settles as failed, and the failed turn consumes the return it was woken for.
  expect(turn.terminal).toMatchObject({ phase: "error", error: "synthetic provider failure" });
  expect(turn.terminal?.aborted).toBeUndefined();
  expect(turn.entry).toMatchObject({
    status: "failed",
    lastRunError: "synthetic provider failure",
  });
  expect(turn.rowPending).toBe(false);
});

it("keeps failure settlement for a wake turn that already answered before its transcript lost", async ({
  signal,
}) => {
  const turn = await failWakeTurn(
    "conflict-answered",
    (id) => new SqliteTranscriptMutationConflictError(id),
    signal,
    { answered: true },
  );

  expect(turn.prompts).toHaveLength(1);
  // The answer already reached its source, so the turn does not yield: it settles as failed,
  // as its sibling with any other failure does, and leaves no interrupted run.
  expect(turn.terminal?.aborted).toBeUndefined();
  expect(turn.entry).toMatchObject({ status: "failed", abortedLastRun: false });
});
