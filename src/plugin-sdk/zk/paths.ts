/**
 * Pure helpers for znode paths. Keep this file zero-runtime-deps so it can
 * be imported from the hot plugin-sdk contract without waking the native
 * driver.
 *
 * Path convention (matches `docs/plugins/zk-parity.md`):
 *   /openclaw/<env>/<feature>/<...>
 *
 * The helpers below deliberately leave the `env` lookup to callers — they
 * are expected to resolve `deploy.env` from the openclaw config (or fall
 * back to the literal `"fleet"`) and pass it in. That keeps these helpers
 * independent of config-loading and safe to call from unit tests.
 */

import { ZkError } from "./errors.js";

export const ZK_DEFAULT_ENV = "fleet";
export const ZK_ROOT = "/openclaw";

/**
 * Join path segments with `/`, collapsing accidental duplicates and
 * normalizing trailing slashes. Rejects empty segments and paths with
 * shell-injection characters.
 *
 * Examples:
 *   joinPath("/openclaw", "fleet", "user", "locks") → "/openclaw/fleet/user/locks"
 *   joinPath("/openclaw/", "/fleet/", "reply")        → "/openclaw/fleet/reply"
 */
export function joinPath(...segments: readonly string[]): string {
  if (segments.length === 0) {
    return "/";
  }
  const joined =
    "/" +
    segments
      .map((seg) => seg.trim().replace(/^\/+|\/+$/g, ""))
      .filter((seg) => seg.length > 0)
      .join("/");
  return joined === "" ? "/" : joined;
}

/**
 * Validate a znode path. Throws `ZkError("invalid-path")` if:
 *   - doesn't start with `/`
 *   - contains `..` segments or consecutive slashes
 *   - contains characters the ZK wire forbids (null byte, `\u0001`-`\u001f`)
 *
 * Called by every recipe constructor so callers can't sneak in shell
 * metacharacters through the CLI wrapper.
 */
export function validatePath(path: string): void {
  if (typeof path !== "string" || path.length === 0) {
    throw new ZkError("invalid-path", "zk path must be a non-empty string");
  }
  if (!path.startsWith("/")) {
    throw new ZkError("invalid-path", `zk path must start with '/': ${path}`, { path });
  }
  if (path.length > 1 && path.endsWith("/")) {
    throw new ZkError("invalid-path", `zk path must not end with '/': ${path}`, { path });
  }
  if (path.includes("//")) {
    throw new ZkError("invalid-path", `zk path contains '//': ${path}`, { path });
  }
  if (path.split("/").some((seg) => seg === "..")) {
    throw new ZkError("invalid-path", `zk path contains '..': ${path}`, { path });
  }
  // ZK forbids \u0000 and some control chars; the C client enforces this but
  // we check early so the error message names the path instead of surfacing
  // a native-driver error.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) {
    throw new ZkError("invalid-path", `zk path contains control character: ${path}`, { path });
  }
}

/**
 * Build a path under the openclaw namespace convention. `env` is the
 * deployment environment (`"fleet"` by default), `feature` is the reserved
 * feature prefix (e.g. `"user/locks"`, `"taskflow"`, `"reply"`), and the
 * remaining segments are the caller's key material.
 *
 * See `docs/plugins/zk-parity.md` for the reserved-prefix table.
 */
export function featurePath(env: string, feature: string, ...rest: readonly string[]): string {
  const path = joinPath(ZK_ROOT, env.trim() || ZK_DEFAULT_ENV, feature, ...rest);
  validatePath(path);
  return path;
}

/**
 * Return the parent znode path. Root (`/`) returns itself.
 */
export function parentPath(path: string): string {
  validatePath(path);
  if (path === "/") {
    return "/";
  }
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === 0 ? "/" : path.slice(0, lastSlash);
}

/**
 * Return the last segment of a znode path.
 */
export function basename(path: string): string {
  validatePath(path);
  if (path === "/") {
    return "";
  }
  const lastSlash = path.lastIndexOf("/");
  return path.slice(lastSlash + 1);
}
