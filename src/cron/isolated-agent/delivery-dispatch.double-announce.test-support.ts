// Pure delivery fixtures for the cron delivery-dispatch double-announce tests.
import type { dispatchCronDelivery } from "./delivery-dispatch.js";

type SourceOutcome = Parameters<typeof dispatchCronDelivery>[0]["sourceDeliveryOutcome"];
export function messageToolOutcome(
  targets: SourceOutcome["visibleDeliveries"][number]["target"][],
  verified = true,
): SourceOutcome {
  return {
    visibleDeliveries: targets.map((target) => ({
      via: "message_tool",
      target,
      verifiedTarget: verified,
    })),
    verifiedMessageToolDelivery: verified,
    satisfiesSourceDelivery: verified,
    unverifiedMessageToolDelivery: !verified,
  };
}
