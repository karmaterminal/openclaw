import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordSubagentTerminalState: vi.fn(async () => {}),
}));

export const timingLifecycleMocks = {
  get recordSubagentTerminalState() {
    return mocks.recordSubagentTerminalState;
  },
};

// mock-isolation: Terminal states are recorded without writing session state events.
vi.mock("../sessions/subagent-terminal-state.js", () => ({
  recordSubagentTerminalState: mocks.recordSubagentTerminalState,
}));
