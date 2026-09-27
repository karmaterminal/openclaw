import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordSubagentTerminalState: vi.fn(async () => {}),
  completeTaskRunByRunIdAsync: vi.fn(async (params: { taskId?: string }) =>
    params.taskId ? [{ taskId: params.taskId, status: "succeeded" as const }] : [],
  ),
}));

export const timingLifecycleMocks = {
  get recordSubagentTerminalState() {
    return mocks.recordSubagentTerminalState;
  },
  get completeTaskRunByRunIdAsync() {
    return mocks.completeTaskRunByRunIdAsync;
  },
};

vi.mock("../sessions/subagent-terminal-state.js", () => ({
  recordSubagentTerminalState: mocks.recordSubagentTerminalState,
}));

vi.mock("../tasks/detached-task-runtime.async.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tasks/detached-task-runtime.async.js")>()),
  completeTaskRunByRunIdAsync: mocks.completeTaskRunByRunIdAsync,
}));
