// Continuation launch keys through the real spawn, in-process Gateway dispatch, agent
// preflight, and registry. The Gateway turn facade is the only stub: it runs the real
// preflight against the client the dispatcher selected, then accepts the run.
import "./subagent-spawn-model.mocks.shared.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearConfigCache, clearRuntimeConfigSnapshot } from "../../../config/config.js";
import { prepareAgentRequestPreflight } from "../../../gateway/agent-turn/agent-request-preflight.js";
import { createAgentTurnIo } from "../../../gateway/agent-turn/io.js";
import type { GatewayRequestContext } from "../../../gateway/server-methods/types.js";
import { withPluginRuntimeGatewayRequestScope } from "../../../plugins/runtime/gateway-request-scope.js";
import { resetGatewayWorkAdmission } from "../../../process/gateway-work-admission.js";
import { createTestRegistry } from "../../../test-utils/channel-plugins.js";
import { captureEnv, setTestEnvValue } from "../../../test-utils/env.js";
import { cleanupSessionStateForTest } from "../../../test-utils/session-state-cleanup.js";
import { loadAgentRuntimePluginRegistryHandle } from "../../runtime-plugins.js";
import { subagentRuns } from "../registry/subagent-registry-memory.js";
import { restoreSubagentRunsFromDisk } from "../registry/subagent-registry-persistence.js";
import { loadSubagentRegistryFromSqlite } from "../registry/subagent-registry-state.fixture.test-support.js";
import { resetSubagentRegistryForTests } from "../registry/subagent-registry.test-helpers.js";
import {
  externalCliClient,
  makeGatewayContext,
} from "./subagent-spawn.in-process-gateway.test-support.js";
import { spawnSubagentDirect } from "./subagent-spawn.js";

vi.mock("../../runtime-plugins.js", () => ({
  loadAgentRuntimePluginRegistryHandle:
    vi.fn<typeof import("../../runtime-plugins.js").loadAgentRuntimePluginRegistryHandle>(),
}));
// Upstream moved restore into the persistence module; registry writes now go through
// the real sqlite worker (mutateSubagentRuns), so there is no sync persist to stub.
vi.mock("../registry/subagent-registry-persistence.js", { spy: true });

const envSnapshot = captureEnv(["OPENCLAW_CONFIG_PATH", "OPENCLAW_STATE_DIR"]);
let stateDir = "";

/** Durable rows for the given run ids, read from fixture storage (upstream's by-id loader is gone). */
function loadDurableRunsByRunIds(runIds: readonly string[]) {
  const durable = loadSubagentRegistryFromSqlite();
  return runIds.flatMap((runId) => {
    const row = durable.get(runId);
    return row ? [row] : [];
  });
}

function installPreflightTurnFacade(gatewayContext: GatewayRequestContext) {
  const admissions: Array<{ runId: string; clientMode?: string }> = [];
  gatewayContext.createAgentTurnFacade = async ({ client }) =>
    ({
      dispatch: async (request: Record<string, unknown>) => {
        const respond = vi.fn();
        const preflight = prepareAgentRequestPreflight({
          request,
          io: createAgentTurnIo(respond),
          context: gatewayContext,
          client,
        } as never);
        if (!preflight) {
          const error = respond.mock.calls[0]?.[2] as { message?: string } | undefined;
          throw new Error(error?.message ?? "agent preflight rejected");
        }
        admissions.push({ runId: preflight.runId, clientMode: client?.connect?.client?.mode });
        return { runId: preflight.runId, status: "accepted" };
      },
    }) as never;
  return admissions;
}

function spawnWithContinuationRunId(
  gatewayContext: GatewayRequestContext,
  continuationChildRunId: string,
  agentSessionKey: string,
) {
  // The parent request scope is an external CLI client; the child launch must still
  // reach the Gateway as the host.
  return withPluginRuntimeGatewayRequestScope(
    { context: gatewayContext, client: externalCliClient(), isWebchatConnect: () => false },
    () =>
      spawnSubagentDirect(
        {
          task: "continue the durable delegate",
          context: "isolated",
          lightContext: true,
          continuationChildRunId,
        },
        { agentSessionKey, requesterRunId: "parent-run" },
      ),
  );
}

describe("spawnSubagentDirect continuation launch key at the Gateway boundary", () => {
  beforeEach(async () => {
    resetGatewayWorkAdmission();
    await resetSubagentRegistryForTests({ persist: false });
    clearRuntimeConfigSnapshot();
    clearConfigCache();
    vi.mocked(loadAgentRuntimePluginRegistryHandle).mockReturnValue(createTestRegistry([]));
    vi.mocked(restoreSubagentRunsFromDisk).mockResolvedValue(0);

    stateDir = await mkdtemp(path.join(os.tmpdir(), "openclaw-launch-key-"));
    setTestEnvValue("OPENCLAW_STATE_DIR", stateDir);
    setTestEnvValue("OPENCLAW_CONFIG_PATH", path.join(stateDir, "openclaw.json"));
    await writeFile(
      path.join(stateDir, "openclaw.json"),
      `${JSON.stringify({
        session: { mainKey: "main", scope: "per-sender" },
        agents: {
          defaults: { workspace: stateDir },
          entries: { main: { workspace: stateDir } },
        },
      })}\n`,
    );
    clearConfigCache();
  });

  afterEach(async () => {
    resetGatewayWorkAdmission();
    await resetSubagentRegistryForTests({ persist: false });
    vi.mocked(loadAgentRuntimePluginRegistryHandle).mockReset();
    vi.mocked(restoreSubagentRunsFromDisk).mockReset();
    clearRuntimeConfigSnapshot();
    clearConfigCache();
    await cleanupSessionStateForTest({ stateDir });
    envSnapshot.restore();
    if (stateDir) {
      await rm(stateDir, { recursive: true, force: true });
      stateDir = "";
    }
  });

  it("admits the key verbatim as the backend Gateway run and the durable registry row", async () => {
    const gatewayContext = makeGatewayContext();
    const admissions = installPreflightTurnFacade(gatewayContext);
    const childRunId = "continuation:record-7:3";

    const result = await spawnWithContinuationRunId(gatewayContext, childRunId, "agent:main:main");

    expect(result).toMatchObject({ status: "accepted", runId: childRunId });
    // Preflight rejects this namespace from non-backend clients, so admission proves
    // the spawn owner's dispatch reached the Gateway as a backend caller.
    expect(admissions).toEqual([{ runId: childRunId, clientMode: "backend" }]);
    expect(subagentRuns.get(childRunId)).toMatchObject({
      runId: childRunId,
      requesterSessionKey: "agent:main:main",
      childSessionKey: result.childSessionKey,
    });
    expect(loadDurableRunsByRunIds([childRunId])).toEqual([
      expect.objectContaining({ runId: childRunId, requesterSessionKey: "agent:main:main" }),
    ]);
  });

  it("refuses a key that already names a registry row and leaves that row untouched", async () => {
    const gatewayContext = makeGatewayContext();
    const admissions = installPreflightTurnFacade(gatewayContext);
    const childRunId = "continuation:record-8:1";
    const first = await spawnWithContinuationRunId(gatewayContext, childRunId, "agent:main:owner");
    expect(first).toMatchObject({ status: "accepted", runId: childRunId });
    const existing = subagentRuns.get(childRunId);
    const existingSnapshot = structuredClone(existing);

    const collision = await spawnWithContinuationRunId(
      gatewayContext,
      childRunId,
      "agent:main:intruder",
    );

    expect(collision).toEqual({
      status: "error",
      error: `Launch run id ${childRunId} is already registered; refusing to replace it.`,
    });
    expect(admissions).toHaveLength(1);
    expect(subagentRuns.get(childRunId)).toBe(existing);
    expect(structuredClone(subagentRuns.get(childRunId))).toEqual(existingSnapshot);
    expect(loadDurableRunsByRunIds([childRunId])).toEqual([
      expect.objectContaining({ requesterSessionKey: "agent:main:owner" }),
    ]);
  });
});
