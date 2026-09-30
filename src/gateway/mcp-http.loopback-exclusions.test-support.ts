// Tools the loopback MCP surface withholds: core file/exec tools plus the
// continuation controls, which only the owning agent turn may invoke.
export const LOOPBACK_EXCLUDED_TOOL_NAMES: ReadonlySet<string> = new Set([
  "read",
  "write",
  "edit",
  "ls",
  "apply_patch",
  "exec",
  "process",
  "continue_work",
  "request_compaction",
]);
