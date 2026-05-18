import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCurrentPluginMetadataSnapshot } from "../plugins/current-plugin-metadata-snapshot.js";
import { clearLoadPluginMetadataSnapshotMemo } from "../plugins/plugin-metadata-snapshot.js";
import {
  resetProviderAuthAliasMapCacheForTest,
  resolveProviderIdForAuth,
} from "./provider-auth-aliases.js";

const tempDirs: string[] = [];

function createTempHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-provider-auth-aliases-"));
  tempDirs.push(home);
  return home;
}

function createPluginEnv(home: string): NodeJS.ProcessEnv {
  return {
    HOME: home,
    USERPROFILE: home,
    OPENCLAW_DISABLE_BUNDLED_PLUGINS: "1",
    OPENCLAW_DISABLE_PERSISTED_PLUGIN_REGISTRY: "1",
    VITEST: process.env.VITEST,
  };
}

function writeGlobalPlugin(home: string, id: string, manifest: Record<string, unknown>): void {
  const pluginDir = path.join(home, ".openclaw", "extensions", id);
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, "openclaw.plugin.json"),
    JSON.stringify({ id, enabledByDefault: true, configSchema: { type: "object" }, ...manifest }),
    "utf8",
  );
  fs.writeFileSync(path.join(pluginDir, "index.js"), "export default {};\n", "utf8");
}

describe("provider auth aliases", () => {
  beforeEach(() => {
    resetProviderAuthAliasMapCacheForTest();
    clearLoadPluginMetadataSnapshotMemo();
    clearCurrentPluginMetadataSnapshot();
  });

  afterEach(() => {
    resetProviderAuthAliasMapCacheForTest();
    clearLoadPluginMetadataSnapshotMemo();
    clearCurrentPluginMetadataSnapshot();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats deprecated auth choice ids as provider auth aliases", () => {
    const home = createTempHome();
    const env = createPluginEnv(home);
    writeGlobalPlugin(home, "openai", {
      providerAuthChoices: [
        {
          provider: "openai-codex",
          method: "oauth",
          choiceId: "openai-codex",
          deprecatedChoiceIds: ["codex-cli", "openai-codex-import"],
        },
      ],
    });

    expect(resolveProviderIdForAuth("codex-cli", { config: {}, env })).toBe("openai-codex");
    expect(resolveProviderIdForAuth("openai-codex-import", { config: {}, env })).toBe(
      "openai-codex",
    );
    expect(resolveProviderIdForAuth("openai-codex", { config: {}, env })).toBe("openai-codex");
  });

  it("does not reuse aliases across env-resolved plugin roots", () => {
    const firstHome = createTempHome();
    const secondHome = createTempHome();
    const env = createPluginEnv(firstHome);
    writeGlobalPlugin(firstHome, "one", {
      providerAuthAliases: { fixture: "provider-one" },
    });
    writeGlobalPlugin(secondHome, "two", {
      providerAuthAliases: { fixture: "provider-two" },
    });

    expect(resolveProviderIdForAuth("fixture", { config: {}, env })).toBe("provider-one");
    env.HOME = secondHome;
    env.USERPROFILE = secondHome;
    expect(resolveProviderIdForAuth("fixture", { config: {}, env })).toBe("provider-two");
  });
});
