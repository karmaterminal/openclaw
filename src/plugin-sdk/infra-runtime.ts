/**
 * @deprecated Compatibility shim only. Keep old plugins working, but do not
 * add new imports here and do not use this subpath from repo code.
 * Prefer focused openclaw/plugin-sdk/<domain> runtime subpaths instead.
 */

import { enqueueSystemEvent as enqueueSystemEventInternal } from "../infra/system-events.js";

export * from "./delivery-queue-runtime.js";

export * from "../infra/backoff.js";
export * from "../infra/channel-activity.js";
export * from "../infra/dedupe.js";
export type * from "../infra/diagnostic-events.js";
export {
  areDiagnosticsEnabledForProcess,
  emitDiagnosticEvent,
  isDiagnosticsEnabled,
  onDiagnosticEvent,
} from "../infra/diagnostic-events.js";
export * from "../infra/diagnostic-flags.js";
export * from "../infra/env.js";
export * from "../infra/errors.js";
export * from "../infra/exec-approval-command-display.ts";
export * from "../infra/exec-approval-channel-runtime.ts";
export * from "../infra/exec-approval-reply.ts";
export * from "../infra/exec-approval-session-target.ts";
export * from "../infra/exec-approvals.ts";
export * from "../infra/approval-native-delivery.ts";
export * from "../infra/approval-native-runtime.ts";
export * from "../infra/approval-display-paths.ts";
export * from "../infra/plugin-approvals.ts";
export * from "../infra/fetch.js";
export * from "../infra/file-lock.js";
export * from "../infra/format-time/format-duration.ts";
export * from "../infra/fs-safe.ts";
export * from "../infra/heartbeat-events.ts";
export * from "../infra/heartbeat-summary.ts";
export * from "../infra/heartbeat-visibility.ts";
export * from "../infra/home-dir.js";
export * from "../infra/http-body.js";
export * from "../infra/json-files.js";
export * from "../infra/local-file-access.js";
export * from "../infra/map-size.js";
export * from "../infra/net/hostname.ts";
export {
  fetchWithRuntimeDispatcher,
  fetchWithSsrFGuard,
  GUARDED_FETCH_MODE,
  retainSafeHeadersForCrossOriginRedirectHeaders,
  withStrictGuardedFetchMode,
  withTrustedEnvProxyGuardedFetchMode,
  withTrustedExplicitProxyGuardedFetchMode,
  type GuardedFetchMode,
  type GuardedFetchOptions,
  type GuardedFetchResult,
} from "../infra/net/fetch-guard.js";
export * from "../infra/net/proxy-env.js";
export * from "../infra/net/proxy-fetch.js";
export * from "../infra/net/undici-global-dispatcher.js";
export * from "../infra/net/ssrf.js";
export * from "../infra/outbound/identity.js";
export * from "../infra/outbound/sanitize-text.js";
export * from "../infra/parse-finite-number.js";
export * from "../infra/outbound/send-deps.js";
export * from "../infra/retry.js";
export * from "../infra/retry-policy.js";
export * from "../infra/scp-host.ts";
export * from "../infra/secret-file.js";
export * from "../infra/secure-random.js";
// The raw `enqueueSystemEvent`/`enqueueSystemEventEntry` are deliberately NOT
// re-exported here: this deprecated barrel is reachable by untrusted third-party
// plugins, so a forced-untrusted wrapper (below) replaces the producer and only
// the read/drain helpers pass through. Trusted-internal producers use the direct
// `infra/system-events` import, not this barrel.
export {
  consumeSelectedSystemEventEntries,
  consumeSystemEventEntries,
  drainSystemEventEntries,
  drainSystemEvents,
  hasSystemEvents,
  isSystemEventContextChanged,
  peekSystemEventEntries,
  peekSystemEvents,
  removeSystemEvents,
  resetSystemEventsForTest,
  resolveSystemEventDeliveryContext,
  type SystemEvent,
} from "../infra/system-events.js";

/**
 * Plugins reaching this deprecated barrel are untrusted by construction. Force
 * `trusted: false` so a plugin cannot set `trusted: true` to bypass the inbound
 * anti-spoof sanitizer (#999), and strip the session-delivery ack fields so a
 * plugin cannot forge an ack target it never owned. `traceparent`/`contextKey`/
 * `deliveryContext` are additive and pass through untouched.
 */
export function enqueueSystemEvent(
  text: string,
  options: Parameters<typeof enqueueSystemEventInternal>[1],
): boolean {
  return enqueueSystemEventInternal(text, {
    ...options,
    trusted: false,
    sessionDeliveryAckId: undefined,
    sessionDeliveryAckStateDir: undefined,
  });
}
export * from "../infra/system-message.ts";
export * from "../infra/tmp-openclaw-dir.js";
export * from "../infra/transport-ready.js";
export * from "../infra/wsl.ts";
export * from "../utils/fetch-timeout.js";
export * from "../utils/run-with-concurrency.js";
export { createRuntimeOutboundDelegates } from "../channels/plugins/runtime-forwarders.js";
export * from "./ssrf-policy.js";
