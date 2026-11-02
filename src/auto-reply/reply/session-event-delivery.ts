import type { ReplyPayload } from "../../shared/reply-payload.types.js";
import type { DeliveryContext } from "../../utils/delivery-context.types.js";
import { isAgentRunFailurePayload } from "../reply-payload.js";
import type { SessionEventOptions, SessionEventTarget } from "./session-event-contract.js";

type RouteReplyParams = Parameters<typeof import("./route-reply.js").routeReply>[0];
type SessionEventDeliveryParams = Pick<
  RouteReplyParams,
  | "cfg"
  | "agentId"
  | "sessionKey"
  | "payload"
  | "replyKind"
  | "abortSignal"
  | "beforeDeliver"
  | "assertCurrent"
>;

/**
 * Producer opt-outs keep a session event off its transport route. A scheduled turn also keeps
 * its run-failure copy off the route: that copy is interactive recovery advice, not the job's
 * result, and Cron records the failed run and owns its failure alerts (#1447).
 */
export function isDeliveryWithheld(
  options: Pick<SessionEventOptions, "deliver" | "scheduledAutomation">,
  target: Pick<SessionEventTarget, "deliver"> | undefined,
  payload: ReplyPayload,
): boolean {
  return (
    options.deliver === false ||
    target?.deliver === false ||
    (options.scheduledAutomation !== undefined && isAgentRunFailurePayload(payload))
  );
}

export async function prepareSessionEventDelivery(
  route: DeliveryContext,
  assertCurrent: () => void,
): Promise<
  (params: SessionEventDeliveryParams) => ReturnType<typeof import("./route-reply.js").routeReply>
> {
  const { isRoutableChannel, routeReply, routePreparedReply } = await import("./route-reply.js");
  assertCurrent();
  if (!isRoutableChannel(route.channel) || !route.to) {
    throw new Error(
      "Session event has no original external delivery route; inspect the session result or choose a delivery destination",
    );
  }
  const { channel, to, accountId, threadId } = route;
  return async (params) => {
    const { payload, ...delivery } = params;
    const destination = { channel, to, accountId, threadId, mirror: false };
    if (params.replyKind !== "final") {
      return routeReply({ ...params, ...destination });
    }
    // Dispatch already applied final lane policy and normalized this payload.
    // Preserve admitted reasoning without enabling raw tool or block reasoning.
    const { createStructuredOutboundPayloadPlan } =
      await import("../../infra/outbound/payloads.js");
    const [plan] = createStructuredOutboundPayloadPlan([payload]);
    if (!plan) {
      return { ok: true, delivered: false, suppressed: true };
    }
    return routePreparedReply({ ...delivery, ...destination, plan });
  };
}
