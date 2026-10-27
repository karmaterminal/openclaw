// A finished child's continue_work wake must run its next turn (bootstrap#1727).
// Real Gateway, sessions_spawn, continue_work, work dispatcher and session controller;
// only the model provider is a local HTTP fixture.
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
import { sleep } from "../utils/sleep.js";
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
  vi.unstubAllEnvs();
  await resetSubagentRegistryForTests({ persist: false });
});

/** Mailbox custody for one session at the moment its wake is admitted (H1/H2/H3 evidence). */
function captureControllerState(sessionKey: string) {
  return {
    runActive: isSessionRunActiveForKey(sessionKey),
    owners: [...sessionControllers.values()]
      .filter((owner) => owner.key === sessionKey || owner.aliases.has(sessionKey))
      .map((owner) => ({
        active: owner.active?.phase,
        attached: owner.attachment !== undefined,
        droppedCount: owner.mailbox?.droppedCount,
        claim: owner.mailbox?.claim && { released: owner.mailbox.claim.released },
        entries: owner.mailbox?.entries.map((input) => ({
          phase: input.phase,
          protocolRunId: input.protocolRunId,
          retirementRequested: input.retirementRequested === true,
          claimReleased: input.claim?.released,
          custodyWork: input.custody.work?.size ?? 0,
          custodySettling: input.custody.settling !== undefined,
        })),
      })),
  };
}

type WakeAttempt = {
  sessionKey: string;
  preparedRunStarted: boolean;
  queueDecisions: Array<{
    params: Parameters<typeof queuePolicy.resolveActiveRunQueueAction>[0];
    action: ReturnType<typeof queuePolicy.resolveActiveRunQueueAction>;
    state: ReturnType<typeof captureControllerState>;
  }>;
};

/** Pass-through observation of continuation work wakes; behavior is unchanged. */
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
      preparedRunStarted: false,
      queueDecisions: [],
    };
    attempts.push(attempt);
    const onPreparedAgentRunStart = opts.onPreparedAgentRunStart;
    return await current.run(attempt, () =>
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

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() <= deadline) {
    await sleep(50);
  }
}

function continuationConfig(workspace: string, baseUrl: string): OpenClawConfig {
  const cfg = createSubagentModelConfig(workspace, { baseUrl, modelId: MODEL_ID, runtime: true });
  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        continuation: { enabled: true, defaultDelayMs: 0, minDelayMs: 0 },
      },
    },
    tools: { ...cfg.tools, alsoAllow: ["continue_work"] },
  };
}

function readToolOutputs(body: string): string[] {
  return ((JSON.parse(body) as { input?: Array<{ type?: string }> }).input ?? [])
    .filter((item) => item.type === "function_call_output")
    .map((item) => JSON.stringify(item));
}

it("runs the next turn of a finished gateway-agent child that elected continue_work", async () => {
  const id = randomUUID().slice(0, 8);
  const parentPrompt = `Spawn the worker for ${id}.`;
  const prompts = {
    child: `Do both halves of task ${id}.`,
    control: `Control turn for ${id}: do both halves.`,
    "agent-rpc": `Agent RPC turn for ${id}: do both halves.`,
  };
  const childResult = `CHILD_FIRST_HALF_${id}`;
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
      if (body.includes(parentPrompt)) {
        if (body.includes(childResult) || body.includes("SECOND_HALF_DONE")) {
          reply(`Parent saw the child result for ${id}.`);
        } else if (!body.includes("function_call_output")) {
          writeToolCall(response, "sessions_spawn", {
            task: prompts.child,
            context: "isolated",
            cleanup: "keep",
          });
        } else {
          const receipt = findSubagentSpawnReceipt(JSON.parse(body) as unknown);
          if (receipt) {
            childAccepted.resolve(receipt);
          } else {
            childAccepted.reject(
              new Error(`sessions_spawn refused: ${readToolOutputs(body).join("\n")}`),
            );
          }
          reply("Child accepted.");
        }
        return;
      }
      const label = (Object.keys(prompts) as Array<keyof typeof prompts>).find((key) =>
        body.includes(prompts[key]),
      );
      if (!label) {
        reply("Unexpected request.");
      } else if (body.includes(WAKE_MARKER)) {
        hopTwoTurns.push(label);
        reply(`${label}_SECOND_HALF_DONE`);
      } else if (!body.includes("function_call_output")) {
        writeToolCall(response, "continue_work", {
          reason: `finish the second half of ${label}`,
          delaySeconds: 0,
        });
      } else {
        reply(label === "child" ? childResult : `${label}_FIRST_HALF_DONE`);
      }
    },
  });
  // Wakes drive the full reply runtime; a child's wake may precede the first chat
  // dispatch that marks the runtime config complete for the fast-reply test guard.
  vi.stubEnv("OPENCLAW_ALLOW_SLOW_REPLY_TESTS", "1");
  const state = await createOpenClawTestState({ label: "finished-child-wake" });
  const gateway = await startGatewayWithClient({
    cfg: continuationConfig(state.workspaceDir, `${model.baseUrl}/v1`),
    configPath: state.configPath,
    token: "finished-child-wake-token",
  });
  const wakes = observeWorkWakes();
  const outcome = async (label: keyof typeof prompts, sessionKey: string) => {
    await waitFor(() => hopTwoTurns.includes(label), WAKE_TURN_BOUND_MS);
    return {
      label,
      hopTwoTurns: hopTwoTurns.filter((turn) => turn === label).length,
      wakes: wakes.filter((wake) => wake.sessionKey === sessionKey),
    };
  };
  const ranOnce = {
    hopTwoTurns: 1,
    wakes: [expect.objectContaining({ preparedRunStarted: true })],
  };
  try {
    await gateway.server.startupSettled;

    // Fossil: the child's turn was launched in-process by the parent's sessions_spawn tool.
    await gateway.client.request(
      "agent",
      {
        sessionKey: `agent:main:wake-parent-${id}`,
        message: parentPrompt,
        idempotencyKey: `wake-parent-${id}`,
        deliver: false,
      },
      { expectFinal: true },
    );
    const child = await childAccepted.promise;
    const fossil = await outcome("child", child.childSessionKey);

    // Control: same key shape and lane, but the previous turn came through the reply runner.
    const controlKey = `agent:main:subagent:wake-control-${id}`;
    await gateway.client.request("chat.send", {
      sessionKey: controlKey,
      message: prompts.control,
      idempotencyKey: `wake-control-${id}`,
      deliver: false,
    });
    const control = await outcome("control", controlKey);

    // Discriminator: a gateway agent RPC turn from an operator client, with no spawning tool.
    const agentRpcKey = `agent:main:subagent:wake-agent-rpc-${id}`;
    await gateway.client.request(
      "agent",
      {
        sessionKey: agentRpcKey,
        message: prompts["agent-rpc"],
        idempotencyKey: `wake-agent-rpc-${id}`,
        deliver: false,
      },
      { expectFinal: true },
    );
    const agentRpc = await outcome("agent-rpc", agentRpcKey);

    console.log(`[finished-child-wake] ${JSON.stringify({ fossil, control, agentRpc }, null, 2)}`);
    expect(control).toMatchObject(ranOnce);
    expect(agentRpc).toMatchObject(ranOnce);
    expect(fossil).toMatchObject(ranOnce);
  } finally {
    await disconnectGatewayClient(gateway.client);
    await gateway.server.close({ reason: "finished-child wake proof complete" });
    await model.close();
    await state.cleanup();
  }
}, 180_000);
