import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadExactSessionEntryReadOnly } from "../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolvePluginLocalSessionRoute } from "./local-session-route.js";

vi.mock("../config/sessions/session-accessor.js", () => ({
  loadExactSessionEntryReadOnly: vi.fn(),
}));

const cfg = { session: { store: "/tmp/oc-local-route/sessions.json" } } as OpenClawConfig;
const read = vi.mocked(loadExactSessionEntryReadOnly);
function entry(sessionKey: string, delivery?: { kind: "internal" | "none" }) {
  read.mockReturnValue({ sessionKey, entry: { sessionId: "s1", updatedAt: 1, delivery } });
}
function resolve(sessionKey: string) {
  return resolvePluginLocalSessionRoute({ cfg, sessionKey });
}

beforeEach(() => read.mockReset());

describe("exact plugin local session route proof", () => {
  it("proves an exact local child and refuses missing or deleted rows", () => {
    const key = "agent:main:subagent:abc";
    entry(key);
    expect(resolve(key)).toEqual({ sessionKey: key, exists: true, onHost: true });
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ sessionKey: key, agentId: "main" }),
    );
    read.mockReturnValue(undefined);
    expect(resolve(key)).toEqual({ sessionKey: key, exists: false, onHost: false });
  });

  it("never infers locality for shared main or channel keys", () => {
    for (const key of ["agent:main:main", "agent:main:discord:channel:123"]) {
      entry(key, { kind: "internal" });
      expect(resolve(key)).toEqual({ sessionKey: key, exists: true, onHost: false });
    }
  });

  it("rejects external delivery and rechecks a reset child", () => {
    const key = "agent:main:subagent:abc";
    read.mockReturnValue({
      sessionKey: key,
      entry: {
        sessionId: "before",
        updatedAt: 1,
        delivery: {
          kind: "external",
          route: { channel: "discord", target: { to: "123" } },
          context: { channel: "discord", to: "123" },
          origin: {},
        },
      },
    });
    expect(resolve(key).onHost).toBe(false);
    entry(key, { kind: "internal" });
    expect(resolve(key).onHost).toBe(true);
  });

  it("preserves case-distinct opaque peer identities on exact lookup", () => {
    const key = "agent:main:signal:group:AbCd";
    expect(resolve(key).exists).toBe(false);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ sessionKey: key }));
  });

  it("fails closed on unreadable store", () => {
    const key = "agent:main:subagent:abc";
    read.mockImplementation(() => {
      throw new Error("unreadable");
    });
    expect(resolve(key)).toEqual({ sessionKey: key, exists: false, onHost: false });
  });
});
