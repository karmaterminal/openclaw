/**
 * Shared subagent registry mocks.
 *
 * Tests import this module to hoist gateway/event mocks consistently before
 * registry modules resolve their runtime dependencies.
 */
import { vi } from "vitest";

const noop = () => {};
const sharedMocks = vi.hoisted(() => ({
  callGateway: vi.fn(async () => ({
    status: "ok" as const,
    startedAt: 111,
    endedAt: 222,
  })),
  onAgentEvent: vi.fn(() => noop),
}));

/**
 * Tests assert THIS object's spies, not a separately imported `onAgentEvent`
 * binding: asserting the imported binding cannot distinguish "the listener was
 * never installed" from "two module identities exist and the spy you hold is not
 * the one the registry called".
 *
 * Getters rather than a direct re-export, because a vi.hoisted() result cannot
 * itself be exported ("Cannot export hoisted variable"). These resolve to the same
 * spy objects the vi.mock factories below hand to the runtime.
 */
export const sharedRegistryMocks = {
  get callGateway() {
    return sharedMocks.callGateway;
  },
  get onAgentEvent() {
    return sharedMocks.onAgentEvent;
  },
};

vi.mock("../../../gateway/call.js", () => ({
  callGateway: sharedMocks.callGateway,
}));

vi.mock("../../../infra/agent-events.js", () => ({
  getAgentEventLifecycleGeneration: () => "test-generation",
  isAgentEventLifecycleGenerationCurrent: (generation: string) => generation === "test-generation",
  onAgentEvent: sharedMocks.onAgentEvent,
  registerAgentEventLifecycleRotationHandler: vi.fn(),
}));
vi.mock("../../../infra/agent-run-registry.js", () => ({
  getAgentRunLifecycleGeneration: () => "test-generation",
  getAgentRunContext: () => undefined,
  listAgentRunsForSession: () => [],
  hasLiveAgentRunContext: () => false,
}));
