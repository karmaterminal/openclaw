import { beforeEach, describe, expect, it, vi } from "vitest";
import { artifactsHandlers } from "./artifacts.js";
import { expectArtifactList, expectErrorDetails, expectFields } from "./artifacts.test-support.js";

const hoisted = vi.hoisted(() => ({
  visitSessionMessagesAsync: vi.fn(),
}));

vi.mock("../session-sharing-preparation.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../session-sharing-preparation.js")>();
  const { artifactFixtureSessionFacts } = await import("./artifacts.test-support.js");
  return {
    ...actual,
    prepareSessionMutationFacts: async (
      params: Parameters<typeof actual.prepareSessionMutationFacts>[0],
    ) => artifactFixtureSessionFacts(params),
  };
});

vi.mock("../session-transcript-readers.js", async () => {
  const actual = await vi.importActual<typeof import("../session-transcript-readers.js")>(
    "../session-transcript-readers.js",
  );
  // Route readSessionArtifacts through the fixture visitor too; otherwise the handler
  // reaches the real transcript worker and opens the agent DB beside `storePath`.
  const { withArtifactFixtureReader } = await import("./artifacts.test-support.js");
  return withArtifactFixtureReader(actual, hoisted.visitSessionMessagesAsync);
});

function mockMessages(messages: unknown[]) {
  hoisted.visitSessionMessagesAsync.mockImplementation(async (_scope, visit) => {
    messages.forEach((message, index) => visit(message, index + 1));
    return messages.length;
  });
}

async function invokeArtifactHandler(
  method: "artifacts.list" | "artifacts.get" | "artifacts.download",
  params: Record<string, unknown>,
) {
  const calls: Array<{ ok: boolean; payload?: unknown; error?: unknown }> = [];
  await artifactsHandlers[method]?.({
    req: { type: "req", id: method, method, params: {} },
    params,
    client: null,
    isWebchatConnect: () => false,
    respond: (ok, payload, error) => calls.push({ ok, payload, error }),
    context: {
      getRuntimeConfig: () => ({ agents: { entries: { main: { default: true } } } }),
    } as never,
  });
  return calls;
}

describe("managed delegate artifact claim projections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not collect or resolve claim projections", async () => {
    const claimId = "6dd7df78-f407-42cb-bef1-6381abe7ebd7";
    mockMessages([
      {
        role: "system",
        content: JSON.stringify({
          artifacts: [
            {
              id: claimId,
              type: "report",
              title: "Delegate report",
              mimeType: "application/pdf",
              sizeBytes: 12,
              source: "delegate-return",
              download: { mode: "unsupported" },
            },
          ],
        }),
      },
    ]);

    const listed = await invokeArtifactHandler("artifacts.list", {
      sessionKey: "agent:main:main",
    });
    expect(hoisted.visitSessionMessagesAsync).toHaveBeenCalled();
    expect(expectArtifactList(listed).artifacts).toEqual([]);
    for (const method of ["artifacts.get", "artifacts.download"] as const) {
      const result = await invokeArtifactHandler(method, {
        sessionKey: "agent:main:main",
        artifactId: claimId,
      });
      expectFields(expectErrorDetails(result), {
        type: "artifact_not_found",
        artifactId: claimId,
      });
      expect(JSON.stringify(result)).not.toMatch(/JVBER|base64|https?:\/\//i);
    }
  });
});
