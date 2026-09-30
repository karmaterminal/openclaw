/**
 * a completing subagent whose final findings carry a bare CONTINUE_WORK
 * token self-elects another turn through the announce/completion flow.
 *
 * The spawn-init/turn-1 path (attempt-execution.ts) is the primary site that
 * arms the same-session continue_work wake from the run-result payloads (pinned
 * by attempt-execution.continue-work-token.test.ts). THIS path is the
 * completion-flow fallback that reads the canonical transcript findings: it
 * strips the token from the announced findings (so the parent never sees the
 * child's internal continuation marker) and routes it through the SAME durable
 * work scheduler, guarded so it never double-arms the wake.
 */
import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./subagents/announce/subagent-announce.runtime.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readSessionMessagesAsync: vi.fn(async () => []),
}));

vi.mock("../gateway/call.js", () => ({
  callGateway: vi.fn(async (request: Record<string, unknown>) => {
    if (request.method === "chat.history") {
      return { messages: [] };
    }
    return {};
  }),
}));

vi.mock("./subagents/spawn/subagent-depth.js", () => ({
  getSubagentDepthFromSessionStore: () => 1,
}));

vi.mock("./embedded-agent.js", () => ({
  isEmbeddedAgentRunActive: () => false,
  queueEmbeddedAgentMessage: () => false,
  waitForEmbeddedAgentRunEnd: async () => true,
}));

vi.mock("./subagents/registry/subagent-registry-read.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  countActiveDescendantRuns: () => 0,
  countPendingDescendantRuns: () => 0,
  countPendingDescendantRunsExcludingRun: () => 0,
  isSubagentSessionRunActive: () => true,
  listSubagentRunsForRequester: () => [],
  replaceSubagentRunAfterSteer: () => true,
  resolveRequesterForChildSession: () => null,
  shouldIgnorePostCompletionAnnounceForSession: () => false,
}));
vi.mock("./subagents/registry/subagent-registry-runtime.js", () => ({
  countActiveDescendantRuns: () => 0,
  countPendingDescendantRuns: () => 0,
  countPendingDescendantRunsExcludingRun: () => 0,
  isSubagentSessionRunActive: () => true,
  listSubagentRunsForRequester: () => [],
  replaceSubagentRunAfterSteer: () => true,
  resolveRequesterForChildSession: () => null,
  shouldIgnorePostCompletionAnnounceForSession: () => false,
}));

vi.mock("../auto-reply/continuation/delegate-store.js", () => ({
  annotateQueuedDelegatesChainTokensFold: vi.fn(async () => 0),
  clearQueuedDelegatesChainTokensFold: vi.fn(async () => 0),
  consumePendingDelegates: vi.fn(async () => []),
  enqueuePendingDelegate: vi.fn(),
  markPendingDelegateFailed: vi.fn(),
  markPendingDelegateSpawnAccepted: vi.fn(),
  peekEarliestQueuedDelegateDueAt: vi.fn(async () => undefined),
}));

vi.mock("../auto-reply/continuation/delegate-store-post-compaction.js", () => ({
  failStagedPostCompactionDelegatesForCleanup: vi.fn(() => 0),
  stagePostCompactionDelegate: vi.fn(),
}));

const deliverSubagentAnnouncementMock = vi.hoisted(() =>
  vi.fn(async (_announcement: unknown) => ({ delivered: true, path: "direct" as const })),
);
vi.mock("./subagents/announce/subagent-announce-delivery.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  deliverSubagentAnnouncement: deliverSubagentAnnouncementMock,
}));

import { resolveContinuationRuntimeConfig } from "../auto-reply/continuation/config.js";
import { resetContinuationCustodyProjection } from "../auto-reply/continuation/custody/custody-projection.js";
import { hydrateContinuationCustody } from "../auto-reply/continuation/custody/custody-store.js";
import {
  custodyStateForTest,
  listCustodyRecordsForTest,
} from "../auto-reply/continuation/custody/custody.test-support.js";
import { loadContinuationChainState } from "../auto-reply/continuation/state.js";
import {
  resetContinuationWorkDispatchForTests,
  scheduleContinuationWork,
} from "../auto-reply/continuation/work-dispatch.js";
import { setRuntimeConfigSnapshot, clearRuntimeConfigSnapshot } from "../config/config.js";
import { resolveSessionStorePathCore } from "../config/sessions.js";
import { clearSessionStoreCacheForTest } from "../config/sessions/store-writer-state.js";
import { saveLegacySessionStore as saveSessionStore } from "../infra/state-migrations.legacy-session-store.js";
import { closeOpenClawStateDatabaseAsync } from "../state/openclaw-state-db.js";
import {
  createOpenClawTestState,
  type OpenClawTestState,
} from "../test-utils/openclaw-test-state.js";
import { runSubagentAnnounceFlow } from "./subagents/announce/subagent-announce.js";

type AnnounceFlowParams = Parameters<typeof runSubagentAnnounceFlow>[0];

const childSessionKey = "agent:main:subagent:952-self-cont";
const requesterSessionKey = "agent:main:discord:dm:test-952";

function makeConfig() {
  return {
    session: { mainKey: "main", scope: "per-sender" as const },
    agents: {
      defaults: {
        continuation: {
          enabled: true,
          maxChainLength: 50,
          costCapTokens: 500_000,
          // Non-zero so a pre-armed wake stays queued through the test window.
          minDelayMs: 5_000,
          maxDelayMs: 60_000,
          defaultDelayMs: 5_000,
          maxPendingWork: 32,
          crossSessionTargeting: "disabled" as const,
        },
      },
    },
  };
}

async function writeSessionStore(data: Record<string, unknown>) {
  const storePath = resolveSessionStorePathCore(undefined, { agentId: "main" });
  await saveSessionStore(storePath, data as Parameters<typeof saveSessionStore>[1], {
    skipMaintenance: true,
  });
  clearSessionStoreCacheForTest();
}

function buildParams(reply: string): AnnounceFlowParams {
  return {
    childSessionKey,
    childRunId: "run-952-self-cont",
    requesterSessionKey,
    requesterDisplayKey: "test-952",
    // A regular subagent (NOT a chain-hop) — self-continuation must work for any
    // tool-less subagent, not only continuation-chain delegates.
    task: "Delegated task: ordinary research",
    roundOneReply: reply,
    timeoutMs: 30_000,
    cleanup: "delete",
    outcome: { status: "ok" as const },
    silentAnnounce: true,
    wakeOnReturn: true,
  };
}

async function continuationWorkFlows() {
  return (
    await listCustodyRecordsForTest({
      ownerSessionKey: childSessionKey,
      kinds: ["work"],
      statuses: ["queued", "running"],
    })
  ).map((record) => Object.assign(record, { state: custodyStateForTest(record) }));
}

describe("subagent self-continuation via announce/completion flow", () => {
  let state: OpenClawTestState;

  beforeEach(async () => {
    // Isolate the shared state DB (continuation custody + session store) per
    // test so continuation work never leaks across tests or worktrees, and
    // hydrate the custody projection from it as Gateway boot does.
    state = await createOpenClawTestState({ layout: "state-only", prefix: "oc952-self-cont-" });
    resetContinuationWorkDispatchForTests();
    await hydrateContinuationCustody();
    await writeSessionStore({
      [childSessionKey]: { sessionId: "child-sid", updatedAt: Date.now() },
    });
    setRuntimeConfigSnapshot(makeConfig() as never);
    deliverSubagentAnnouncementMock.mockClear();
  });

  afterEach(async () => {
    resetContinuationWorkDispatchForTests();
    resetContinuationCustodyProjection();
    await closeOpenClawStateDatabaseAsync();
    clearRuntimeConfigSnapshot();
    clearSessionStoreCacheForTest();
    await state.cleanup();
  });

  it("arms a same-session continue_work wake from the CONTINUE_WORK token in findings", async () => {
    expect(await continuationWorkFlows()).toHaveLength(0);

    await runSubagentAnnounceFlow(buildParams("Research progress so far.\nCONTINUE_WORK:5"));

    const flows = await continuationWorkFlows();
    expect(flows).toHaveLength(1);
    expect(expectDefined(flows.at(0), "continuation flow").state.sessionKey).toBe(childSessionKey);
  });

  it("strips the CONTINUE_WORK token from the findings announced to the parent", async () => {
    // Non-silent announce so the visible delivery path (deliverSubagentAnnouncement)
    // is exercised and the stripped findings are observable.
    await runSubagentAnnounceFlow({
      ...buildParams("Research progress so far.\nCONTINUE_WORK:5"),
      silentAnnounce: false,
      wakeOnReturn: false,
      expectsCompletionMessage: true,
    });

    expect(deliverSubagentAnnouncementMock).toHaveBeenCalledTimes(1);
    const arg = expectDefined(
      deliverSubagentAnnouncementMock.mock.calls.at(0)?.at(0),
      "announcement delivery",
    ) as {
      internalEvents: { result?: string }[];
      triggerMessage?: string;
    };
    const result = arg.internalEvents[0]?.result ?? "";
    expect(result).toContain("Research progress so far.");
    expect(result).not.toContain("CONTINUE_WORK");
    expect(arg.triggerMessage ?? "").not.toContain("CONTINUE_WORK");
  });

  it("does NOT double-arm when the spawn-init path already armed the wake", async () => {
    // Simulate the own-turn path having already armed the wake for this child.
    const config = resolveContinuationRuntimeConfig(makeConfig() as never);
    const armed = await scheduleContinuationWork({
      sessionKey: childSessionKey,
      chainState: loadContinuationChainState(undefined),
      request: { delaySeconds: 5, reason: "own-turn pre-armed" },
      config,
      parentRunId: "run-own-turn",
    });
    expect(armed.scheduled).toBe(true);
    expect(await continuationWorkFlows()).toHaveLength(1);

    await runSubagentAnnounceFlow(buildParams("More progress.\nCONTINUE_WORK:5"));

    // Still exactly one wake — the announce fallback saw the live wake and
    // skipped, so the child does not get two hop-2 turns.
    expect(await continuationWorkFlows()).toHaveLength(1);
  });

  it("does not arm a wake when findings carry no CONTINUE_WORK token", async () => {
    await runSubagentAnnounceFlow(buildParams("All done, nothing left to do."));
    expect(await continuationWorkFlows()).toHaveLength(0);
  });
});
