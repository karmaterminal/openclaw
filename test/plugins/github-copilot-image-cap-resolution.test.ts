import { createBoundaryAwareStreamFnForModel } from "@openclaw/ai/transports";
import { clearLiveCatalogCacheForTests } from "openclaw/plugin-sdk/provider-catalog-live-runtime";
import { withServer } from "openclaw/plugin-sdk/test-env";
import { afterEach, assert, beforeEach, expect, it, vi } from "vitest";
import githubCopilot from "../../extensions/github-copilot/index.js";
import {
  createEmptyAgentDiscoveryStores,
  resolveModelAsync,
} from "../../src/agents/embedded-agent-runner/model.js";
import type { ProviderRuntimeHooks } from "../../src/agents/embedded-agent-runner/model.provider-hooks.js";
import { createOpenClawTestState } from "../../src/test-utils/openclaw-test-state.js";
import { registerSingleProviderPlugin } from "../../src/test-utils/plugin-registration.js";

const capture = vi.hoisted(() => ({ origin: "" }));

// mock-isolation: Only the catalog destination changes. The guarded fetch and the physical
// HTTP request stay real, so /models discovery reaches the local capture server.
vi.mock("openclaw/plugin-sdk/ssrf-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/ssrf-runtime")>();
  return {
    ...actual,
    fetchWithSsrFGuard: (params: Parameters<typeof actual.fetchWithSsrFGuard>[0]) =>
      actual.fetchWithSsrFGuard({
        ...params,
        url: `${capture.origin}${new URL(params.url).pathname}`,
        policy: { allowPrivateNetwork: true },
      }),
  };
});

const COPILOT_API = "https://api.individual.githubcopilot.com";
let state: Awaited<ReturnType<typeof createOpenClawTestState>>;

beforeEach(async () => {
  state = await createOpenClawTestState({ label: "github-copilot-image-cap" });
  clearLiveCatalogCacheForTests();
  vi.stubEnv("COPILOT_GITHUB_TOKEN", "synthetic-github-token");
  // The account lookup answers with Copilot's public endpoint; anything else off-host fails.
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.href === "https://api.github.com/copilot_internal/user") {
      return Response.json({ endpoints: { api: COPILOT_API } });
    }
    assert(url.hostname === "127.0.0.1", `unexpected network request to ${url.href}`);
    return await realFetch(input, init);
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  clearLiveCatalogCacheForTests();
  await state.cleanup();
});

// A real PNG signature passes the transport's image sanitizer; the trailing tag names the photo.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
const photo = (tag: string) => ({
  type: "image" as const,
  data: Buffer.concat([png, Buffer.from(tag)]).toString("base64"),
  mimeType: "image/png",
});

it("carries the listed per-prompt image cap through core model resolution to the Copilot wire (#1565)", async () => {
  const provider = await registerSingleProviderPlugin(githubCopilot);
  // The runtime's hook dispatch, with plugin lookup replaced by the registered Copilot provider.
  const runtimeHooks: ProviderRuntimeHooks = {
    prepareProviderDynamicModel: async ({ context }) =>
      await provider.prepareDynamicModel?.(context),
    runProviderDynamicModel: ({ context }) => provider.resolveDynamicModel?.(context),
    shouldPreferProviderRuntimeResolvedModel: ({ context }) =>
      provider.preferRuntimeResolvedModel?.(context) ?? false,
    normalizeProviderResolvedModelWithPlugin: ({ context }) =>
      provider.normalizeResolvedModel?.(context),
    buildProviderUnknownModelHintWithPlugin: () => undefined,
    normalizeProviderTransportWithPlugin: () => undefined,
  };
  const listing = {
    id: "mai-code-2-flash",
    vendor: "Microsoft",
    supported_endpoints: ["/responses"],
    capabilities: {
      type: "chat",
      limits: {
        max_context_window_tokens: 128_000,
        max_output_tokens: 16_000,
        vision: { max_prompt_images: 1 },
      },
      supports: { vision: true, streaming: true, tool_calls: true },
    },
  };
  const requests: string[] = [];
  const bodies: Array<{ input: Array<{ content?: Array<Record<string, unknown>> }> }> = [];
  await withServer(
    (request, response) => {
      requests.push(`${request.method} ${request.url}`);
      if (request.url === "/models") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ data: [listing] }));
        return;
      }
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        body += chunk;
      });
      request.on("end", () => {
        bodies.push(JSON.parse(body));
        response.writeHead(200, { "content-type": "text/event-stream" });
        const usage = { input_tokens: 1, output_tokens: 1, total_tokens: 2 };
        const completed = { id: "resp_1", status: "completed", output: [], usage };
        response.end(
          `data: ${JSON.stringify({ type: "response.completed", response: completed })}\n\n`,
        );
      });
    },
    async (origin) => {
      capture.origin = origin;
      const resolved = await resolveModelAsync(
        "github-copilot",
        "mai-code-2-flash",
        state.agentDir(),
        {},
        {
          ...createEmptyAgentDiscoveryStores(),
          workspaceDir: state.workspaceDir,
          authProfileMode: "token",
          runtimeHooks,
          skipAgentDiscovery: true,
        },
      );
      expect(resolved.error).toBeUndefined();
      assert(resolved.model, "listed Copilot model missing");
      expect(resolved.model).toMatchObject({
        id: "mai-code-2-flash",
        api: "openai-responses",
        baseUrl: COPILOT_API,
        params: { copilotMaxPromptImages: 1 },
      });
      // Only the destination changes; the resolved params reach the wrapper untouched.
      const model = { ...resolved.model, baseUrl: origin };
      const stream = provider.wrapStreamFn?.({
        config: {},
        provider: "github-copilot",
        modelId: model.id,
        streamFn: createBoundaryAwareStreamFnForModel(model),
      });
      assert(stream, "Copilot stream wrapper missing");
      const turn = {
        role: "user" as const,
        content: [{ type: "text" as const, text: "three photos" }, ...["a", "b", "c"].map(photo)],
        timestamp: 1,
      };
      const result = await (
        await stream(model, { messages: [turn] }, { apiKey: "copilot-token" })
      ).result();
      expect(result.errorMessage).toBeUndefined();
    },
  );
  expect(requests).toEqual(["GET /models", "POST /responses"]);
  const omitted =
    "[image omitted: this model accepts at most 1 image per prompt, so only the newest image is shown]";
  const parts = bodies[0]?.input.flatMap((item) => item.content ?? []);
  expect(parts).toMatchObject([
    { type: "input_text", text: "three photos" },
    { type: "input_text", text: omitted },
    { type: "input_text", text: omitted },
    { type: "input_image" },
  ]);
  const kept = String(parts?.at(-1)?.image_url).split(",")[1] ?? "";
  expect(Buffer.from(kept, "base64").subarray(png.length).toString()).toBe("c");
});
