/**
 * Final-payload enforcement for sovereign prompts (openclaw#1321, design § 7.1).
 *
 * The renderer chokepoint hands each run the spans its validated render placed. This
 * module checks them in the settled provider request: after `before_provider_request`,
 * provider `wrapStreamFn` edits and every other payload hook, before transport, on every
 * send, including a transport's own retries. It never re-resolves an owner or re-renders.
 */
import {
  markModelPayloadObserver,
  modelRequestBodyState,
  serializeModelRequestBody,
} from "@openclaw/ai/internal/model-request-body";
import { isRecord } from "@openclaw/normalization-core/record-coerce";
import { SUMMARIZATION_SYSTEM_PROMPT } from "../../../packages/agent-core/src/harness/compaction/summarization-prompts.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { StreamFn } from "../runtime/index.js";
import type { SovereignPromptSpans } from "./runtime.js";
import { describeSovereignPromptsRefused, SovereignPromptRefusal } from "./snapshot.js";

const log = createSubsystemLogger("agents/sovereign-prompts");

type SystemTextExtractor = (payload: Record<string, unknown>) => string[] | undefined;

/** A string, or an array whose `textType` blocks carry the text (other blocks are skipped). */
function readTextBlocks(value: unknown, textType: string): string[] | undefined {
  if (typeof value === "string") {
    return [value];
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.flatMap((block) =>
    isRecord(block) && block.type === textType && typeof block.text === "string"
      ? [block.text]
      : [],
  );
}

/** The leading system-role messages of a message list: the system prompt position. */
function readLeadingSystemMessages(
  messages: unknown,
  roles: ReadonlySet<string>,
  textType: string,
): string[] | undefined {
  if (!Array.isArray(messages)) {
    return undefined;
  }
  const segments: string[] = [];
  for (const message of messages) {
    if (!isRecord(message) || typeof message.role !== "string" || !roles.has(message.role)) {
      break;
    }
    const text = readTextBlocks(message.content, textType);
    if (!text) {
      return undefined;
    }
    segments.push(...text);
  }
  return segments.length > 0 ? segments : undefined;
}

const SYSTEM_ROLES: ReadonlySet<string> = new Set(["system"]);
const SYSTEM_OR_DEVELOPER_ROLES: ReadonlySet<string> = new Set(["system", "developer"]);

/** Responses routes carry the prompt in `instructions`, or first in `input` where unsupported. */
const readResponsesSystemText: SystemTextExtractor = (payload) => {
  const instructions =
    typeof payload.instructions === "string" ? [payload.instructions] : undefined;
  const input = readLeadingSystemMessages(payload.input, SYSTEM_OR_DEVELOPER_ROLES, "input_text");
  return instructions || input ? [...(instructions ?? []), ...(input ?? [])] : undefined;
};

/** Gemini `systemInstruction`: a string, or content whose text parts carry the prompt. */
function readGoogleInstruction(value: unknown): string[] | undefined {
  if (typeof value === "string") {
    return [value];
  }
  const parts = isRecord(value) ? value.parts : value;
  if (!Array.isArray(parts)) {
    return undefined;
  }
  return parts.flatMap((part) =>
    isRecord(part) && typeof part.text === "string" ? [part.text] : [],
  );
}

/** The SDK builder nests it in `config`; the Google transport sends it at the top level. */
const readGoogleSystemText: SystemTextExtractor = (payload) =>
  readGoogleInstruction(
    payload.systemInstruction ??
      (isRecord(payload.config) ? payload.config.systemInstruction : undefined),
  );

/**
 * Where each supported API builder (`@openclaw/ai` built-in registrations) places the
 * system prompt. An API absent here cannot be checked, so an `enforce` run there refuses.
 */
const SYSTEM_TEXT_EXTRACTORS: Readonly<Record<string, SystemTextExtractor>> = {
  "anthropic-messages": (payload) => readTextBlocks(payload.system, "text"),
  "openai-completions": (payload) =>
    readLeadingSystemMessages(payload.messages, SYSTEM_OR_DEVELOPER_ROLES, "text"),
  "mistral-conversations": (payload) =>
    readLeadingSystemMessages(payload.messages, SYSTEM_ROLES, "text"),
  "openai-responses": readResponsesSystemText,
  "azure-openai-responses": readResponsesSystemText,
  "openai-chatgpt-responses": readResponsesSystemText,
  "google-generative-ai": readGoogleSystemText,
  "google-vertex": readGoogleSystemText,
  "google-interactions": (payload) =>
    typeof payload.system_instruction === "string" ? [payload.system_instruction] : undefined,
};

/** Whether a provider request for this API can be checked; others refuse under `enforce`. */
export function isSovereignProviderRequestCheckable(api: string): boolean {
  return Object.hasOwn(SYSTEM_TEXT_EXTRACTORS, api);
}

/**
 * Fails the request unless every span appears whole in one system text segment of the
 * payload. Formatting a provider adds around a span (cache blocks, an identity block,
 * a developer role) passes; a missing or unrecognised system field fails like an edit.
 */
export function assertSovereignProviderRequest(params: {
  agentId: string;
  spans: SovereignPromptSpans | undefined;
  api: string;
  payload: unknown;
}): void {
  const { spans } = params;
  const extract = SYSTEM_TEXT_EXTRACTORS[params.api];
  const segments = extract && isRecord(params.payload) ? extract(params.payload) : undefined;
  if (
    spans?.agentId !== params.agentId ||
    !segments ||
    spans.instances.some((instance) => !segments.some((text) => text.includes(instance)))
  ) {
    throw new SovereignPromptRefusal("transform_altered", { site: "provider_request" });
  }
}

type EncodeModelRequestBody = NonNullable<ReturnType<typeof modelRequestBodyState>["encode"]>;

function isResponsesContinuationDelta(api: string, payload: unknown): boolean {
  return (
    SYSTEM_TEXT_EXTRACTORS[api] === readResponsesSystemText &&
    isRecord(payload) &&
    typeof payload.previous_response_id === "string" &&
    readResponsesSystemText(payload) === undefined
  );
}

// A re-sent call can reuse its options' body state; unwrap an earlier check, never nest.
const checkedEncoders = new WeakMap<EncodeModelRequestBody, EncodeModelRequestBody | undefined>();

/**
 * Checks the settled provider request of an `enforce` run. Install it innermost, around
 * the selected transport, so its payload hook is the one the transport calls: it runs
 * the whole outer hook chain first, then checks what that chain returned, against the
 * API the transport built it for. A transport that encodes through the host is checked
 * again on each encoded attempt, which covers resends that skip the hook (a slower
 * service tier, stripped reasoning). A refusal throws before any byte is sent.
 *
 * A run whose render placed no span (an off agent, a raw run) keeps its stream as is.
 * Compaction summaries share the run's stream with their own code-owned system prompt,
 * which carries no sovereign span; a request whose prompt starts with it is not checked.
 */
export function wrapStreamFnWithSovereignRequestCheck(
  streamFn: StreamFn,
  run: {
    sessionAgentId: string;
    /** The applied render's spans; a tool refresh can re-render mid-run. */
    sovereignSpans?: () => SovereignPromptSpans | undefined;
  },
): StreamFn {
  const { sessionAgentId: agentId, sovereignSpans: readSpans } = run;
  if (!readSpans?.()) {
    return streamFn;
  }
  return (model, context, options) => {
    if (context.systemPrompt?.startsWith(SUMMARIZATION_SYSTEM_PROMPT)) {
      return streamFn(model, context, options);
    }
    if (!isSovereignProviderRequestCheckable(model.api)) {
      throw new SovereignPromptRefusal("route_unconverted", { route: `api:${model.api}` });
    }
    // A provider transport can build for another API than it was routed by (LM Studio).
    let api = model.api;
    const assertPayload = (payload: unknown) => {
      try {
        assertSovereignProviderRequest({ agentId, spans: readSpans(), api, payload });
      } catch (error) {
        // The transport's error projection redacts `key=value` text; the log keeps the site.
        if (error instanceof SovereignPromptRefusal) {
          const { line, fields } = describeSovereignPromptsRefused(agentId, error);
          log.warn(line, fields);
        }
        throw error;
      }
    };
    const originalOnPayload = options?.onPayload;
    const checkedOptions: NonNullable<Parameters<StreamFn>[2]> = {
      ...options,
      onPayload: async (payload, payloadModel) => {
        const replacement = await originalOnPayload?.(payload, payloadModel);
        api = payloadModel.api;
        assertPayload(replacement === undefined ? payload : replacement);
        return replacement;
      },
    };
    // Mutability follows the caller's hook; this one never edits the payload.
    markModelPayloadObserver(checkedOptions.onPayload!, originalOnPayload);
    const bodyState = modelRequestBodyState(checkedOptions);
    const current = bodyState.encode;
    const encode = current && checkedEncoders.has(current) ? checkedEncoders.get(current) : current;
    const checkedEncode: EncodeModelRequestBody = async (payload) => {
      // A Responses continuation sends only new input after `previous_response_id`; the
      // provider reuses the stored prefix the hook check above already passed.
      if (!isResponsesContinuationDelta(api, payload)) {
        assertPayload(payload);
      }
      return encode ? await encode(payload) : serializeModelRequestBody(payload);
    };
    checkedEncoders.set(checkedEncode, encode);
    bodyState.encode = checkedEncode;
    return streamFn(model, context, checkedOptions);
  };
}
