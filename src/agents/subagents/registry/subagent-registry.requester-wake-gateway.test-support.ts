// Gateway response shape for the requester-wake product-flow fixture, split from
// subagent-registry.requester-wake.e2e.test.ts for its line budget.
import type { deliverAgentCommandResult } from "../../command/delivery.js";
import type { EmbeddedAgentRunResult } from "../../embedded-agent-runner/types.js";

type GatewayDeliveryStatus = NonNullable<
  Awaited<ReturnType<typeof deliverAgentCommandResult>>["deliveryStatus"]
>;

export type RequesterWakeGatewayResponse = {
  status?: string;
  runId?: string;
  messages?: Array<Record<string, unknown>>;
  result?: Partial<EmbeddedAgentRunResult> & { deliveryStatus?: Partial<GatewayDeliveryStatus> };
};
