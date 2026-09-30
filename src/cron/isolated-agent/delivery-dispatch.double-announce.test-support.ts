// Pure delivery fixtures for the cron delivery-dispatch double-announce tests.
import type { dispatchCronDelivery } from "./delivery-dispatch.js";
import type { DeliveryTargetResolution } from "./delivery-target.js";

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

type SuccessfulDeliveryResolution = Extract<DeliveryTargetResolution, { ok: true }>;

export function makeResolvedDelivery(
  overrides: Partial<SuccessfulDeliveryResolution> = {},
): SuccessfulDeliveryResolution {
  return {
    ok: true,
    channel: "telegram",
    to: "123456",
    accountId: undefined,
    threadId: undefined,
    mode: "explicit",
    ...overrides,
  };
}
