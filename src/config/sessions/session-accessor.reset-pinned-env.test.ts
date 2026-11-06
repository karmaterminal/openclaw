import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import {
  loadSessionEntry,
  resetSessionEntryLifecycle,
  upsertSessionEntryCore,
} from "./session-accessor.js";
import { prepareMessageCutLocalWorkspace } from "./session-message-cut-local-workspace.js";
import type { InternalSessionEntry } from "./types.js";

// mock-isolation: The entry the pre-reset read returned reaches this owner; nothing is cut.
vi.mock("./session-message-cut-local-workspace.js", () => ({
  prepareMessageCutLocalWorkspace: vi.fn(async () => undefined),
}));

const agentId = "main";
const sessionKey = "agent:main:pinned-reset";
const interrupted = {
  localWorkspaceHandoff: { fromSessionId: "cut" },
} as unknown as Partial<InternalSessionEntry>;

function reset(env: NodeJS.ProcessEnv, storePath: string) {
  return resetSessionEntryLifecycle({
    agentId,
    env,
    storePath,
    target: { canonicalKey: sessionKey, storeKeys: [sessionKey] },
    buildNextEntry: () => ({ sessionId: "after-reset", updatedAt: 2 }),
  });
}

beforeEach(() => {
  vi.mocked(prepareMessageCutLocalWorkspace).mockClear();
});

it("reads a shared locator's entry from the store the pinned env names", () =>
  withOpenClawTestState({ scenario: "minimal" }, async (state) => {
    const env = { ...process.env, OPENCLAW_STATE_DIR: state.path("fork-root") };
    const storePath = state.path("shared/sessions.json");
    const scope = { agentId, env, sessionKey, storePath };
    await upsertSessionEntryCore(scope, { sessionId: "fork", updatedAt: 1, ...interrupted });

    await reset(env, storePath);

    expect(
      vi.mocked(prepareMessageCutLocalWorkspace).mock.calls.map(([, entry]) => entry.sessionId),
    ).toEqual(["fork"]);
  }));

it("refuses a store outside the pinned env before the read's entry is used", () =>
  withOpenClawTestState({ scenario: "minimal" }, async (state) => {
    const env = { ...process.env, OPENCLAW_STATE_DIR: state.path("fork-root") };
    const storePath = path.join(state.sessionsDir(), "sessions.json");
    const ambient = { agentId, sessionKey, storePath };
    await upsertSessionEntryCore(ambient, { sessionId: "ambient", updatedAt: 1, ...interrupted });

    await expect(reset(env, storePath)).rejects.toThrow("belongs to another shared-state database");

    expect(prepareMessageCutLocalWorkspace).not.toHaveBeenCalled();
    expect(loadSessionEntry(ambient)?.sessionId).toBe("ambient");
  }));
