// Registry write fault seam for custody tests. Faults are injected at the native
// state-worker boundary, so the real FIFO writer, its outcome classification and
// its uncertainty fence all run unchanged.
import { vi } from "vitest";
import {
  SqliteWorkerError,
  type SqliteWorkerCommand,
} from "../../../infra/sqlite-worker-contract.js";
import type { SqliteWorkerOperationAdmission } from "../../../infra/sqlite-worker-operation-admission.js";
import type { OpenClawStateWorkerOperations } from "../../../state/openclaw-state-worker-contract.js";
import * as stateWorker from "../../../state/openclaw-state-worker-store.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

export type RegistryWrite = Extract<
  SqliteWorkerCommand<OpenClawStateWorkerOperations>,
  { type: "subagents.persistChanges" }
>["input"];

export type WriteRule = {
  match: (rows: SubagentRunRecord[], write: RegistryWrite) => boolean;
  /**
   * refuse: thrown before execute (never committed).
   * lose-receipt: committed durably, receipt lost (outcome unknown). A "not landed"
   * twin restarts from the durable image captured in `match`, before the commit.
   */
  mode: "refuse" | "lose-receipt";
  remaining: number;
  hits: number;
};

let writeRules: WriteRule[] = [];

export function rowsOfRegistryWrite(write: RegistryWrite): SubagentRunRecord[] {
  return write.values.map((value) => {
    const parsed = JSON.parse(value.payload_json) as
      | SubagentRunRecord
      | { parentCompletion: SubagentRunRecord };
    return "parentCompletion" in parsed ? parsed.parentCompletion : parsed;
  });
}

/** Fault the next `times` registry writes that match. */
export function faultWrites(
  mode: WriteRule["mode"],
  match: WriteRule["match"],
  times = Number.POSITIVE_INFINITY,
): WriteRule {
  const rule = { match, mode, remaining: times, hits: 0 };
  writeRules.push(rule);
  return rule;
}

export function liftFaults(): void {
  writeRules = [];
}

export function interceptRegistryWrites() {
  liftFaults();
  const run = stateWorker.runOpenClawStateWorkerOperation;
  return vi
    .spyOn(stateWorker, "runOpenClawStateWorkerOperation")
    .mockImplementation((context, operation, options) => {
      let admission: SqliteWorkerOperationAdmission | undefined;
      const createAdmission = options?.createAdmission;
      return run(
        context,
        (scope) =>
          operation({
            ...scope,
            execute: async (
              command: SqliteWorkerCommand<OpenClawStateWorkerOperations>,
              ...rest: unknown[]
            ) => {
              const forward = () =>
                // SAFETY: forwards the original execute arguments unchanged.
                (scope.execute as (...args: unknown[]) => Promise<unknown>)(command, ...rest);
              if (command.type !== "subagents.persistChanges") {
                return forward();
              }
              const rows = rowsOfRegistryWrite(command.input);
              const rule = writeRules.find(
                (candidate) => candidate.remaining > 0 && candidate.match(rows, command.input),
              );
              if (!rule) {
                return forward();
              }
              rule.remaining -= 1;
              rule.hits += 1;
              if (rule.mode === "refuse") {
                throw new Error("injected registry write refusal");
              }
              await forward();
              if (admission) {
                // The bytes are durable; only the native receipt is lost.
                Object.defineProperty(admission, "committed", { value: undefined });
              }
              throw new SqliteWorkerError("injected lost registry receipt", "outcome-unknown");
            },
          } as typeof scope),
        {
          ...options,
          ...(createAdmission
            ? {
                createAdmission: (native: Parameters<typeof createAdmission>[0]) => {
                  const prepared = createAdmission(native);
                  admission = prepared.admission;
                  return prepared;
                },
              }
            : {}),
        } as typeof options,
      );
    });
}
