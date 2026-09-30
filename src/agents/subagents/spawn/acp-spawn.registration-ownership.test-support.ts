import { beforeEach, vi } from "vitest";
import { registerSubagentRun } from "../registry/subagent-registry.js";

// Imported for its side effect by acp-spawn.test.ts, whose vi.mock replaces
// registerSubagentRun with a bare vi.fn(). This root-level hook resets that mock
// before each test and gives it a structured result.
//
// Our fork's spawn-pipeline requires a structured SubagentRegistrationOwnership
// and reads registrationResult.status unconditionally; upstream's pipeline
// instead treats the return as an optional promise (`if (completion) await
// completion`), which a bare vi.fn() satisfies. Derive the identity from the
// registration actually passed so `attempted` stays consistent with it, since
// rollback consumes that identity. See karmaterminal/openclaw#1361 for this
// divergence class.
beforeEach(() => {
  vi.mocked(registerSubagentRun)
    .mockReset()
    .mockImplementation((registration) => ({
      status: "new-row-committed",
      attempted: {
        runId: registration.runId,
        childSessionKey: registration.childSessionKey,
        generation: 1,
        createdAt: Date.now(),
      },
    }));
});
