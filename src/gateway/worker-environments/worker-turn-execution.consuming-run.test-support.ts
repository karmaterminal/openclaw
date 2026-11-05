// Continuation (karmaterminal): openclaw#1504's consuming-run stamp at the worker launch boundary,
// registered from worker-turn-execution.test.ts with its tunnel, provider and execute helpers.
import assert from "node:assert/strict";
import { isRecord } from "@openclaw/normalization-core/record-coerce";
import { expect, it, vi } from "vitest";
import { WORKER_TURN_ADMISSION_PROTOCOL_FEATURE } from "../../../packages/gateway-protocol/src/schema/worker-turn-admission.js";
import { makeAgentAssistantMessage } from "../../agents/test-helpers/agent-message-fixtures.js";
import { bindUserTurnInputRunId } from "../../sessions/user-turn-transcript-input-run.js";
import { createUserTurnTranscriptRecorder } from "../../sessions/user-turn-transcript.js";
import { admitWorkerTurnInput } from "./placement-turn-claim-events.js";
import { WorkerRunnerCapacityError, type WorkerTunnelHandle } from "./tunnel-contract.js";
import {
  acknowledgeCompletedWorkerTurn,
  attachedEnvironment,
  createWorkerSessionTurnPlacementProvider,
  createWorkerTurnTunnel,
  credential,
  openSessionManager,
  seedActivePlacement,
  sessionTarget,
  turn,
  type WorkerTurnEnvironmentService,
} from "./worker-turn-launcher.test-support.js";

type TurnProvider = ReturnType<typeof createWorkerSessionTurnPlacementProvider>;

const captureFailure = (error: unknown) => error;

export function registerWorkerTurnConsumingRunTests(helpers: {
  unusedTunnel: (
    overrides: Partial<WorkerTunnelHandle>,
  ) => ReturnType<typeof createWorkerTurnTunnel>;
  turnProvider: (environments: Partial<WorkerTurnEnvironmentService>) => TurnProvider;
  execute: (
    provider: TurnProvider,
    input: Parameters<TurnProvider["executeTurn"]>[1],
  ) => ReturnType<TurnProvider["executeTurn"]>;
}): void {
  const { unusedTunnel, turnProvider, execute } = helpers;

  // openclaw#1504: a woken event's input names its consuming run only once the worker takes it: a
  // dispatched launch, or the launched worker's admission. A launch that fails first leaves it unknown.
  it.each([
    { dispatched: false, outcome: "never stamped when its worker launch fails before dispatch" },
    { dispatched: true, outcome: "stamped once its worker launch is dispatched" },
    { dispatched: true, admission: true, outcome: "stamped once the launched worker admits it" },
  ])("records an event input's consuming run: $outcome", async ({ dispatched, admission }) => {
    await seedActivePlacement();
    const input = turn(`consuming-run-${dispatched}-${admission}`);
    const inputDeliveries = [{ deliveryId: "delivery-1", sourceRunId: "delegate-run" }];
    const recorder = createUserTurnTranscriptRecorder({
      target: () => ({ ...sessionTarget, sessionEntry: undefined }),
      input: { text: input.prompt, inputDeliveries },
    });
    bindUserTurnInputRunId(recorder, input.runId);
    const environment = attachedEnvironment();
    const receipt = environment.bootstrapReceipt;
    assert(receipt);
    if (admission) {
      receipt.protocolFeatures.push(WORKER_TURN_ADMISSION_PROTOCOL_FEATURE);
    }
    const launchTurn = vi.fn<NonNullable<WorkerTunnelHandle["launchTurn"]>>(async (request) => {
      if (!dispatched) {
        throw new WorkerRunnerCapacityError();
      }
      request.onDispatchReady?.();
      if (admission) {
        // The launched worker's admission RPC, as the worker runtime calls it before inference.
        const { turnClaim } = request;
        const admitted = await admitWorkerTurnInput(
          {
            environmentId: environment.environmentId,
            ownerEpoch: environment.ownerEpoch,
            sessionId: turnClaim.sessionId,
            runId: turnClaim.runId,
            turnClaim,
            credentialHash: credential().deliveryId,
            bundleHash: receipt.bundleHash,
            rpcSetVersion: 1,
            protocolFeatures: receipt.protocolFeatures,
            credentialExpiresAtMs: Date.now() + 60_000,
          },
          {
            runEpoch: environment.ownerEpoch,
            systemPrompt: "Worker system prompt",
            prompt: input.prompt,
            messages: [],
          },
          () => true,
        );
        expect(admitted).toMatchObject({ ok: true, result: { outcome: "allow" } });
      }
      const leafId = await (
        await openSessionManager()
      ).appendMessageAsync(
        makeAgentAssistantMessage({ content: [{ type: "text", text: "Reviewed." }], timestamp: 2 }),
      );
      return await acknowledgeCompletedWorkerTurn(request.turnClaim, leafId);
    });
    const tunnel = unusedTunnel({
      launchTurn,
      quiesceWorkspace: async () => ({ assertActive: async () => {}, resume: async () => {} }),
      stop: vi.fn(async () => {}),
    });
    const provider = turnProvider({
      get: () => environment,
      acquireTurnCredential: async () => credential(),
      acknowledgeCredentialDelivery: async () => true,
      startTunnel: async () => tunnel,
    });
    try {
      const outcome = await execute(provider, {
        ...input,
        userTurnTranscriptRecorder: recorder,
      }).catch(captureFailure);
      if (dispatched) {
        expect(outcome).toMatchObject({ payloads: [{ text: "Reviewed." }] });
      } else {
        expect(outcome).toBeInstanceOf(WorkerRunnerCapacityError);
      }
      await recorder.waitForRuntimePersistence();

      const [stored] = (await openSessionManager()).getEntries();
      assert(stored?.type === "message", "Expected the committed event input");
      const metadata = isRecord(stored.message) ? stored.message["__openclaw"] : undefined;
      expect(metadata).toMatchObject({ inputDeliveries });
      expect(isRecord(metadata) ? metadata.inputRunId : undefined).toBe(
        dispatched ? input.runId : undefined,
      );
    } finally {
      input.preparedRunAdmission.close();
    }
  });
}
