import { expect } from "vitest";
import { runWithOperatorToolGatewayAuthority } from "../../gateway/operator-tool-gateway-authority.js";
import { withPluginRuntimeGatewayRequestScope } from "../../plugins/runtime/gateway-request-scope.js";
import { dispatchPendingContinuationWorkFromDetachedCallback } from "./work-dispatch.js";
import { enqueuePendingWork } from "./work-store.test-support.js";

type ObservedAuthority = { direct: boolean; requestClient: boolean; resolver: boolean };

export async function runDetachedAuthorityFossil(params: {
  mockSessionStore: Record<string, unknown>;
  observedDetachedAuthority: ObservedAuthority[];
  turnGrants: unknown[];
}): Promise<void> {
  const sessionKey = "agent:main:detached-authority";
  params.mockSessionStore[sessionKey] = { sessionKey };
  const resolveGatewayContext = () => undefined;
  params.observedDetachedAuthority.push({ direct: true, requestClient: true, resolver: false });
  await enqueuePendingWork({
    sessionKey,
    hop: 1,
    delayMs: 0,
    electedAt: Date.now(),
    dueAt: Date.now(),
    maxChainLength: 8,
    reason: "detached authority",
  });
  await runWithOperatorToolGatewayAuthority(
    {
      assertCurrent: () => {
        throw new Error("Gateway caller authority is no longer active.");
      },
    } as Parameters<typeof runWithOperatorToolGatewayAuthority>[0],
    () =>
      withPluginRuntimeGatewayRequestScope(
        {
          isWebchatConnect: () => false,
          resolveGatewayContext,
          client: { authenticatedUserProfile: { profileId: "owner" } } as Parameters<
            typeof withPluginRuntimeGatewayRequestScope
          >[0]["client"],
          hasCurrentClientAuthority: () => false,
        },
        async () => await dispatchPendingContinuationWorkFromDetachedCallback({ sessionKey }),
      ),
  );
  expect(params.observedDetachedAuthority).toEqual([
    { direct: false, requestClient: false, resolver: true },
  ]);
  expect(params.turnGrants).toHaveLength(1);
}
