import { afterEach, beforeEach, describe, expect, it, vi, type MockedFunction } from "vitest";
import {
  buildLiveModelProviderConfig,
  clearLiveCatalogCacheForTests,
  type LiveModelCatalogFetchGuard,
} from "./provider-catalog-live-runtime.js";
import type { ModelDefinitionConfig } from "./provider-model-shared.js";

function buildLiveCatalogTestModel(id: string): ModelDefinitionConfig {
  return {
    id,
    name: id,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8192,
  };
}

describe("provider-catalog-live-runtime provider configs", () => {
  beforeEach(() => {
    clearLiveCatalogCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects malformed UTF-8 bytes in live catalog responses and falls back to static rows", async () => {
    // Build raw bytes with a 0xFE byte inside the JSON payload — 0xFE is never
    // a valid UTF-8 lead byte, so fatal:true throws before JSON.parse.
    const encoder = new TextEncoder();
    const prefix = encoder.encode('{"data":[{"id":"model-a","label":"test-');
    const suffix = encoder.encode('"}]}');
    const body = new Uint8Array(prefix.length + 1 + suffix.length);
    body.set(prefix, 0);
    // Inject an invalid UTF-8 byte before the suffix
    body[prefix.length] = 0xfe;
    body.set(suffix, prefix.length + 1);

    const release = vi.fn(async () => undefined);
    const fetchGuardMock: MockedFunction<LiveModelCatalogFetchGuard> = vi.fn(async () => ({
      response: new Response(body),
      finalUrl: "https://provider.example.test/v1/models",
      release,
    }));
    const providerConfig = {
      api: "openai-completions" as const,
      baseUrl: "https://provider.example.test/v1",
    };
    const models = [buildLiveCatalogTestModel("model-a"), buildLiveCatalogTestModel("model-b")];

    const result = await buildLiveModelProviderConfig({
      providerId: "provider",
      endpoint: "https://provider.example.test/v1/models",
      providerConfig,
      apiKey: "PROVIDER_API_KEY",
      fetchGuard: fetchGuardMock,
      models,
    });

    // The malformed UTF-8 causes readLiveModelCatalogJson to throw.
    // buildLiveModelProviderConfig should catch it and return the static catalog.
    expect(result.models.map((model) => model.id)).toEqual(["model-a", "model-b"]);
    expect(result.apiKey).toBe("PROVIDER_API_KEY");
    expect(fetchGuardMock).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does not cache empty live provider config discoveries", async () => {
    const release = vi.fn(async () => undefined);
    const fetchGuardMock: MockedFunction<LiveModelCatalogFetchGuard> = vi
      .fn()
      .mockResolvedValueOnce({
        response: new Response(JSON.stringify({ data: [] })),
        finalUrl: "https://provider.example.test/v1/models",
        release,
      })
      .mockResolvedValueOnce({
        response: new Response(JSON.stringify({ data: [{ id: "model-b", object: "model" }] })),
        finalUrl: "https://provider.example.test/v1/models",
        release,
      });
    const providerConfig = {
      api: "openai-completions" as const,
      baseUrl: "https://provider.example.test/v1",
    };
    const models = [buildLiveCatalogTestModel("model-a"), buildLiveCatalogTestModel("model-b")];

    const fallback = await buildLiveModelProviderConfig({
      providerId: "provider",
      endpoint: "https://provider.example.test/v1/models",
      providerConfig,
      fetchGuard: fetchGuardMock,
      models,
      ttlMs: 60_000,
    });
    const recovered = await buildLiveModelProviderConfig({
      providerId: "provider",
      endpoint: "https://provider.example.test/v1/models",
      providerConfig,
      fetchGuard: fetchGuardMock,
      models,
      ttlMs: 60_000,
    });

    expect(fallback.models.map((model) => model.id)).toEqual(["model-a", "model-b"]);
    expect(recovered.models.map((model) => model.id)).toEqual(["model-b"]);
    expect(fetchGuardMock).toHaveBeenCalledTimes(2);
  });
});
