// Prepared model runtime policy paths hot-reload without restarting Gateway subsystems.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChannelPlugin } from "../channels/plugins/types.plugin.js";
import { resetPluginRuntimeStateForTest, setActivePluginRegistry } from "../plugins/runtime.js";
import { createChannelTestPluginBase, createTestRegistry } from "../test-utils/channel-plugins.js";
import { buildGatewayReloadPlan, resolveConfigReloadMetadata } from "./config-reload-plan.js";

describe("buildGatewayReloadPlan", () => {
  const emptyRegistry = createTestRegistry([]);
  const telegramPlugin: ChannelPlugin = {
    ...createChannelTestPluginBase({
      id: "telegram",
      label: "Telegram",
      config: { listAccountIds: () => [] },
    }),
    reload: { configPrefixes: ["channels.telegram"] },
  };
  const whatsappPlugin: ChannelPlugin = {
    ...createChannelTestPluginBase({
      id: "whatsapp",
      label: "WhatsApp",
      config: { listAccountIds: () => [] },
    }),
    reload: {
      configPrefixes: ["web", "channels.whatsapp.accounts", "channels.whatsapp.selfChatMode"],
      noopPrefixes: ["channels.whatsapp"],
    },
  };
  const mattermostPlugin: ChannelPlugin = {
    ...createChannelTestPluginBase({
      id: "mattermost",
      label: "Mattermost",
      config: {
        listAccountIds: (cfg) => Object.keys(cfg.channels?.mattermost?.accounts ?? {}),
      },
    }),
    reload: { configPrefixes: ["channels.mattermost"], accountScopedRestart: true },
  };
  const registry = createTestRegistry([
    { pluginId: "telegram", plugin: telegramPlugin, source: "test" },
    { pluginId: "whatsapp", plugin: whatsappPlugin, source: "test" },
    { pluginId: "mattermost", plugin: mattermostPlugin, source: "test" },
  ]);
  registry.reloads = [
    {
      pluginId: "browser",
      pluginName: "Browser",
      registration: { restartPrefixes: ["browser"], hotPrefixes: ["browser.profiles"] },
      source: "test",
    },
    {
      pluginId: "canvas",
      pluginName: "Canvas",
      registration: { restartPrefixes: ["plugins.entries.canvas"] },
      source: "test",
    },
    {
      pluginId: "codex",
      pluginName: "Codex",
      registration: { noopPrefixes: ["plugins.entries.codex.config.codexPlugins"] },
      source: "test",
    },
  ];

  beforeEach(() => {
    setActivePluginRegistry(registry);
  });

  afterEach(() => {
    resetPluginRuntimeStateForTest();
    setActivePluginRegistry(emptyRegistry);
  });

  it.each([
    "agents.defaults",
    "agents.defaults.compaction",
    "tools",
    "tools.deny",
    "agents.defaults.continuation.maxDelegatesPerTurn",
  ])("refreshes prepared model runtime policy without restarting subsystems: %s", (path) => {
    const plan = buildGatewayReloadPlan([path]);

    expect(plan).toMatchObject({
      restartGateway: false,
      restartReasons: [],
      hotReasons: [path],
      noopPaths: [],
      restartHeartbeat: false,
      restartCron: false,
      reloadHooks: false,
      reloadPlugins: false,
      disposeMcpRuntimes: false,
      restartChannels: new Set(),
      restartChannelAccounts: new Map(),
    });
    expect(resolveConfigReloadMetadata(path).kind).toBe("hot");
  });
});
