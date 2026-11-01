import { expect, it, vi } from "vitest";
import * as runtimeSnapshot from "../config/runtime-snapshot.js";
import { readSessionEntryReadOnlyInWorker } from "../config/sessions/session-entry-read-runtime.js";
import { buildPluginApi } from "./api-builder.js";
import { instrumentPluginInstanceApi } from "./api-facades.js";
import { runPluginRegistration } from "./api-lifecycle.js";
import { createOwnedInstance } from "./plugin-instance.test-support.js";
import type { PluginRuntime } from "./runtime/types.js";
import type { OpenClawPluginApi } from "./types.js";

vi.mock("../config/sessions/session-entry-read-runtime.js", () => ({
  readSessionEntryReadOnlyInWorker: vi.fn(),
}));

function createPluginApi(handlers: Parameters<typeof buildPluginApi>[0]["handlers"] = {}) {
  return buildPluginApi({
    id: "late-call-fixture",
    name: "Late Call Fixture",
    source: "test",
    registrationMode: "full",
    config: {},
    runtime: {} as PluginRuntime,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    resolvePath: (input) => input,
    handlers,
  });
}

function captureRegisteredPluginApi(handlers: Parameters<typeof buildPluginApi>[0]["handlers"]) {
  let captured = createPluginApi(handlers);
  runPluginRegistration((pluginApi) => {
    captured = pluginApi;
  }, captured);
  return captured;
}

it("keeps path resolution available to registered callbacks", () => {
  const api = captureRegisteredPluginApi({});

  expect(api.resolvePath("models/model.onnx")).toBe("models/model.onnx");
});

it("lets registered callbacks construct inline view results", () => {
  const api = captureRegisteredPluginApi({});
  const result = api.inlineView(
    "incident",
    { id: "incident-42" },
    {
      version: 1,
      summary: "Showing incident 42.",
    },
  );

  expect(result).toEqual({
    content: [{ type: "text", text: "Showing incident 42." }],
    details: {
      pluginInlineView: {
        pluginId: "late-call-fixture",
        viewId: "incident",
        version: 1,
        payload: { id: "incident-42" },
        summary: "Showing incident 42.",
      },
    },
  });
});

it("keeps session route inspection callable after registration and reads each lifecycle anew", async () => {
  const key = "agent:main:subagent:abc";
  const read = vi.mocked(readSessionEntryReadOnlyInWorker);
  read.mockReset();
  const api = captureRegisteredPluginApi({});
  read.mockResolvedValueOnce({ sessionId: "before", lifecycleRevision: "r1", updatedAt: 1 });
  expect(await api.session.state.resolveLocalSessionRoute(key)).toEqual({
    sessionKey: key,
    exists: true,
    onHost: true,
    sessionId: "before",
    lifecycleRevision: "r1",
  });
  read.mockResolvedValueOnce(undefined);
  expect(await api.session.state.resolveLocalSessionRoute(key)).toEqual({
    sessionKey: key,
    exists: false,
    onHost: false,
    sessionId: null,
    lifecycleRevision: null,
  });
  expect(read).toHaveBeenCalledTimes(2);
});

it("fails closed when a retained route callback's owner retires", async () => {
  const config = { session: { store: "/tmp/route-owner-test.json" } };
  const snapshot = vi.spyOn(runtimeSnapshot, "getRuntimeConfigSnapshot").mockReturnValue(config);
  const { instance } = createOwnedInstance("route-owner-test");
  const api = instrumentPluginInstanceApi(createPluginApi({}), instance);
  let retained!: OpenClawPluginApi["session"]["state"]["resolveLocalSessionRoute"];
  runPluginRegistration((registered) => {
    retained = registered.session.state.resolveLocalSessionRoute;
  }, api);
  const key = "agent:main:subagent:abc";
  const read = vi.mocked(readSessionEntryReadOnlyInWorker);
  read
    .mockReset()
    .mockResolvedValue({ sessionId: "owned", lifecycleRevision: "owned-revision", updatedAt: 1 });
  try {
    expect((await retained(key)).onHost).toBe(true);
    await instance.dispose();
    expect(await retained(key)).toEqual({
      sessionKey: key,
      exists: false,
      onHost: false,
      sessionId: null,
      lifecycleRevision: null,
    });
    expect(read).toHaveBeenCalledTimes(1);
  } finally {
    snapshot.mockRestore();
  }
});

it.each<[string, unknown, boolean]>([
  ["runContext.clearRunContext", undefined, true],
  ["agent.events.emitAgentEvent", { emitted: false, reason: "not wired" }, true],
  ["enqueueNextTurnInjection", { enqueued: false, id: "", sessionKey: "agent:main:main" }, true],
  [
    "session.workflow.enqueueNextTurnInjection",
    { enqueued: false, id: "", sessionKey: "agent:main:main" },
    true,
  ],
  ["session.workflow.steerActiveRun", { steered: false, reason: "not wired" }, true],
  ["runContext.getRunContext", undefined, true],
  ["session.workflow.sendSessionAttachment", { ok: false, error: "not wired" }, true],
  ["session.workflow.scheduleSessionTurn", undefined, true],
  ["runContext.setRunContext", false, true],
  ["session.workflow.unscheduleSessionTurnsByTag", { removed: 0, failed: 0 }, true],
  ["registerSessionSchedulerJob", undefined, false],
  ["registerTool", undefined, false],
  ["session.state.registerSessionExtension", undefined, false],
  ["session.controls.registerSessionAction", undefined, false],
  ["unknown", undefined, false],
  ["__proto__", undefined, false],
])(
  "keeps the unwired default and post-registration eligibility for %s",
  async (methodName, fallback, eligible) => {
    const input = { sessionKey: "agent:main:main", text: "guidance", namespace: "workflow" };
    const output = { forwarded: true };
    const handler = vi.fn(async () => output);
    const path = methodName.split(".");
    const invoke = (api: OpenClawPluginApi) => {
      const method = path.reduce<unknown>(
        (value, key) => (value && typeof value === "object" ? Reflect.get(value, key) : undefined),
        api,
      );
      return typeof method === "function" ? Reflect.apply(method, api, [input]) : undefined;
    };
    expect(await invoke(createPluginApi())).toStrictEqual(fallback);
    const api = captureRegisteredPluginApi({ [path.at(-1)!]: handler });
    expect(await invoke(api)).toBe(eligible ? output : undefined);
    expect(handler.mock.calls).toEqual(eligible ? [[input]] : []);
  },
);
