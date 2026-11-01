import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("./local-session-route.js");
  vi.doUnmock("../config/runtime-snapshot.js");
  vi.resetModules();
});

it("keeps setup-only API construction free of the session route worker graph", async () => {
  let routeModuleLoads = 0;
  const route = vi.fn(async (params: { sessionKey: string }) => ({
    sessionKey: params.sessionKey,
    exists: true,
    onHost: true,
    sessionId: "s1",
    lifecycleRevision: "r1",
  }));
  vi.doMock("./local-session-route.js", () => {
    routeModuleLoads++;
    return { resolvePluginLocalSessionRoute: route };
  });

  const { buildPluginApi } = await import("./api-builder.js");
  const api = buildPluginApi({
    id: "setup-only-route-test",
    name: "Setup Only Route Test",
    source: "test",
    registrationMode: "discovery",
    config: {},
    runtime: {} as Parameters<typeof buildPluginApi>[0]["runtime"],
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    resolvePath: (value) => value,
    handlers: {},
  });
  expect(routeModuleLoads).toBe(0);

  const key = "agent:main:subagent:late";
  expect(await api.session.state.resolveLocalSessionRoute(key)).toEqual({
    sessionKey: key,
    exists: true,
    onHost: true,
    sessionId: "s1",
    lifecycleRevision: "r1",
  });
  expect(routeModuleLoads).toBe(1);
  expect(route).toHaveBeenCalledWith({ cfg: api.config, sessionKey: key });
});

it("uses the current store/owner config and rejects a route read spanning config publication", async () => {
  const oldConfig = { session: { store: "/tmp/old-sessions.json" } };
  const newConfig = { session: { store: "/tmp/new-sessions.json" } };
  let currentConfig = oldConfig;
  let revision = 1;
  vi.doMock("../config/runtime-snapshot.js", () => ({
    getRuntimeConfigSnapshot: () => currentConfig,
    getRuntimeConfigSnapshotMetadata: () => ({ revision }),
  }));
  let finishRead:
    | ((value: {
        sessionKey: string;
        exists: boolean;
        onHost: boolean;
        sessionId: string | null;
        lifecycleRevision: string | null;
      }) => void)
    | undefined;
  const route = vi.fn(
    (_params: { cfg: unknown; sessionKey: string }) =>
      new Promise<{
        sessionKey: string;
        exists: boolean;
        onHost: boolean;
        sessionId: string | null;
        lifecycleRevision: string | null;
      }>((resolve) => {
        finishRead = resolve;
      }),
  );
  vi.doMock("./local-session-route.js", () => ({ resolvePluginLocalSessionRoute: route }));
  const { buildPluginApi } = await import("./api-builder.js");
  const api = buildPluginApi({
    id: "route-drift",
    name: "Route Drift",
    source: "test",
    registrationMode: "full",
    config: oldConfig,
    runtime: {} as Parameters<typeof buildPluginApi>[0]["runtime"],
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    resolvePath: (value) => value,
  });
  const key = "agent:main:subagent:late";
  const stale = api.session.state.resolveLocalSessionRoute(key);
  await vi.waitFor(() => expect(route).toHaveBeenCalledTimes(1));
  expect(route).toHaveBeenLastCalledWith({ cfg: oldConfig, sessionKey: key });
  currentConfig = newConfig;
  revision++;
  finishRead?.({
    sessionKey: key,
    exists: true,
    onHost: true,
    sessionId: "s1",
    lifecycleRevision: "r1",
  });
  expect(await stale).toEqual({
    sessionKey: key,
    exists: false,
    onHost: false,
    sessionId: null,
    lifecycleRevision: null,
  });

  const fresh = api.session.state.resolveLocalSessionRoute(key);
  await vi.waitFor(() => expect(route).toHaveBeenCalledTimes(2));
  expect(route).toHaveBeenLastCalledWith({ cfg: newConfig, sessionKey: key });
  finishRead?.({
    sessionKey: key,
    exists: false,
    onHost: false,
    sessionId: null,
    lifecycleRevision: null,
  });
  expect(await fresh).toEqual({
    sessionKey: key,
    exists: false,
    onHost: false,
    sessionId: null,
    lifecycleRevision: null,
  });

  const inPlace = api.session.state.resolveLocalSessionRoute(key);
  await vi.waitFor(() => expect(route).toHaveBeenCalledTimes(3));
  expect(route).toHaveBeenLastCalledWith({ cfg: newConfig, sessionKey: key });
  newConfig.session.store = "/tmp/another-sessions.json";
  revision++;
  finishRead?.({
    sessionKey: key,
    exists: true,
    onHost: true,
    sessionId: "s1",
    lifecycleRevision: "r1",
  });
  expect(await inPlace).toEqual({
    sessionKey: key,
    exists: false,
    onHost: false,
    sessionId: null,
    lifecycleRevision: null,
  });
});
