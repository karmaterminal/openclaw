// Routed mock OpenAI Responses model server for the TUI PTY real-backend e2e cases.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { writeOpenAiResponsesSse } from "../../test/helpers/openai-responses-sse.js";
import { createDeferred } from "../../test/helpers/promise.js";

export type MockModelServer = {
  baseUrl: string;
  requests: (modelId?: string) => MockModelRequest[];
  rejectedRequests: () => MockModelRequest[];
  allowValidResponses: (modelId: string) => void;
  releaseFirstResponse: (modelId: string) => void;
  stop: () => Promise<void>;
};

export type MockModelBehavior = {
  replyText: string;
  holdFirstResponse?: boolean;
  followupReplyText?: string;
  invalidEditLoop?: boolean;
};

type MockModelRequest = {
  method: string;
  path: string;
  authorization?: string;
  body: Record<string, unknown>;
};

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function writeJson(res: ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
  });
  res.end(text);
}

async function writeResponsesSse(
  res: ServerResponse,
  text: string,
  completionGate?: Promise<void>,
) {
  const id = "msg_tui_pty_local";
  const events = [
    {
      type: "response.output_item.added",
      output_index: 0,
      sequence_number: 0,
      item: { type: "message", id, role: "assistant", content: [], status: "in_progress" },
    },
    {
      type: "response.output_text.delta",
      item_id: id,
      output_index: 0,
      content_index: 0,
      sequence_number: 1,
      logprobs: [],
      delta: text,
    },
    {
      type: "response.output_text.done",
      item_id: id,
      output_index: 0,
      content_index: 0,
      sequence_number: 2,
      logprobs: [],
      text,
    },
    {
      type: "response.output_item.done",
      output_index: 0,
      sequence_number: 3,
      item: {
        type: "message",
        id,
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    },
    {
      type: "response.completed",
      sequence_number: 4,
      response: {
        id: "resp_tui_pty_local",
        status: "completed",
        output: [
          {
            type: "message",
            id,
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text, annotations: [] }],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      },
    },
  ];
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify(events[0])}\n\n`);
  if (completionGate) {
    await completionGate;
  }
  if (res.destroyed) {
    return;
  }
  const completionBody = `${events
    .slice(1)
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("")}data: [DONE]\n\n`;
  res.end(completionBody);
}

function writeInvalidEditCallSse(res: ServerResponse, requestIndex: number) {
  const item = {
    type: "function_call",
    id: `fc_tui_validation_${requestIndex}`,
    call_id: `call_tui_validation_${requestIndex}`,
    name: "edit",
    arguments: "{}",
    status: "completed",
  };
  const events = [
    {
      type: "response.output_item.added",
      output_index: 0,
      sequence_number: 0,
      item: { ...item, status: "in_progress" },
    },
    { type: "response.output_item.done", output_index: 0, sequence_number: 1, item },
    {
      type: "response.completed",
      sequence_number: 2,
      response: {
        id: `resp_tui_validation_${requestIndex}`,
        status: "completed",
        output: [item],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      },
    },
  ];
  writeOpenAiResponsesSse(res, events);
}

async function readJsonRequest(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readRequestBody(req);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

export async function startRoutedMockModelServer(
  behaviors: Readonly<Record<string, MockModelBehavior>>,
): Promise<MockModelServer> {
  const requests: MockModelRequest[] = [];
  const rejectedRequests: MockModelRequest[] = [];
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
        writeJson(res, 200, { ok: true });
        return;
      }
      if (req.method === "GET" && url.pathname === "/v1/models") {
        writeJson(res, 200, {
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
            method: req.method,
            path: url.pathname,
            authorization: req.headers.authorization,
            body,
          };
          const behavior = behaviors[modelId];
          if (!behavior) {
            rejectedRequests.push(request);
            writeJson(res, 400, { error: `unknown mock model: ${modelId || "missing"}` });
            return;
          }
          const modelRequests = requestsByModel.get(modelId) ?? [];
          if (!requestsByModel.has(modelId)) {
            requestsByModel.set(modelId, modelRequests);
          }
          const requestIndex = modelRequests.length;
          requests.push(request);
          modelRequests.push(request);
          if (behavior.invalidEditLoop) {
            writeInvalidEditCallSse(res, requestIndex);
            return;
          }
          await writeResponsesSse(
            res,
            requestIndex === 0
              ? behavior.replyText
              : (behavior.followupReplyText ?? behavior.replyText),
            requestIndex === 0 ? firstResponseGates.get(modelId)?.promise : undefined,
          );
          return;
        }
        writeJson(res, 404, { error: "not found" });
        return;
      }
      writeJson(res, 404, { error: "not found" });
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
    rejectedRequests: () => rejectedRequests,
    allowValidResponses: (modelId) => {
      const behavior = behaviors[modelId];
      if (behavior) {
        behavior.invalidEditLoop = false;
      }
    },
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

export async function startMockModelServer(
  replyText: string,
  opts: Omit<MockModelBehavior, "replyText"> = {},
): Promise<MockModelServer> {
  return await startRoutedMockModelServer({
    "gpt-5.5": { replyText, ...opts },
  });
}
