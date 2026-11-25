// Frond (karmaterminal, #1415): the turn has ended and its room chatter waits out the queue debounce.
// Real dispatch admission decides what a new arrival does meanwhile; only the reply resolver is
// replaced. An arrival that waits here keeps its channel's ingress lane, so everything behind it in
// the room waits too.
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { testing as controllerTesting } from "../../sessions/session-controller.test-support.js";
import type { RuntimeMsgContext as MsgContext } from "../templating.js";
import { createDispatcher, sessionStoreMocks } from "./dispatch-from-config.shared.test-harness.js";
import {
  describe0BeforeEach0,
  dispatchReplyFromConfig,
  globalBeforeAll0,
  setNoAbort,
} from "./dispatch-from-config.test-support.js";
import { resetInboundDedupe } from "./inbound-dedupe.js";
import { enqueueFollowupRun, scheduleFollowupDrain, type FollowupRun } from "./queue.js";
import { createQueueTestRun } from "./queue.test-helpers.js";
import { clearFollowupQueue } from "./queue/state.js";
import { buildTestCtx } from "./test-ctx.js";

beforeAll(globalBeforeAll0);
beforeEach(() => {
  describe0BeforeEach0();
  setNoAbort();
});
afterEach(() => {
  controllerTesting.resetSessionControllerForTest();
  resetInboundDedupe();
});

const KEY = "agent:main:discord:channel:room";
const PEER = { InboundEventKind: "room_event", SenderId: "peer", SenderIsBot: true } as const;

type Setup = { queued?: "room_event" | "user_request" | "internal"; mode?: "collect" | "followup" };

/** Whether an arrival reaches its reply resolver while a `queued` source waits out its debounce. */
async function arrive(
  facts: Partial<MsgContext>,
  reached: boolean,
  { queued = "room_event", mode = "collect" }: Setup = {},
) {
  const cfg: OpenClawConfig = {
    session: { store: sessionStoreMocks.resolveSessionStorePathCore() },
    commands: { ownerAllowFrom: ["discord:figs"] },
    messages: {
      groupChat: { ownerQueueProtectionAccounts: ["discord:figs"] },
      queue: { byChannel: { discord: mode }, debounceMsByChannel: { discord: 60_000 } },
    },
  };
  const runTurn = vi.fn(async (_run: FollowupRun) => {});
  const waiting = createQueueTestRun(
    {
      prompt: "waiting",
      messageId: "waiting",
      originatingChannel: "discord",
      originatingTo: "channel:room",
      originatingChatType: "channel",
      currentInboundEventKind: queued === "internal" ? undefined : queued,
    },
    {
      agentId: "main",
      sessionKey: KEY,
      messageProvider: "discord",
      senderIsBot: true,
      config: cfg,
    },
  );
  enqueueFollowupRun(KEY, waiting, { mode, debounceMs: 60_000 }, "message-id", runTurn, false);
  scheduleFollowupDrain(KEY, runTurn);
  const resolver = vi.fn(async () => undefined);
  const abort = new AbortController();
  const dispatch = dispatchReplyFromConfig({
    ctx: buildTestCtx({
      Provider: "discord",
      Surface: "discord",
      ChatType: "channel",
      From: "discord:channel:room",
      To: "channel:room",
      SessionKey: KEY,
      MessageSid: "arrival",
      ...facts,
    }),
    cfg,
    dispatcher: createDispatcher(),
    replyOptions: {
      abortSignal: abort.signal,
      turnAdoptionLifecycle: { admission: "exclusive", onAdopted() {}, abortSignal: abort.signal },
    },
    replyResolver: resolver,
  });
  try {
    if (reached) {
      await vi.waitFor(() => expect(resolver).toHaveBeenCalledOnce(), { timeout: 5_000 });
    } else {
      // Dispatch is parked behind the waiting source; a real debounce keeps it there.
      await new Promise((resolve) => {
        setTimeout(resolve, 300);
      });
      expect(resolver).not.toHaveBeenCalled();
    }
    expect(runTurn).not.toHaveBeenCalled();
  } finally {
    abort.abort();
    clearFollowupQueue(KEY);
    await Promise.allSettled([dispatch]);
  }
}

it.each<[string, Partial<MsgContext>, Setup?]>([
  ["a mention", { InboundEventKind: "user_request", SenderId: "asker" }],
  [
    "a listed account's line",
    { InboundEventKind: "room_event", SenderId: "figs", SenderAccountVerified: true },
  ],
  ["a peer bot's chatter", PEER],
  ["a guest's chatter", { InboundEventKind: "room_event", SenderId: "guest" }],
  ["chatter behind a queued request", PEER, { queued: "user_request" }],
])("%s proceeds at once while queued room input waits", async (_, facts, setup) => {
  await arrive(facts, true, setup);
});

it.each<[string, Partial<MsgContext>, Setup?]>([
  ["chatter behind an internal turn", PEER, { queued: "internal" }],
  ["chatter under configured followup", PEER, { mode: "followup" }],
  ["an internal turn", { InboundEventKind: undefined, SenderId: "asker" }],
])("%s keeps its place", async (_, facts, setup) => {
  await arrive(facts, false, setup);
});
