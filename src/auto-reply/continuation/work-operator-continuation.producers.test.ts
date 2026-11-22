// Continuation (karmaterminal): a continue_work wake is a new start (🌊's O4 ruling on #129388). A
// started run keeps its admission fixed (upstream #201377); the wake admits the retained source
// once, against the owner's current policy, through the custody's runWithRequester (upstream
// #202513). That admission narrows the source to its current role, never past the custody's own
// scopes, and refuses it only where upstream refuses a start (🌊 and 🩸's wake-admission ruling).
// These cases arm the real continue_work tool under a channel operator's and a scheduled
// operator's own authority, change that authority after the turn, then run the real wake.
// Real: the channel ingress and host context, the scheduled source restore, the continue_work
// tool, the in-process custody capture, the wake's start admission and the in-process Gateway
// dispatch the wake's tools use. Observed only: the turn the wake would start and the failed row
// it would write.
import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, expect, it, vi } from "vitest";
import type { AdmittedRunOperatorAuthority } from "../../agents/admitted-run-context.js";
import { createContinueWorkTool } from "../../agents/tools/continue-work-tool.js";
import { withGatewayToolCallerIdentity } from "../../agents/tools/gateway-caller-context.js";
import { withAdminIngress } from "../../channels/message-access/operator-authority.test-support.js";
import { setRuntimeConfigSnapshot } from "../../config/runtime-snapshot.js";
import { captureQueuedOperatorRecoverySource } from "../../gateway/operator-run-recovery-source.js";
import { withRecovery } from "../../gateway/operator-run-recovery.test-support.js";
import type { OperatorScope } from "../../gateway/operator-scopes.js";
import type { GatewayRequestContext } from "../../gateway/server-methods/types.js";
import { removePairedDevice } from "../../infra/device-pairing.js";
import { getPluginRuntimeGatewayRequestScope } from "../../plugins/runtime/gateway-request-scope.js";
import { trackAsyncWork } from "../../shared/async-work-scope.js";
import { changeCanonicalUserChannelIdentity } from "../../state/user-channel-identity-operations.js";
import { mergeProfiles, setUserProfileRole } from "../../state/user-profile-writes.worker.js";
import { ensureProfileForEmail } from "../../state/user-profiles.js";
import { getCommandOwnerAuthority } from "../command-owner-authority.js";
import type { ContinueWorkRequest } from "./types.js";
import type { PendingContinuationWork } from "./work-flow-state.js";
import {
  executePendingWorkWithOperatorContinuation,
  resetWorkOperatorContinuationsForTests,
  retainWorkOperatorContinuation,
} from "./work-operator-continuation.js";

const observed = vi.hoisted(() => ({
  turns: [] as Array<{
    authority: AdmittedRunOperatorAuthority | undefined;
    scopes: readonly string[] | undefined;
    admin: string;
  }>,
  failed: [] as Array<{ summary: string; options: unknown[] }>,
}));
vi.mock("./work-dispatch-execution.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./work-dispatch-execution.js")>()),
  executePendingContinuationWork: async () => {
    // The scope the wake's turn and its tools run in (what its reply runtime reads).
    const client = getPluginRuntimeGatewayRequestScope()?.client;
    const { dispatchGatewayMethodInProcess } =
      await import("../../gateway/server-plugin-in-process-dispatch.js");
    const admin = await dispatchGatewayMethodInProcess("exec.approvals.get", {}).then(
      () => "allowed",
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    observed.turns.push({
      authority: client?.internal?.operatorRunAuthority,
      scopes: client?.connect.scopes,
      admin,
    });
    return { kind: "dispatched" as const };
  },
}));
vi.mock("./work-store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./work-store.js")>()),
  markPendingWorkFailed: async (
    _work: PendingContinuationWork,
    summary: string,
    ...options: unknown[]
  ) => {
    observed.failed.push({ summary, options });
    return true;
  },
}));

afterEach(() => {
  resetWorkOperatorContinuationsForTests();
  observed.turns.length = 0;
  observed.failed.length = 0;
});

const ADMIN: OperatorScope[] = ["operator.admin"];
const MEMBER: OperatorScope[] = ["operator.read", "operator.write"];
// The generic refusal upstream's admission raises for a changed identity or credential.
const AUTHORITY_CHANGED = "Restart recovery operator authority changed; start a new user turn.";

type Expected = { dispatched: readonly string[] } | { refused: string };

/** One turn's continue_work call under the producer's authority, and the wake it armed. */
async function armContinueWork(params: {
  sessionKey: string;
  authority: AdmittedRunOperatorAuthority;
  context: GatewayRequestContext;
}) {
  const requests: ContinueWorkRequest[] = [];
  const tool = createContinueWorkTool({
    agentSessionKey: params.sessionKey,
    requestContinuation: (request) => {
      requests.push(request);
    },
  });
  await withGatewayToolCallerIdentity(
    {
      agentId: "main",
      sessionKey: params.sessionKey,
      operatorAuthority: params.authority,
      gatewayContextResolver: () => params.context,
    },
    () => tool.execute("continue-1", { reason: "finish the second half", delaySeconds: 5 }),
  );
  const custody = expectDefined(requests[0]?.operatorContinuation, "retained operator custody");
  const retained = expectDefined(custody.operatorAuthority, "retained operator authority");
  const flowId = `flow-${params.sessionKey}`;
  retainWorkOperatorContinuation(flowId, params.sessionKey, custody);
  const work: PendingContinuationWork = {
    sessionKey: params.sessionKey,
    hop: 1,
    delayMs: 5_000,
    electedAt: Date.now(),
    dueAt: Date.now(),
    maxChainLength: 5,
    operatorAuthorityRequired: true,
    flowId,
    expectedRevision: 1,
  };
  return {
    retained: retained as AdmittedRunOperatorAuthority,
    wake: () =>
      executePendingWorkWithOperatorContinuation(
        work,
        {} as Parameters<typeof executePendingWorkWithOperatorContinuation>[1],
        new AbortController().signal,
      ),
  };
}

function expectWake(
  result: Awaited<ReturnType<typeof executePendingWorkWithOperatorContinuation>>,
  arming: { profileId: string; retained: AdmittedRunOperatorAuthority },
  expected: Expected,
) {
  if ("refused" in expected) {
    // Refused before a turn starts: no execution, no tool dispatch, and no notice owed.
    expect(result).toEqual({ kind: "failed" });
    expect(observed.turns).toEqual([]);
    expect(observed.failed).toEqual([
      {
        summary: expect.stringContaining(
          `Retained operator authority revoked: ${expected.refused}`,
        ),
        options: [],
      },
    ]);
    return;
  }
  expect(result).toEqual({ kind: "dispatched" });
  expect(observed.failed).toEqual([]);
  expect(observed.turns).toHaveLength(1);
  const turn = expectDefined(observed.turns[0], "the wake's turn");
  const authority = expectDefined(turn.authority, "the wake's admitted operator authority");
  expect(authority.profileId).toBe(arming.profileId);
  expect(authority.scopes).toEqual(expected.dispatched);
  expect(turn.scopes).toEqual(expected.dispatched);
  // The wake's tools hold exactly the admitted scopes: admin only where admission kept it.
  expect(turn.admin).toEqual(
    expected.dispatched.includes("operator.admin")
      ? "allowed"
      : expect.stringContaining("missing scope: operator.admin"),
  );
  // Admitted at start for the arming requester, not the arming turn's authority reused.
  expect(authority).not.toBe(arming.retained);
}

// The custody restores a saved channel source at the wake's start; a source past its recovery
// bound keeps the live channel authority itself (upstream's "preserves live channel work at
// recovery bounds"), which a start re-admits as a live profile-backed source.
it.for([
  { source: "saved", change: "authorized", expected: { dispatched: ADMIN } },
  // Every profile authority change clears its saved channel authorizations, and an unlinked
  // identity has none: the saved source resolves no linked identity, so its start is refused.
  { source: "saved", change: "role demoted", expected: { refused: AUTHORITY_CHANGED } },
  { source: "saved", change: "identity unlinked", expected: { refused: AUTHORITY_CHANGED } },
  { source: "live", change: "authorized", expected: { dispatched: ADMIN } },
  // A live profile-backed source re-reads its current role: member scopes, never admin.
  { source: "live", change: "role demoted", expected: { dispatched: MEMBER } },
  // It needs its profile to exist, not every binding of it.
  { source: "live", change: "identity unlinked", expected: { dispatched: ADMIN } },
  {
    source: "live",
    change: "agent excluded",
    expected: { refused: 'Your operator role cannot create sessions for agent "main".' },
  },
  {
    source: "live",
    change: "role without scopes",
    expected: {
      refused:
        "Gateway access is not active for this requester; ask an administrator to restore access.",
    },
  },
  {
    source: "live",
    change: "profile merged away",
    expected: { refused: "user profile not found" },
  },
] as const)(
  "a channel operator's continue_work wake admits the $source source at start ($change)",
  ({ source, change, expected }) =>
    withAdminIngress(async ({ admins, cfg, context, gateway, activatePolicy }) => {
      const admin = expectDefined(admins[0], "linked channel operator");
      // As a production Gateway context does, resolve the owner a detached capture restores against,
      // and track the in-process requests the wake's tools dispatch.
      gateway.resolveGatewayContext = () => gateway;
      gateway.trackExecution = trackAsyncWork;
      if (source === "live") {
        cfg.agents = { entries: { main: { model: "fixture/permitted" } } };
        const roles = expectDefined(cfg.gateway?.roles, "configured channel roles");
        const adminRole = expectDefined(roles.definitions.admin, "administrator role");
        await activatePolicy({
          roles: {
            ...roles,
            definitions: {
              ...roles.definitions,
              admin: {
                ...adminRole,
                modelPolicy: {
                  sourceAgent: "main",
                  allow: ["fixture/*"],
                  deny: Array.from({ length: 257 }, (_, index) => `fixture/blocked-${index}/*`),
                },
              },
              // Each leaves exactly one admission rule to refuse the wake.
              "other-agent": { scopes: MEMBER, agents: ["other"], sessions: { others: "view" } },
              suspended: { scopes: [], agents: "*", sessions: { others: "none" } },
            },
          },
        });
      }
      const turn = await context(admin.identity.senderId);
      const authority = expectDefined(
        getCommandOwnerAuthority(turn)?.operatorAuthority,
        "channel operator authority",
      );
      expect(captureQueuedOperatorRecoverySource(authority)?.kind).toBe(
        source === "saved" ? "channel" : "unavailable",
      );
      const { retained, wake } = await armContinueWork({
        sessionKey: expectDefined(turn.SessionKey, "channel session"),
        authority,
        context: gateway,
      });
      // The custody retains the arming authority; the wake's start restores and admits it.
      expect(retained).toBe(authority);

      if (change === "role demoted") {
        setUserProfileRole(admin.profile.id, "member");
      } else if (change === "identity unlinked") {
        await changeCanonicalUserChannelIdentity("unlink", admin.profile.id, admin.identity);
      } else if (change === "agent excluded") {
        setUserProfileRole(admin.profile.id, "other-agent");
      } else if (change === "role without scopes") {
        setUserProfileRole(admin.profile.id, "suspended");
      } else if (change === "profile merged away") {
        mergeProfiles(admin.profile.id, ensureProfileForEmail("successor@example.test").id);
      }
      expectWake(await wake(), { profileId: admin.profile.id, retained }, expected);
    }),
);

it.for([
  { change: "authorized", expected: { dispatched: ADMIN } },
  // No role is configured, so the new assignment restricts nothing and the device keeps admin.
  { change: "role changed", expected: { dispatched: ADMIN } },
  { change: "device removed", expected: { refused: AUTHORITY_CHANGED } },
] as const)(
  "a scheduled operator's continue_work wake admits the restored source at start ($change)",
  ({ change, expected }) =>
    withRecovery(async (fixture, stateDir, profile) => {
      setRuntimeConfigSnapshot({});
      // A scheduled run's authority: restoreCronOperatorSource restores its saved source here.
      const scheduled = expectDefined(await fixture.restore(), "scheduled operator authority");
      try {
        const { retained, wake } = await armContinueWork({
          sessionKey: fixture.target.sessionKey,
          authority: scheduled.authority,
          context: fixture.context,
        });
        // The custody retains the run's authority past the occurrence; the wake restores it.
        expect(retained).toBe(scheduled.authority);
        expect(retained.recoverySnapshot).toBeDefined();
        fixture.retire();
        scheduled.release();

        if (change === "role changed") {
          setUserProfileRole(profile.id, "viewer");
        } else if (change === "device removed") {
          // Upstream #202513: a start reads the paired-device record, not the revocation index.
          expect(await removePairedDevice("recovery-device", stateDir)).not.toBeNull();
        }
        expectWake(await wake(), { profileId: profile.id, retained }, expected);
      } finally {
        scheduled.release();
      }
    }),
);
