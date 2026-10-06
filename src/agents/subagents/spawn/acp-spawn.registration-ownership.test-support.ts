import { beforeEach, vi } from "vitest";
import { registerSubagentRun } from "../registry/subagent-registry.js";

// Imported for its side effect by acp-spawn.test.ts, whose vi.mock replaces
// registerSubagentRun with a bare vi.fn(). This root-level hook resets that mock
// before each test and gives it a structured result.
//
// The spawn pipeline awaits registerSubagentRun (now async upstream) and reads
// the resolved SubagentRegistrationOwnership's status unconditionally, so a
// bare vi.fn() (or upstream's `mockResolvedValue(undefined)`) is not enough.
// Derive the identity from the registration actually passed so `attempted`
// stays consistent with it, since rollback consumes that identity.
beforeEach(() => {
  vi.mocked(registerSubagentRun)
    .mockReset()
    .mockImplementation(async (registration) => ({
      status: "new-row-committed",
      attempted: {
        runId: registration.runId,
        childSessionKey: registration.childSessionKey,
        generation: 1,
        createdAt: Date.now(),
      },
    }));
});
