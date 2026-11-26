/**
 * Process redactor for sovereign prompt text (openclaw#1321, loader design § 5.4).
 *
 * The prompt renderer registers every sovereign instance it renders. Echo surfaces
 * (plugin hook payloads, trajectory events, diagnostics) replace each whole instance
 * with a slot-and-digest marker, so sovereign text reaches the model and nothing else.
 *
 * Kept apart from the secret redaction registry on purpose: that one is exact-match,
 * bounded with oldest-first eviction, shared with credentials and masks partially.
 * Instances here are bounded by agents × converted slots × generations loaded in this
 * process, and are never evicted, so a late echo of an earlier render stays masked.
 */
import { sha256Hex } from "@openclaw/normalization-core/node-crypto";
import { resolveGlobalSingleton } from "../shared/global-singleton.js";

/** Prefix of the marker; a sovereign body may never contain it (loader `reserved_token`). */
export const SOVEREIGN_REDACTION_MARKER_PREFIX = "<!-- openclaw:sovereign";

const MAX_VALUE_DEPTH = 16;

// Native and source module copies share one instance set.
const state = resolveGlobalSingleton<{
  markers: Map<string, string>;
  /** Longest first, so an instance inside a longer one never splits it. */
  ordered: string[] | undefined;
}>(Symbol.for("openclaw.sovereignRedaction"), () => ({ markers: new Map(), ordered: undefined }));

/**
 * Records one rendered instance; the marker names its slot and digest, never its text.
 * The JSON-escaped spelling is recorded too, for raw request bodies (debug proxy capture)
 * that carry the prompt inside a serialized string.
 */
export function registerSovereignRenderedInstance(text: string, slot: string): void {
  if (!text || state.markers.has(text)) {
    return;
  }
  const marker = `${SOVEREIGN_REDACTION_MARKER_PREFIX} ${slot} sha256:${sha256Hex(text).slice(0, 12)} bytes:${Buffer.byteLength(text, "utf8")} -->`;
  state.markers.set(text, marker);
  const escaped = JSON.stringify(text).slice(1, -1);
  if (escaped !== text) {
    state.markers.set(escaped, marker);
  }
  state.ordered = undefined;
}

/** Replaces every registered instance in `text` with its marker. */
export function redactSovereignText(text: string): string;
export function redactSovereignText(text: string | undefined): string | undefined;
export function redactSovereignText(text: string | undefined): string | undefined {
  if (state.markers.size === 0 || !text) {
    return text;
  }
  state.ordered ??= [...state.markers.keys()].toSorted((a, b) => b.length - a.length);
  let redacted = text;
  for (const instance of state.ordered) {
    if (redacted.includes(instance)) {
      redacted = redacted.replaceAll(instance, state.markers.get(instance) ?? "");
    }
  }
  return redacted;
}

/** Own data properties, non-enumerable ones too, as the diagnostic projection reads them. */
function ownDataEntries(value: object): [string, unknown][] {
  const prototype = Object.getPrototypeOf(value);
  if (prototype === Object.prototype || prototype === null) {
    return Object.entries(value);
  }
  return Object.getOwnPropertyNames(value).flatMap((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor
      ? [[key, descriptor.value] as [string, unknown]]
      : [];
  });
}

function redactValue(value: unknown, depth: number, memo: Map<object, unknown>): unknown {
  if (typeof value === "string") {
    return redactSovereignText(value);
  }
  if (typeof value !== "object" || value === null || depth > MAX_VALUE_DEPTH) {
    return value;
  }
  // A shared reference reuses its result; a cycle back to an ancestor keeps the edge.
  if (memo.has(value)) {
    return memo.get(value);
  }
  if (ArrayBuffer.isView(value) || value instanceof Date || value instanceof RegExp) {
    return value;
  }
  memo.set(value, value);
  let result: unknown;
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const next = redactValue(item, depth + 1, memo);
      changed ||= next !== item;
      return next;
    });
    result = changed ? items : value;
  } else {
    let changed = false;
    const entries = ownDataEntries(value).map(([key, item]) => {
      const next = redactValue(item, depth + 1, memo);
      changed ||= next !== item;
      return [key, next] as const;
    });
    // Sanitizers project class instances (provider errors echoing a request) to plain data,
    // so a changed instance becomes that plain copy, with the sovereign spans replaced.
    result = changed ? Object.fromEntries(entries) : value;
  }
  memo.set(value, result);
  return result;
}

/**
 * Redacts strings inside objects and arrays, returning the input itself when nothing
 * matched. An object that held a sovereign span comes back as a plain copy.
 */
export function redactSovereignValue<T>(value: T): T {
  // SAFETY: only string leaves change; a changed object becomes a plain copy of its own data
  // properties, which is what every diagnostic and trajectory sink serializes anyway.
  return state.markers.size === 0 ? value : (redactValue(value, 0, new Map()) as T);
}

export function resetSovereignRedactionForTests(): void {
  state.markers.clear();
  state.ordered = undefined;
}
