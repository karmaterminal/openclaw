import type { PluginJsonValue } from "../../plugins/host-hook-json.js";

export type SessionPluginNextTurnInjection = {
  id: string;
  pluginId: string;
  pluginName?: string;
  text: string;
  idempotencyKey?: string;
  placement: "prepend_context" | "append_context";
  ttlMs?: number;
  expiresAt?: number;
  notBefore?: number;
  supersedeKey?: string;
  outcomeRetainUntil?: number;
  provenance?: { source: string };
  createdAt: number;
  metadata?: PluginJsonValue;
};

export type SessionPluginNextTurnInjectionOutcome = {
  state: "consumed" | "withdrawn" | "expired" | "discarded";
  settledAt: number;
  retainUntil: number;
};
