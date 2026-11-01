export type PluginHookSessionStartEvent = {
  sessionId: string;
  sessionKey?: string;
  resumedFrom?: string;
};

export type PluginHookSessionEndReason =
  | "new"
  | "reset"
  | "idle"
  | "daily"
  | "compaction"
  | "deleted"
  | "shutdown"
  | "restart"
  | "unknown";

/** Post-commit lifecycle notification for plugin-owned session state. */
export type PluginHookSessionResetEvent = {
  sessionId: string;
  sessionKey: string;
  lifecycleRevision?: string;
  nextSessionId?: string;
};

/** Post-commit lifecycle notification for plugin-owned session state. */
export type PluginHookSessionDeleteEvent = {
  sessionId: string;
  sessionKey: string;
  lifecycleRevision?: string;
};

export type PluginHookSessionEndEvent = {
  sessionId: string;
  sessionKey?: string;
  messageCount: number;
  durationMs?: number;
  reason?: PluginHookSessionEndReason;
  sessionFile?: string;
  transcriptArchived?: boolean;
  nextSessionId?: string;
  nextSessionKey?: string;
};
