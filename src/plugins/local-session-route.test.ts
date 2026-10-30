import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSessionEntryReadOnlyInWorker } from "../config/sessions/session-entry-read-runtime.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolvePluginLocalSessionRoute } from "./local-session-route.js";

vi.mock("../config/sessions/session-entry-read-runtime.js", () => ({
  readSessionEntryReadOnlyInWorker: vi.fn(),
}));

const cfg = { session: { store: "/tmp/oc-local-route/sessions.json" } } as OpenClawConfig;
const read = vi.mocked(readSessionEntryReadOnlyInWorker);
function entry(sessionKey: string, delivery?: { kind: "internal" | "none" }) {
  read.mockResolvedValue({ sessionId: "s1", updatedAt: 1, delivery });
}
function resolve(sessionKey: string) {
  return resolvePluginLocalSessionRoute({ cfg, sessionKey });
}

beforeEach(() => read.mockReset());

describe("exact plugin local session route proof", () => {
  it("proves an exact local child and refuses missing or deleted rows", async () => {
    const key = "agent:main:subagent:abc";
    entry(key);
    expect(await resolve(key)).toEqual({ sessionKey: key, exists: true, onHost: true });
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ sessionKey: key, agentId: "main" }),
    );
    read.mockResolvedValue(undefined);
    expect(await resolve(key)).toEqual({ sessionKey: key, exists: false, onHost: false });
  });

  it("never infers locality for shared main or channel keys", async () => {
    for (const key of ["agent:main:main", "agent:main:discord:channel:123"]) {
      entry(key, { kind: "internal" });
      expect(await resolve(key)).toEqual({ sessionKey: key, exists: true, onHost: false });
    }
  });

  it("reports global presence without claiming locality", async () => {
    entry("global");
    expect(await resolve("global")).toEqual({ sessionKey: "global", exists: true, onHost: false });
    read.mockResolvedValue(undefined);
    expect(await resolve("global")).toEqual({ sessionKey: "global", exists: false, onHost: false });
  });

  it("rejects external delivery and rechecks a reset child", async () => {
    const key = "agent:main:subagent:abc";
    read.mockResolvedValue({
      sessionId: "before",
      updatedAt: 1,
      delivery: {
        kind: "external",
        route: { channel: "discord", target: { to: "123" } },
        context: { channel: "discord", to: "123" },
        origin: {},
      },
    });
    expect((await resolve(key)).onHost).toBe(false);
    entry(key, { kind: "internal" });
    expect((await resolve(key)).onHost).toBe(true);
  });

  it("preserves case-distinct opaque peer identities on exact lookup", async () => {
    const key = "agent:main:signal:group:AbCd";
    expect((await resolve(key)).exists).toBe(false);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ sessionKey: key }));
  });
});
