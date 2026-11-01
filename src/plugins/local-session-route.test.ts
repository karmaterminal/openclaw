import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSessionEntryReadOnlyInWorker } from "../config/sessions/session-entry-read-runtime.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createWorkerSessionPlacementStore } from "../gateway/worker-environments/placement-store.js";
import { listSessionBindingsBySessionAsync } from "../infra/outbound/session-binding-service.js";
import { resolvePluginLocalSessionRoute } from "./local-session-route.js";

vi.mock("../config/sessions/session-entry-read-runtime.js", () => ({
  readSessionEntryReadOnlyInWorker: vi.fn(),
}));
vi.mock("../gateway/worker-environments/placement-store.js", () => ({
  createWorkerSessionPlacementStore: vi.fn(),
}));
vi.mock("../infra/outbound/session-binding-service.js", () => ({
  listSessionBindingsBySessionAsync: vi.fn(),
}));

const cfg = { session: { store: "/tmp/oc-local-route/sessions.json" } } as OpenClawConfig;
const read = vi.mocked(readSessionEntryReadOnlyInWorker);
const readProjection = vi.fn();
const listBindings = vi.mocked(listSessionBindingsBySessionAsync);
function entry(sessionKey: string, delivery?: { kind: "internal" | "none" }) {
  read.mockResolvedValue({ sessionId: "s1", lifecycleRevision: "r1", updatedAt: 1, delivery });
}
function resolve(sessionKey: string) {
  return resolvePluginLocalSessionRoute({ cfg, sessionKey });
}

beforeEach(() => {
  read.mockReset();
  readProjection.mockReset().mockResolvedValue({ placements: new Map() });
  listBindings.mockReset().mockResolvedValue([]);
  vi.mocked(createWorkerSessionPlacementStore).mockReturnValue({ readProjection } as never);
});

describe("exact plugin local session route proof", () => {
  it("proves an exact local child and refuses missing or deleted rows", async () => {
    const key = "agent:main:subagent:abc";
    entry(key);
    expect(await resolve(key)).toEqual({
      sessionKey: key,
      exists: true,
      onHost: true,
      sessionId: "s1",
      lifecycleRevision: "r1",
    });
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ sessionKey: key, agentId: "main" }),
    );
    read.mockResolvedValue(undefined);
    expect(await resolve(key)).toEqual({
      sessionKey: key,
      exists: false,
      onHost: false,
      sessionId: null,
      lifecycleRevision: null,
    });
  });

  it("does not reuse a row from a previous configured store", async () => {
    const key = "agent:main:subagent:abc";
    entry(key);
    expect((await resolve(key)).onHost).toBe(true);
    const nextConfig = { session: { store: "/tmp/oc-local-route/other.json" } } as OpenClawConfig;
    read.mockResolvedValueOnce(undefined);
    expect(await resolvePluginLocalSessionRoute({ cfg: nextConfig, sessionKey: key })).toEqual({
      sessionKey: key,
      exists: false,
      onHost: false,
      sessionId: null,
      lifecycleRevision: null,
    });
    expect(read).toHaveBeenLastCalledWith(
      expect.objectContaining({
        storePath: "/tmp/oc-local-route/other.json",
        sessionKey: key,
      }),
    );
  });

  it("never infers locality for shared main or channel keys", async () => {
    for (const key of ["agent:main:main", "agent:main:discord:channel:123"]) {
      entry(key, { kind: "internal" });
      expect(await resolve(key)).toEqual({
        sessionKey: key,
        exists: true,
        onHost: false,
        sessionId: "s1",
        lifecycleRevision: "r1",
      });
    }
  });

  it("reports global presence without claiming locality", async () => {
    entry("global");
    expect(await resolve("global")).toEqual({
      sessionKey: "global",
      exists: true,
      onHost: false,
      sessionId: "s1",
      lifecycleRevision: "r1",
    });
    read.mockResolvedValue(undefined);
    expect(await resolve("global")).toEqual({
      sessionKey: "global",
      exists: false,
      onHost: false,
      sessionId: null,
      lifecycleRevision: null,
    });
  });

  it("rejects external delivery and rechecks a reset child", async () => {
    const key = "agent:main:subagent:abc";
    read.mockResolvedValue({
      sessionId: "before",
      lifecycleRevision: "before-revision",
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

  it("does not claim locality for a child retaining legacy external-route metadata", async () => {
    const key = "agent:main:subagent:legacy";
    read.mockResolvedValue({
      sessionId: "legacy",
      lifecycleRevision: "legacy-revision",
      updatedAt: 1,
      delivery: { kind: "internal" },
      lastChannel: "discord",
      lastTo: "channel:123",
    });
    expect(await resolve(key)).toEqual({
      sessionKey: key,
      exists: true,
      onHost: false,
      sessionId: "legacy",
      lifecycleRevision: "legacy-revision",
    });
  });

  it("rejects a thread-bound child even when its row delivery and placement look local", async () => {
    const key = "agent:main:subagent:thread-bound";
    entry(key, { kind: "internal" });
    listBindings.mockResolvedValueOnce([
      {
        bindingId: "thread-binding",
        targetSessionKey: key,
        targetKind: "subagent",
        conversation: { channel: "discord", accountId: "default", conversationId: "thread:123" },
        status: "active",
        boundAt: 1,
      },
    ]);
    expect(await resolve(key)).toMatchObject({ exists: true, onHost: false, sessionId: "s1" });
    expect(listBindings).toHaveBeenCalledWith(key);
    expect(readProjection).not.toHaveBeenCalled();
    expect(await resolve(key)).toMatchObject({ exists: true, onHost: true, sessionId: "s1" });
  });

  it("fails closed when binding lookup cannot prove absence", async () => {
    const key = "agent:main:subagent:abc";
    entry(key);
    listBindings.mockRejectedValueOnce(new Error("binding owner unavailable"));
    expect(await resolve(key)).toMatchObject({ exists: false, onHost: false });
    expect(readProjection).not.toHaveBeenCalled();
  });

  it("uses current exact placement ownership, rejecting remote and uncertain placements", async () => {
    const key = "agent:main:subagent:abc";
    entry(key);
    const placement = { sessionId: "s1", sessionKey: key, agentId: "main" };
    readProjection.mockResolvedValueOnce({
      placements: new Map([["s1", { ...placement, state: "active" }]]),
    });
    expect(await resolve(key)).toMatchObject({ exists: true, onHost: false });
    expect(readProjection).toHaveBeenCalledWith(["s1"], { current: true });

    readProjection.mockResolvedValueOnce({
      placements: new Map([["s1", { ...placement, state: "local" }]]),
    });
    expect(await resolve(key)).toMatchObject({ exists: true, onHost: true });

    readProjection.mockResolvedValueOnce({
      placements: new Map([
        ["s1", { ...placement, sessionKey: "agent:main:subagent:other", state: "local" }],
      ]),
    });
    expect(await resolve(key)).toMatchObject({ exists: true, onHost: false });
    readProjection.mockRejectedValueOnce(new Error("placement unavailable"));
    expect(await resolve(key)).toMatchObject({ exists: false, onHost: false });
  });

  it("preserves case-distinct opaque peer identities on exact lookup", async () => {
    const key = "agent:main:signal:group:AbCd";
    expect((await resolve(key)).exists).toBe(false);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ sessionKey: key }));
  });

  it("fails closed for cron, hook, and identity-incomplete rows", async () => {
    for (const key of ["agent:main:cron:job", "agent:main:hook:event"]) {
      entry(key);
      expect((await resolve(key)).onHost).toBe(false);
    }
    const key = "agent:main:subagent:legacy";
    read.mockResolvedValue({ sessionId: "legacy", updatedAt: 1 });
    expect(await resolve(key)).toEqual({
      sessionKey: key,
      exists: true,
      onHost: false,
      sessionId: "legacy",
      lifecycleRevision: null,
    });
  });

  it("keeps concurrent reads bound to their own exact lifecycle row", async () => {
    const key = "agent:main:subagent:abc";
    read
      .mockResolvedValueOnce({ sessionId: "old", lifecycleRevision: "revision-old", updatedAt: 1 })
      .mockResolvedValueOnce({ sessionId: "new", lifecycleRevision: "revision-new", updatedAt: 2 });
    const [first, second] = await Promise.all([resolve(key), resolve(key)]);
    expect(first).toMatchObject({
      onHost: true,
      sessionId: "old",
      lifecycleRevision: "revision-old",
    });
    expect(second).toMatchObject({
      onHost: true,
      sessionId: "new",
      lifecycleRevision: "revision-new",
    });
  });
});
