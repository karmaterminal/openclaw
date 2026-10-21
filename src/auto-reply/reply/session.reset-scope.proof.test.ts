// Continuation (karmaterminal): proves reply-session reset cleanup clears only the retiring incarnation's runtime state, never another session's or agent's (shared with upstream).
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  clearEmbeddedSessionPromptStates,
  retainEmbeddedSessionPromptState,
} from "../../agents/embedded-agent-runner/session-prompt-state.js";
import type { OpenClawConfig } from "../../config/config.js";
import { testing as sessionBindingTesting } from "../../infra/outbound/session-binding-service.js";
import { withSystemEventOwner } from "../../infra/system-event-ownership.js";
import {
  enqueueSystemEvent,
  peekSystemEvents,
  resetSystemEventsForTest,
} from "../../infra/system-events.js";
import { captureSessionTarget } from "../../sessions/session-controller.lifecycle.js";
import { reserveSessionControllerSource } from "../../sessions/session-controller.mailbox.js";
import { testing as controllerTesting } from "../../sessions/session-controller.test-support.js";
import { closeOpenClawStateDatabaseAsync } from "../../state/openclaw-state-db.js";
import { initSessionState, writeSessionStore } from "./test/session.test-support.js";

const sessionInitWarn = vi.hoisted(() => vi.fn());

// Committed-reset cleanup reports best-effort failures through the session-init warn log.
vi.mock("../../logging/subsystem.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../logging/subsystem.js")>();
  return {
    ...actual,
    createSubsystemLogger: (...args: Parameters<typeof actual.createSubsystemLogger>) => {
      const logger = actual.createSubsystemLogger(...args);
      return args[0] === "session-init" ? { ...logger, warn: sessionInitWarn } : logger;
    },
  };
});

// mock-isolation: Tab cleanup is recorded without loading the browser plugin facade.
vi.mock("../../plugin-sdk/browser-maintenance.js", () => ({
  closeTrackedBrowserTabsForSessions: vi.fn(async () => 0),
}));

// mock-isolation: No global hook runner is installed, so plugin hooks never run.
vi.mock("../../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => null,
}));

// mock-isolation: Channel summaries come from the test; the real builder inspects channel plugin accounts.
vi.mock("../../infra/channel-summary.js", () => ({
  buildChannelSummary: vi.fn(async () => [] as string[]),
}));

// mock-isolation: A fixed model catalog replaces the prepared runtime catalog, which reads config and auth.
vi.mock("../../agents/prepared-model-catalog.js", () => ({
  loadProviderScopedThinkingCatalog: vi.fn(async () => []),
  readPreparedModelCatalog: vi.fn(async () => [
    { provider: "openai", id: "gpt-4o-mini", name: "GPT-4o mini" },
  ]),
}));

let suiteRoot = "";
let suiteCase = 0;
// Live prompt handles keep each projection installed until the test ends.
const promptHandles: Array<ReturnType<typeof retainEmbeddedSessionPromptState>> = [];

beforeAll(async () => {
  suiteRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-reset-scope-proof-"));
});

afterAll(async () => {
  await fs.rm(suiteRoot, { recursive: true, force: true });
});

afterEach(async () => {
  sessionInitWarn.mockReset();
  for (const handle of promptHandles.splice(0)) {
    handle[Symbol.dispose]();
  }
  clearEmbeddedSessionPromptStates(["a-session", "b-session", "c-session"]);
  controllerTesting.resetSessionControllerForTest();
  resetSystemEventsForTest();
  sessionBindingTesting.resetSessionBindingAdaptersForTests();
  await closeOpenClawStateDatabaseAsync();
});

// A is reset; B shares A's agent; C shares A's key under another agent.
const A = { agentId: "main", sessionKey: "agent:main:telegram:dm:reset-scope", id: "a-session" };
const B = { agentId: "main", sessionKey: "agent:main:telegram:dm:bystander", id: "b-session" };
const C = { agentId: "ops", sessionKey: "agent:ops:telegram:dm:reset-scope", id: "c-session" };

async function makeStorePath(): Promise<string> {
  const dir = path.join(suiteRoot, `case-${++suiteCase}`);
  await fs.mkdir(dir);
  return path.join(dir, "sessions.json");
}

/** Pending reply input, system event and prompt projection for one session. */
function seedRuntime(session: typeof A, storePath: string) {
  enqueueSystemEvent(
    `${session.id} event`,
    withSystemEventOwner({ sessionKey: session.sessionKey }, session.agentId),
  );
  const queued = reserveSessionControllerSource(session.sessionKey, {
    policy: { mode: "followup" },
    target: captureSessionTarget({
      storeScope: storePath,
      sessionKey: session.sessionKey,
      agentId: session.agentId,
    }),
  });
  const retained = retainEmbeddedSessionPromptState(session.id);
  promptHandles.push(retained);
  return { queued, promptState: retained.state };
}

function expectRetained(session: typeof A, seeded: ReturnType<typeof seedRuntime>) {
  expect(peekSystemEvents(session.sessionKey), session.sessionKey).toEqual([`${session.id} event`]);
  expect(seeded.queued.abortSignal.aborted, session.sessionKey).toBe(false);
  using current = retainEmbeddedSessionPromptState(session.id);
  expect(current.state, session.sessionKey).toBe(seeded.promptState);
}

function expectCleared(session: typeof A, seeded: ReturnType<typeof seedRuntime>) {
  expect(sessionInitWarn.mock.calls.map(([message]) => String(message))).toEqual([]);
  expect(peekSystemEvents(session.sessionKey), session.sessionKey).toEqual([]);
  expect(seeded.queued.abortSignal.aborted, session.sessionKey).toBe(true);
  using current = retainEmbeddedSessionPromptState(session.id);
  expect(current.state, session.sessionKey).not.toBe(seeded.promptState);
}

async function runTurn(params: {
  body: string;
  updatedAt: number;
  cfg?: OpenClawConfig["session"];
}) {
  const storePath = await makeStorePath();
  await writeSessionStore(storePath, {
    [A.sessionKey]: { sessionId: A.id, updatedAt: params.updatedAt },
  });
  const seeded = {
    a: seedRuntime(A, storePath),
    b: seedRuntime(B, storePath),
    c: seedRuntime(C, path.join(suiteRoot, "ops-sessions.json")),
  };
  const result = await initSessionState({
    ctx: {
      Body: params.body,
      RawBody: params.body,
      CommandBody: params.body,
      SessionKey: A.sessionKey,
    },
    cfg: { session: { store: storePath, idleMinutes: 999, ...params.cfg } } as OpenClawConfig,
  });
  return { result, seeded };
}

it("negative: a same-incarnation turn clears nothing", async () => {
  const { result, seeded } = await runTurn({ body: "hello", updatedAt: Date.now() });

  expect(result.isNewSession).toBe(false);
  expect(result.resetTriggered).toBe(false);
  expectRetained(A, seeded.a);
  expectRetained(B, seeded.b);
  expectRetained(C, seeded.c);
});

it.each(["/new", "/reset"])(
  "positive: explicit %s clears only the retiring incarnation's runtime state",
  async (body) => {
    const { result, seeded } = await runTurn({ body, updatedAt: Date.now() });

    expect(result.resetTriggered).toBe(true);
    expectCleared(A, seeded.a);
    expectRetained(B, seeded.b);
    expectRetained(C, seeded.c);
  },
);

it.each([
  {
    name: "idle rollover",
    updatedAt: Date.now() - 2 * 60 * 60_000,
    cfg: { reset: { mode: "idle" as const, idleMinutes: 30 } },
  },
  { name: "pending-reset tombstone", updatedAt: 0, cfg: {} },
])(
  "positive: replacement by $name clears only the retiring incarnation's runtime state",
  async ({ updatedAt, cfg }) => {
    const { result, seeded } = await runTurn({ body: "hello", updatedAt, cfg });

    expect(result.isNewSession).toBe(true);
    expect(result.resetTriggered).toBe(false);
    expectCleared(A, seeded.a);
    expectRetained(B, seeded.b);
    expectRetained(C, seeded.c);
  },
);
