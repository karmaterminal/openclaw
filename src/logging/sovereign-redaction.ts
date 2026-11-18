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

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return redactSovereignText(value);
  }
  if (typeof value !== "object" || value === null || depth > MAX_VALUE_DEPTH || seen.has(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    seen.add(value);
    let changed = false;
    const items = value.map((item) => {
      const next = redactValue(item, depth + 1, seen);
      changed ||= next !== item;
      return next;
    });
    return changed ? items : value;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }
  seen.add(value);
  let changed = false;
  const entries = Object.entries(value).map(([key, item]) => {
    const next = redactValue(item, depth + 1, seen);
    changed ||= next !== item;
    return [key, next] as const;
  });
  return changed ? Object.fromEntries(entries) : value;
}

/**
 * Redacts strings inside plain objects and arrays, returning the input itself when
 * nothing matched. Class instances pass through untouched; their owners redact.
 */
export function redactSovereignValue<T>(value: T): T {
  // SAFETY: redaction only replaces string leaves, so the shape and types are unchanged.
  return state.markers.size === 0 ? value : (redactValue(value, 0, new WeakSet()) as T);
}

export function resetSovereignRedactionForTests(): void {
  state.markers.clear();
  state.ordered = undefined;
}
