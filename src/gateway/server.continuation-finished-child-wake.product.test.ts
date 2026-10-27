// A finished child's continue_work wake must run its next turn (bootstrap#1727).
// Real Gateway, real sessions_spawn and continue_work, real work dispatcher and
// session controller; only the model provider is a local HTTP fixture.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { readRequestText } from "../../test/helpers/gateway-integration-fixtures.js";
import { startOpenAiResponsesModelServer } from "../../test/helpers/openai-responses-model-fixture.js";
import { writeOpenAiResponsesText } from "../../test/helpers/openai-responses-sse.js";
import { createDeferred } from "../../test/helpers/promise.js";
import { resetSubagentRegistryForTests } from "../agents/subagents/registry/subagent-registry.test-helpers.js";
import * as getReply from "../auto-reply/reply/get-reply.js";
import * as queuePolicy from "../auto-reply/reply/queue-policy.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { isSessionRunActiveForKey } from "../sessions/session-controller.queries.js";
import { sessionControllers } from "../sessions/session-controller.storage.js";
import { createOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import { writeToolCall } from "./gateway-provider-fixture.test-support.js";
import {
  createSubagentModelConfig,
  findSubagentSpawnReceipt,
  type SpawnReceipt,
} from "./server.subagent-stop-settlement.product.test-support.js";
import { disconnectGatewayClient, startGatewayWithClient } from "./test-helpers.e2e.js";

const MODEL_ID = "finished-child-wake";
const WAKE_MARKER = "[continuation:wake]";
const WAKE_TURN_BOUND_MS = 20_000;

afterEach(async () => {
  vi.restoreAllMocks();
  await resetSubagentRegistryForTests({ persist: false });
});

/** Controller custody for one session, read in-process at the moment a wake is admitted. */
function captureControllerState(sessionKey: string) {
  return {
    runActive: isSessionRunActiveForKey(sessionKey),
    owners: [...sessionControllers.values()]
      .filter((owner) => owner.key === sessionKey || owner.aliases.has(sessionKey))
      .map((owner) => ({
        key: owner.key,
        active: owner.active
          ? { phase: owner.active.phase, sessionId: owner.active.sessionId }
          : undefined,
        attached: owner.attachment !== undefined,
        mailbox: owner.mailbox && {
          droppedCount: owner.mailbox.droppedCount,
          claim: owner.mailbox.claim && {
            released: owner.mailbox.claim.released,
            releaseRequested: owner.mailbox.claim.releaseRequested === true,
            inputs: owner.mailbox.claim.inputs.length,
          },
          entries: owner.mailbox.entries.map((input) => ({
            sequence: input.sequence,
            phase: input.phase,
            protocolRunId: input.protocolRunId,
            payload: input.payload,
            retirementRequested: input.retirementRequested === true,
            retirementPending: input.retirementPending === true,
            aborted: input.abortSignal.aborted,
            claim: input.claim && {
              released: input.claim.released,
              releaseRequested: input.claim.releaseRequested === true,
              operation: input.claim.operation?.phase,
            },
            custody: {
              work: input.custody.work?.size ?? 0,
              enqueued: input.custody.enqueued === true,
              adopted: input.custody.adopted === true,
              adopting: input.custody.adopting !== undefined,
              settling: input.custody.settling !== undefined,
              completed: input.custody.completed === true,
              rpcAdopted: input.custody.rpcAdopted === true,
              rpcAccepted: input.custody.rpcAccepted === true,
              cancellationRetired: input.custody.cancellationRetired === true,
            },
            source: input.source !== undefined,
            injection: input.injection !== undefined,
            withdrawalHolds: input.withdrawalHolds,
          })),
        },
      })),
  };
}

type WakeAttempt = {
  sessionKey: string;
  atEntry: ReturnType<typeof captureControllerState>;
  queueDecisions: Array<{
    params: Parameters<typeof queuePolicy.resolveActiveRunQueueAction>[0];
    action: ReturnType<typeof queuePolicy.resolveActiveRunQueueAction>;
    state: ReturnType<typeof captureControllerState>;
  }>;
  preparedRunStarted: boolean;
  outcome?: string;
};

/** Pass-through observation of every continuation work wake; behavior is unchanged. */
function observeWorkWakes() {
  const attempts: WakeAttempt[] = [];
  const current = new AsyncLocalStorage<WakeAttempt>();
  const getReplyFromConfig = getReply.getReplyFromConfig;
  vi.spyOn(getReply, "getReplyFromConfig").mockImplementation(async (ctx, opts, cfg) => {
    if (opts?.continuationTrigger !== "work-wake" || !ctx.SessionKey) {
      return await getReplyFromConfig(ctx, opts, cfg);
    }
    const attempt: WakeAttempt = {
      sessionKey: ctx.SessionKey,
      atEntry: captureControllerState(ctx.SessionKey),
      queueDecisions: [],
      preparedRunStarted: false,
    };
    attempts.push(attempt);
    const onPreparedAgentRunStart = opts.onPreparedAgentRunStart;
    try {
      const reply = await current.run(attempt, () =>
        getReplyFromConfig(
          ctx,
          {
            ...opts,
            onPreparedAgentRunStart: (run) => {
              attempt.preparedRunStarted = true;
              return onPreparedAgentRunStart?.(run);
            },
          },
          cfg,
        ),
      );
      attempt.outcome = reply === undefined ? "returned-undefined" : "returned-reply";
      return reply;
    } catch (error) {
      attempt.outcome = `threw: ${String(error)}`;
      throw error;
    }
  });
  const resolveActiveRunQueueAction = queuePolicy.resolveActiveRunQueueAction;
  vi.spyOn(queuePolicy, "resolveActiveRunQueueAction").mockImplementation((params) => {
    const action = resolveActiveRunQueueAction(params);
    const attempt = current.getStore();
    attempt?.queueDecisions.push({
      params,
      action,
      state: captureControllerState(attempt.sessionKey),
    });
    return action;
  });
  return attempts;
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

function continuationConfig(workspace: string, baseUrl: string): OpenClawConfig {
  const cfg = createSubagentModelConfig(workspace, { baseUrl, modelId: MODEL_ID, runtime: true });
  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        continuation: {
          enabled: true,
          defaultDelayMs: 0,
          minDelayMs: 0,
          busySkipBackoff: { baseMs: 250, ceilingMs: 2_000 },
        },
      },
    },
    tools: { ...cfg.tools, alsoAllow: ["continue_work"] },
  };
}

it("runs the next turn of a finished gateway-agent child that elected continue_work", async () => {
  const id = randomUUID().slice(0, 8);
  const parentPrompt = `Spawn the worker for ${id}.`;
  const childTask = `Do both halves of task ${id}.`;
  const childResult = `CHILD_FIRST_HALF_${id}`;
  const controlPrompt = `Control turn for ${id}: do both halves.`;
  const agentRpcPrompt = `Agent RPC turn for ${id}: do both halves.`;
  const hopTwoTurns: string[] = [];
  const childAccepted = createDeferred<SpawnReceipt>();
  let sequence = 0;
  const model = await startOpenAiResponsesModelServer({
    modelId: MODEL_ID,
    bindError: "Expected finished-child wake model server address",
    onRequest: async (request, response) => {
      const body = await readRequestText(request);
      const reply = (text: string) => {
        const replyId = `wake_${++sequence}`;
        writeOpenAiResponsesText(response, {
          text,
          messageId: replyId,
          responseId: `${replyId}_response`,
        });
      };
      const electOrFinish = (label: string, firstHalf: string) => {
        if (body.includes(WAKE_MARKER)) {
          hopTwoTurns.push(label);
          reply(`${label}_SECOND_HALF_DONE`);
        } else if (!body.includes("function_call_output")) {
          writeToolCall(response, "continue_work", {
            reason: `finish the second half of ${label}`,
            delaySeconds: 0,
          });
        } else {
          reply(firstHalf);
        }
      };
      if (body.includes(parentPrompt)) {
        if (body.includes(childResult) || body.includes("SECOND_HALF_DONE")) {
          reply(`Parent saw the child result for ${id}.`);
        } else if (!body.includes("function_call_output")) {
          writeToolCall(response, "sessions_spawn", {
            task: childTask,
            context: "isolated",
            cleanup: "keep",
          });
        } else {
          const receipt = findSubagentSpawnReceipt(JSON.parse(body) as unknown);
          if (receipt) {
            childAccepted.resolve(receipt);
          }
          reply("Child accepted.");
        }
      } else if (body.includes(controlPrompt)) {
        electOrFinish("control", `CONTROL_FIRST_HALF_${id}`);
      } else if (body.includes(agentRpcPrompt)) {
        electOrFinish("agent-rpc", `AGENT_RPC_FIRST_HALF_${id}`);
      } else if (body.includes(childTask)) {
        electOrFinish("child", childResult);
      } else {
        reply("Unexpected request.");
      }
    },
  });
  const state = await createOpenClawTestState({ label: "finished-child-wake" });
  const gateway = await startGatewayWithClient({
    cfg: continuationConfig(state.workspaceDir, `${model.baseUrl}/v1`),
    configPath: state.configPath,
    token: "finished-child-wake-token",
  });
  const wakes = observeWorkWakes();
  const report = (label: string, sessionKey: string) => ({
    label,
    hopTwoTurns: hopTwoTurns.filter((turn) => turn === label).length,
    wakes: wakes.filter((wake) => wake.sessionKey === sessionKey),
  });
  try {
    await gateway.server.startupSettled;

    // Control: the previous turn came through chat.send and the reply runner.
    const controlKey = `agent:main:subagent:wake-control-${id}`;
    await gateway.client.request("chat.send", {
      sessionKey: controlKey,
      message: controlPrompt,
      idempotencyKey: `wake-control-${id}`,
      deliver: false,
    });
    await waitFor(() => hopTwoTurns.includes("control"), WAKE_TURN_BOUND_MS);
    const control = report("control", controlKey);
    console.log(`[finished-child-wake] control ${JSON.stringify(control, null, 2)}`);

    // Probe: the previous turn came through the gateway agent RPC, with no spawn or return.
    const agentRpcKey = `agent:main:subagent:wake-agent-rpc-${id}`;
    await gateway.client.request(
      "agent",
      {
        sessionKey: agentRpcKey,
        message: agentRpcPrompt,
        idempotencyKey: `wake-agent-rpc-${id}`,
        deliver: false,
      },
      { expectFinal: true },
    );
    await waitFor(() => hopTwoTurns.includes("agent-rpc"), WAKE_TURN_BOUND_MS);
    const agentRpc = report("agent-rpc", agentRpcKey);
    console.log(`[finished-child-wake] agent-rpc ${JSON.stringify(agentRpc, null, 2)}`);

    // Fossil: a child spawned through the gateway agent path elects continue_work.
    const parentKey = `agent:main:wake-parent-${id}`;
    await gateway.client.request(
      "agent",
      {
        sessionKey: parentKey,
        message: parentPrompt,
        idempotencyKey: `wake-parent-${id}`,
        deliver: false,
      },
      { expectFinal: true },
    );
    const child = await childAccepted.promise;
    await waitFor(() => hopTwoTurns.includes("child"), WAKE_TURN_BOUND_MS);
    const fossil = report("child", child.childSessionKey);
    console.log(`[finished-child-wake] child ${JSON.stringify(fossil, null, 2)}`);

    expect(control).toMatchObject({
      hopTwoTurns: 1,
      wakes: [expect.objectContaining({ preparedRunStarted: true })],
    });
    expect(agentRpc).toMatchObject({
      hopTwoTurns: 1,
      wakes: [expect.objectContaining({ preparedRunStarted: true })],
    });
    expect(fossil).toMatchObject({
      hopTwoTurns: 1,
      wakes: [expect.objectContaining({ preparedRunStarted: true })],
    });
  } finally {
    await disconnectGatewayClient(gateway.client);
    await gateway.server.close({ reason: "finished-child wake proof complete" });
    await model.close();
    await state.cleanup();
  }
}, 180_000);
