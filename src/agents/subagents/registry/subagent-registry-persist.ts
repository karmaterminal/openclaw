/** Persistence helpers that write the live subagent run registry to disk. */
import type { OpenClawStateWorkerContext } from "../../../state/openclaw-state-worker-context.types.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import type { SubagentRegistryWriteOptions } from "./subagent-registry-persistence.js";
import {
  persistSubagentRunsToDisk,
  persistSubagentRunsToDiskOrThrow,
  persistSubagentRunsToDiskAsyncOrThrow,
} from "./subagent-registry-state.js";

export function persistSubagentRuns(...runIds: string[]) {
  persistSubagentRunsToDisk(subagentRuns, runIds);
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
  persistSubagentRunsToDiskOrThrow(subagentRuns, runIds);
}
