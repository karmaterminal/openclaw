import path from "node:path";
import { expectDefined } from "@openclaw/normalization-core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../../../packages/gateway-protocol/src/index.js";
import { resolveUnsuffixedSqliteTargetFromSessionStorePath } from "../../config/sessions/session-sqlite-target-paths.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { closeOpenClawAgentDatabasesForTest } from "../../state/openclaw-agent-db.js";
import { createSuiteTempRootTracker } from "../../test-helpers/temp-dir.js";
import type { GatewayRequestContext, RespondFn } from "./types.js";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  deletedAgent: vi.fn(),
  latest: vi.fn(),
  live: vi.fn(),
  replace: vi.fn(),
  terminate: vi.fn(),
  send: vi.fn(),
}));
const started = { runId: "run-new", status: "started" };

// mock-isolation: Follow-up routing uses synthetic entries instead of real session stores.
vi.mock("../session-utils.js", () => ({
  prepareDeletedAgentSessionCheck: mocks.deletedAgent,
}));
// mock-isolation: Follow-up routing supplies synthetic entries without a database worker.
vi.mock("../session-utils-store-worker.js", () => ({
  loadGatewaySessionEntryReadOnlyInWorker: async (
    params: Parameters<
      typeof import("../session-utils-store-worker.js").loadGatewaySessionEntryReadOnlyInWorker
    >[0],
  ) => mocks.load(params.key, { agentId: params.agentId }),
}));
vi.mock("../../agents/subagents/registry/subagent-registry-read.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../agents/subagents/registry/subagent-registry-read.js")
  >("../../agents/subagents/registry/subagent-registry-read.js");
  return {
    ...actual,
    getLatestSubagentRunByChildSessionKey: mocks.latest,
    getLatestLiveSubagentRunByChildSessionKey: (
      ...args: Parameters<typeof actual.getLatestLiveSubagentRunByChildSessionKey>
    ) => {
      const run = mocks.live(...args);
      return run && run.childSessionKey === args[0].trim() && (!args[1] || args[1](run))
        ? run
        : null;
    },
  };
});

// mock-isolation: capture replacement without changing the shared subagent registry.
vi.mock("../../agents/subagents/registry/subagent-registry.js", () => ({
  replaceSubagentRunAfterSteerCore: mocks.replace,
}));
// mock-isolation: observe collector termination without starting cleanup work.
vi.mock("../../agents/subagents/spawn/subagent-spawn-cleanup.js", () => ({
  terminateAcceptedCollectorRun: mocks.terminate,
}));
// mock-isolation: supply send outcomes without executing external chat turns.
vi.mock("./chat-send-external-entry.js", () => ({
  handleDirectExternalChatSend: mocks.send,
}));

import { flushPendingSessionsChangedEvents } from "./session-change-event.js";
import { sessionMessagingHandlers } from "./sessions-messaging.js";

let context: GatewayRequestContext;
// The row projection resolves a store's sibling SQLite file. A shared /tmp path
// can read stale host state even when the session entry itself is mocked.
const tempRoots = createSuiteTempRootTracker({ prefix: "sessions-send-followup-" });
let fixtureRoot = "";
let fixtureStorePath = "";
let workStorePath = "";

async function send(
  params: Record<string, unknown>,
  method: "sessions.send" | "sessions.steer" = "sessions.send",
) {
  const respond = vi.fn<RespondFn>();
  const handler = expectDefined(sessionMessagingHandlers[method], method);
  await handler({
    req: { type: "req", id: method, method },
    params,
    respond,
    context,
    client: null,
    isWebchatConnect: () => false,
  });
  return respond;
}

function loadSession(
  canonicalKey: string,
  sessionId: string,
  storePath = fixtureStorePath,
  cfg: OpenClawConfig = {},
) {
  mocks.load.mockReturnValue({ cfg, canonicalKey, storePath, entry: { sessionId } });
}

function completedRun(childSessionKey: string) {
  const run = {
    runId: "run-old",
    childSessionKey,
    controllerSessionKey: "agent:main:main",
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    task: "initial task",
    cleanup: "keep" as const,
    createdAt: 1,
    execution: {
      status: "terminal" as const,
      startedAt: 2,
      endedAt: 3,
      outcome: { status: "ok" as const },
    },
  };
  mocks.latest.mockResolvedValue(run);
  mocks.live.mockReturnValue(run);
}

function respondWith(payload: unknown) {
  mocks.send.mockImplementation(async ({ respond }: { respond: RespondFn }) => {
    respond(true, payload, undefined, undefined);
  });
}

describe("sessions.send completed subagent follow-up status", () => {
  afterEach(() => flushPendingSessionsChangedEvents());
  beforeAll(async () => {
    fixtureRoot = await tempRoots.setup();
    fixtureStorePath = path.join(fixtureRoot, "sessions.json");
    workStorePath = path.join(fixtureRoot, "work", "sessions.json");
  });
  afterAll(async () => {
    closeOpenClawAgentDatabasesForTest();
    await tempRoots.cleanup();
  });

  it("resolves every fixture store path inside this suite's root", () => {
    for (const storePath of [fixtureStorePath, workStorePath]) {
      const resolved = resolveUnsuffixedSqliteTargetFromSessionStorePath(storePath).path;
      expect(resolved.startsWith(`${fixtureRoot}${path.sep}`)).toBe(true);
    }
  });

  beforeEach(() => {
    context = {
      chatRunState: { runs: new Map() },
      dedupe: new Map(),
      broadcastToConnIds: vi.fn(),
      getSessionEventSubscriberConnIds: () => new Set<string>(),
      getRuntimeConfig: () => ({}),
    } as unknown as GatewayRequestContext;
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.deletedAgent.mockReturnValue(null);
    respondWith({ ...started });
  });

  it("rejects keys belonging to a deleted agent", async () => {
    const key = "agent:deleted-agent:main";
    loadSession(key, "sess-orphan");
    mocks.deletedAgent.mockReturnValue("deleted-agent");
    const respond = await send({ key, message: "hi" });
    expect(respond).toHaveBeenCalledWith(false, undefined, {
      code: ErrorCodes.INVALID_REQUEST,
      message: 'Agent "deleted-agent" no longer exists in configuration',
    });
  });

  it("terminates a started follow-up when its completed owner cannot be replaced", async () => {
    const childSessionKey = "agent:main:subagent:followup-rejected";
    loadSession(childSessionKey, "sess-followup-rejected");
    completedRun(childSessionKey);
    mocks.replace.mockImplementationOnce(() => {
      throw new Error("database unavailable");
    });
    mocks.terminate.mockResolvedValueOnce(undefined);
    await expect(send({ key: childSessionKey, message: "follow-up" })).rejects.toThrow(
      "database unavailable",
    );
    expect(mocks.replace).toHaveBeenCalledWith(expect.objectContaining({ task: "follow-up" }));
    expect(mocks.terminate).toHaveBeenCalledWith({
      childSessionKey,
      gatewayRunId: "run-new",
      sessionCleanup: "preserve",
    });
  });

  it("steers the selected global agent with committed receipt and interrupt facts", async () => {
    const cfg = { agents: { entries: { main: {}, work: {} } } };
    context.getRuntimeConfig = () => cfg;
    loadSession("global", "sess-work-global", workStorePath, cfg);
    const payload = {
      runId: "run-work",
      status: "started",
      messageSeq: 4,
      interruptedActiveRun: true,
    };
    respondWith(payload);
    const params = {
      agentId: "work",
      message: "@Bob follow-up",
      mentions: [{ profileId: "bob", start: 0, end: 4 }],
      idempotencyKey: "run-work",
    };
    const respond = await send({ key: "global", ...structuredClone(params) }, "sessions.steer");
    expect(mocks.load).toHaveBeenCalledWith("global", { agentId: "work" });
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        params: expect.objectContaining({
          sessionKey: "global",
          ...params,
          queueMode: "interrupt",
        }),
      }),
    );
    expect(respond).toHaveBeenCalledWith(true, payload, undefined, undefined);
  });
});
