import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("./local-session-route.js");
  vi.resetModules();
});

it("keeps setup-only API construction free of the session route worker graph", async () => {
  let routeModuleLoads = 0;
  const route = vi.fn(async (params: { sessionKey: string }) => ({
    sessionKey: params.sessionKey,
    exists: true,
    onHost: true,
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
  });
  expect(routeModuleLoads).toBe(1);
  expect(route).toHaveBeenCalledWith({ cfg: api.config, sessionKey: key });
});
