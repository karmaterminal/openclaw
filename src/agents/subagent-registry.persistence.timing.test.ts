import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../config/config.js";
import { replaceSessionEntry } from "../config/sessions/session-accessor.js";
import "./subagents/registry/subagent-registry.persistence.mocks.test-support.js";
import type { SessionEntry } from "../config/sessions/types.js";
import { closeOpenClawStateDatabaseForTest } from "../state/openclaw-state-db.js";
import { captureEnv, setTestEnvValue } from "../test-utils/env.js";
import { cleanupSessionStateForTest } from "../test-utils/session-state-cleanup.js";
import { SUBAGENT_ENDED_REASON_KILLED } from "./subagents/registry/subagent-lifecycle-events.js";
import { resetSubagentRegistryRuntimeLoadersForTests } from "./subagents/registry/subagent-registry-deps.js";
import { persistSubagentSessionTiming } from "./subagents/registry/subagent-registry-helpers.js";
// Registers the shared gateway/agent-event vi.mock factories and owns the spies.
// This file resets and programs sharedRegistryMocks.callGateway rather than a
// `vi.mocked(callGateway)` binding of its own: the batch runs this project's 57
// files in one worker, so another file can resolve ../gateway/call.js before this
// module executes, leaving a local import bound to the real function. Holding the
// owner's spy is independent of module identity and of file order.
import { sharedRegistryMocks } from "./subagents/registry/subagent-registry.mocks.shared.js";
import {
  createCanonicalSubagentRunFixture,
  readSubagentSessionStore,
  writeSubagentSessionEntry,
} from "./subagents/registry/subagent-registry.persistence.test-support.js";
import {
  registerSubagentRun,
  resetSubagentRegistryForTests,
} from "./subagents/registry/subagent-registry.test-helpers.js";

const { announceSpy } = vi.hoisted(() => ({
  announceSpy: vi.fn(async () => "delivered" as const),
}));
// No importOriginal: loading the real announce module here drags its import graph
// in during the registry's own lazy load of it. loadSubagentAnnounceModule() is
// typed as a Pick of exactly these two exports, so this is the whole surface the
// registry reaches through that loader.
vi.mock("./subagents/announce/subagent-announce.js", () => ({
  runSubagentAnnounceFlow: announceSpy,
  captureSubagentCompletionReply: vi.fn(async () => undefined),
}));

// persistSubagentRunsToDisk is redirected to the sqlite writer, matching upstream's
// own idiom in subagent-registry.persistence.test.ts. The registry imports this
// entry point directly, so the module mock is what reaches the runtime.
vi.mock("./subagents/registry/subagent-registry-state.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./subagents/registry/subagent-registry-state.js")>();
  const { saveSubagentRegistryToSqlite: saveRegistryToSqlite } =
    await import("./subagents/registry/subagent-registry.store.sqlite.js");
  return { ...actual, persistSubagentRunsToDisk: saveRegistryToSqlite };
});

describe("subagent registry persistence timing", () => {
  const envSnapshot = captureEnv(["OPENCLAW_STATE_DIR"]);
  let tempStateDir: string | null = null;

  const writeChildSessionEntry = async (params: {
    sessionKey: string;
    sessionId?: string;
    updatedAt?: number;
  }) => {
    if (!tempStateDir) {
      throw new Error("tempStateDir not initialized");
    }
    return await writeSubagentSessionEntry({
      stateDir: tempStateDir,
      agentId: "main",
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      updatedAt: params.updatedAt,
      defaultSessionId: `sess-main-${Date.now()}`,
    });
  };

  const waitForRegistryWork = async (predicate: () => boolean | Promise<boolean>) =>
    await vi.waitFor(
      async () => {
        // The registry now reaches announce/browser-cleanup through lazy dynamic
        // imports rather than an injected object, so the completion path parks on
        // a pending import that nothing else flushes. Without this the lifecycle
        // never advances and announceSpy is never called.
        await vi.dynamicImportSettled();
        expect(await predicate()).toBe(true);
      },
      {
        interval: 1,
        timeout: 5_000,
      },
    );

  beforeEach(() => {
    setRuntimeConfigSnapshot({});
    // The shared owner's spies are module-scoped and accumulate across cases.
    sharedRegistryMocks.onAgentEvent.mockClear();
    announceSpy.mockReset();
    announceSpy.mockResolvedValue("delivered");
    sharedRegistryMocks.callGateway.mockReset();
    sharedRegistryMocks.callGateway.mockResolvedValue({
      status: "ok",
      startedAt: 111,
      endedAt: 222,
    });
  });

  afterEach(async () => {
    clearRuntimeConfigSnapshot();
    closeOpenClawStateDatabaseForTest();
    resetSubagentRegistryForTests({ persist: false });
    resetSubagentRegistryRuntimeLoadersForTests();
    await cleanupSessionStateForTest();
    if (tempStateDir) {
      await fs.rm(tempStateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      tempStateDir = null;
    }
    envSnapshot.restore();
  });

  it("persists completed subagent timing into the child session entry", async () => {
    tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-subagent-"));
    setTestEnvValue("OPENCLAW_STATE_DIR", tempStateDir);

    const now = Date.now();
    const startedAt = now;
    const endedAt = now + 500;

    const storePath = await writeChildSessionEntry({
      sessionKey: "agent:main:subagent:timing",
      sessionId: "sess-timing",
      updatedAt: startedAt - 1,
    });
    await persistSubagentSessionTiming(
      createCanonicalSubagentRunFixture({
        runId: "run-session-timing",
        childSessionKey: "agent:main:subagent:timing",
        requesterSessionKey: "agent:main:main",
        requesterDisplayKey: "main",
        task: "persist timing",
        cleanup: "keep",
        createdAt: startedAt,
        startedAt,
        sessionStartedAt: startedAt,
        accumulatedRuntimeMs: 0,
        endedAt,
        outcome: { status: "ok" },
      }),
    );

    const store = await readSubagentSessionStore(storePath);
    const persisted = store["agent:main:subagent:timing"];
    expect(persisted?.endedAt).toBe(endedAt);
    expect(persisted?.runtimeMs).toBe(500);
    expect(persisted?.status).toBe("done");
    expect(persisted?.startedAt).toBeGreaterThanOrEqual(startedAt);
    expect(persisted?.startedAt).toBeLessThanOrEqual(endedAt);
  });

  it("persists completed subagent timing through the lifecycle (registerSubagentRun → callGateway → persist)", async () => {
    tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-subagent-"));
    setTestEnvValue("OPENCLAW_STATE_DIR", tempStateDir);
    const now = Date.now();
    const startedAt = now;
    const endedAt = now + 500;
    sharedRegistryMocks.callGateway.mockResolvedValueOnce({
      status: "ok",
      startedAt,
      endedAt,
    });
    const storePath = await writeChildSessionEntry({
      sessionKey: "agent:main:subagent:timing",
      sessionId: "sess-timing",
      updatedAt: startedAt - 1,
    });
    registerSubagentRun({
      runId: "run-session-timing",
      childSessionKey: "agent:main:subagent:timing",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "persist timing",
      cleanup: "keep",
    });
    // registerSubagentRun stamps startedAt from the real clock, so bound the
    // upper edge by an observed timestamp rather than the mocked endedAt --
    // a loaded runner can take longer than the synthetic 500ms window.
    // Listener installation verified during the port: the shared owner's
    // onAgentEvent spy records the registration synchronously, so a stalled
    // lifecycle here is never "no listener installed".
    expect(sharedRegistryMocks.onAgentEvent).toHaveBeenCalled();
    const registeredBy = Date.now();
    await waitForRegistryWork(async () => {
      const store = await readSubagentSessionStore(storePath);
      return store["agent:main:subagent:timing"]?.endedAt === endedAt;
    });
    const store = await readSubagentSessionStore(storePath);
    const persisted = store["agent:main:subagent:timing"];
    expect(persisted?.endedAt).toBe(endedAt);
    expect(persisted?.runtimeMs).toBe(500);
    expect(persisted?.status).toBe("done");
    expect(persisted?.startedAt).toBeGreaterThanOrEqual(startedAt);
    expect(persisted?.startedAt).toBeLessThanOrEqual(registeredBy);
  });

  it.each([false, true])(
    "preserves session state when timing commit is denied (current=%s)",
    async (isCurrent) => {
      tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-subagent-"));
      setTestEnvValue("OPENCLAW_STATE_DIR", tempStateDir);

      const startedAt = Date.now();
      const storePath = await writeChildSessionEntry({
        sessionKey: "agent:main:subagent:stale-timing",
        sessionId: "sess-stale-timing",
        updatedAt: startedAt - 1,
      });
      const write = persistSubagentSessionTiming(
        createCanonicalSubagentRunFixture({
          runId: "run-stale-timing",
          childSessionKey: "agent:main:subagent:stale-timing",
          requesterSessionKey: "agent:main:main",
          requesterDisplayKey: "main",
          task: "do not persist stale timing",
          cleanup: "keep",
          createdAt: startedAt,
          startedAt,
          endedAt: startedAt + 500,
          outcome: { status: "ok" },
        }),
        {
          isCurrentGeneration: () => isCurrent,
          assertCommitAllowed: () => {
            throw new Error("timing commit denied");
          },
        },
      );
      if (isCurrent) {
        await expect(write).rejects.toThrow("timing commit denied");
      } else {
        await expect(write).resolves.toBeUndefined();
      }

      const persisted = (await readSubagentSessionStore(storePath))[
        "agent:main:subagent:stale-timing"
      ];
      expect(persisted).toMatchObject({
        sessionId: "sess-stale-timing",
        updatedAt: startedAt - 1,
      });
      expect(persisted?.startedAt).toBeUndefined();
      expect(persisted?.endedAt).toBeUndefined();
      expect(persisted?.status).toBeUndefined();
    },
  );

  it("does not overwrite durable completion with a provisional killed status", async () => {
    tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-subagent-"));
    setTestEnvValue("OPENCLAW_STATE_DIR", tempStateDir);

    const startedAt = Date.now();
    const completedAt = startedAt + 500;
    const storePath = await writeChildSessionEntry({
      sessionKey: "agent:main:subagent:kill-race",
      sessionId: "sess-kill-race",
      updatedAt: completedAt,
    });
    const store = await readSubagentSessionStore(storePath);
    await replaceSessionEntry({ storePath, sessionKey: "agent:main:subagent:kill-race" }, {
      ...store["agent:main:subagent:kill-race"],
      status: "done",
      startedAt,
      endedAt: completedAt,
      runtimeMs: 500,
      abortedLastRun: true,
    } as SessionEntry);

    await persistSubagentSessionTiming(
      createCanonicalSubagentRunFixture({
        runId: "run-kill-race",
        childSessionKey: "agent:main:subagent:kill-race",
        requesterSessionKey: "agent:main:main",
        requesterDisplayKey: "main",
        task: "preserve completion",
        cleanup: "keep",
        createdAt: startedAt,
        startedAt,
        endedAt: completedAt + 1,
        endedReason: SUBAGENT_ENDED_REASON_KILLED,
        outcome: { status: "error", error: "manual kill" },
      }),
    );

    const persisted = (await readSubagentSessionStore(storePath))["agent:main:subagent:kill-race"];
    expect(persisted).toMatchObject({
      status: "done",
      startedAt,
      endedAt: completedAt,
      runtimeMs: 500,
    });
    expect(persisted?.abortedLastRun).toBeUndefined();
  });
});
