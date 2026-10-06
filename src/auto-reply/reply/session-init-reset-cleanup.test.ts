import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions/types.js";
import { SessionContinuationResetError } from "../continuation/session-reset.js";
import { clearReplacedSessionRuntimeState } from "./session-init-reset-cleanup.js";
import { SessionResetCleanupError } from "./session-reset-cleanup.js";

const cleanupMocks = vi.hoisted(() => ({
  clearSessionResetRuntimeState: vi.fn(async () => {}),
}));

vi.mock("./session-reset-cleanup.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./session-reset-cleanup.js")>()),
  clearSessionResetRuntimeState: cleanupMocks.clearSessionResetRuntimeState,
}));

const params = {
  sessionKey: "agent:main:main",
  agentId: "main",
  previousSessionEntry: { sessionId: "previous", updatedAt: 1 } as SessionEntry,
  previousSessionEndReason: "new",
};

describe("clearReplacedSessionRuntimeState after a committed reset", () => {
  beforeEach(() => {
    cleanupMocks.clearSessionResetRuntimeState.mockReset().mockResolvedValue(undefined);
  });

  it("treats runtime cleanup failures as best-effort once the reset committed", async () => {
    cleanupMocks.clearSessionResetRuntimeState.mockRejectedValue(new Error("queue clear failed"));

    await expect(clearReplacedSessionRuntimeState(params)).resolves.toBeUndefined();
    expect(cleanupMocks.clearSessionResetRuntimeState).toHaveBeenCalledWith(
      ["agent:main:main", "previous"],
      expect.objectContaining({ activeReplySessionId: "previous", reason: "new" }),
    );
  });

  it("fails initialization when continuation custody cannot be cancelled durably", async () => {
    cleanupMocks.clearSessionResetRuntimeState.mockRejectedValue(
      new SessionContinuationResetError("flow-1", "database busy"),
    );

    await expect(clearReplacedSessionRuntimeState(params)).rejects.toBeInstanceOf(
      SessionResetCleanupError,
    );
  });
});
