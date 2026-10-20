import { describe, expect, it, vi } from "vitest";
import type { bindSubagentSpawnCleanup } from "./subagent-spawn-cleanup.js";
import type { PreparedContextEngineSubagentSpawn } from "./subagent-spawn-context.js";
import { cleanupAcceptedSubagentSpawnFailure } from "./subagent-spawn-rollback.js";

const { calls, ownership } = vi.hoisted(() => ({
  calls: [] as string[],
  ownership: { current: true },
}));

vi.mock("./subagent-spawn-cleanup.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./subagent-spawn-cleanup.js")>()),
  // The accepted run stops, and another owner takes the child while termination is awaited.
  terminateAcceptedCollectorRun: vi.fn(async () => {
    calls.push("terminate");
    ownership.current = false;
  }),
}));
vi.mock("./subagent-spawn-context.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./subagent-spawn-context.js")>()),
  rollbackPreparedContextEngine: vi.fn(async () => {
    calls.push("rollback");
    return true;
  }),
}));
vi.mock("../subagent-attachment-cleanup.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../subagent-attachment-cleanup.js")>()),
  cleanupMaterializedSubagentAttachments: vi.fn(async () => {
    calls.push("attachments");
  }),
}));

type CleanupOwner = ReturnType<typeof bindSubagentSpawnCleanup>;
type Termination = Awaited<ReturnType<NonNullable<CleanupOwner["terminateAcceptedRun"]>>>;

function createRetainedOwner(termination: Termination) {
  const terminateAcceptedRun = vi.fn(async () => termination);
  const cleanupOwner: CleanupOwner = {
    isCurrent: () => true,
    callGateway: vi.fn(),
    terminateAcceptedRun,
    bindAcceptedRun: vi.fn(),
  };
  return { cleanupOwner, terminateAcceptedRun };
}

function failRetainedRegistration(owner: ReturnType<typeof createRetainedOwner>) {
  const cleanupCreatedSession = vi.fn(async () => undefined);
  const result = cleanupAcceptedSubagentSpawnFailure({
    phase: "register",
    error: new Error("ordinary child registry outcome is unknown"),
    runId: "spawn-idem",
    childSessionKey: "agent:main:subagent:child",
    childAgentId: "main",
    acceptedChildRunId: "accepted-run",
    registrationRequired: true,
    resolveLifecycleHooks: async () => false,
    cleanupCreatedSession,
    // The registry retains the row: the spawn no longer owns session cleanup,
    // but the retained owner may still abort the accepted run.
    isCurrent: () => false,
    isAbortCurrent: () => true,
    cleanupOwner: owner.cleanupOwner,
  });
  return { result, cleanupCreatedSession };
}

describe("cleanupAcceptedSubagentSpawnFailure retained-owner termination", () => {
  it("reports an unconfirmed retained termination as upstream's error text without throwing", async () => {
    const owner = createRetainedOwner({
      status: "failed",
      error: new Error("first accepted-child abort failed"),
    });
    const { result, cleanupCreatedSession } = failRetainedRegistration(owner);

    const message = await result;

    expect(message).toBe(
      "Child termination is not confirmed: first accepted-child abort failed. " +
        "Its session is retained; stop the child by its run ID or restart the Gateway.",
    );
    expect(owner.terminateAcceptedRun).toHaveBeenCalledExactlyOnceWith();
    expect(cleanupCreatedSession).toHaveBeenCalledOnce();
  });

  it("returns no termination text once the retained owner settles termination", async () => {
    const owner = createRetainedOwner({ status: "settled" });
    const { result } = failRetainedRegistration(owner);

    await expect(result).resolves.toBeUndefined();
    expect(owner.terminateAcceptedRun).toHaveBeenCalledOnce();
  });
});

describe("cleanupAcceptedSubagentSpawnFailure after termination", () => {
  function failOwnedRegistration() {
    calls.length = 0;
    ownership.current = true;
    const contextEnginePreparation = {
      dispose: vi.fn(async () => {
        calls.push("dispose");
      }),
    } as unknown as PreparedContextEngineSubagentSpawn;
    return cleanupAcceptedSubagentSpawnFailure({
      phase: "register",
      error: new Error("registration failed"),
      runId: "spawn-idem",
      childSessionKey: "agent:main:subagent:child",
      childAgentId: "main",
      acceptedChildRunId: "accepted-run",
      registrationRequired: true,
      contextEnginePreparation,
      attachmentId: "attachment-1",
      resolveLifecycleHooks: async () => {
        calls.push("lifecycle-hooks");
        return true;
      },
      cleanupCreatedSession: async (emitLifecycleHooks) => {
        calls.push(`cleanup-session:${String(emitLifecycleHooks)}`);
      },
      isCurrent: () => ownership.current,
    });
  }

  it("re-reads ownership after termination: disposes the context and keeps attachments it no longer owns", async () => {
    await expect(failOwnedRegistration()).resolves.toBeUndefined();

    expect(calls).toEqual(["terminate", "dispose", "lifecycle-hooks", "cleanup-session:true"]);
  });

  it("resolves the spawn-failed lifecycle hooks after termination and rollback, before session cleanup", async () => {
    await failOwnedRegistration();

    expect(calls.indexOf("lifecycle-hooks")).toBeGreaterThan(calls.indexOf("terminate"));
    expect(calls.indexOf("lifecycle-hooks")).toBeGreaterThan(calls.indexOf("dispose"));
    expect(calls.at(-1)).toBe("cleanup-session:true");
  });
});
