// Continuation (karmaterminal): proves reply admission promotes only turn-owned queued system events, once and in order, consumes only a producer-owned turn's captured selection, and leaves them queued when a claim or abort lands before promotion.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import { withSystemEventOwner } from "../../infra/system-event-ownership.js";
import {
  claimSystemEventTurn,
  enqueueSystemEvent,
  enqueueSystemEventEntry,
  isSystemEventTurnOwned,
  peekSystemEventEntries,
  resetSystemEventsForTest,
  type SystemEvent,
} from "../../infra/system-events.js";
import type { runReplyAgent } from "./agent-runner-run.js";
import { parseInlineSessionDirectives } from "./directive-handling.parse.js";
import { prepareReplyRunAdmission } from "./get-reply-run-admission.js";
import { prepareReplyRunContext } from "./get-reply-run-context.js";
import { executePreparedReplyRun } from "./get-reply-run-execute.js";
import { finalizeInboundContext } from "./inbound-context.js";
import { createModelSelectionStateFixture } from "./model-selection.test-support.js";
import { prepareReplyConversation } from "./prompt-session-context.js";
import { withReplySystemEventContext } from "./system-event-session-key.js";
import { createTypingController } from "./typing.js";

type RunReplyAgentParams = Parameters<typeof runReplyAgent>[0];
const runReplyAgentMock = vi.hoisted(() =>
  vi.fn(async (_params: unknown): Promise<{ text: string } | undefined> => ({ text: "ok" })),
);

// Credential edge: no auth profile store is involved in queue promotion.
vi.mock("../../agents/auth-profiles/session-override.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../agents/auth-profiles/session-override.js")>()),
  resolveSessionAuthSelection: vi.fn(async () => undefined),
}));
// The agent runner (model loop) is the edge; the runtime loaders stay light.
vi.mock("./get-reply-run-helpers.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./get-reply-run-helpers.js")>()),
  loadAgentRunnerRuntime: async () => ({ runReplyAgent: runReplyAgentMock }),
  loadEmbeddedAgentRuntime: async () => ({
    preemptAndDrainEmbeddedHeartbeatRun: async () => "not-heartbeat",
    resolveActiveEmbeddedRunBySessionFile: () => undefined,
  }),
  loadSessionUpdatesRuntime: async () => ({
    ensureSkillSnapshot: async ({ sessionEntry }: { sessionEntry: SessionEntry }) => ({
      sessionEntry,
    }),
  }),
}));

const STORE_PATH = "/tmp/agent/sessions/sessions.json";

async function prepareTurn(input: {
  sessionKey: string;
  opts?: Record<string, unknown>;
  body?: string;
}) {
  const body = input.body ?? "check the queue";
  const ctx = finalizeInboundContext({
    SessionKey: input.sessionKey,
    Provider: "slack",
    ChatType: "channel",
    Body: body,
    RawBody: body,
    CommandBody: body,
    BodyStripped: body,
  });
  const entry: SessionEntry = { sessionId: "proof-session", updatedAt: 1 };
  const params: Parameters<typeof prepareReplyRunContext>[0] = {
    ctx,
    sessionCtx: ctx,
    conversation: prepareReplyConversation({ ctx, sessionEntry: entry }),
    sessionEntry: entry,
    cfg: {},
    agentId: "main",
    agentDir: "/tmp/agent",
    agentCfg: {},
    sessionCfg: {},
    commandAuthorized: true,
    command: {
      surface: "slack",
      channel: "slack",
      ownerList: [],
      senderIsOwner: false,
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
    sessionKey: input.sessionKey,
    sessionId: entry.sessionId,
    storePath: STORE_PATH,
    sessionStore: { [input.sessionKey]: entry },
    workspaceDir: "/tmp/workspace",
    abortedLastRun: false,
    resolvedThinkLevel: "off",
    resolvedVerboseLevel: "off",
    resolvedReasoningLevel: "off",
    resolvedElevatedLevel: "off",
    elevatedEnabled: false,
    elevatedAllowed: false,
    blockStreamingEnabled: false,
    resolvedBlockStreamingBreak: "message_end",
    ...(input.opts ? { opts: input.opts as never } : {}),
  };
  const context = await prepareReplyRunContext(params);
  if (context.kind !== "ready") {
    throw new Error("Expected a prepared reply context");
  }
  return context;
}

async function admit(context: Awaited<ReturnType<typeof prepareTurn>>) {
  const admission = await prepareReplyRunAdmission(context);
  if (admission.kind !== "ready") {
    throw new Error("Expected a ready reply admission");
  }
  return admission;
}

async function runTurn(input: Parameters<typeof prepareTurn>[0]) {
  const admission = await admit(await prepareTurn(input));
  return await executePreparedReplyRun(admission, () => ({}));
}

function lastRun(): RunReplyAgentParams {
  const params = runReplyAgentMock.mock.calls.at(-1)?.[0];
  if (!params) {
    throw new Error("Expected a runReplyAgent call");
  }
  return params as RunReplyAgentParams;
}

/** Every model-facing and transcript-facing text the runner received for this turn. */
function promptSurfaces(run: RunReplyAgentParams) {
  return {
    context: run.followupRun.currentInboundContext?.text ?? "",
    user: [run.commandBody, run.followupRun.prompt, run.followupRun.transcriptPrompt ?? ""],
  };
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

beforeEach(() => {
  resetSystemEventsForTest();
  runReplyAgentMock.mockClear();
});

afterEach(() => {
  resetSystemEventsForTest();
});

describe("reply admission system-event promotion", () => {
  it("promotes route then session events exactly once, in queue order, as context only", async () => {
    const routeKey = "agent:main:slack:channel:c123";
    const sessionKey = `${routeKey}:thread:1.2`;
    const texts = ["ROUTE-ONE", "ROUTE-TWO", "SESSION-ONE", "SESSION-TWO"];
    enqueueSystemEvent(texts[0]!, { sessionKey: routeKey });
    enqueueSystemEvent(texts[1]!, { sessionKey: routeKey });
    enqueueSystemEvent(texts[2]!, { sessionKey });
    enqueueSystemEvent(texts[3]!, { sessionKey });

    await runTurn({ sessionKey, opts: withReplySystemEventContext({}, { sessionKey: routeKey }) });

    expect(runReplyAgentMock).toHaveBeenCalledOnce();
    const { context, user } = promptSurfaces(lastRun());
    for (const text of texts) {
      expect(occurrences(context, text)).toBe(1);
      for (const surface of user) {
        expect(surface).not.toContain(text);
      }
    }
    const positions = texts.map((text) => context.indexOf(text));
    expect(positions).toEqual([...positions].toSorted((a, b) => a - b));
    expect(peekSystemEventEntries(routeKey)).toEqual([]);
    expect(peekSystemEventEntries(sessionKey)).toEqual([]);

    // A second turn finds nothing left to promote: no event is promoted twice.
    await runTurn({ sessionKey, opts: withReplySystemEventContext({}, { sessionKey: routeKey }) });
    const second = promptSurfaces(lastRun()).context;
    for (const text of texts) {
      expect(second).not.toContain(text);
    }
  });

  // Upstream retired the heartbeat "drop" action and its captured-selection plumbing (#180192,
  // #180563). The selection contract that survives is the producer-owned (event) turn's.
  it("consumes only a producer-owned turn's captured selection; a later passive event waits for the next ordinary turn", async () => {
    const sessionKey = "agent:main:proof-producer";
    enqueueSystemEvent("SELECTED-ONE", { sessionKey });
    enqueueSystemEvent("SELECTED-TWO", { sessionKey });
    const captured = peekSystemEventEntries(sessionKey);
    enqueueSystemEvent("LATE-PASSIVE", { sessionKey });

    await runTurn({
      sessionKey,
      opts: withReplySystemEventContext(
        { internalEventExecution: { onStarted: () => {}, onTerminal: () => {} } },
        { sessionKey, events: captured },
      ),
    });

    const context = promptSurfaces(lastRun()).context;
    expect(occurrences(context, "SELECTED-ONE")).toBe(1);
    expect(occurrences(context, "SELECTED-TWO")).toBe(1);
    expect(context.indexOf("SELECTED-ONE")).toBeLessThan(context.indexOf("SELECTED-TWO"));
    expect(context).not.toContain("LATE-PASSIVE");
    expect(peekSystemEventEntries(sessionKey).map((event) => event.text)).toEqual(["LATE-PASSIVE"]);

    // The next ordinary turn reads the live queue and adopts the passive event, once.
    await runTurn({ sessionKey });
    const next = promptSurfaces(lastRun()).context;
    expect(occurrences(next, "LATE-PASSIVE")).toBe(1);
    expect(next).not.toContain("SELECTED-");
    expect(peekSystemEventEntries(sessionKey)).toEqual([]);
  });

  it("admits only the prepared agent's unclaimed events; foreign and turn-owned ones stay queued", async () => {
    const own = enqueueSystemEventEntry(
      "OWN-UNCLAIMED",
      withSystemEventOwner({ sessionKey: "global" }, "main"),
    );
    const claimed = enqueueSystemEventEntry(
      "OWN-CLAIMED",
      withSystemEventOwner({ sessionKey: "global" }, "main"),
    );
    enqueueSystemEvent("FOREIGN-AGENT", withSystemEventOwner({ sessionKey: "global" }, "beta"));
    expect(own).toBeTruthy();
    const cancel = vi.fn();
    const owner = claimSystemEventTurn("agent:main:global", [claimed!], cancel, "main");
    expect(owner).toBeDefined();

    try {
      await runTurn({ sessionKey: "global" });

      const context = promptSurfaces(lastRun()).context;
      expect(occurrences(context, "OWN-UNCLAIMED")).toBe(1);
      expect(context).not.toContain("OWN-CLAIMED");
      expect(context).not.toContain("FOREIGN-AGENT");
      const mainQueue = peekSystemEventEntries("agent:main:global");
      expect(mainQueue.map((event) => event.text)).toEqual(["OWN-CLAIMED"]);
      expect(isSystemEventTurnOwned("agent:main:global", mainQueue[0]!)).toBe(true);
      expect(peekSystemEventEntries("agent:beta:global").map((event) => event.text)).toEqual([
        "FOREIGN-AGENT",
      ]);
      expect(cancel).not.toHaveBeenCalled();
    } finally {
      owner?.release();
    }
  });

  it.each(["competing claim", "competing reply turn"] as const)(
    "gives an event to exactly one owner when a %s lands between admission and promotion",
    async (competitor) => {
      const sessionKey = "agent:main:proof-race";
      const event = enqueueSystemEventEntry("RACED-EVENT", { sessionKey }) as SystemEvent;
      const admission = await admit(await prepareTurn({ sessionKey }));
      // Where the queue stands once admission returns decides which owner may win.
      const promotedAtAdmission = peekSystemEventEntries(sessionKey).length === 0;

      let competitorPrompt = "";
      const cancel = vi.fn();
      const claim =
        competitor === "competing claim"
          ? claimSystemEventTurn(sessionKey, [event], cancel, "main")
          : undefined;
      if (competitor === "competing reply turn") {
        await runTurn({ sessionKey, body: "competing turn" });
        competitorPrompt = promptSurfaces(lastRun()).context;
      }
      const claimedByCompetitor =
        competitor === "competing claim"
          ? claim !== undefined
          : competitorPrompt.includes("RACED-EVENT");
      try {
        await executePreparedReplyRun(admission, () => ({}));
        const ownPrompt = promptSurfaces(lastRun()).context;

        expect(claimedByCompetitor).toBe(!promotedAtAdmission);
        expect(occurrences(ownPrompt, "RACED-EVENT")).toBe(promotedAtAdmission ? 1 : 0);
        expect(occurrences(competitorPrompt, "RACED-EVENT")).toBe(
          competitor === "competing reply turn" && !promotedAtAdmission ? 1 : 0,
        );
        // A claim keeps its occurrence queued for its own start; a turn consumes it.
        expect(peekSystemEventEntries(sessionKey).map((entry) => entry.text)).toEqual(
          claim ? ["RACED-EVENT"] : [],
        );
        expect(cancel).not.toHaveBeenCalled();
      } finally {
        claim?.release();
      }
    },
  );

  it("leaves queued events in place when the turn aborts after admission, before promotion", async () => {
    const sessionKey = "agent:main:proof-abort";
    enqueueSystemEvent("ABORTED-ONE", { sessionKey });
    enqueueSystemEvent("ABORTED-TWO", { sessionKey });
    const abort = new AbortController();
    const admission = await admit(
      await prepareTurn({ sessionKey, opts: { abortSignal: abort.signal } }),
    );
    const queuedAfterAdmission = peekSystemEventEntries(sessionKey).map((event) => event.text);

    abort.abort(new Error("turn aborted before hand-off"));
    const outcome = await executePreparedReplyRun(admission, () => ({})).then(
      () => "resolved",
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );

    // One object so a failing run shows every facet of what happened.
    expect({
      outcome,
      queuedAfterAdmission,
      runnerCalls: runReplyAgentMock.mock.calls.length,
      queuedAfterAbort: peekSystemEventEntries(sessionKey).map((event) => event.text),
    }).toEqual({
      outcome: "turn aborted before hand-off",
      queuedAfterAdmission: ["ABORTED-ONE", "ABORTED-TWO"],
      runnerCalls: 0,
      queuedAfterAbort: ["ABORTED-ONE", "ABORTED-TWO"],
    });
  });
});
