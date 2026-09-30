/** Persistence helpers that write the live subagent run registry to disk. */
import type { OpenClawStateWorkerContext } from "../../../state/openclaw-state-worker-context.types.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import type { SubagentRegistryWriteOptions } from "./subagent-registry-persistence.js";
import {
  persistSubagentRunsToDisk,
  persistSubagentRunsToDiskOrThrow,
  persistSubagentRunsToDiskAsyncOrThrow,
} from "./subagent-registry-state.js";

// Hot lifecycle callers name every changed or removed row. Zero ids is reserved
// for explicit full-registry replacement at restore/reset boundaries.
export function persistSubagentRuns(...runIds: string[]) {
  persistSubagentRunsToDisk(subagentRuns, runIds.length > 0 ? runIds : undefined);
}

export function persistSubagentRunsAsyncOrThrow(
  context: OpenClawStateWorkerContext,
  callbacks: Omit<SubagentRegistryWriteOptions, "context"> & { assertCurrent: () => void },
  ...runIds: string[]
): Promise<void> {
  return persistSubagentRunsToDiskAsyncOrThrow(subagentRuns, runIds, {
    context,
    ...callbacks,
  });
}

export function persistSubagentRunsOrThrow(...runIds: string[]) {
  persistSubagentRunsToDiskOrThrow(subagentRuns, runIds.length > 0 ? runIds : undefined);
}
