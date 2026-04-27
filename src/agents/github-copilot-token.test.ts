import { describe, expect, it, vi } from "vitest";
import { buildCopilotIdeHeaders } from "./copilot-dynamic-headers.js";
import {
  deriveCopilotApiBaseUrlFromToken,
  resolveCopilotApiToken,
} from "./github-copilot-token.js";

describe("resolveCopilotApiToken", () => {
  it("derives native Copilot base URLs from Copilot proxy hints", () => {
    expect(
      deriveCopilotApiBaseUrlFromToken(
        "copilot-token;proxy-ep=https://proxy.individual.githubcopilot.com;",
      ),
    ).toBe("https://api.individual.githubcopilot.com");
    expect(deriveCopilotApiBaseUrlFromToken("copilot-token;proxy-ep=proxy.example.com;")).toBe(
      "https://api.example.com",
    );
    expect(deriveCopilotApiBaseUrlFromToken("copilot-token;proxy-ep=proxy.example.com:8443;")).toBe(
      "https://api.example.com",
    );
  });

  it("rejects malformed or non-http proxy hints", () => {
    expect(
      deriveCopilotApiBaseUrlFromToken("copilot-token;proxy-ep=javascript:alert(1);"),
    ).toBeNull();
    expect(deriveCopilotApiBaseUrlFromToken("copilot-token;proxy-ep=://bad;")).toBeNull();
  });

  it("treats 11-digit expires_at values as seconds epochs", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        token: "copilot-token",
        expires_at: 12_345_678_901,
      }),
    }));

    const result = await resolveCopilotApiToken({
      githubToken: "github-token",
      cachePath: "/tmp/github-copilot-token-test.json",
      loadJsonFileImpl: () => undefined,
      saveJsonFileImpl: () => undefined,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.expiresAt).toBe(12_345_678_901_000);
  });

  it("keys cache paths by auth profile so named profiles do not collapse", async () => {
    const loadJsonFileImpl = vi.fn<(path: string) => unknown>(() => undefined);
    const saveJsonFileImpl = vi.fn<(path: string, value: unknown) => void>(() => undefined);
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        token: "copilot-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    }));
    const env = { OPENCLAW_STATE_DIR: "/tmp/openclaw-state" } as NodeJS.ProcessEnv;

    await resolveCopilotApiToken({
      githubToken: "github-token-a",
      profileId: "github-copilot:github",
      env,
      loadJsonFileImpl,
      saveJsonFileImpl,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await resolveCopilotApiToken({
      githubToken: "github-token-b",
      profileId: "github-copilot:pool-1",
      env,
      loadJsonFileImpl,
      saveJsonFileImpl,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(loadJsonFileImpl.mock.calls.map(([cachePath]) => cachePath)).toEqual([
      "/tmp/openclaw-state/credentials/github-copilot.github-copilot-github.token.json",
      "/tmp/openclaw-state/credentials/github-copilot.github-copilot-pool-1.token.json",
    ]);
    expect(saveJsonFileImpl.mock.calls.map(([cachePath]) => cachePath)).toEqual([
      "/tmp/openclaw-state/credentials/github-copilot.github-copilot-github.token.json",
      "/tmp/openclaw-state/credentials/github-copilot.github-copilot-pool-1.token.json",
    ]);
  });

  it("sends IDE headers when exchanging the GitHub token", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        token: "copilot-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    }));

    await resolveCopilotApiToken({
      githubToken: "github-token",
      cachePath: "/tmp/github-copilot-token-test.json",
      loadJsonFileImpl: () => undefined,
      saveJsonFileImpl: () => undefined,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/copilot_internal/v2/token",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer github-token",
          ...buildCopilotIdeHeaders({ includeApiVersion: true }),
        }),
      }),
    );
  });
});
