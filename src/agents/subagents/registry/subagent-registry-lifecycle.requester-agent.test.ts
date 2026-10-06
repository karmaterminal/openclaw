// Gate 2.7: announce cleanup derives the requester agent for registry rows that
// predate requesterAgentId, as upstream does. Harness mirrors
// subagent-registry-lifecycle.test.ts (same module mocks, same controller fixture).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as sessionAccessor from "../../../config/sessions/session-accessor.js";
import type { CallGatewayOptions } from "../../../gateway/call.js";
import { resetGatewayWorkAdmission } from "../../../process/gateway-work-admission.js";
import { SUBAGENT_ENDED_REASON_COMPLETE } from "./subagent-lifecycle-events.js";
import { mockBlockedCompletionDeliveryOwner } from "./subagent-registry-lifecycle-completion.test-support.js";
import {
  createLifecycleControllerFixture,
  createRunEntry,
} from "./subagent-registry-lifecycle-controller.test-support.js";
import type { SubagentLifecycleOptions } from "./subagent-registry-lifecycle.js";

type AnnounceFlowOutcome = Awaited<ReturnType<SubagentLifecycleOptions["runSubagentAnnounceFlow"]>>;

const completionDeliveryMocks = vi.hoisted(() => ({
  blockSubagentCompletionDelivery: vi.fn(),
  settleRequesterCompletionBatch: vi.fn(),
  mutateRequesterSettleWakeBatch: vi.fn(),
  ownersByEntry: new Map<object, Pick<SubagentLifecycleOptions, "runs">>(),
}));

vi.mock("../../../config/config.js", { spy: true });
vi.mock("../../../context-engine/init.js", () => ({ ensureContextEnginesInitialized: vi.fn() }));
vi.mock("../../runtime-plugins.js", () => ({ loadAgentRuntimePluginRegistryHandle: vi.fn() }));
vi.mock("../completion/subagent-completion-admission.store.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../completion/subagent-completion-admission.store.js")
  >()),
  blockSubagentCompletionDelivery: completionDeliveryMocks.blockSubagentCompletionDelivery,
  settleRequesterCompletionBatch: completionDeliveryMocks.settleRequesterCompletionBatch,
  mutateRequesterSettleWakeBatch: completionDeliveryMocks.mutateRequesterSettleWakeBatch,
}));
vi.mock("../../../browser-lifecycle-cleanup.js", () => ({
  cleanupBrowserSessionsForLifecycleEnd: vi.fn(async () => {}),
}));
vi.mock("../../agent-bundle-mcp-tools.js", () => ({
  retireSessionMcpRuntimeForSessionKey: vi.fn(async () => true),
}));
vi.mock("../../internal-session-effects.js", () => ({
  removeInternalSessionEffectsSession: vi.fn(async () => {}),
}));
vi.mock("../../../runtime.js", () => ({ defaultRuntime: { log: vi.fn() } }));
vi.mock("../announce/subagent-announce.js", () => ({
  captureSubagentCompletionReply: vi.fn(async () => undefined),
  runSubagentAnnounceFlow: vi.fn(async () => "retryable" as const),
}));

describe("announce cleanup requester agent", () => {
  beforeAll(() => {
    sessionAccessor.replaceSessionEntrySync(
      { agentId: "main", sessionKey: "agent:main:subagent:child" },
      {
        sessionId: "child-session-id",
        lifecycleRevision: "child-lifecycle-revision",
        updatedAt: 1,
      },
    );
  });

  beforeEach(() => {
    resetGatewayWorkAdmission();
    vi.clearAllMocks();
    mockBlockedCompletionDeliveryOwner(completionDeliveryMocks);
  });

  it.each([
    {
      name: "a stored requesterAgentId",
      stored: "beta",
      requesterSessionKey: "main",
      expected: "beta",
    },
    {
      name: "a legacy row that predates requesterAgentId",
      stored: undefined,
      requesterSessionKey: "agent:alpha:main",
      expected: "alpha",
    },
  ])("hands announce dispatch the requester agent for $name", async (scenario) => {
    const cfg = { agents: { ownership: "explicit" as const, entries: { alpha: {}, beta: {} } } };
    const entry = createRunEntry({
      expectsCompletionMessage: true,
      requesterSessionKey: scenario.requesterSessionKey,
      ...(scenario.stored ? { requesterAgentId: scenario.stored } : {}),
    });
    expect(entry.requesterAgentId).toBe(scenario.stored);
    const runSubagentAnnounceFlow = vi.fn(
      async (_announceParams: { requesterAgentId?: string }) => "delivered" as AnnounceFlowOutcome,
    );
    const controller = createLifecycleControllerFixture(
      { entry, getRuntimeConfig: () => cfg, runSubagentAnnounceFlow },
      {
        callGateway: async <T = Record<string, unknown>>(_opts: CallGatewayOptions): Promise<T> =>
          ({}) as T,
        cleanupBrowserSessionsForLifecycleEnd: vi.fn(async () => {}),
        ownersByEntry: completionDeliveryMocks.ownersByEntry,
      },
    );

    await controller.completeSubagentRun({
      runId: entry.runId,
      endedAt: 4_000,
      outcome: { status: "ok" },
      reason: SUBAGENT_ENDED_REASON_COMPLETE,
      triggerCleanup: true,
    });
    await vi.waitFor(() => expect(runSubagentAnnounceFlow).toHaveBeenCalledOnce(), {
      interval: 1,
    });

    expect(runSubagentAnnounceFlow.mock.calls[0]?.[0]?.requesterAgentId).toBe(scenario.expected);
  });
});
