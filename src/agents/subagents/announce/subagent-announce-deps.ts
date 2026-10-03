import { createLazyImportLoader } from "../../../shared/lazy-promise.js";
import * as subagentAnnounceRuntime from "./subagent-announce.runtime.js";
import {
  callSubagentLifecycleGateway,
  dispatchGatewayMethodInProcess,
  getRuntimeConfig,
} from "./subagent-announce.runtime.js";

const subagentRegistryRuntimeLoader = createLazyImportLoader(
  () => import("../registry/subagent-registry.js"),
);
const subagentContinuationRuntimeLoader = createLazyImportLoader(
  () => import("../../subagent-announce.continuation.runtime.js"),
);

function loadSubagentRegistryRuntime() {
  return subagentRegistryRuntimeLoader.load();
}

export function loadSubagentContinuationRuntime() {
  return subagentContinuationRuntimeLoader.load();
}

type SubagentAnnounceDeps = {
  // Cleanup and descendant-wake termination keep the run's inherited Gateway binding (#146369).
  callGateway: typeof callSubagentLifecycleGateway;
  dispatchGatewayMethodInProcess: typeof dispatchGatewayMethodInProcess;
  getRuntimeConfig: typeof getRuntimeConfig;
  loadSubagentRegistryRuntime: typeof loadSubagentRegistryRuntime;
  resolveContinuationRuntimeConfig: typeof subagentAnnounceRuntime.resolveContinuationRuntimeConfig;
};

// Continuation config is resolved through the runtime barrel at call time, not
// bound at import. Upstream's announce tests replace that barrel with a mock that
// lists only the core exports; binding a continuation-only export at import would make
// every such suite fail to load, while call-time access keeps our mocks of it
// effective for the continuation paths that actually use it.
const resolveContinuationRuntimeConfig: SubagentAnnounceDeps["resolveContinuationRuntimeConfig"] = (
  ...args
) => subagentAnnounceRuntime.resolveContinuationRuntimeConfig(...args);

const defaultSubagentAnnounceDeps: SubagentAnnounceDeps = {
  callGateway: callSubagentLifecycleGateway,
  dispatchGatewayMethodInProcess,
  getRuntimeConfig,
  loadSubagentRegistryRuntime,
  resolveContinuationRuntimeConfig,
};

export let subagentAnnounceDeps: SubagentAnnounceDeps = defaultSubagentAnnounceDeps;

export const testing = {
  setDepsForTest(
    overrides?: Partial<SubagentAnnounceDeps> & {
      callGateway?: typeof callSubagentLifecycleGateway;
    },
  ) {
    const callGatewayOverride = overrides?.callGateway;
    const dispatchGatewayMethodInProcessOverride =
      overrides?.dispatchGatewayMethodInProcess ??
      (callGatewayOverride
        ? ((async (method, agentParams, options) =>
            await callGatewayOverride({
              method,
              params: agentParams,
              expectFinal: options?.expectFinal,
              timeoutMs: options?.timeoutMs,
            })) satisfies typeof dispatchGatewayMethodInProcess)
        : undefined);
    subagentAnnounceDeps = overrides
      ? {
          ...defaultSubagentAnnounceDeps,
          ...overrides,
          ...(dispatchGatewayMethodInProcessOverride
            ? { dispatchGatewayMethodInProcess: dispatchGatewayMethodInProcessOverride }
            : {}),
        }
      : defaultSubagentAnnounceDeps;
  },
};
