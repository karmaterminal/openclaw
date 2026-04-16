import { escapeRegExp } from "../utils.js";

export const HEARTBEAT_TOKEN = "HEARTBEAT_OK";
export const SILENT_REPLY_TOKEN = "NO_REPLY";
export const CONTINUE_WORK_TOKEN = "CONTINUE_WORK";

const silentExactRegexByToken = new Map<string, RegExp>();
const silentTrailingRegexByToken = new Map<string, RegExp>();
const silentLeadingAttachedRegexByToken = new Map<string, RegExp>();

function getSilentExactRegex(token: string): RegExp {
  const cached = silentExactRegexByToken.get(token);
  if (cached) {
    return cached;
  }
  const escaped = escapeRegExp(token);
  const regex = new RegExp(`^\\s*${escaped}\\s*$`, "i");
  silentExactRegexByToken.set(token, regex);
  return regex;
}

function getSilentTrailingRegex(token: string): RegExp {
  const cached = silentTrailingRegexByToken.get(token);
  if (cached) {
    return cached;
  }
  const escaped = escapeRegExp(token);
  const regex = new RegExp(`(?:^|\\s+|\\*+)${escaped}\\s*$`, "i");
  silentTrailingRegexByToken.set(token, regex);
  return regex;
}

export function isSilentReplyText(
  text: string | undefined,
  token: string = SILENT_REPLY_TOKEN,
): boolean {
  if (!text) {
    return false;
  }
  // Match only the exact silent token with optional surrounding whitespace.
  // This prevents substantive replies ending with NO_REPLY from being suppressed (#19537).
  return getSilentExactRegex(token).test(text);
}

type SilentReplyActionEnvelope = { action?: unknown };

export function isSilentReplyEnvelopeText(
  text: string | undefined,
  token: string = SILENT_REPLY_TOKEN,
): boolean {
  if (!text) {
    return false;
  }
  const trimmed = text.trim();
  if (!trimmed || !trimmed.startsWith("{") || !trimmed.endsWith("}") || !trimmed.includes(token)) {
    return false;
  }
  try {
    const parsed = JSON.parse(trimmed) as SilentReplyActionEnvelope;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }
    const keys = Object.keys(parsed);
    return (
      keys.length === 1 &&
      keys[0] === "action" &&
      typeof parsed.action === "string" &&
      parsed.action.trim() === token
    );
  } catch {
    return false;
  }
}

export function isSilentReplyPayloadText(
  text: string | undefined,
  token: string = SILENT_REPLY_TOKEN,
): boolean {
  return isSilentReplyText(text, token) || isSilentReplyEnvelopeText(text, token);
}

/**
 * Strip a trailing silent reply token from mixed-content text.
 * Returns the remaining text with the token removed (trimmed).
 * If the result is empty, the entire message should be treated as silent.
 */
export function stripSilentToken(text: string, token: string = SILENT_REPLY_TOKEN): string {
  return text.replace(getSilentTrailingRegex(token), "").trim();
}

const silentLeadingRegexByToken = new Map<string, RegExp>();

function getSilentLeadingAttachedRegex(token: string): RegExp {
  const cached = silentLeadingAttachedRegexByToken.get(token);
  if (cached) {
    return cached;
  }
  const escaped = escapeRegExp(token);
  // Match one or more leading occurrences of the token where the final token
  // is glued directly to visible word-start content (for example
  // `NO_REPLYhello`), without treating punctuation-start text like
  // `NO_REPLY: explanation` as a silent prefix.
  const regex = new RegExp(`^\\s*(?:${escaped}\\s+)*${escaped}(?=[\\p{L}\\p{N}])`, "iu");
  silentLeadingAttachedRegexByToken.set(token, regex);
  return regex;
}

function getSilentLeadingRegex(token: string): RegExp {
  const cached = silentLeadingRegexByToken.get(token);
  if (cached) {
    return cached;
  }
  const escaped = escapeRegExp(token);
  // Match one or more leading occurrences of the token, each optionally followed by whitespace
  const regex = new RegExp(`^(?:\\s*${escaped})+\\s*`, "i");
  silentLeadingRegexByToken.set(token, regex);
  return regex;
}

/**
 * Strip leading silent reply tokens from text.
 * Handles cases like "NO_REPLYThe user is saying..." where the token
 * is not separated from the following text.
 */
export function stripLeadingSilentToken(text: string, token: string = SILENT_REPLY_TOKEN): string {
  return text.replace(getSilentLeadingRegex(token), "").trim();
}

/**
 * Check whether text starts with one or more leading silent reply tokens where
 * the final token is glued directly to visible content.
 */
export function startsWithSilentToken(
  text: string | undefined,
  token: string = SILENT_REPLY_TOKEN,
): boolean {
  if (!text) {
    return false;
  }
  return getSilentLeadingAttachedRegex(token).test(text);
}

export function isSilentReplyPrefixText(
  text: string | undefined,
  token: string = SILENT_REPLY_TOKEN,
): boolean {
  if (!text) {
    return false;
  }
  const trimmed = text.trimStart();
  if (!trimmed) {
    return false;
  }
  // Guard against suppressing natural-language "No..." text while still
  // catching uppercase lead fragments like "NO" from streamed NO_REPLY.
  if (trimmed !== trimmed.toUpperCase()) {
    return false;
  }
  const normalized = trimmed.toUpperCase();
  if (!normalized) {
    return false;
  }
  if (normalized.length < 2) {
    return false;
  }
  if (/[^A-Z_]/.test(normalized)) {
    return false;
  }
  const tokenUpper = token.toUpperCase();
  if (!tokenUpper.startsWith(normalized)) {
    return false;
  }
  if (normalized.includes("_")) {
    return true;
  }
  // Keep underscore guard for generic tokens to avoid suppressing unrelated
  // uppercase words (e.g. HEART/HE with HEARTBEAT_OK). Only allow bare "NO"
  // because NO_REPLY streaming can transiently emit that fragment.
  return tokenUpper === SILENT_REPLY_TOKEN && normalized === "NO";
}

export type ContinuationSignal =
  | { kind: "work"; delayMs?: number }
  | {
      kind: "delegate";
      task: string;
      delayMs?: number;
      silent?: boolean;
      silentWake?: boolean;
      postCompaction?: boolean;
    };

export function parseContinuationSignal(text: string | undefined): ContinuationSignal | null {
  if (!text) {
    return null;
  }

  const trimmed = text.trim();

  const delegateMatch = trimmed.match(
    /\[\[\s*CONTINUE_DELEGATE:\s*((?:(?!\]\])[\s\S])+?)\s*\]\]\s*$/,
  );
  if (delegateMatch) {
    let taskBody = delegateMatch[1].trim();
    let silent: boolean | undefined;
    let silentWake: boolean | undefined;
    let postCompaction: boolean | undefined;
    const postCompactionSuffixMatch = taskBody.match(/\s*\|\s*post[- ]compaction\s*$/i);
    if (postCompactionSuffixMatch) {
      postCompaction = true;
      silent = true;
      silentWake = true;
      taskBody = taskBody.slice(0, -postCompactionSuffixMatch[0].length).trimEnd();
    } else {
      const silentWakeSuffixMatch = taskBody.match(/\s*\|\s*silent[- ]wake\s*$/i);
      if (silentWakeSuffixMatch) {
        silentWake = true;
        taskBody = taskBody.slice(0, -silentWakeSuffixMatch[0].length).trimEnd();
      } else {
        const silentSuffixMatch = taskBody.match(/\s*\|\s*silent\s*$/i);
        if (silentSuffixMatch) {
          silent = true;
          taskBody = taskBody.slice(0, -silentSuffixMatch[0].length).trimEnd();
        }
      }
    }
    let delayMs: number | undefined;
    const delayMatch = taskBody.match(/\s+\+(\d+)s\s*$/);
    if (delayMatch) {
      delayMs = parseInt(delayMatch[1], 10) * 1000;
      taskBody = taskBody.slice(0, -delayMatch[0].length).trimEnd();
    }
    if (taskBody) {
      const maxTaskLength = 4096;
      return {
        kind: "delegate",
        task: taskBody.slice(0, maxTaskLength),
        delayMs,
        silent,
        silentWake,
        postCompaction,
      };
    }
  }

  const workMatch = trimmed.match(/\bCONTINUE_WORK(?::(\d+))?\s*$/);
  if (workMatch) {
    const delaySec = workMatch[1] ? parseInt(workMatch[1], 10) : undefined;
    return {
      kind: "work",
      delayMs: delaySec !== undefined ? delaySec * 1000 : undefined,
    };
  }

  return null;
}

export function stripContinuationSignal(text: string): {
  text: string;
  signal: ContinuationSignal | null;
} {
  const signal = parseContinuationSignal(text);
  if (!signal) {
    return { text, signal: null };
  }

  const stripped =
    signal.kind === "delegate"
      ? text.replace(/\[\[\s*CONTINUE_DELEGATE:\s*(?:(?!\]\])[\s\S])+?\s*\]\]\s*$/, "")
      : text.replace(/\bCONTINUE_WORK(?::\d+)?\s*$/, "");

  return {
    text: stripped.trimEnd(),
    signal,
  };
}
