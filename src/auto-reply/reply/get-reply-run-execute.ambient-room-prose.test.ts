// Frond (karmaterminal, #1415): the reply run records whether a room event is plain prose, the fact
// the ambient owner room aggregate keys on. Real context, admission and execution build the queued
// source; only the agent runner is replaced.
import { describe, expect, it, vi } from "vitest";
import type { InboundEventKind } from "../../channels/inbound-event/kind.js";
import { withTempState } from "../../channels/message/ingress-drain.test-helpers.js";
import type { SessionEntry } from "../../config/sessions.js";
import type { MsgContext } from "../templating.js";
import { parseInlineSessionDirectives } from "./directive-handling.parse.js";
import { prepareReplyRunAdmission } from "./get-reply-run-admission.js";
import { prepareReplyRunContext } from "./get-reply-run-context.js";
import { executePreparedReplyRun } from "./get-reply-run-execute.js";
import { finalizeInboundContext } from "./inbound-context.js";
import { createModelSelectionStateFixture } from "./model-selection.test-support.js";
import { prepareReplyConversation } from "./prompt-session-context.js";
import type { FollowupRun } from "./queue.js";
import { createTypingController } from "./typing.js";

const runReplyAgent = vi.hoisted(() => vi.fn());
vi.mock("../../agents/auth-profiles/session-override.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../agents/auth-profiles/session-override.js")>()),
  resolveSessionAuthSelection: vi.fn(async () => undefined),
}));
vi.mock("./get-reply-run-helpers.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./get-reply-run-helpers.js")>()),
  loadAgentRunnerRuntime: async () => ({ runReplyAgent }),
  loadSessionUpdatesRuntime: async () => ({
    ensureSkillSnapshot: async ({ sessionEntry }: { sessionEntry: SessionEntry }) => ({
      sessionEntry,
    }),
  }),
}));

/** The queued source an owner prince's Discord channel message becomes. */
async function stageOwnerMessage(
  body: string,
  kind: InboundEventKind,
  sender: Pick<MsgContext, "SenderIsBot" | "SenderAccountVerified"> = { SenderIsBot: true },
): Promise<FollowupRun> {
  return await withTempState(async (stateDir) => {
    const sessionKey = "agent:main:discord:channel:room";
    const storePath = `${stateDir}/agents/main/sessions/sessions.json`;
    const entry: SessionEntry = { sessionId: "room-session", updatedAt: 1 };
    const cfg = { session: { store: storePath } };
    const ctx = finalizeInboundContext({
      SessionKey: sessionKey,
      Provider: "discord",
      Surface: "discord",
      ChatType: "channel",
      InboundEventKind: kind,
      MessageSid: "m1",
      SenderId: "peer-a",
      ...sender,
      Body: body,
      RawBody: body,
      CommandBody: body,
      BodyStripped: body,
    });
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
        ownerList: ["peer-a"],
        senderIsOwner: true,
        isAuthorizedSender: true,
        rawBodyNormalized: body,
        commandBodyNormalized: body,
      },
      allowTextCommands: true,
      directives: parseInlineSessionDirectives(body),
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
      sessionKey,
      sessionId: entry.sessionId,
      storePath,
      sessionStore: { [sessionKey]: entry },
      workspaceDir: stateDir,
      abortedLastRun: false,
      resolvedThinkLevel: "off",
      resolvedVerboseLevel: "off",
      resolvedReasoningLevel: "off",
      resolvedElevatedLevel: "off",
      elevatedEnabled: false,
      elevatedAllowed: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
    });
    if (context.kind !== "ready") {
      throw new Error("Expected a prepared reply context");
    }
    const admission = await prepareReplyRunAdmission(context);
    if (admission.kind !== "ready") {
      throw new Error("Expected reply admission");
    }
    runReplyAgent.mockClear();
    await executePreparedReplyRun(admission, () => cfg);
    return runReplyAgent.mock.calls[0]?.[0]?.followupRun;
  });
}

describe("ambient room prose (#1415)", () => {
  it.each<[string, boolean, string, InboundEventKind]>([
    ["unaddressed prose", true, "it passes here", "room_event"],
    ["an inline directive", false, "sounds right /think high", "room_event"],
    ["a command prefix", false, "!deploy the nightly", "room_event"],
    ["an addressed request", false, "does the nightly pass?", "user_request"],
  ])("%s from an owner is ambient prose: %s", async (_, prose, body, kind) => {
    const run = await stageOwnerMessage(body, kind);
    expect(run.currentInboundEventKind).toBe(kind);
    // The owner keeps its own authority on its own run; the fact only names the text. The channel's
    // bot flag rides the run for the ambient owner peers check.
    expect(run.run).toMatchObject({
      senderIsOwner: true,
      traceAuthorized: true,
      senderIsBot: true,
    });
    expect(run.ambientRoomProse).toBe(prose);
  });
});

// Frond (karmaterminal, #1564): the queue's owner protection reads the channel's account provenance
// from the queued run, so it must ride there, and absence must stay absence.
it.each([true, undefined] as const)(
  "carries account provenance %s onto the queued run",
  async (verified) => {
    const run = await stageOwnerMessage("it passes here", "room_event", {
      SenderAccountVerified: verified,
    });
    expect(run.run.senderAccountVerified).toBe(verified);
    expect(run.run.senderIsBot).toBeUndefined();
  },
);
