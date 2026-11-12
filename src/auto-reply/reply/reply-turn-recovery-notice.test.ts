import { describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  entry: {
    sessionId: "retired",
    mainRestartRecovery: {
      cycleId: "cycle-1",
      tombstone: { reason: "automatic replay refused" },
    },
  },
}));

vi.mock("../../acp/runtime/session-meta.js", () => ({
  readAcpSessionEntryAsync: vi.fn(async () => null),
}));
vi.mock("../../config/sessions/session-accessor.js", () => ({
  loadSessionEntryReadOnly: vi.fn(() => fixture.entry),
}));
vi.mock("../../sessions/send-policy.js", () => ({
  resolveSendPolicy: vi.fn(() => "allow"),
}));

import { sendReplyRestartRecoveryNotice } from "./reply-turn-recovery-notice.js";

describe("restart recovery notice", () => {
  it("sends once per session cycle", async () => {
    const deliver = vi.fn(async (_text: string) => true);
    const params = {
      agentId: "main",
      cfg: {},
      sessionKey: "agent:main:notice-proof",
      storePath: "/tmp/restart-notice-proof",
      deliver,
    };
    await sendReplyRestartRecoveryNotice(params);
    await sendReplyRestartRecoveryNotice(params);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0]?.[0]).toContain("Use /reset or /new");

    fixture.entry.mainRestartRecovery.cycleId = "cycle-2";
    await sendReplyRestartRecoveryNotice(params);
    expect(deliver).toHaveBeenCalledTimes(2);
  });
});
