import type { LegacyStateMigrationStep } from "./state-migrations.types.js";

/**
 * Stable owner order and inclusion scope for every legacy state migration step.
 * When detection itself fails, Doctor closes each listed owner with a blocked
 * receipt in this order instead of silently dropping it.
 */
export const unresolvedMigrationStepLayout = [
  ["device-auth", "shared", "all"],
  ["device-identity", "shared", "all"],
  ["meeting-transcripts", "shared", "all"],
  ["managed-worktrees", "shared", "all"],
  ["shared-auth-store", "shared", "all"],
  ["debug-proxy-capture", "shared", "all"],
  ["voice-wake", "shared", "all"],
  ["update-check", "shared", "all"],
  ["config-health", "shared", "all"],
  ["plugin-binding-approvals", "shared", "all"],
  ["current-conversation-bindings", "shared", "all"],
  ["delivery-queues", "shared", "doctor"],
  ["pairing-stores", "shared", "doctor"],
  ["tui-last-session", "final", "doctor"],
  ["commitments", "final", "doctor"],
  ["audit-logs", "final", "doctor"],
  ["acp-replay-ledger", "final", "doctor"],
  ["managed-outgoing-images", "final", "doctor"],
  ["apns-registrations", "final", "doctor"],
  ["exec-approvals", "final", "doctor"],
  ["mcp-oauth", "final", "doctor"],
  ["restart-sentinel", "final", "all"],
  ["workspace-state", "final", "all"],
  ["web-push", "final", "doctor"],
  ["node-host", "final", "doctor"],
  ["rescue-pending", "final", "doctor"],
  ["skill-workshop", "final", "doctor"],
  ["channel-pairing", "final", "doctor"],
  ["plugin-doctor-state", "final", "all"],
  ["sessions", "final", "doctor-agent"],
  ["legacy-main-session-keys", "final", "automatic"],
  ["acp-session-metadata", "final", "doctor-agent"],
  ["agent-dir", "final", "agent"],
  ["plugin-doctor-post-session-state", "final", "doctor"],
] as const satisfies ReadonlyArray<
  readonly [
    id: string,
    phase: LegacyStateMigrationStep["phase"],
    scope: "all" | "doctor" | "automatic" | "doctor-agent" | "agent",
  ]
>;
