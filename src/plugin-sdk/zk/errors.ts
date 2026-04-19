/**
 * Typed errors for the ZooKeeper coordination SDK. Callers should branch on
 * `error.code` rather than `instanceof` checks — that keeps contract-only
 * consumers from pulling the full error class hierarchy onto a cold path.
 *
 * Path convention: every error carries the znode path that triggered it when
 * applicable, so log lines are self-describing without callers re-wrapping.
 */

export type ZkErrorCode =
  | "session-expired"
  | "connection-loss"
  | "no-node"
  | "node-exists"
  | "not-empty"
  | "version-mismatch"
  | "auth-failed"
  | "not-owner"
  | "native-driver-unavailable"
  | "invalid-path"
  | "timeout"
  | "unknown";

export class ZkError extends Error {
  readonly code: ZkErrorCode;
  readonly path?: string;
  readonly cause?: unknown;

  constructor(code: ZkErrorCode, message: string, options?: { path?: string; cause?: unknown }) {
    super(message);
    this.name = "ZkError";
    this.code = code;
    this.path = options?.path;
    this.cause = options?.cause;
  }
}

// Narrow aliases for readability at call sites. Each keeps the same code but
// sets a canonical message prefix so stack traces read cleanly.

export class SessionExpiredError extends ZkError {
  constructor(message = "zk session expired", options?: { path?: string; cause?: unknown }) {
    super("session-expired", message, options);
    this.name = "SessionExpiredError";
  }
}

export class ConnectionLossError extends ZkError {
  constructor(message = "zk connection loss", options?: { path?: string; cause?: unknown }) {
    super("connection-loss", message, options);
    this.name = "ConnectionLossError";
  }
}

export class NoNodeError extends ZkError {
  constructor(path: string, message?: string) {
    super("no-node", message ?? `zk node not found: ${path}`, { path });
    this.name = "NoNodeError";
  }
}

export class NodeExistsError extends ZkError {
  constructor(path: string, message?: string) {
    super("node-exists", message ?? `zk node exists: ${path}`, { path });
    this.name = "NodeExistsError";
  }
}

export class ZkNativeDriverUnavailableError extends ZkError {
  constructor(cause?: unknown) {
    super(
      "native-driver-unavailable",
      "zookeeper native driver unavailable — run `openclaw zk setup` to install " +
        "node-gyp prereqs + the `zookeeper` package (it's an optionalDependency " +
        "so a missing toolchain during `npm i -g openclaw` doesn't break install).",
      { cause },
    );
    this.name = "ZkNativeDriverUnavailableError";
  }
}

/**
 * Convert a raw error from any driver into a `ZkError`. Drivers should call
 * this on the failure path so callers get a stable error shape.
 */
export function toZkError(err: unknown, fallbackPath?: string): ZkError {
  if (err instanceof ZkError) {
    return err;
  }
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes("no node") || lower.includes("does not exist")) {
    return new NoNodeError(fallbackPath ?? "<unknown>", message);
  }
  if (lower.includes("node exists") || lower.includes("already exists")) {
    return new NodeExistsError(fallbackPath ?? "<unknown>", message);
  }
  if (lower.includes("session") && lower.includes("expir")) {
    return new SessionExpiredError(message, { path: fallbackPath, cause: err });
  }
  if (lower.includes("connection") && (lower.includes("loss") || lower.includes("closed"))) {
    return new ConnectionLossError(message, { path: fallbackPath, cause: err });
  }
  return new ZkError("unknown", message, { path: fallbackPath, cause: err });
}
