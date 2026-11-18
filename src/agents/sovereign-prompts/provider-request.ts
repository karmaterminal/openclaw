/**
 * Final-payload enforcement for sovereign prompts (openclaw#1321, design § 7.1).
 *
 * The renderer chokepoint hands each run the spans its validated render placed. This
 * module checks them in the settled provider request: after `before_provider_request`,
 * provider `wrapStreamFn` edits and every other payload hook, before transport, on every
 * send, including a transport's own retries. It never re-resolves an owner or re-renders.
 */
import { types } from "node:util";
import {
  markModelPayloadObserver,
  modelRequestBodyState,
  serializeModelRequestBody,
} from "@openclaw/ai/internal/model-request-body";
import { isRecord } from "@openclaw/normalization-core/record-coerce";
import { SUMMARIZATION_SYSTEM_PROMPT } from "../../../packages/agent-core/src/harness/compaction/summarization-prompts.js";
import type { SovereignPromptVerification } from "../../config/sessions/session-system-prompt-report.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { StreamFn } from "../runtime/index.js";
import type { SovereignPromptSpans } from "./runtime.js";
import { describeSovereignPromptsRefused, SovereignPromptRefusal } from "./snapshot.js";
import { finalPayloadVerified, type SovereignProviderRequestApi } from "./verification.js";

const log = createSubsystemLogger("agents/sovereign-prompts");

/**
 * Reads a payload's system text. `built` is the request the transport built, before any
 * hook ran: where two transports share an API id, its shape names the carrier.
 */
type SystemTextExtractor = (
  payload: Record<string, unknown>,
  built: unknown,
) => string[] | undefined;

/*
 * A transport serializes the request after this check, with `JSON.stringify` or its SDK's
 * own field reads. A proxy, a `toJSON` or a class prototype runs payload code there, and an
 * accessor answers each read anew, so the text sent could differ from the text read. The
 * readers below take only own enumerable data members of plain objects and arrays, what
 * `JSON.stringify` writes; anything else on the way to the system text reads as absent and
 * refuses (openclaw#1571 review).
 */
function isPlainJsonContainer(value: object): boolean {
  if (types.isProxy(value) || Object.hasOwn(value, "toJSON")) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return Array.isArray(value)
    ? prototype === Array.prototype
    : prototype === Object.prototype || prototype === null;
}

function readJsonRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) && isPlainJsonContainer(value) ? value : undefined;
}

/** The member `JSON.stringify` writes under `key`; an accessor is never called. */
function readJsonMember(container: object, key: string | number): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(container, key);
  return descriptor?.enumerable && "value" in descriptor ? descriptor.value : undefined;
}

function* readJsonElements(array: readonly unknown[]): Generator<unknown> {
  for (let index = 0; index < array.length; index++) {
    yield readJsonMember(array, index);
  }
}

function readJsonArray(value: unknown): Generator<unknown> | undefined {
  return Array.isArray(value) && isPlainJsonContainer(value) ? readJsonElements(value) : undefined;
}

/** The text of each element that `read` returns a string for (other elements are skipped). */
function readTexts(
  elements: Iterable<unknown>,
  read: (element: Record<string, unknown>) => unknown,
): string[] {
  const texts: string[] = [];
  for (const element of elements) {
    const record = readJsonRecord(element);
    const text = record ? read(record) : undefined;
    if (typeof text === "string") {
      texts.push(text);
    }
  }
  return texts;
}

/** A string, or an array whose `textType` blocks carry the text (other blocks are skipped). */
function readTextBlocks(value: unknown, textType: string): string[] | undefined {
  if (typeof value === "string") {
    return [value];
  }
  const blocks = readJsonArray(value);
  return blocks
    ? readTexts(blocks, (block) =>
        readJsonMember(block, "type") === textType ? readJsonMember(block, "text") : undefined,
      )
    : undefined;
}

/** The leading system-role messages of a message list: the system prompt position. */
function readLeadingSystemMessages(
  messages: unknown,
  roles: ReadonlySet<string>,
  textType: string,
): string[] | undefined {
  const elements = readJsonArray(messages);
  if (!elements) {
    return undefined;
  }
  const segments: string[] = [];
  for (const element of elements) {
    const message = readJsonRecord(element);
    const role = message ? readJsonMember(message, "role") : undefined;
    if (!message || typeof role !== "string" || !roles.has(role)) {
      break;
    }
    const text = readTextBlocks(readJsonMember(message, "content"), textType);
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
  const value = readJsonMember(payload, "instructions");
  const instructions = typeof value === "string" ? [value] : undefined;
  const input = readLeadingSystemMessages(
    readJsonMember(payload, "input"),
    SYSTEM_OR_DEVELOPER_ROLES,
    "input_text",
  );
  return instructions || input ? [...(instructions ?? []), ...(input ?? [])] : undefined;
};

/** Gemini `systemInstruction`: a string, or content whose text parts carry the prompt. */
function readGoogleInstruction(value: unknown): string[] | undefined {
  if (typeof value === "string") {
    return [value];
  }
  const content = readJsonRecord(value);
  const parts = readJsonArray(content ? readJsonMember(content, "parts") : value);
  return parts ? readTexts(parts, (part) => readJsonMember(part, "text")) : undefined;
}

/**
 * Two transports build Gemini requests under these API ids. The SDK builder hands the SDK
 * `GenerateContentParameters`, which sends the instruction from `config` and ignores a
 * top-level field; the managed transport (extensions/google) sends the REST body, which
 * carries it top-level and has no `config`. The built request names the contract, and only
 * that carrier is read: a hook cannot satisfy the check with a field the transport drops.
 */
const readGoogleSystemText: SystemTextExtractor = (payload, built) => {
  const carrier =
    isRecord(built) && isRecord(built.config)
      ? readJsonRecord(readJsonMember(payload, "config"))
      : payload;
  return carrier ? readGoogleInstruction(readJsonMember(carrier, "systemInstruction")) : undefined;
};

/**
 * Where each supported API builder (`@openclaw/ai` built-in registrations) places the
 * system prompt; the declared list (verification.ts) and this map must match. An API
 * absent here cannot be checked, so an `enforce` run there refuses.
 */
const SYSTEM_TEXT_EXTRACTORS: Readonly<Record<SovereignProviderRequestApi, SystemTextExtractor>> = {
  "anthropic-messages": (payload) => readTextBlocks(readJsonMember(payload, "system"), "text"),
  "openai-completions": (payload) =>
    readLeadingSystemMessages(
      readJsonMember(payload, "messages"),
      SYSTEM_OR_DEVELOPER_ROLES,
      "text",
    ),
  "mistral-conversations": (payload) =>
    readLeadingSystemMessages(readJsonMember(payload, "messages"), SYSTEM_ROLES, "text"),
  "openai-responses": readResponsesSystemText,
  "azure-openai-responses": readResponsesSystemText,
  "openai-chatgpt-responses": readResponsesSystemText,
  "google-generative-ai": readGoogleSystemText,
  "google-vertex": readGoogleSystemText,
  "google-interactions": (payload) => {
    const value = readJsonMember(payload, "system_instruction");
    return typeof value === "string" ? [value] : undefined;
  },
};

function isCheckedApi(api: string): api is SovereignProviderRequestApi {
  return Object.hasOwn(SYSTEM_TEXT_EXTRACTORS, api);
}

/**
 * Whether every span of this run's agent appears whole in one system text segment of the
 * payload. Formatting a provider adds around a span (cache blocks, an identity block,
 * a developer role) passes; a missing or unrecognised system field fails like an edit.
 */
function carriesSovereignSpans(params: {
  agentId: string;
  spans: SovereignPromptSpans | undefined;
  api: SovereignProviderRequestApi;
  payload: unknown;
  built: unknown;
}): boolean {
  const { spans } = params;
  const root = readJsonRecord(params.payload);
  const segments = root ? SYSTEM_TEXT_EXTRACTORS[params.api](root, params.built) : undefined;
  return (
    spans?.agentId === params.agentId &&
    segments !== undefined &&
    spans.instances.every((instance) => segments.some((text) => text.includes(instance)))
  );
}

type EncodeModelRequestBody = NonNullable<ReturnType<typeof modelRequestBodyState>["encode"]>;

/** `sent` is a parsed request body, so its members are plain data. */
function isResponsesContinuationDelta(api: string, sent: unknown): boolean {
  return (
    isCheckedApi(api) &&
    SYSTEM_TEXT_EXTRACTORS[api] === readResponsesSystemText &&
    isRecord(sent) &&
    typeof sent.previous_response_id === "string" &&
    readResponsesSystemText(sent, undefined) === undefined
  );
}

/** The request the encoded bytes carry, as the provider parses it. */
function parseSentRequest(body: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    // Not JSON: no system field the check can read, so it refuses.
    return undefined;
  }
}

/** What the check reads of its run. */
type SovereignRequestCheckRun = {
  sessionAgentId: string;
  /** The applied render's spans; a tool refresh can re-render mid-run. */
  sovereignSpans?: () => SovereignPromptSpans | undefined;
  /** Receives each check's outcome for the prompt report; `undefined` after a refusal. */
  onSovereignVerification?: (verification: SovereignPromptVerification | undefined) => void;
};

// A re-sent call can reuse its options' body state; unwrap an earlier check, never nest.
const checkedEncoders = new WeakMap<EncodeModelRequestBody, EncodeModelRequestBody | undefined>();

/**
 * Checks the settled provider request of an `enforce` run. Install it innermost, around
 * the selected transport, so its payload hook is the one the transport calls: it runs
 * the whole outer hook chain first, then checks what that chain returned, against the
 * API the transport built it for. A transport that encodes through the host is checked
 * again on the bytes of each encoded attempt, which covers resends that skip the hook (a
 * slower service tier, stripped reasoning), and sends exactly the bytes it checked. A
 * transport that serializes the request itself is checked on plain data only, so its own
 * serialization writes what was read. A refusal throws before any byte is sent.
 *
 * Each passed check reports `final-payload-verified` with the API it read; a refusal
 * withdraws it, so the run's prompt report holds the outcome of its latest check.
 *
 * A run whose render placed no span (an off agent, a raw run) keeps its stream as is.
 * Compaction summaries share the run's stream with their own code-owned system prompt,
 * which carries no sovereign span; a request whose prompt starts with it is not checked.
 */
export function wrapStreamFnWithSovereignRequestCheck(
  streamFn: StreamFn,
  run: SovereignRequestCheckRun,
): StreamFn {
  const { sessionAgentId: agentId, sovereignSpans: readSpans, onSovereignVerification } = run;
  if (!readSpans?.()) {
    return streamFn;
  }
  const refuse = (refusal: SovereignPromptRefusal): never => {
    // The transport's error projection redacts `key=value` text; the log keeps the site.
    const { line, fields } = describeSovereignPromptsRefused(agentId, refusal);
    log.warn(line, fields);
    onSovereignVerification?.(undefined);
    throw refusal;
  };
  return (model, context, options) => {
    if (context.systemPrompt?.startsWith(SUMMARIZATION_SYSTEM_PROMPT)) {
      return streamFn(model, context, options);
    }
    if (!isCheckedApi(model.api)) {
      refuse(new SovereignPromptRefusal("route_unconverted", { route: `api:${model.api}` }));
    }
    // A provider transport can build for another API than it was routed by (LM Studio).
    let api = model.api;
    let built: unknown;
    const assertPayload = (payload: unknown) => {
      const checkedApi = isCheckedApi(api) ? api : undefined;
      if (
        checkedApi &&
        carriesSovereignSpans({ agentId, spans: readSpans(), api: checkedApi, payload, built })
      ) {
        onSovereignVerification?.(finalPayloadVerified(checkedApi));
      } else {
        refuse(new SovereignPromptRefusal("transform_altered", { site: "provider_request" }));
      }
    };
    const originalOnPayload = options?.onPayload;
    const checkedOptions: NonNullable<Parameters<StreamFn>[2]> = {
      ...options,
      onPayload: async (payload, payloadModel) => {
        // Read before the outer chain runs: a hook can edit the built request in place.
        built = payload;
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
      const encoded = encode ? await encode(payload) : serializeModelRequestBody(payload);
      const sent = parseSentRequest(encoded.body);
      // A Responses continuation sends only new input after `previous_response_id`; the
      // provider reuses the stored prefix the hook check above already passed.
      if (!isResponsesContinuationDelta(api, sent)) {
        assertPayload(sent);
      }
      return encoded;
    };
    checkedEncoders.set(checkedEncode, encode);
    bodyState.encode = checkedEncode;
    return streamFn(model, context, checkedOptions);
  };
}
