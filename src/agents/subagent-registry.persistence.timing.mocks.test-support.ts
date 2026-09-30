import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordSubagentTerminalState: vi.fn(async () => {}),
}));

export const timingLifecycleMocks = {
  get recordSubagentTerminalState() {
    return mocks.recordSubagentTerminalState;
  },
};

vi.mock("../sessions/subagent-terminal-state.js", () => ({
  recordSubagentTerminalState: mocks.recordSubagentTerminalState,
}));
