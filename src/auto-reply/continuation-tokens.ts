/**
 * Parse and strip continuation response-token syntax from agent output.
 *
 * Two forms are supported:
 *   - CONTINUE_WORK / CONTINUE_WORK:N  — self-elected same-session continuation
 *   - [[CONTINUE_DELEGATE: <task>]]     — delegated continuation with optional +Ns delay
 *
 * These are the response-token fallback path. The primary path is the typed
 * tool interface (continue_work, continue_delegate). Both paths converge on
 * the same scheduler.
 */

export type ContinuationWorkSignal = {
  kind: "work";
  delaySeconds: number | undefined;
};

export type ContinuationDelegateSignal = {
  kind: "delegate";
  task: string;
  delaySeconds: number | undefined;
};

export type ContinuationSignal = ContinuationWorkSignal | ContinuationDelegateSignal;

// CONTINUE_WORK or CONTINUE_WORK:30 at end of text
const CONTINUE_WORK_RE = /(?:^|\s+)CONTINUE_WORK(?::(\d+))?\s*$/;

// [[CONTINUE_DELEGATE: <task> +10s]] — task is everything up to optional +Ns
const CONTINUE_DELEGATE_RE = /\[\[CONTINUE_DELEGATE:\s*([\s\S]+?)\s*\]\]\s*$/;

// Optional +Ns delay suffix inside the delegate task text
const DELAY_SUFFIX_RE = /\s+\+(\d+)s\s*$/;

/**
 * Parse a continuation signal from the end of finalized response text.
 * Returns undefined if no signal is detected.
 */
export function parseContinuationSignal(text: string): ContinuationSignal | undefined {
  if (!text) {
    return undefined;
  }

  // Check for [[CONTINUE_DELEGATE: ...]] first (more specific)
  const delegateMatch = CONTINUE_DELEGATE_RE.exec(text);
  if (delegateMatch) {
    let task = delegateMatch[1].trim();
    let delaySeconds: number | undefined;

    const delaySuffixMatch = DELAY_SUFFIX_RE.exec(task);
    if (delaySuffixMatch) {
      delaySeconds = parseInt(delaySuffixMatch[1], 10);
      task = task.replace(DELAY_SUFFIX_RE, "").trim();
    }

    if (task) {
      return { kind: "delegate", task, delaySeconds };
    }
  }

  // Check for CONTINUE_WORK / CONTINUE_WORK:N
  const workMatch = CONTINUE_WORK_RE.exec(text);
  if (workMatch) {
    const delaySeconds = workMatch[1] ? parseInt(workMatch[1], 10) : undefined;
    return { kind: "work", delaySeconds };
  }

  return undefined;
}

/**
 * Strip the continuation signal syntax from display text.
 * Returns the cleaned text (may be empty if the entire message was the signal).
 */
export function stripContinuationSignal(text: string): string {
  if (!text) {
    return text;
  }

  // Strip [[CONTINUE_DELEGATE: ...]]
  const delegateStripped = text.replace(CONTINUE_DELEGATE_RE, "");
  if (delegateStripped !== text) {
    return delegateStripped.trim();
  }

  // Strip CONTINUE_WORK / CONTINUE_WORK:N
  return text.replace(CONTINUE_WORK_RE, "").trim();
}

/**
 * Check whether partial streaming text looks like it could be a continuation
 * signal still being emitted. Used to suppress premature display of partial
 * tokens during streaming.
 */
export function isContinuationSignalPrefix(text: string): boolean {
  if (!text) {
    return false;
  }
  const trimmed = text.trimStart().toUpperCase();
  if (!trimmed) {
    return false;
  }
  // Only uppercase letters and underscores can be a CONTINUE_WORK prefix
  if (/[^A-Z_:]/.test(trimmed)) {
    return false;
  }
  return "CONTINUE_WORK".startsWith(trimmed) || trimmed.startsWith("CONTINUE_WORK");
}
