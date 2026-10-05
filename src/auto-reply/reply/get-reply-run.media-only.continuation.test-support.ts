// Continuation-owned runPreparedReply cases registered by get-reply-run.media-only.test.ts:
// system-event adoption (managed deliveries, recipient authority, conversation-data routing)
// and continuation-wake marking, plus the runner-call and actual-drain helpers both files share.
import { expect, it, vi, type Mock } from "vitest";
import { createUserTurnTranscriptRecorder } from "../../sessions/user-turn-transcript.js";
import { runReplyAgent } from "./agent-runner.runtime.js";
import { runPreparedReply } from "./get-reply-run.js";
import {
  recipientAuthorityCurrentMock,
  sessionSystemEventsMocks,
} from "./get-reply-run.media-only.system-events.test-support.js";
import { baseParams } from "./get-reply-run.test-support.js";
import type { PreparedFormattedSystemEvents } from "./session-system-event-adoption.js";
import {
  drainFormattedSystemEvents,
  prepareFormattedSystemEvents,
} from "./session-system-events.js";

export function requireRunReplyAgentCall(index = 0) {
  const call = vi.mocked(runReplyAgent).mock.calls.at(index)?.[0];
  if (!call) {
    throw new Error(`runReplyAgent call ${index} missing`);
  }
  return call;
}

export async function useActualSystemEventDrain() {
  const actual = await vi.importActual<typeof import("./session-system-events.js")>(
    "./session-system-events.js",
  );
  vi.mocked(drainFormattedSystemEvents).mockImplementation(actual.drainFormattedSystemEvents);
  vi.mocked(prepareFormattedSystemEvents).mockImplementation(actual.prepareFormattedSystemEvents);
}

export function registerMediaOnlyContinuationCases(resolveCurrentTurnImagesMock: Mock): void {
  const preparedState = sessionSystemEventsMocks.state;
  it("adopts managed events without a receipt when a supplied recorder is already durable", async () => {
    const acknowledge = vi.fn().mockResolvedValue(undefined);
    const restore = vi.fn();
    preparedState.prepared = {
      blocks: [
        {
          key: "session-delivery:delivery-1",
          text: "System: managed delegate artifact",
        },
      ],
      managedDeliveries: [{ id: "delivery-1", acknowledge, restore }],
    };
    const recorder = createUserTurnTranscriptRecorder({
      input: { text: "retry" },
      target: {
        sessionId: "session-id",
        sessionKey: "session-key",
        sessionEntry: undefined,
        agentId: "default",
      },
    });
    recorder.markRuntimePersisted({ role: "user", content: "retry", timestamp: Date.now() });

    await runPreparedReply(
      baseParams({
        ctx: {
          Body: "retry",
          RawBody: "retry",
          CommandBody: "retry",
          OriginatingChannel: "slack",
          OriginatingTo: "C123",
          ChatType: "group",
        },
        opts: { userTurnTranscriptRecorder: recorder },
      }),
    );

    // A staged user message cannot carry the ack id. The return is still
    // delivered in this turn and settled on adoption, never left for restart.
    const call = requireRunReplyAgentCall();
    expect(call.followupRun.currentInboundContext?.text).toContain("managed delegate artifact");
    await call.opts?.turnAdoptionLifecycle?.onAdopted();
    call.opts?.turnAdoptionLifecycle?.onSettled?.();
    expect(acknowledge).toHaveBeenCalledOnce();
    expect(restore).not.toHaveBeenCalled();
  });

  it("adopts managed events without a receipt when a supplied recorder cannot replace delivery receipts", async () => {
    const acknowledge = vi.fn().mockResolvedValue(undefined);
    const restore = vi.fn();
    preparedState.prepared = {
      blocks: [
        {
          key: "session-delivery:delivery-1",
          text: "System: managed delegate artifact",
        },
      ],
      managedDeliveries: [{ id: "delivery-1", acknowledge, restore }],
    };
    const recorder = createUserTurnTranscriptRecorder({
      input: { text: "retry" },
      target: {
        sessionId: "session-id",
        sessionKey: "session-key",
        sessionEntry: undefined,
        agentId: "default",
      },
    });
    Reflect.deleteProperty(recorder, "replaceSessionDeliveryAckIds");

    await runPreparedReply(
      baseParams({
        ctx: {
          Body: "retry",
          RawBody: "retry",
          CommandBody: "retry",
          OriginatingChannel: "slack",
          OriginatingTo: "C123",
          ChatType: "group",
        },
        opts: { userTurnTranscriptRecorder: recorder },
      }),
    );

    // A staged user message cannot carry the ack id. The return is still
    // delivered in this turn and settled on adoption, never left for restart.
    const call = requireRunReplyAgentCall();
    expect(call.followupRun.currentInboundContext?.text).toContain("managed delegate artifact");
    await call.opts?.turnAdoptionLifecycle?.onAdopted();
    call.opts?.turnAdoptionLifecycle?.onSettled?.();
    expect(acknowledge).toHaveBeenCalledOnce();
    expect(restore).not.toHaveBeenCalled();
  });

  it("removes an authority-bound event revoked during current-turn image resolution", async () => {
    const recipientAuthority = {
      state: "bound" as const,
      epoch: "11111111-1111-4111-8111-111111111111",
    };
    const authorityOwner = {
      scope: {
        agentId: "default",
        sessionKey: "session-key",
        storePath: "/tmp/sessions.json",
      },
      pending: new Map([
        [
          "event-stale",
          {
            authority: recipientAuthority,
            event: {
              id: "event-stale",
              text: "stale delegate result",
              ts: 1,
              recipientAuthority,
            },
          },
        ],
      ]),
    } satisfies NonNullable<PreparedFormattedSystemEvents["authorityOwner"]>;
    preparedState.prepared = {
      blocks: [
        {
          key: "session-delivery:delivery-stale",
          text: "System: stale delegate result",
          authorityKey: "event-stale",
        },
        { text: "System: unbound sibling event" },
        {
          key: "session-delivery:delivery-managed",
          text: "System: managed artifact event",
        },
      ],
      managedDeliveries: [
        {
          id: "delivery-stale",
          acknowledge: vi.fn().mockResolvedValue(undefined),
          authorityKey: "event-stale",
        },
        {
          id: "delivery-managed",
          acknowledge: vi.fn().mockResolvedValue(undefined),
        },
      ],
      authorityOwner,
    };
    resolveCurrentTurnImagesMock.mockImplementationOnce(async () => {
      recipientAuthorityCurrentMock.mockReturnValue(false);
      return {};
    });

    await runPreparedReply(baseParams());

    const call = requireRunReplyAgentCall();
    expect(call.followupRun.currentInboundContext?.text).not.toContain("stale delegate result");
    expect(call.followupRun.currentInboundContext?.text).toContain("unbound sibling event");
    expect(call.followupRun.currentInboundContext?.text).toContain("managed artifact event");
    expect(call.followupRun.userTurnTranscriptRecorder?.message).toMatchObject({
      __openclaw: { sessionDeliveryAckIds: ["delivery-managed"] },
    });
    expect(authorityOwner.pending.size).toBe(0);
  });

  it("preserves an authority-bound event through final prompt adoption while it remains current", async () => {
    const recipientAuthority = {
      state: "bound" as const,
      epoch: "11111111-1111-4111-8111-111111111111",
    };
    const authorityOwner = {
      scope: {
        agentId: "default",
        sessionKey: "session-key",
        storePath: "/tmp/sessions.json",
      },
      pending: new Map([
        [
          "event-current",
          {
            authority: recipientAuthority,
            event: {
              id: "event-current",
              text: "accepted delegate result",
              ts: 1,
              recipientAuthority,
            },
          },
        ],
      ]),
    } satisfies NonNullable<PreparedFormattedSystemEvents["authorityOwner"]>;
    preparedState.prepared = {
      blocks: [
        {
          key: "session-delivery:delivery-current",
          text: "System: accepted delegate result",
          authorityKey: "event-current",
        },
      ],
      managedDeliveries: [
        {
          id: "delivery-current",
          acknowledge: vi.fn().mockResolvedValue(undefined),
          authorityKey: "event-current",
        },
      ],
      authorityOwner,
    };

    await runPreparedReply(baseParams());

    const call = requireRunReplyAgentCall();
    expect(call.followupRun.currentInboundContext?.text).toContain("accepted delegate result");
    expect(call.followupRun.userTurnTranscriptRecorder?.message).toMatchObject({
      __openclaw: { sessionDeliveryAckIds: ["delivery-current"] },
    });
    expect(authorityOwner.pending.size).toBe(1);
  });

  it("returns managed events to the queue when the turn is abandoned before adoption", async () => {
    const acknowledge = vi.fn().mockResolvedValue(undefined);
    const restore = vi.fn();
    preparedState.prepared = {
      blocks: [{ key: "session-delivery:delivery-abandoned", text: "System: delegate return" }],
      managedDeliveries: [{ id: "delivery-abandoned", acknowledge, restore }],
    };

    await runPreparedReply(baseParams());

    const lifecycle = requireRunReplyAgentCall().followupRun.turnAdoptionLifecycle;
    lifecycle?.onAbandoned?.();
    lifecycle?.onSettled?.();
    expect(acknowledge).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalled();
  });

  it("acknowledges adopted managed deliveries when the runner adopts an immediate turn", async () => {
    const acknowledge = vi.fn().mockResolvedValue(undefined);
    preparedState.prepared = {
      blocks: [
        {
          key: "session-delivery:delivery-immediate",
          text: "System: delegate return ready",
        },
      ],
      managedDeliveries: [{ id: "delivery-immediate", acknowledge }],
    };

    await runPreparedReply(baseParams());

    // The runner owns adoption for a turn it runs immediately, and it reads the
    // lifecycle from opts (agent-runner-run). Persist the stamped turn as the
    // runner would, then adopt through that same lifecycle.
    const call = requireRunReplyAgentCall();
    const recorder = call.followupRun.userTurnTranscriptRecorder;
    expect(recorder?.message).toMatchObject({
      __openclaw: { sessionDeliveryAckIds: ["delivery-immediate"] },
    });
    recorder?.markRuntimePersisted(recorder.message, undefined);
    await call.opts?.turnAdoptionLifecycle?.onAdopted();

    expect(acknowledge).toHaveBeenCalledOnce();
  });

  it("marks delegate-return turns as continuation wakes and clears delegate-pending state", async () => {
    await runPreparedReply(
      baseParams({
        opts: {
          continuationTrigger: "delegate-return",
        },
      }),
    );

    const call = vi.mocked(runReplyAgent).mock.calls[0]?.[0];
    expect(call?.isContinuationWake).toBe(true);
  });

  it("marks work-wake turns as continuation wakes without clearing delegate-pending state", async () => {
    await runPreparedReply(
      baseParams({
        opts: {
          continuationTrigger: "work-wake",
        },
      }),
    );

    const call = vi.mocked(runReplyAgent).mock.calls[0]?.[0];
    expect(call?.isContinuationWake).toBe(true);
  });

  it("leaves ordinary turns unmarked as continuation wakes", async () => {
    await runPreparedReply(baseParams());

    const call = vi.mocked(runReplyAgent).mock.calls[0]?.[0];
    expect(call?.isContinuationWake).toBe(false);
  });

  it("leaves ordinary subagent-return turns unmarked as continuation wakes (chain-budget reset)", async () => {
    // An ordinary inter-session subagent completion is NOT a mid-chain wake. It
    // must NOT set isContinuationWake, otherwise the agent-runner chain-budget
    // reset gate is skipped and a stale chain count rejects every fresh
    // continuation elected from the subagent return (the doom-lock hole).
    await runPreparedReply(
      baseParams({
        opts: {
          continuationTrigger: "subagent-return",
        },
      }),
    );

    const call = vi.mocked(runReplyAgent).mock.calls[0]?.[0];
    expect(call?.isContinuationWake).toBe(false);
  });

  it("routes queued system events as conversation data without changing system context", async () => {
    vi.mocked(drainFormattedSystemEvents).mockResolvedValueOnce("System: [t] Model switched.");

    await runPreparedReply(baseParams());

    const call = requireRunReplyAgentCall();
    const context = call.followupRun.currentInboundContext;
    expect(context?.text).toContain("System: [t] Model switched.");
    expect(context?.fragments).toContainEqual({
      kind: "conversation-data",
      text: "System: [t] Model switched.",
    });
    expect(call.commandBody).toBe("[User sent media without caption]");
    expect(call.followupRun.prompt).toBe("[User sent media without caption]");
    expect(call.transcriptCommandBody).not.toContain("System: [t] Model switched.");
    expect(call.followupRun.run.extraSystemPrompt ?? "").not.toContain("Runtime System Events");
  });
}
