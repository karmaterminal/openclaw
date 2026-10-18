import { describe, expect, it, vi } from "vitest";
import type { callGateway } from "../../../gateway/call.js";
import {
  cleanupFailedSpawnBeforeAgentStart,
  cleanupProvisionalSession,
  terminateAcceptedCollectorRun,
} from "./subagent-spawn-cleanup.js";

// Mirrors the module-local GatewayCall parameter. Declaring it keeps
// callGateway.mock.calls a one-element tuple so request assertions can
// destructure it instead of indexing an empty tuple.
type GatewayRequest = Parameters<typeof callGateway>[0];

function sessionChangedError(): Error {
  return Object.assign(new Error("session changed"), {
    name: "GatewayClientRequestError",
    gatewayCode: "INVALID_REQUEST",
    details: { reason: "session-changed" },
  });
}

describe("subagent spawn cleanup identity", () => {
  it("resolves only when termination is confirmed and rejects after one failed attempt", async () => {
    const confirmedGateway = vi.fn(async () => ({
      ok: true,
      aborted: true,
      runIds: ["gateway-run"],
    }));
    await expect(
      terminateAcceptedCollectorRun({
        childSessionKey: "agent:main:subagent:child",
        gatewayRunId: "gateway-run",
        sessionCleanup: "preserve",
        callGateway: confirmedGateway,
      }),
    ).resolves.toBeUndefined();

    const unavailableGateway = vi.fn(async () => {
      throw new Error("gateway unavailable");
    });
    await expect(
      terminateAcceptedCollectorRun({
        childSessionKey: "agent:main:subagent:child",
        gatewayRunId: "gateway-run",
        sessionCleanup: "preserve",
        callGateway: unavailableGateway,
      }),
    ).rejects.toThrow("gateway unavailable");
    expect(unavailableGateway).toHaveBeenCalledOnce();
  });

  it("requires both frozen session identities before deletion", async () => {
    const callGateway = vi.fn();

    await expect(
      cleanupProvisionalSession("agent:main:subagent:child", {
        expectedSessionId: "session-id",
        callGateway,
      }),
    ).resolves.toBe(false);

    expect(callGateway).not.toHaveBeenCalled();
  });

  // An abort miss falls through to exact-session deletion only for a frozen identity;
  // deleting by key alone could remove a successor generation.
  it("never deletes by key alone when the accepted run's session identity is not frozen", async () => {
    const callGateway = vi.fn(async (_request: GatewayRequest) => ({
      ok: true,
      aborted: false,
      runIds: [],
    }));

    await expect(
      terminateAcceptedCollectorRun({
        childSessionKey: "agent:main:subagent:child",
        gatewayRunId: "gateway-run",
        expectedSessionId: "session-id",
        callGateway,
      }),
    ).rejects.toThrow("Gateway did not confirm accepted child termination");

    expect(callGateway).toHaveBeenCalledOnce();
    expect(callGateway.mock.calls[0]?.[0]).toMatchObject({ method: "chat.abort" });
  });

  it("skips waited provisional deletion without a frozen session identity", async () => {
    const callGateway = vi.fn();
    const waitForCleanup = vi.fn(async () => {});

    await expect(
      cleanupFailedSpawnBeforeAgentStart({
        childSessionKey: "agent:main:subagent:child",
        waitForSessionDeletion: true,
        waitForCleanup,
        expectedLifecycleRevision: "session-revision",
        callGateway,
      }),
    ).resolves.toEqual({ attachmentsRemoved: true, sessionDeleted: false });

    expect(waitForCleanup).not.toHaveBeenCalled();
    expect(callGateway).not.toHaveBeenCalled();
  });

  // Termination is the ONLY place the live ownership predicate is consumed. When
  // ownership flips after acceptance but before cleanup, termination makes one
  // bounded attempt and must not delete a successor-owned session or retry.
  it("makes one bounded attempt and deletes nothing once cleanup ownership has flipped", async () => {
    const callGateway = vi.fn(async (_request: GatewayRequest) => ({
      ok: true,
      aborted: false,
      runIds: [],
    }));

    await terminateAcceptedCollectorRun({
      childSessionKey: "agent:main:subagent:child",
      gatewayRunId: "gateway-run",
      expectedSessionId: "session-id",
      expectedLifecycleRevision: "session-revision",
      isCurrent: () => false,
      callGateway,
    });

    // No successor-owned session deletion.
    expect(
      callGateway.mock.calls.filter(
        ([request]) => (request as { method?: string }).method === "sessions.delete",
      ),
    ).toHaveLength(0);
    // Bounded: termination makes a single attempt, so there is no second abort either.
    expect(
      callGateway.mock.calls.filter(
        ([request]) => (request as { method?: string }).method === "chat.abort",
      ).length,
    ).toBeLessThanOrEqual(1);
  });

  it("accepts chat.abort only when it confirms the exact run", async () => {
    const callGateway = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, aborted: false, runIds: [] })
      .mockResolvedValueOnce({ deleted: true });

    await terminateAcceptedCollectorRun({
      childSessionKey: "agent:main:subagent:child",
      gatewayRunId: "gateway-run",
      expectedSessionId: "session-id",
      expectedLifecycleRevision: "session-revision",
      callGateway,
    });

    expect(callGateway).toHaveBeenNthCalledWith(2, {
      method: "sessions.delete",
      params: {
        key: "agent:main:subagent:child",
        emitLifecycleHooks: false,
        deleteTranscript: true,
        expectedSessionId: "session-id",
        expectedLifecycleRevision: "session-revision",
      },
      timeoutMs: 60_000,
    });
  });

  it("does not delete after chat.abort confirms the matching run", async () => {
    const callGateway = vi.fn(async () => ({
      ok: true,
      aborted: true,
      runIds: ["gateway-run"],
    }));

    await terminateAcceptedCollectorRun({
      childSessionKey: "agent:main:subagent:child",
      gatewayRunId: "gateway-run",
      expectedSessionId: "session-id",
      expectedLifecycleRevision: "session-revision",
      callGateway,
    });

    expect(callGateway).toHaveBeenCalledOnce();
  });

  it("stops without deleting a durable session when the accepted run already ended", async () => {
    const callGateway = vi.fn(async () => ({
      ok: true,
      aborted: false,
      runIds: [],
    }));

    await terminateAcceptedCollectorRun({
      childSessionKey: "agent:main:subagent:child",
      gatewayRunId: "gateway-run",
      sessionCleanup: "preserve",
      callGateway,
    });

    expect(callGateway).toHaveBeenCalledOnce();
  });

  it("reports an abort failure without deleting or retrying a durable session", async () => {
    const failure = new Error("gateway unavailable");
    const callGateway = vi.fn().mockRejectedValue(failure);
    await expect(
      terminateAcceptedCollectorRun({
        childSessionKey: "agent:main:subagent:child",
        gatewayRunId: "gateway-run",
        sessionCleanup: "preserve",
        callGateway,
      }),
    ).rejects.toBe(failure);
    expect(callGateway).toHaveBeenCalledOnce();
  });

  it("stops cleanup when guarded deletion observes a successor lifecycle", async () => {
    const callGateway = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, aborted: true, runIds: ["different-run"] })
      .mockRejectedValueOnce(sessionChangedError());

    // Termination resolves when the accepted run is stopped or provably no longer
    // ours, and rejects when that is unconfirmed; the rollback, sweep and collector
    // consumers translate the rejection into their kept-custody outcome. Here the
    // abort confirmed a DIFFERENT run, so deletion was attempted and refused with
    // session-changed, which proves a successor owns the session: resolved.
    await expect(
      terminateAcceptedCollectorRun({
        childSessionKey: "agent:main:subagent:child",
        gatewayRunId: "gateway-run",
        expectedSessionId: "session-id",
        expectedLifecycleRevision: "session-revision",
        callGateway,
      }),
    ).resolves.toBeUndefined();

    // Unchanged and the point of the case: bounded at exactly one abort plus one
    // guarded deletion, and no successor-owned session was deleted.
    expect(callGateway).toHaveBeenCalledTimes(2);
  });
});
