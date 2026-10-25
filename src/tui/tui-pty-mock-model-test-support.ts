// Routed mock OpenAI Responses model server for the TUI PTY real-backend e2e cases, kept apart
// so the fork's Gateway-client collect case does not grow the e2e file past its line cap.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { writeOpenAiResponsesText } from "../../test/helpers/openai-responses-sse.js";
import { createDeferred } from "../../test/helpers/promise.js";
import { readRequestBody, writeTuiModelHttpJson } from "./tui-pty-model-http-test-support.js";

export type MockModelServer = {
  baseUrl: string;
  requests: (modelId?: string) => MockModelRequest[];
  releaseFirstResponse: (modelId: string) => void;
  stop: () => Promise<void>;
};

export type MockModelBehavior = {
  replyText: string;
  holdFirstResponse?: boolean;
  followupReplyText?: string;
};

export type MockModelRequest = {
  authorization?: string;
  body: Record<string, unknown>;
};

async function writeResponsesSse(
  res: ServerResponse,
  text: string,
  completionGate?: Promise<void>,
) {
  await completionGate;
  if (!res.destroyed) {
    writeOpenAiResponsesText(res, {
      text,
      messageId: "msg_tui_pty_local",
      responseId: "resp_tui_pty_local",
    });
  }
}

async function readJsonRequest(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readRequestBody(req);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

export async function startRoutedMockModelServer(
  behaviors: Readonly<Record<string, MockModelBehavior>>,
): Promise<MockModelServer> {
  const requests: MockModelRequest[] = [];
  const requestsByModel = new Map<string, MockModelRequest[]>();
  const firstResponseGates = new Map(
    Object.entries(behaviors)
      .filter(([, behavior]) => behavior.holdFirstResponse)
      .map(([modelId]) => [modelId, createDeferred()] as const),
  );
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/readyz")) {
        writeTuiModelHttpJson(res, 200, { ok: true });
        return;
      }
      if (req.method === "GET" && url.pathname === "/v1/models") {
        writeTuiModelHttpJson(res, 200, {
          data: Object.keys(behaviors).map((id) => ({
            id,
            object: "model",
          })),
        });
        return;
      }
      if (req.method === "POST") {
        const body = await readJsonRequest(req);
        if (url.pathname === "/v1/responses" || url.pathname === "/responses") {
          const modelId = typeof body.model === "string" ? body.model : "";
          const request = {
            authorization: req.headers.authorization,
            body,
          };
          const behavior = behaviors[modelId];
          if (!behavior) {
            writeTuiModelHttpJson(res, 400, {
              error: `unknown mock model: ${modelId || "missing"}`,
            });
            return;
          }
          const modelRequests = requestsByModel.get(modelId) ?? [];
          if (!requestsByModel.has(modelId)) {
            requestsByModel.set(modelId, modelRequests);
          }
          const requestIndex = modelRequests.length;
          requests.push(request);
          modelRequests.push(request);
          await writeResponsesSse(
            res,
            requestIndex === 0
              ? behavior.replyText
              : (behavior.followupReplyText ?? behavior.replyText),
            requestIndex === 0 ? firstResponseGates.get(modelId)?.promise : undefined,
          );
          return;
        }
        writeTuiModelHttpJson(res, 404, { error: "not found" });
        return;
      }
      writeTuiModelHttpJson(res, 404, { error: "not found" });
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("mock model server did not bind");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests: (modelId) => (modelId ? (requestsByModel.get(modelId) ?? []) : requests),
    releaseFirstResponse: (modelId) => {
      firstResponseGates.get(modelId)?.resolve();
    },
    stop: async () => {
      // Never leave a held request owning the shared server during failure cleanup.
      for (const gate of firstResponseGates.values()) {
        gate.resolve();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        // Aborted local runs can leave a provider keep-alive open. Force-close
        // test-owned connections so cleanup does not wait for idle expiry.
        server.closeAllConnections();
      });
    },
  };
}
