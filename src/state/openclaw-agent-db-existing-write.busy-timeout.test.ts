import { describe, expect, it, vi } from "vitest";
import { OPENCLAW_SQLITE_BUSY_TIMEOUT_MS } from "./openclaw-state-db-contract.js";

// Regression guard for karmaterminal/openclaw#1365.
//
// The agent-database maintenance admission write used to pass `busyTimeoutMs: 0`,
// overriding the contract default. `runExistingOpenClawStateWriteTransaction`
// resolves `contract.busyTimeoutMs ?? OPENCLAW_SQLITE_BUSY_TIMEOUT_MS`, so that
// override gave this BEGIN one attempt and zero wait. It then lost
// deterministically to a concurrent `state.write` that the same gateway startup
// creates — reproduced twice, the second time on a deliberately quiet host — and
// because the agent-database schema had already advanced by then, the seat was
// left with no startable build in either direction.
//
// This asserts the EFFECTIVE timeout the callee will compute, not merely that a
// line is absent, so it keeps meaning if the default is ever renamed or moved.
const captured: Array<{ operationLabel: string; busyTimeoutMs?: number }> = [];

vi.mock("./openclaw-state-db-existing-write.js", () => ({
  runExistingOpenClawStateWriteTransaction: (
    _operation: unknown,
    _options: unknown,
    contract: { operationLabel: string; busyTimeoutMs?: number },
  ) => {
    captured.push({
      operationLabel: contract.operationLabel,
      busyTimeoutMs: contract.busyTimeoutMs,
    });
    return undefined;
  },
}));

const { withExistingAgentLeaseWrite } = await import("./openclaw-agent-db-existing-write.js");

describe("agent database maintenance admission busy timeout (#1365)", () => {
  it("inherits the shared existing-state default instead of overriding it to zero", () => {
    captured.length = 0;
    const maintenance = { assertCurrent: vi.fn(), assertOwnedInTransaction: vi.fn() };
    withExistingAgentLeaseWrite(maintenance as never, {}, () => undefined);

    expect(captured).toHaveLength(1);
    const contract = captured[0];
    expect(contract?.operationLabel).toBe("agent.database.maintenance.admission");

    // The effective value the callee resolves. This is the assertion that matters:
    // zero here is the defect, and it must be the shared 5s default.
    const effective = contract?.busyTimeoutMs ?? OPENCLAW_SQLITE_BUSY_TIMEOUT_MS;
    expect(effective).toBe(OPENCLAW_SQLITE_BUSY_TIMEOUT_MS);
    expect(effective).toBeGreaterThan(0);
  });

  it("pins the shared default so a silent change to it cannot pass unnoticed", () => {
    // If this ever legitimately changes, the change should be deliberate and
    // visible in a diff rather than quietly altering every existing-state write.
    expect(OPENCLAW_SQLITE_BUSY_TIMEOUT_MS).toBe(5_000);
  });
});
