// Spawn admission verifies model account facts. Provision them through the
// shared spawn-model fixture so the spawn never depends on an ambient account.
import "./subagents/spawn/subagent-spawn-model.mocks.shared.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type GatewayRequest = { method?: string; params?: Record<string, unknown> };

const gatewayState = vi.hoisted(() => ({
  runCounter: 0,
  finalText: new Map<string, string>(),
}));

// No in-process Gateway context exists here, so every spawn takes the WebSocket
// fallback. Like the real Gateway, this double accepts the run.
const callGatewayMock = vi.hoisted(() =>
  vi.fn(async (request: GatewayRequest) => {
    if (request.method === "agent") {
      gatewayState.runCounter += 1;
      return { runId: `run-${gatewayState.runCounter}`, status: "accepted" };
    }
    if (request.method === "agent.wait") {
      return { status: "pending" };
    }
    if (request.method === "chat.history") {
      const sessionKey = request.params?.sessionKey;
      const text =
        typeof sessionKey === "string" ? gatewayState.finalText.get(sessionKey) : undefined;
      return { messages: text ? [{ role: "assistant", content: text }] : [] };
    }
    return { ok: true };
  }),
);
const inProcessDispatchMock = vi.hoisted(() =>
  vi.fn(async (_method: string, params: Record<string, unknown>) => ({
    runId: typeof params.idempotencyKey === "string" ? params.idempotencyKey : "return-run",
    status: "accepted",
  })),
);

vi.mock("../gateway/call.js", () => ({
  callGateway: (...args: [GatewayRequest]) => callGatewayMock(...args),
}));
vi.mock("../gateway/server-plugin-in-process-dispatch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../gateway/server-plugin-in-process-dispatch.js")>()),
  dispatchGatewayMethodInProcess: (method: string, params: Record<string, unknown>) =>
    inProcessDispatchMock(method, params),
}));
// Browser cleanup and plugin runtime activation have owner tests and are not
// part of the completion ownership under proof.
vi.mock("../browser-lifecycle-cleanup.js", () => ({
  cleanupBrowserSessionsForLifecycleEnd: vi.fn(async () => {}),
}));
vi.mock("./runtime-plugins.js", () => ({
  loadAgentRuntimePluginRegistryHandle: vi.fn(),
}));

import { resetDelegateStoreForTests } from "../auto-reply/continuation/delegate-store.js";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../config/config.js";
import { resolveSessionStorePathCore } from "../config/sessions.js";
import { upsertSessionEntryCore } from "../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { emitAgentEvent, resetAgentEventsForTest } from "../infra/agent-events.js";
import { resetSystemEventsForTest } from "../infra/system-events.js";
import { closeOpenClawAgentDatabasesForTest } from "../state/openclaw-agent-db.js";
import { closeOpenClawStateDatabaseForTest } from "../state/openclaw-state-db.js";
import {
  countPendingDescendantRuns,
  getSubagentRunByChildSessionKey,
} from "./subagents/registry/subagent-registry-read.js";
import { resetSubagentRegistryForTests } from "./subagents/registry/subagent-registry.test-helpers.js";
import { spawnSubagentDirect } from "./subagents/spawn/subagent-spawn.js";

const rootSessionKey = "agent:main:root";
let stateDir = "";

function makeConfig(): OpenClawConfig {
  return {
    session: { mainKey: "main", scope: "per-sender" as const },
    agents: {
      entries: { main: {} },
      defaults: {
        workspace: process.cwd(),
        model: { primary: "openai/gpt-5.5" },
        subagents: { maxSpawnDepth: 10, maxChildrenPerAgent: 10 },
        continuation: { enabled: true, maxChainLength: 10, costCapTokens: 500_000 },
      },
    },
  };
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise<void>((resolveTurn) => {
      setTimeout(resolveTurn, 20);
    });
  }
}

describe("continuation spawn over the WebSocket fallback", () => {
  beforeEach(async () => {
    gatewayState.runCounter = 0;
    gatewayState.finalText.clear();
    callGatewayMock.mockClear();
    inProcessDispatchMock.mockClear();
    stateDir = mkdtempSync(join(tmpdir(), "openclaw-continuation-fallback-row-"));
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
    resetAgentEventsForTest();
    await resetSubagentRegistryForTests();
    resetDelegateStoreForTests();
    resetSystemEventsForTest();
    setRuntimeConfigSnapshot(makeConfig());
    await upsertSessionEntryCore(
      {
        sessionKey: rootSessionKey,
        agentId: "main",
        storePath: resolveSessionStorePathCore(undefined, { agentId: "main" }),
      },
      { sessionId: "sess-root", updatedAt: Date.now() },
    );
  });

  afterEach(async () => {
    clearRuntimeConfigSnapshot();
    resetSystemEventsForTest();
    resetDelegateStoreForTests();
    await resetSubagentRegistryForTests();
    resetAgentEventsForTest();
    vi.unstubAllEnvs();
    closeOpenClawAgentDatabasesForTest();
    closeOpenClawStateDatabaseForTest();
    rmSync(stateDir, { recursive: true, force: true });
  });

  async function spawnFromRoot(params: Parameters<typeof spawnSubagentDirect>[0]) {
    const spawned = await spawnSubagentDirect(params, {
      agentSessionKey: rootSessionKey,
      agentChannel: "discord",
      agentTo: "chan-root",
      agentAccountId: "acct-root",
    });
    if (spawned.status !== "accepted" || !spawned.childSessionKey || !spawned.runId) {
      throw new Error(`spawn failed: ${JSON.stringify(spawned)}`);
    }
    // The fallback must not have been an in-process dispatch in disguise.
    expect(inProcessDispatchMock).not.toHaveBeenCalled();
    return { childSessionKey: spawned.childSessionKey, runId: spawned.runId };
  }

  it("keeps a parked completion owned while its descendant is pending", async () => {
    const { childSessionKey, runId } = await spawnFromRoot({
      task: "[continuation:chain-hop:1] orchestrate one descendant",
      silentAnnounce: true,
      wakeOnReturn: true,
      drainsContinuationDelegateQueue: true,
      continuationChainState: { count: 1, startedAt: Date.now(), tokens: 0, chainId: "chain" },
    });
    const descendant = await spawnSubagentDirect(
      { task: "descendant work" },
      { agentSessionKey: childSessionKey, agentChannel: "discord", agentTo: "chan-root" },
    );
    expect(descendant.status).toBe("accepted");
    await expect(countPendingDescendantRuns(childSessionKey, () => {})).resolves.toBe(1);

    gatewayState.finalText.set(childSessionKey, "WAITING");
    emitAgentEvent({
      runId,
      stream: "lifecycle",
      sessionKey: childSessionKey,
      data: {
        phase: "end",
        startedAt: Date.now() - 100,
        endedAt: Date.now(),
        terminalReply: { disposition: "visible", text: "WAITING" },
      },
    });

    // The run ended before its descendant, so completion is retryable: it must
    // park until the descendant settles; a `task-missing` retirement would lose the wake.
    await waitFor(async () => {
      const entry = await getSubagentRunByChildSessionKey(childSessionKey);
      return entry?.wakeOnDescendantSettle === true || entry?.delivery?.status === "discarded";
    });
    const parked = await getSubagentRunByChildSessionKey(childSessionKey);
    expect(parked?.delivery).not.toMatchObject({ discardReason: "task-missing" });
    expect(parked?.runId).toBe(runId);
    expect(parked?.wakeOnDescendantSettle).toBe(true);
    expect(parked?.cleanupCompletedAt).toBeUndefined();
  });
});
