// Subagent registry persistence tests cover SQLite registry restore, child
// session timing writes, and restart cleanup behavior.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./subagents/registry/subagent-registry.mocks.shared.js";
import "./subagents/registry/subagent-registry.persistence.mocks.test-support.js";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../config/config.js";
import { callGateway } from "../gateway/call.js";
import { onAgentEvent } from "../infra/agent-events.js";
import { closeOpenClawStateDatabaseForTest } from "../state/openclaw-state-db.js";
import { resolveOpenClawStateSqlitePath } from "../state/openclaw-state-db.paths.js";
import {
  captureEnv,
  deleteTestEnvValue,
  setTestEnvValue,
  withEnvAsync,
} from "../test-utils/env.js";
import { cleanupSessionStateForTest } from "../test-utils/session-state-cleanup.js";
import {
  loadSubagentRegistryFromSqlite,
  saveSubagentRegistryToSqlite,
} from "./subagents/registry/subagent-registry-state.fixture.test-support.js";
import { activateSubagentPersistenceRegistry } from "./subagents/registry/subagent-registry.persistence-fixture.test-support.js";
import {
  canonicalSubagentRunFixtures,
  settleSubagentRegistryPersistenceWork,
  writeSubagentSessionEntry,
} from "./subagents/registry/subagent-registry.persistence.test-support.js";
import {
  activateSubagentRegistry,
  getLatestSubagentRunByChildSessionKey,
  getSubagentRunByChildSessionKey,
  initSubagentRegistry,
  listSubagentRunsForRequester,
  resetSubagentRegistryForTests,
} from "./subagents/registry/subagent-registry.test-helpers.js";
import type { SubagentRunRecord } from "./subagents/registry/subagent-registry.types.js";

const { announceSpy } = vi.hoisted(() => ({
  announceSpy: vi.fn(async () => "delivered" as const),
}));
// mock-isolation: Announce flows are recorded without delivering through the Gateway.
vi.mock("./subagents/announce/subagent-announce.js", () => ({
  runSubagentAnnounceFlow: announceSpy,
  captureSubagentCompletionReply: vi.fn(async () => undefined),
}));

// No persistence redirect: upstream (14fe10d01c) deleted persistSubagentRunsToDisk,
// and every registry write now goes through mutateSubagentRuns to the real SQLite worker.

function expectFields(value: unknown, expected: Record<string, unknown>): void {
  if (!value || typeof value !== "object") {
    throw new Error("expected fields object");
  }
  const record = value as Record<string, unknown>;
  for (const [key, expectedValue] of Object.entries(expected)) {
    expect(record[key], key).toEqual(expectedValue);
  }
}

describe("subagent registry persistence", () => {
  const envSnapshot = captureEnv(["OPENCLAW_STATE_DIR"]);
  let tempStateDir: string | null = null;

  const resolveAgentIdFromSessionKey = (sessionKey: string) => {
    const match = sessionKey.match(/^agent:([^:]+):/i);
    return (match?.[1] ?? "main").trim().toLowerCase() || "main";
  };

  const writeChildSessionEntry = async (params: {
    sessionKey: string;
    sessionId?: string;
    updatedAt?: number;
    abortedLastRun?: boolean;
  }) => {
    if (!tempStateDir) {
      throw new Error("tempStateDir not initialized");
    }
    const agentId = resolveAgentIdFromSessionKey(params.sessionKey);
    return await writeSubagentSessionEntry({
      stateDir: tempStateDir,
      agentId,
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      updatedAt: params.updatedAt,
      abortedLastRun: params.abortedLastRun,
      defaultSessionId: `sess-${agentId}-${Date.now()}`,
    });
  };

  const seedChildSessionsForPersistedRuns = async (persisted: Record<string, unknown>) => {
    const runs = (persisted.runs ?? {}) as Record<
      string,
      {
        runId?: string;
        childSessionKey?: string;
      }
    >;
    for (const [runId, run] of Object.entries(runs)) {
      const childSessionKey = run?.childSessionKey?.trim();
      if (!childSessionKey) {
        continue;
      }
      await writeChildSessionEntry({
        sessionKey: childSessionKey,
        sessionId: `sess-${run.runId ?? runId}`,
      });
    }
  };

  const writePersistedRegistry = async (
    persisted: Record<string, unknown>,
    opts?: { seedChildSessions?: boolean },
  ) => {
    // Each persisted-registry fixture gets its own state dir so session stores
    // and sqlite registry rows are tested through the same paths production resolves.
    tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-subagent-"));
    setTestEnvValue("OPENCLAW_STATE_DIR", tempStateDir);
    const runs = new Map(
      Object.entries((persisted.runs ?? {}) as Record<string, SubagentRunRecord>),
    );
    saveSubagentRegistryToSqlite(canonicalSubagentRunFixtures(runs));
    if (opts?.seedChildSessions !== false) {
      await seedChildSessionsForPersistedRuns(persisted);
    }
  };

  const flushQueuedRegistryWork = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  const waitForRegistryWork = async (predicate: () => boolean) => {
    await vi.waitFor(() => expect(predicate()).toBe(true), { interval: 1, timeout: 5_000 });
  };

  const readPersistedRuns = () => loadSubagentRegistryFromSqlite();

  const restartRegistry = async () => {
    await resetSubagentRegistryForTests({ persist: false });
    await initSubagentRegistry();
    // Upstream (36e277d761) removed chatAbortControllers from the Gateway context.
    await activateSubagentPersistenceRegistry({ activateSubagentRegistry }, callGateway);
  };

  beforeEach(() => {
    setRuntimeConfigSnapshot({});
    announceSpy.mockReset();
    announceSpy.mockResolvedValue("delivered");
    vi.mocked(callGateway).mockReset();
    vi.mocked(callGateway).mockResolvedValue({
      status: "ok",
      startedAt: 111,
      endedAt: 222,
    });
    vi.mocked(onAgentEvent).mockReset();
    vi.mocked(onAgentEvent).mockReturnValue(() => undefined);
  });

  afterEach(async () => {
    await settleSubagentRegistryPersistenceWork();
    await resetSubagentRegistryForTests({ persist: false });
    await cleanupSessionStateForTest();
    closeOpenClawStateDatabaseForTest();
    if (tempStateDir) {
      await fs.rm(tempStateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      tempStateDir = null;
    }
    clearRuntimeConfigSnapshot();
    envSnapshot.restore();
  });

  it("preserves restored killed tombstones until bounded reconciliation", async () => {
    const now = Date.now();
    const runId = "run-killed-restore-tombstone";
    await writePersistedRegistry(
      {
        version: 2,
        runs: {
          [runId]: {
            runId,
            childSessionKey: "agent:main:subagent:killed-restore-tombstone",
            requesterSessionKey: "agent:main:main",
            requesterDisplayKey: "main",
            task: "restore killed tombstone",
            cleanup: "keep",
            createdAt: now - 100,
            startedAt: now - 50,
            endedAt: now,
            endedReason: "subagent-killed",
            outcome: { status: "error", error: "manual kill" },
            suppressAnnounceReason: "killed",
            killReconciliation: { killedAt: now },
            cleanupHandled: true,
            cleanupCompletedAt: now,
          },
        },
      },
      { seedChildSessions: false },
    );

    await restartRegistry();
    await flushQueuedRegistryWork();

    expect(announceSpy).not.toHaveBeenCalled();
    expect(listSubagentRunsForRequester("agent:main:main")).toEqual([
      expect.objectContaining({
        runId,
        endedReason: "subagent-killed",
        suppressAnnounceReason: "killed",
      }),
    ]);
  });

  // Continuation (karmaterminal, bootstrap#1727): a delegate hands custody to its row
  // (RFC §5.4.4), so the row the previous Gateway left running is settled, never relaunched.
  it("settles a continuation delegate an earlier Gateway left running as interrupted", async () => {
    const now = Date.now();
    const runId = "run-stale-unended-restore";
    await writePersistedRegistry({
      version: 2,
      runs: {
        [runId]: {
          runId,
          childSessionKey: "agent:main:subagent:stale-unended-restore",
          requesterSessionKey: "agent:main:main",
          requesterDisplayKey: "main",
          task: "stale unended restored work",
          cleanup: "keep",
          createdAt: now - 3 * 60 * 60 * 1_000,
          startedAt: now - 3 * 60 * 60 * 1_000,
          expectsCompletionMessage: false,
          drainsContinuationDelegateQueue: true,
        },
      },
    });

    await restartRegistry();
    await waitForRegistryWork(
      () => readPersistedRuns().get(runId)?.cleanupCompletedAt !== undefined,
    );
    await settleSubagentRegistryPersistenceWork();

    expect(callGateway).not.toHaveBeenCalled();
    expect(announceSpy).not.toHaveBeenCalled();
    expect(readPersistedRuns().get(runId)?.execution).toMatchObject({
      status: "terminal",
      outcome: { status: "error", error: expect.stringContaining("interrupted") },
    });
  });

  it("settles an interrupted delegate without traversing legacy attachment paths", async () => {
    tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-subagent-"));
    setTestEnvValue("OPENCLAW_STATE_DIR", tempStateDir);
    const attachmentsRootDir = path.join(tempStateDir, "attachments");
    const attachmentsDir = path.join(attachmentsRootDir, "ghost");
    await fs.mkdir(attachmentsDir, { recursive: true });
    await fs.writeFile(path.join(attachmentsDir, "artifact.txt"), "artifact", "utf8");
    const now = Date.now();
    const runId = "run-orphan-attachments";
    saveSubagentRegistryToSqlite(
      canonicalSubagentRunFixtures(
        new Map([
          [
            runId,
            {
              runId,
              childSessionKey: "agent:main:subagent:ghost-attachments",
              requesterSessionKey: "agent:main:main",
              requesterDisplayKey: "main",
              task: "orphan attachments",
              cleanup: "keep",
              createdAt: now - 2,
              startedAt: now - 1,
              expectsCompletionMessage: false,
              drainsContinuationDelegateQueue: true,
              attachmentsRootDir,
              attachmentsDir,
            },
          ],
        ]),
      ),
    );

    await restartRegistry();
    await waitForRegistryWork(
      () => readPersistedRuns().get(runId)?.cleanupCompletedAt !== undefined,
    );
    await settleSubagentRegistryPersistenceWork();

    // The interrupted record stays inspectable; a delegate's row is keep-mode history.
    expect(readPersistedRuns().get(runId)?.execution).toMatchObject({
      status: "terminal",
      outcome: { status: "error", error: expect.stringContaining("interrupted") },
    });
    // Legacy attachment paths are untrusted and retired without traversal (upstream #146600).
    await expect(fs.readFile(path.join(attachmentsDir, "artifact.txt"), "utf8")).resolves.toBe(
      "artifact",
    );
  });

  it("prefers active runs and can resolve them from persisted registry snapshots", async () => {
    const childSessionKey = "agent:main:subagent:disk-active";
    await writePersistedRegistry(
      {
        version: 2,
        runs: {
          "run-complete": {
            runId: "run-complete",
            childSessionKey,
            requesterSessionKey: "agent:main:main",
            requesterDisplayKey: "main",
            task: "completed first",
            cleanup: "keep",
            createdAt: 200,
            startedAt: 210,
            endedAt: 220,
            outcome: { status: "ok" },
          },
          "run-active": {
            runId: "run-active",
            childSessionKey,
            requesterSessionKey: "agent:main:main",
            requesterDisplayKey: "main",
            task: "still running",
            cleanup: "keep",
            createdAt: 100,
            startedAt: 110,
          },
        },
      },
      { seedChildSessions: false },
    );

    await resetSubagentRegistryForTests({ persist: false });

    // The read is async upstream; keep the SQLite-read flag set until it resolves.
    const resolved = await withEnvAsync({ OPENCLAW_TEST_READ_SUBAGENT_RUNS_FROM_SQLITE: "1" }, () =>
      getSubagentRunByChildSessionKey(childSessionKey),
    );

    expectFields(resolved, {
      runId: "run-active",
      childSessionKey,
    });
    expect(resolved?.execution.endedAt).toBeUndefined();
  });

  it("can resolve the newest child-session row even when an older stale row is still active", async () => {
    const childSessionKey = "agent:main:subagent:disk-latest";
    await writePersistedRegistry(
      {
        version: 2,
        runs: {
          "run-current-ended": {
            runId: "run-current-ended",
            childSessionKey,
            requesterSessionKey: "agent:main:main",
            requesterDisplayKey: "main",
            task: "completed latest",
            cleanup: "keep",
            createdAt: 200,
            startedAt: 210,
            endedAt: 220,
            outcome: { status: "ok" },
          },
          "run-stale-active": {
            runId: "run-stale-active",
            childSessionKey,
            requesterSessionKey: "agent:main:main",
            requesterDisplayKey: "main",
            task: "stale active",
            cleanup: "keep",
            createdAt: 100,
            startedAt: 110,
          },
        },
      },
      { seedChildSessions: false },
    );

    await resetSubagentRegistryForTests({ persist: false });

    const resolved = await withEnvAsync({ OPENCLAW_TEST_READ_SUBAGENT_RUNS_FROM_SQLITE: "1" }, () =>
      getLatestSubagentRunByChildSessionKey(childSessionKey),
    );

    expectFields(resolved, {
      runId: "run-current-ended",
      childSessionKey,
    });
    expect(resolved?.execution.endedAt).toBe(220);
  });

  it("uses isolated temp state when OPENCLAW_STATE_DIR is unset in tests", () => {
    deleteTestEnvValue("OPENCLAW_STATE_DIR");
    const isolatedHome = process.env.OPENCLAW_TEST_HOME;
    if (!isolatedHome) {
      throw new Error("OPENCLAW_TEST_HOME is not configured");
    }
    const sqlitePath = resolveOpenClawStateSqlitePath();
    expect(sqlitePath).toBe(path.join(isolatedHome, ".openclaw", "state", "openclaw.sqlite"));
  });
});
