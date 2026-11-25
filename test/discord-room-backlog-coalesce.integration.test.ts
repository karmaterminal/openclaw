// Frond (karmaterminal, #1415): a room backlog behind a busy turn. Discord gateway frames from many
// senders, most of them replies to different messages, pass Discord's real message context, the real
// reply context, admission and execution, real durable ingress and the session mailbox; only the
// agent runner and the Discord transport are replaced. The sources queue while the room's turn runs;
// its end admits the whole ambient backlog as one turn, behind the mention and the principal.
import { GatewayDispatchEvents, MessageType } from "discord-api-types/v10";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDiscordMessageContextFixture } from "../extensions/discord/test-api.js";
import { parseInlineSessionDirectives } from "../src/auto-reply/reply/directive-handling.parse.js";
import { prepareReplyRunAdmission } from "../src/auto-reply/reply/get-reply-run-admission.js";
import { prepareReplyRunContext } from "../src/auto-reply/reply/get-reply-run-context.js";
import { executePreparedReplyRun } from "../src/auto-reply/reply/get-reply-run-execute.js";
import { finalizeInboundContext } from "../src/auto-reply/reply/inbound-context.js";
import { createModelSelectionStateFixture } from "../src/auto-reply/reply/model-selection.test-support.js";
import { prepareReplyConversation } from "../src/auto-reply/reply/prompt-session-context.js";
import {
  enqueueFollowupRun,
  scheduleFollowupDrain,
  type FollowupRun,
} from "../src/auto-reply/reply/queue.js";
import {
  expectSettledOnce,
  openRoomIngress,
  type Harness,
} from "../src/auto-reply/reply/queue.room-event-collect.test-support.js";
import { installQueueRuntimeErrorSilencer } from "../src/auto-reply/reply/queue.test-helpers.js";
import { clearFollowupQueue, getExistingFollowupQueue } from "../src/auto-reply/reply/queue/state.js";
import {
  bindReplySourceToFollowup,
  prepareReplySourceInput,
} from "../src/auto-reply/reply/reply-source-binding.js";
import { createTypingController } from "../src/auto-reply/reply/typing.js";
import type { InboundEventKind } from "../src/channels/inbound-event/kind.js";
import {
  bindIngressLifecycleToReplyOptions,
  type ChannelIngressDispatchLifecycle,
} from "../src/channels/message/ingress-drain-lifecycle.js";
import { withTempState } from "../src/channels/message/ingress-drain.test-helpers.js";
import type { SessionEntry } from "../src/config/sessions.js";
import type { OpenClawConfig } from "../src/config/types.openclaw.js";
import { createReplyOperation } from "../src/sessions/session-controller.js";
import { testing as controllerTesting } from "../src/sessions/session-controller.test-support.js";

const runReplyAgent = vi.hoisted(() => vi.fn());
vi.mock("../src/agents/auth-profiles/session-override.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/agents/auth-profiles/session-override.js")>()),
  resolveSessionAuthSelection: vi.fn(async () => undefined),
}));
vi.mock("../src/auto-reply/reply/get-reply-run-helpers.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/auto-reply/reply/get-reply-run-helpers.js")>()),
  loadAgentRunnerRuntime: async () => ({ runReplyAgent }),
  loadEmbeddedAgentRuntime: async () => ({
    resolveActiveEmbeddedRunSessionIdBySessionFile: (
      await import("../src/agents/embedded-agent-runner/runs.js")
    ).resolveActiveEmbeddedRunSessionIdBySessionFile,
    resolveActiveEmbeddedRunBySessionFile: (
      await import("../src/agents/embedded-agent-runner/runs.js")
    ).resolveActiveEmbeddedRunBySessionFile,
  }),
  loadSessionUpdatesRuntime: async () => ({
    ensureSkillSnapshot: async ({ sessionEntry }: { sessionEntry: SessionEntry }) => ({
      sessionEntry,
    }),
  }),
}));

installQueueRuntimeErrorSilencer();
afterEach(() => controllerTesting.resetSessionControllerForTest());

const SESSION_KEY = "agent:main:discord:channel:room";
const CHANNEL_ID = "room";

type Line = {
  /** A snowflake: arrival order. */
  id: string;
  author: { id: string; name: string; bot?: true; owner?: true };
  text: string;
  /** The message this one quotes, as Discord's reply button sends it. */
  replyTo?: string;
  kind?: InboundEventKind;
};

const FIGS = { id: "9001", name: "figs", owner: true } as const;
const PEER_A = { id: "7001", name: "peer-a", bot: true, owner: true } as const;
const PEER_B = { id: "7002", name: "peer-b", bot: true, owner: true } as const;
const PEER_C = { id: "7003", name: "peer-c", bot: true, owner: true } as const;
const GUEST = { id: "8001", name: "guest" } as const;
const OTHER = { id: "8002", name: "other" } as const;

const FLEET: OpenClawConfig = {
  channels: { discord: { replyToMode: "batched" } },
  messages: {
    queue: {
      mode: "steer",
      byChannel: { discord: "collect" },
      debounceMsByChannel: { discord: 0 },
      cap: 50,
      drop: "summarize",
    },
    groupChat: {
      unmentionedInbound: "room_event",
      ambientOwnerAggregate: true,
      ambientOwnerAggregatePeers: [PEER_A, PEER_B, PEER_C].map(({ id }) => `discord:${id}`),
    },
  },
};

/** The queued source one Discord frame becomes: Discord's context, then core's reply run. */
async function stageDiscordLine(params: {
  stateDir: string;
  config: OpenClawConfig;
  line: Line;
  lifecycle: ChannelIngressDispatchLifecycle;
}): Promise<FollowupRun> {
  const { line, stateDir } = params;
  const { mapGatewayDispatchData, createBaseDiscordMessageContext, buildDiscordMessageProcessContext } =
    await loadDiscordMessageContextFixture();
  const storePath = `${stateDir}/agents/main/sessions/sessions.json`;
  const cfg: OpenClawConfig = { ...params.config, session: { store: storePath } };
  const kind = line.kind ?? "room_event";
  const { message, author } = mapGatewayDispatchData(
    { rest: {} } as never,
    GatewayDispatchEvents.MessageCreate,
    {
      id: line.id,
      channel_id: CHANNEL_ID,
      guild_id: "g1",
      timestamp: new Date(Number(line.id)).toISOString(),
      type: line.replyTo ? MessageType.Reply : MessageType.Default,
      content: line.text,
      attachments: [],
      author: {
        id: line.author.id,
        username: line.author.name,
        discriminator: "0",
        global_name: null,
        avatar: null,
        ...(line.author.bot ? { bot: true } : {}),
      },
      ...(line.replyTo
        ? { message_reference: { channel_id: CHANNEL_ID, message_id: line.replyTo } }
        : {}),
    } as never,
  ) as { message: unknown; author: unknown };
  const discord = await createBaseDiscordMessageContext(
    {
      cfg,
      inboundEventKind: kind,
      replyToMode: "batched",
      message,
      author,
      sender: {
        id: line.author.id,
        label: line.author.name,
        name: line.author.name,
        isPluralKit: false,
      },
      messageChannelId: CHANNEL_ID,
      baseText: line.text,
      messageText: line.text,
      shouldRequireMention: false,
      effectiveWasMentioned: kind === "user_request",
      baseSessionKey: SESSION_KEY,
      route: {
        agentId: "main",
        channel: "discord",
        accountId: "default",
        sessionKey: SESSION_KEY,
        mainSessionKey: "agent:main:main",
      },
    },
    { storePath },
  );
  const built = await buildDiscordMessageProcessContext({
    ctx: discord,
    text: line.text,
    mediaList: [],
  });
  if (!built) {
    throw new Error("Expected a Discord message context");
  }
  const ctx = finalizeInboundContext({
    ...built.ctxPayload,
    BodyStripped: built.ctxPayload.BodyForAgent,
  });
  const entry: SessionEntry = { sessionId: "room-session", updatedAt: 1 };
  // Dispatch reserves the physical source before preparation (reply-source-binding).
  const source = await prepareReplySourceInput(
    ctx,
    cfg,
    bindIngressLifecycleToReplyOptions(params.lifecycle),
  );
  const context = await prepareReplyRunContext({
    ctx,
    sessionCtx: ctx,
    conversation: prepareReplyConversation({ ctx, sessionEntry: entry }),
    sessionEntry: entry,
    cfg,
    agentId: "main",
    agentDir: `${stateDir}/agents/main/agent`,
    agentCfg: {},
    sessionCfg: {},
    commandAuthorized: true,
    command: {
      surface: "discord",
      channel: "discord",
      ownerList: line.author.owner ? [line.author.id] : [],
      senderId: line.author.id,
      senderIsOwner: line.author.owner === true,
      isAuthorizedSender: true,
      rawBodyNormalized: line.text,
      commandBodyNormalized: line.text,
    },
    allowTextCommands: true,
    directives: parseInlineSessionDirectives(line.text),
    defaultActivation: "always",
    modelState: createModelSelectionStateFixture({
      agentCfg: {},
      provider: "anthropic",
      model: "claude",
    }),
    provider: "anthropic",
    model: "claude",
    typing: createTypingController({}),
    defaultModel: "claude",
    timeoutMs: 30_000,
    isNewSession: false,
    resetTriggered: false,
    systemSent: true,
    sessionKey: SESSION_KEY,
    sessionId: entry.sessionId,
    storePath,
    sessionStore: { [SESSION_KEY]: entry },
    workspaceDir: "/tmp",
    abortedLastRun: false,
    resolvedThinkLevel: "off",
    resolvedVerboseLevel: "off",
    resolvedReasoningLevel: "off",
    resolvedElevatedLevel: "off",
    elevatedEnabled: false,
    elevatedAllowed: false,
    blockStreamingEnabled: false,
    resolvedBlockStreamingBreak: "message_end",
    opts: source.options,
  });
  if (context.kind !== "ready") {
    throw new Error("Expected a prepared reply context");
  }
  const admission = await prepareReplyRunAdmission(context);
  if (admission.kind !== "ready") {
    throw new Error("Expected reply admission");
  }
  // Configured collect queues behind the active turn: nothing steers it.
  expect(admission).toMatchObject({ shouldSteer: false, isActive: true });
  runReplyAgent.mockClear();
  await executePreparedReplyRun(admission, () => cfg);
  const run: FollowupRun = runReplyAgent.mock.calls[0]?.[0]?.followupRun;
  // The same publication runReplyAgent performs for an active-run follow-up.
  bindReplySourceToFollowup(source.options, run);
  expect(
    enqueueFollowupRun(
      admission.queueKey,
      run,
      admission.resolvedQueue,
      "message-id",
      undefined,
      false,
    ),
  ).toBe(true);
  return run;
}

/** The lines arrive while the room's turn runs; its end drains the mailbox. */
async function drainBacklog(
  lines: readonly Line[],
  check: (harness: Harness) => void | Promise<void>,
  config = FLEET,
) {
  await withTempState(async (stateDir) => {
    const active = createReplyOperation({
      sessionKey: SESSION_KEY,
      sessionId: "room-session",
      resetTriggered: false,
    });
    active.setPhase("running");
    const byId = new Map(lines.map((line) => [line.id, line]));
    const harness = await openRoomIngress(
      stateDir,
      lines.map(({ id }) => ({ id })),
      {
        enqueue: (row, lifecycle) =>
          stageDiscordLine({ stateDir, config, line: byId.get(row.id)!, lifecycle }),
      },
    );
    try {
      await harness.dispatchRows();
      active.complete();
      const settlements = (getExistingFollowupQueue(SESSION_KEY)?.entries ?? []).map(
        (input) => input.settlement.promise,
      );
      expect(settlements).toHaveLength(lines.length);
      scheduleFollowupDrain(SESSION_KEY, harness.adoptAndRecord);
      await Promise.allSettled(settlements);
      await harness.drain.waitForIdle();
      await check(harness);
      await expectSettledOnce(
        harness,
        lines.map((line) => line.id),
      );
    } finally {
      active.complete();
      clearFollowupQueue(SESSION_KEY);
      harness.dispose();
    }
  });
}

/** One turn names every line's author, in order, with its text. */
function expectCarries(run: FollowupRun | undefined, lines: readonly Line[]) {
  const prompt = run?.prompt ?? "";
  expect(prompt.startsWith("[Queued messages while agent was busy]")).toBe(true);
  const at = lines.map((line, index) => {
    const label = `Queued #${index + 1} (from ${line.author.name})`;
    expect(prompt).toContain(label);
    expect(prompt.slice(prompt.indexOf(label))).toContain(line.text);
    return prompt.indexOf(line.text);
  });
  expect(at).toEqual(at.toSorted((left, right) => left - right));
  expect(prompt).not.toContain(`Queued #${lines.length + 1}`);
  expect(run?.controllerClaim?.sources.map((item) => item.messageId)).toEqual(
    lines.map((line) => line.id),
  );
}

describe("a Discord room backlog behind a busy turn (#1415)", () => {
  // A live room: most lines quote a message, each a different one (ronan, 2026-11-25: 20 claimed
  // rows, 10 of them replies to 7 distinct messages).
  const room: Line[] = [
    { id: "1001", author: PEER_A, text: "it passes here" },
    { id: "1002", author: PEER_B, text: "green for me too", replyTo: "1000" },
    { id: "1003", author: GUEST, text: "same on arm", replyTo: "1001" },
    { id: "1004", author: PEER_C, text: "confirmed", replyTo: "1002" },
    { id: "1005", author: PEER_A, text: "the docs job too", replyTo: "1003" },
    { id: "1006", author: OTHER, text: "mine is still running" },
  ];

  it("admits every ambient line as one turn, whatever message each one quotes", async () => {
    await drainBacklog(room, (harness) => {
      const keys = room.map(({ id }) => harness.runs.get(id)?.originatingReplyToId);
      expect(keys).toEqual([undefined, "1000", "1001", "1002", "1003", undefined]);
      expect(harness.calls).toHaveLength(1);
      expectCarries(harness.calls[0], room);
    });
  });

  it("runs the principal and a mention first, in order, then one ambient turn", async () => {
    const lines: Line[] = [
      ...room.slice(0, 2),
      { id: "10021", author: FIGS, text: "also check the arm runner" },
      ...room.slice(2, 4).map((line, index) => ({ ...line, id: `1003${index}` })),
      {
        id: "10040",
        author: PEER_B,
        text: "can you look at the arm job?",
        replyTo: "1000",
        kind: "user_request",
      },
      { id: "10041", author: OTHER, text: "mine is still running" },
    ];
    const first = lines.filter((line) => line.author === FIGS || line.kind === "user_request");
    const ambient = lines.filter((line) => !first.includes(line));
    await drainBacklog(lines, (harness) => {
      expect(harness.calls).toHaveLength(3);
      // Each first-class line keeps its own run and its own authority.
      expect(harness.calls.slice(0, 2)).toEqual(first.map(({ id }) => harness.runs.get(id)));
      expect(harness.calls[0]?.run).toMatchObject({ senderId: FIGS.id, senderIsOwner: true });
      expect(harness.calls[1]?.originatingReplyToId).toBe("1000");
      expectCarries(harness.calls[2], ambient);
    });
  });
});
