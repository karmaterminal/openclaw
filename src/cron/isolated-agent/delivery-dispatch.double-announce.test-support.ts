// Pure delivery fixtures for the cron delivery-dispatch double-announce tests.
import type { dispatchCronDelivery } from "./delivery-dispatch.js";
import { makeBaseParams } from "./delivery-dispatch.test-fixtures.js";

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

export function emptyParams(spawnOnlyHandoff = false, deliveryBestEffort = false) {
  const params = makeBaseParams({ spawnOnlyHandoff, deliveryBestEffort, synthesizedText: "" });
  params.synthesizedText = undefined;
  params.deliveryPayloads = [];
  params.summary = undefined;
  params.outputText = undefined;
  return params;
}

export function deletingRunParams(sessionTarget = "isolated") {
  const params = makeBaseParams({ synthesizedText: "Delivered report", sessionTarget });
  params.job.deleteAfterRun = true;
  return params;
}
